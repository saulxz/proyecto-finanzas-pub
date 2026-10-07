"use client";

import { motion } from "framer-motion";
import { Loader2, Plus, Minus, Check } from "lucide-react";

interface BotonGuardarProps {
  tipo: "gasto" | "ingreso";
  enviando: boolean;
  flash: boolean;
  label?: string;
  compacto?: boolean;
}

const springTap = { type: "spring" as const, stiffness: 600, damping: 20 };

/**
 * Botón de guardar transacción con micro-interacciones:
 * - Pulsación elástica al hacer clic (whileTap)
 * - Spinner durante el envío
 * - Destello verde/rojo + pulso al completar (ingreso/gasto)
 */
export function BotonGuardar({
  tipo,
  enviando,
  flash,
  label,
  compacto = false,
}: BotonGuardarProps) {
  const esGasto = tipo === "gasto";

  const claseBase = compacto
    ? "flex items-center gap-1.5 rounded-lg px-5 py-2 text-sm font-medium text-white transition-colors disabled:cursor-not-allowed select-none"
    : "flex w-full items-center justify-center gap-2 rounded-xl px-4 py-3.5 text-base font-semibold text-white transition-colors focus:outline-none focus:ring-2 focus:ring-emerald-500/20 disabled:cursor-not-allowed select-none";

  const colorNormal = esGasto
    ? "bg-red-600 hover:bg-red-700 disabled:bg-red-600"
    : "bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-600";

  const colorFlash = esGasto
    ? "bg-red-500 disabled:bg-red-500"
    : "bg-emerald-500 disabled:bg-emerald-500";

  return (
    <motion.button
      type="submit"
      disabled={enviando && !flash}
      whileTap={!enviando || flash ? { scale: 0.9, transition: springTap } : undefined}
      animate={
        flash
          ? {
              scale: [1, 1.08, 1],
              transition: { duration: 0.5, ease: "easeOut" },
            }
          : { scale: 1 }
      }
      className={`${claseBase} ${flash ? colorFlash : colorNormal} ${
        enviando && !flash ? "opacity-70" : ""
      } ${flash ? "btn-flash-exito" : ""}`}
    >
      {flash ? (
        <span className="flex items-center gap-2">
          <Check className="h-5 w-5 animate-bounce" />
          {!compacto && (
            <motion.span
              initial={{ opacity: 0, x: -4 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.2 }}
            >
              {esGasto ? "Gasto registrado" : "Ingreso registrado"}
            </motion.span>
          )}
        </span>
      ) : enviando ? (
        <span className="flex items-center gap-2">
          <Loader2 className="h-5 w-5 animate-spin" />
          {!compacto && <span>Guardando…</span>}
        </span>
      ) : (
        <span className="flex items-center gap-2">
          {esGasto ? (
            <Minus className="h-5 w-5" />
          ) : (
            <Plus className="h-5 w-5" />
          )}
          {label ?? (esGasto ? "Registrar Gasto" : "Registrar Ingreso")}
        </span>
      )}
    </motion.button>
  );
}
