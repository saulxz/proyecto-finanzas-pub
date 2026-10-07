-- ============================================================
-- MIGRACIÓN: Finanzas Domésticas Compartidas
-- Instrucciones: Pega todo este SQL en el Editor SQL de Supabase
-- (Dashboard > SQL Editor) y ejecútalo.
--
-- ⚠️ SEGURIDAD: Después de ejecutar esto, ve a:
-- Authentication > Settings > Disable "Allow new sign-ups"
-- Así SOLO los usuarios que invites manualmente podrán acceder.
-- ============================================================

-- 1. CREAR TIPO ENUM para tipo de transacción
CREATE TYPE tipo_transaccion AS ENUM ('ingreso', 'gasto');

-- 2. TABLA DE PERFILES (vinculada a auth.users)
CREATE TABLE perfiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  nombre TEXT NOT NULL DEFAULT '',
  creado_en TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  actualizado_en TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. TABLA DE TRANSACCIONES
CREATE TABLE transacciones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  creado_en TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  tipo tipo_transaccion NOT NULL,
  cantidad DECIMAL(12, 2) NOT NULL CHECK (cantidad > 0),
  categoria TEXT NOT NULL,
  concepto TEXT DEFAULT '',
  usuario_id UUID NOT NULL REFERENCES perfiles(id) ON DELETE CASCADE,
  recurrente BOOLEAN NOT NULL DEFAULT false,
  ultima_generacion DATE,
  tags TEXT[] NOT NULL DEFAULT '{}'
);

-- Índice para consultas rápidas por usuario y fecha
CREATE INDEX idx_transacciones_usuario ON transacciones(usuario_id);
CREATE INDEX idx_transacciones_creado ON transacciones(creado_en DESC);

-- 4. FUNCIÓN: crear perfil automáticamente al registrarse
CREATE OR REPLACE FUNCTION crear_perfil_al_registrarse()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
  INSERT INTO public.perfiles (id, email, nombre)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data ->> 'nombre', split_part(NEW.email, '@', 1))
  );
  RETURN NEW;
END;
$$;

-- Trigger que ejecuta la función tras cada registro en auth.users
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION crear_perfil_al_registrarse();

-- 5. POLÍTICAS DE SEGURIDAD (RLS)

-- Habilitar RLS en ambas tablas
ALTER TABLE perfiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE transacciones ENABLE ROW LEVEL SECURITY;

-- POLÍTICAS PARA perfiles
-- Cada usuario puede leer su propio perfil
CREATE POLICY "Usuarios ven su propio perfil"
  ON perfiles
  FOR SELECT
  TO authenticated
  USING (auth.uid() = id);

-- Cada usuario puede actualizar su propio perfil
CREATE POLICY "Usuarios actualizan su propio perfil"
  ON perfiles
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- POLÍTICAS PARA transacciones
-- Los usuarios autenticados pueden leer todas las transacciones (vista compartida)
CREATE POLICY "Usuarios auth pueden ver todas las transacciones"
  ON transacciones
  FOR SELECT
  TO authenticated
  USING (true);

-- Los usuarios autenticados pueden insertar sus propias transacciones
CREATE POLICY "Usuarios insertan sus propias transacciones"
  ON transacciones
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = usuario_id);

-- Los usuarios pueden actualizar solo sus propias transacciones
CREATE POLICY "Usuarios actualizan sus propias transacciones"
  ON transacciones
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = usuario_id)
  WITH CHECK (auth.uid() = usuario_id);

-- Los usuarios pueden eliminar solo sus propias transacciones
CREATE POLICY "Usuarios eliminan sus propias transacciones"
  ON transacciones
  FOR DELETE
  TO authenticated
  USING (auth.uid() = usuario_id);

-- 6. TABLA DE PRESUPUESTOS
CREATE TABLE presupuestos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  creado_en TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  actualizado_en TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  user_id UUID NOT NULL REFERENCES perfiles(id) ON DELETE CASCADE,
  categoria TEXT NOT NULL,
  limite_mensual DECIMAL(10, 2) NOT NULL CHECK (limite_mensual > 0),
  UNIQUE(categoria)
);

CREATE INDEX idx_presupuestos_user ON presupuestos(user_id);

ALTER TABLE presupuestos ENABLE ROW LEVEL SECURITY;

-- Todos los usuarios autenticados pueden ver todos los presupuestos (control compartido)
CREATE POLICY "Usuarios auth pueden ver todos los presupuestos"
  ON presupuestos
  FOR SELECT
  TO authenticated
  USING (true);

-- Los usuarios pueden insertar sus propios presupuestos
CREATE POLICY "Usuarios insertan sus propios presupuestos"
  ON presupuestos
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- Cualquier usuario autenticado puede actualizar cualquier presupuesto (gestión compartida)
CREATE POLICY "Usuarios pueden actualizar presupuestos"
  ON presupuestos
  FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (auth.uid() = user_id);

-- Cualquier usuario autenticado puede eliminar presupuestos
CREATE POLICY "Usuarios pueden eliminar presupuestos"
  ON presupuestos
  FOR DELETE
  TO authenticated
  USING (true);

-- 7. STORAGE: BUCKET DE CACHÉ MENSUAL
-- Almacena los JSON cacheados de meses cerrados en Supabase Storage.
-- Requiere crear el bucket manualmente o vía API:
--   1. Ve a Storage > Create bucket > nombre: "cache-mensual", público: ON
--   2. O ejecuta:
INSERT INTO storage.buckets (id, name, public) VALUES ('cache-mensual', 'cache-mensual', true)
ON CONFLICT (id) DO NOTHING;

-- Políticas: cualquier usuario autenticado puede leer y escribir
CREATE POLICY "Usuarios auth pueden leer caché mensual"
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (bucket_id = 'cache-mensual');

CREATE POLICY "Usuarios auth pueden escribir caché mensual"
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'cache-mensual');

CREATE POLICY "Usuarios auth pueden actualizar caché mensual"
  ON storage.objects
  FOR UPDATE
  TO authenticated
  USING (bucket_id = 'cache-mensual')
  WITH CHECK (bucket_id = 'cache-mensual');

-- 8. TABLA DE CIERRES MENSUALES (histórico de informes)
CREATE TABLE cierres_mensuales (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  year INTEGER NOT NULL,
  month INTEGER NOT NULL CHECK (month >= 0 AND month <= 11),
  creado_en TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resumen JSONB NOT NULL,
  UNIQUE(year, month)
);

ALTER TABLE cierres_mensuales ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Usuarios auth pueden leer cierres"
  ON cierres_mensuales
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Usuarios auth pueden insertar cierres"
  ON cierres_mensuales
  FOR INSERT
  TO authenticated
  WITH CHECK (true);
