<div align="center">

# Finanzas Domésticas

**Gestor de finanzas personales con asistente de IA, OCR de tickets y análisis por categorías.**

![Next.js](https://img.shields.io/badge/Next.js-16-000000?style=flat-square&logo=next.js)
![React](https://img.shields.io/badge/React-19-087ea4?style=flat-square&logo=react&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-5-3178c6?style=flat-square&logo=typescript&logoColor=white)
![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-4-38bdf8?style=flat-square&logo=tailwindcss&logoColor=white)
![Supabase](https://img.shields.io/badge/Supabase-3ECF8E?style=flat-square&logo=supabase&logoColor=white)

</div>

---

## Descripción

Gestor de finanzas personales construido con Next.js (App Router) y Supabase. Registra ingresos y gastos, define presupuestos por categoría y visualiza la evolución mensual. Incluye un asistente de IA conversacional que puede **crear y modificar transacciones, presupuestos y categorías** a partir de instrucciones en lenguaje natural, y un OCR de tickets que da de alta una compra a partir de una simple foto del recibo.

Está pensado como herramienta de uso diario: instalable como PWA, con tema claro y oscuro, funcionamiento sin conexión mediante una cola de sincronización y caché de los meses cerrados para reducir las lecturas de la base de datos.

## Características

- **Registro manual de transacciones** — ingresos y gastos con importe, categoría, concepto y marca de recurrencia. Las transacciones marcadas como recurrentes se generan automáticamente al cambiar de mes.
- **Categorías configurables** — las categorías son datos, no constantes: se pueden crear, renombrar y eliminar, y se guardan en `localStorage` con caché de lectura.
- **Asistente de IA conversacional** — chat integrado en el panel con llamadas a funciones (*function calling*). El asistente puede registrar y eliminar transacciones, crear y eliminar presupuestos y añadir categorías nuevas, sin usar los formularios.
- **OCR de tickets y facturas** — sube la foto de un ticket y el modelo extrae automáticamente comercio, importe, categoría y fecha.
- **Categorización automática** — a partir del texto del concepto, la IA sugiere la categoría más adecuada entre las configuradas.
- **Presupuestos mensuales por categoría** — límite de gasto por categoría y comparación con lo ya gastado.
- **Calendario de gastos** — vista mes a mes con el total gastado en cada día.
- **Estadísticas con gráficas** — evolución de ingresos y gastos (gráfico de área) y reparto por categoría (gráfico de sectores), con Recharts.
- **Historial y cierre de meses** — los meses cerrados se resumen en base de datos y se cachean en Supabase Storage.
- **Copia de seguridad** — exporta e importa transacciones, presupuestos y cierres en un único archivo JSON.
- **Importación de hoja de cálculo** — carga masiva desde `.xlsx`, `.xls` o `.csv`.
- **Cola sin conexión** — las transacciones creadas sin red se guardan en `localStorage` y se sincronizan solas al recuperar la conexión.
- **Autenticación con Supabase** — inicio de sesión por correo y contraseña, rutas del panel protegidas y políticas RLS en todas las tablas.
- **PWA instalable** — manifiesto web con iconos propios y feedback háptico en móvil.

## Stack

| Capa | Tecnología |
| --- | --- |
| Framework | Next.js 16 (App Router) |
| UI | React 19, TypeScript 5 |
| Estilos | Tailwind CSS 4 (tema claro/oscuro por clase) |
| Animaciones | Framer Motion |
| Iconos | lucide-react |
| Gráficas | Recharts |
| Backend, auth y datos | Supabase (Postgres, Auth, Storage, RLS) |
| IA | OpenRouter (modelos de texto y multimodal) |
| Importación de datos | SheetJS (`xlsx`) |
| Lint | ESLint 9 (`eslint-config-next`) |

## Requisitos previos

- **Node.js 20** o superior
- **npm 10** o superior
- Un proyecto en [Supabase](https://supabase.com) (el plan gratuito es suficiente)
- Una API key de [OpenRouter](https://openrouter.ai/keys) para las funciones de IA (chat, categorización y OCR)

## Configuración local

### 1. Clonar e instalar

```bash
git clone https://github.com/saulxz/proyecto-finanzas-pub.git
cd proyecto-finanzas-pub
npm install
```

### 2. Configurar las variables de entorno

```bash
cp .env.example .env.local
```

| Variable | Descripción |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | URL del proyecto Supabase (*Settings → Data API*) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Clave pública / *anon* del proyecto (*Settings → API Keys*) |
| `OPENROUTER_API_KEY` | API key de OpenRouter, usada por el chat, el categorizador y el OCR |

`.env.local` está ignorado por git: no lo subas nunca.

### 3. Crear el esquema de base de datos

Ejecuta el contenido de [`supabase/migration.sql`](supabase/migration.sql) en el **SQL Editor** de Supabase. El script crea:

- el enum `tipo_transaccion`;
- las tablas `perfiles`, `transacciones`, `presupuestos` y `cierres_mensuales`;
- el bucket de Storage `cache-mensual` y sus políticas;
- el trigger que crea el perfil automáticamente al registrarse;
- todas las políticas **RLS**: cada usuario edita lo suyo y la lectura de transacciones y presupuestos es compartida.

La aplicación está pensada para uso doméstico compartido entre varias cuentas. Si prefieres acceso cerrado, desactiva los registros nuevos en *Authentication → Settings → Allow new sign-ups* e invita a los usuarios manualmente.

### 4. Crear el primer usuario

Regístralo desde *Authentication → Users → Add user* en el panel de Supabase. El trigger de la migración creará su perfil automáticamente en cuanto se autentique por primera vez.

### 5. Arrancar el servidor

```bash
npm run dev
```

Disponible en [http://localhost:3000](http://localhost:3000). Otros scripts:

```bash
npm run build   # build de producción
npm run start   # servidor de producción
npm run lint    # ESLint
```

## Estructura del proyecto

```
proyecto-finanzas-pub/
├── src/
│   ├── app/
│   │   ├── api/                  # Route Handlers
│   │   │   ├── backup/           # Exportación / importación JSON
│   │   │   ├── cache/mes/        # Caché mensual en Supabase Storage
│   │   │   ├── categorias/       # CRUD de categorías
│   │   │   ├── categorizar/      # Categorización por IA
│   │   │   ├── chat/             # Asistente IA con function calling
│   │   │   ├── cierre-mes/       # Cierres mensuales
│   │   │   ├── importar-excel/   # Importación de .xlsx / .xls / .csv
│   │   │   ├── meses-disponibles/# Meses con datos
│   │   │   └── ocr/              # OCR de tickets
│   │   ├── auth/                 # Login y callback de autenticación
│   │   └── dashboard/            # Panel: inicio, presupuestos, calendario,
│   │                             # estadísticas, historial, ajustes, nueva
│   ├── components/               # UI reutilizable (chat, tema, offline…)
│   ├── context/                  # Contextos de tema y de mes visualizado
│   ├── lib/                      # Clientes de Supabase, caché mensual,
│   │                             # cola offline, normalización, IA
│   ├── types/                    # Tipos de dominio y tipos de Supabase
│   └── proxy.ts                  # Protección de rutas y refresco de sesión
├── supabase/migration.sql        # Esquema completo + RLS
├── scripts/generate-icons.cjs    # Generación de iconos PWA
└── next.config.ts
```

### Configuración de los modelos de IA

Todo el acceso al modelo pasa por `src/lib/gemini-fallback.ts` (nombre histórico: el adaptador traduce el formato interno de contenido al formato de la API de OpenAI de OpenRouter). Ahí se definen:

- `OPENROUTER_MODEL_TEXTO` — modelo para el chat y la categorización.
- `OPENROUTER_MODEL_MULTIMODAL` — modelo para el OCR de imágenes.

La capa incluye reintentos automáticos ante errores de servidor o de límite de peticiones.