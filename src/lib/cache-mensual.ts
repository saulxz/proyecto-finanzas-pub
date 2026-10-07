/**
 * Caché mensual de transacciones en Supabase Storage.
 *
 * Los meses cerrados (anteriores al actual) se cachean en Storage
 * para evitar lecturas reiteradas a Postgres y reducir los límites de lectura.
 * El mes actual siempre se lee en vivo desde la base de datos.
 */

import type { Transaccion } from "@/types";

// ─── Tipos ───────────────────────────────────────────────────────────────────

export interface DatosMesCacheados {
  mes: { year: number; month: number };
  generado_en: string; // ISO date
  transacciones: Transaccion[];
  resumen: {
    total_ingresos: number;
    total_gastos: number;
    balance: number;
    por_categoria: Record<string, number>;
  };
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

export function esMesActual(year: number, month: number): boolean {
  const ahora = new Date();
  return ahora.getFullYear() === year && ahora.getMonth() === month;
}

export function esMesCerrado(year: number, month: number): boolean {
  const ahora = new Date();
  // Un mes está cerrado si su primer día es anterior al primer día del mes actual
  const primerDelMes = new Date(year, month, 1);
  const primerDelActual = new Date(ahora.getFullYear(), ahora.getMonth(), 1);
  return primerDelMes < primerDelActual;
}

export function generarRutaCache(year: number, month: number): string {
  return `cache-mensual/${year}/${month}.json`;
}

export function generarDatosMes(
  transacciones: Transaccion[],
  year: number,
  month: number
): DatosMesCacheados {
  const ingresos = transacciones
    .filter((t) => t.tipo === "ingreso")
    .reduce((s, t) => s + Number(t.cantidad), 0);

  const gastos = transacciones
    .filter((t) => t.tipo === "gasto")
    .reduce((s, t) => s + Number(t.cantidad), 0);

  const porCategoria: Record<string, number> = {};
  transacciones
    .filter((t) => t.tipo === "gasto")
    .forEach((t) => {
      porCategoria[t.categoria] =
        (porCategoria[t.categoria] || 0) + Number(t.cantidad);
    });

  return {
    mes: { year, month },
    generado_en: new Date().toISOString(),
    transacciones,
    resumen: {
      total_ingresos: ingresos,
      total_gastos: gastos,
      balance: ingresos - gastos,
      por_categoria: porCategoria,
    },
  };
}

export function generarRangoMeses(desdeAtras: number = 12): { year: number; month: number; label: string }[] {
  const meses: { year: number; month: number; label: string }[] = [];
  const ahora = new Date();

  for (let i = desdeAtras; i >= 0; i--) {
    const d = new Date(ahora.getFullYear(), ahora.getMonth() - i, 1);
    const year = d.getFullYear();
    const month = d.getMonth();
    const label = d.toLocaleDateString("es-ES", {
      month: "long",
      year: "numeric",
    });
    meses.push({ year, month, label });
  }

  return meses;
}

export const NOMBRE_BUCKET = "cache-mensual";
