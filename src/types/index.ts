export type TipoTransaccion = "ingreso" | "gasto";

export interface Perfil {
  id: string;
  email: string;
  nombre: string;
  creado_en: string;
  actualizado_en: string;
}

export interface Transaccion {
  id: string;
  creado_en: string;
  tipo: TipoTransaccion;
  cantidad: number;
  categoria: string;
  concepto: string;
  usuario_id: string;
  recurrente: boolean;
  ultima_generacion: string | null;
  tags: string[];
}

export interface TransaccionConUsuario extends Transaccion {
  perfiles: Pick<Perfil, "nombre" | "email">;
}

export interface Presupuesto {
  id: string;
  creado_en: string;
  actualizado_en: string;
  user_id: string;
  categoria: string;
  limite_mensual: number;
}

export type Categoria = string;

/**
 * Lista por defecto de categorías usada como fallback
 * cuando la carga desde la API aún no ha finalizado.
 */
export const CATEGORIAS_DEFAULT: { value: string; label: string; icon: string }[] = [
  { value: "alimentacion", label: "Alimentación", icon: "shopping-cart" },
  { value: "transporte", label: "Transporte", icon: "car" },
  { value: "vivienda", label: "Vivienda", icon: "home" },
  { value: "servicios", label: "Servicios", icon: "zap" },
  { value: "ocio", label: "Ocio", icon: "gamepad-2" },
  { value: "salud", label: "Salud", icon: "heart-pulse" },
  { value: "educacion", label: "Educación", icon: "book-open" },
  { value: "ropa", label: "Ropa", icon: "shirt" },
  { value: "salario", label: "Salario", icon: "briefcase" },
  { value: "freelance", label: "Freelance", icon: "laptop" },
  { value: "inversiones", label: "Inversiones", icon: "trending-up" },
  { value: "otros", label: "Otros", icon: "more-horizontal" },
];

// Alias para compatibilidad hacia atrás — seguir usando CATEGORIAS_DEFAULT
export const CATEGORIAS = CATEGORIAS_DEFAULT;

export interface CierreMensual {
  id: string;
  year: number;
  month: number;
  creado_en: string;
  resumen: CierreResumen;
}

export interface CierreResumen {
  balance: {
    ingresos: number;
    gastos: number;
    ahorro: number;
    es_ahorro: boolean;
  };
  mensaje: string;
  categoria_top: {
    categoria: string;
    label: string;
    gasto: number;
    porcentaje: number;
  } | null;
  deudas: {
    usuario_id: string;
    nombre: string;
    total_gastado: number;
    cuota_ideal: number;
    saldo: number;
    es_deudor: boolean;
  }[];
  total_transacciones: number;
  mes_nombre: string;
  year: number;
  month: number;
}
