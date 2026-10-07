"use client";

import { useState, useEffect } from "react";
import type { CierreResumen } from "@/types";
import {
  X,
  PartyPopper,
  AlertTriangle,
  TrendingUp,
  TrendingDown,
  Users,
  FileText,
  Loader2,
  Archive,
} from "lucide-react";

interface Props {
  abierto: boolean;
  cerrar: () => void;
  year: number;
  month: number;
}

const formatearMoneda = (valor: number) =>
  new Intl.NumberFormat("es-ES", {
    style: "currency",
    currency: "EUR",
  }).format(valor);

export default function CierreMesModal({ abierto, cerrar, year, month }: Props) {
  const [resumen, setResumen] = useState<CierreResumen | null>(null);
  const [cargando, setCargando] = useState(true);
  const [generando, setGenerando] = useState(false);
  const [archivado, setArchivado] = useState(false);

  useEffect(() => {
    if (!abierto) return;

    setCargando(true);
    fetch(`/api/cierre-mes?year=${year}&month=${month}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.existe && data.resumen) {
          setResumen(data.resumen);
          setCargando(false);
        } else {
          // No existe aún → generarlo
          setGenerando(true);
          return fetch("/api/cierre-mes", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ year, month }),
          })
            .then((r) => r.json())
            .then((res) => {
              if (res.resumen) {
                setResumen(res.resumen);
              }
              setGenerando(false);
              setCargando(false);
            });
        }
      })
      .catch(() => {
        setCargando(false);
        setGenerando(false);
      });
  }, [abierto, year, month]);

  const handleArchivar = () => {
    setArchivado(true);
    cerrar();
  };

  if (!abierto) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="relative w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-2xl border border-slate-200 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-900">
        {/* Botón cerrar */}
        <button
          onClick={cerrar}
          className="absolute right-3 top-3 z-10 rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800"
        >
          <X className="h-5 w-5" />
        </button>

        {cargando || generando ? (
          <div className="flex flex-col items-center justify-center py-20">
            <Loader2 className="h-8 w-8 animate-spin text-emerald-600" />
            <p className="mt-3 text-sm text-slate-500 dark:text-slate-400">
              {generando
                ? "Generando informe del mes..."
                : "Cargando..."}
            </p>
          </div>
        ) : resumen ? (
          <div className="p-6">
            {/* Encabezado */}
            <div className="mb-6 text-center">
              <div
                className={`mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full ${
                  resumen.balance.es_ahorro
                    ? "bg-emerald-50 dark:bg-emerald-950/50"
                    : "bg-red-50 dark:bg-red-950/50"
                }`}
              >
                {resumen.balance.es_ahorro ? (
                  <PartyPopper className="h-7 w-7 text-emerald-600" />
                ) : (
                  <AlertTriangle className="h-7 w-7 text-red-600" />
                )}
              </div>
              <h2 className="text-lg font-bold text-slate-800 dark:text-slate-100">
                Informe de {resumen.mes_nombre}
              </h2>
              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                {resumen.total_transacciones} transacciones registradas
              </p>
            </div>

            {/* Mensaje motivacional */}
            <div
              className={`mb-4 rounded-xl p-4 text-center text-sm font-medium ${
                resumen.balance.es_ahorro
                  ? "bg-emerald-50 text-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-300"
                  : "bg-red-50 text-red-800 dark:bg-red-950/30 dark:text-red-300"
              }`}
            >
              {resumen.mensaje}
            </div>

            {/* Balance */}
            <div className="mb-4 grid grid-cols-3 gap-3">
              <div className="rounded-xl bg-slate-50 p-3 text-center dark:bg-slate-800/50">
                <TrendingUp className="mx-auto mb-1 h-4 w-4 text-emerald-600" />
                <p className="text-[10px] text-slate-500 dark:text-slate-400">
                  Ingresos
                </p>
                <p className="mt-0.5 text-sm font-bold text-emerald-600">
                  {formatearMoneda(resumen.balance.ingresos)}
                </p>
              </div>
              <div className="rounded-xl bg-slate-50 p-3 text-center dark:bg-slate-800/50">
                <TrendingDown className="mx-auto mb-1 h-4 w-4 text-red-600" />
                <p className="text-[10px] text-slate-500 dark:text-slate-400">
                  Gastos
                </p>
                <p className="mt-0.5 text-sm font-bold text-red-600">
                  {formatearMoneda(resumen.balance.gastos)}
                </p>
              </div>
              <div className="rounded-xl bg-slate-50 p-3 text-center dark:bg-slate-800/50">
                <FileText className="mx-auto mb-1 h-4 w-4 text-slate-600" />
                <p className="text-[10px] text-slate-500 dark:text-slate-400">
                  {resumen.balance.es_ahorro ? "Ahorro" : "Déficit"}
                </p>
                <p
                  className={`mt-0.5 text-sm font-bold ${
                    resumen.balance.es_ahorro
                      ? "text-emerald-600"
                      : "text-red-600"
                  }`}
                >
                  {formatearMoneda(resumen.balance.ahorro)}
                </p>
              </div>
            </div>

            {/* Categoría top */}
            {resumen.categoria_top && (
              <div className="mb-4 rounded-xl border border-slate-200 p-4 dark:border-slate-700">
                <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
                  Categoría con más gasto
                </p>
                <p className="mt-1 text-base font-bold text-slate-800 dark:text-slate-100">
                  {resumen.categoria_top.label}
                </p>
                <div className="mt-1.5 flex items-center justify-between">
                  <span className="text-xs text-slate-500 dark:text-slate-400">
                    {formatearMoneda(resumen.categoria_top.gasto)} ·{" "}
                    {resumen.categoria_top.porcentaje}% del total
                  </span>
                </div>
              </div>
            )}

            {/* Deudas / ajuste de cuentas */}
            {resumen.deudas.length > 1 && (
              <div className="mb-4 rounded-xl border border-slate-200 p-4 dark:border-slate-700">
                <div className="mb-3 flex items-center gap-2">
                  <Users className="h-4 w-4 text-slate-500" />
                  <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
                    Ajuste de cuentas
                  </p>
                </div>

                <div className="space-y-2">
                  {resumen.deudas.map((d) => (
                    <div
                      key={d.usuario_id}
                      className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2 dark:bg-slate-800/50"
                    >
                      <div>
                        <p className="text-xs font-medium text-slate-700 dark:text-slate-300">
                          {d.nombre}
                        </p>
                        <p className="text-[10px] text-slate-400">
                          Gastó {formatearMoneda(d.total_gastado)}
                        </p>
                      </div>
                      <div className="text-right">
                        {d.es_deudor ? (
                          <p className="text-xs font-semibold text-red-600">
                            Debe {formatearMoneda(Math.abs(d.saldo))}
                          </p>
                        ) : (
                          <p className="text-xs font-semibold text-emerald-600">
                            Le deben {formatearMoneda(d.saldo)}
                          </p>
                        )}
                        <p className="text-[10px] text-slate-400">
                          Cuota: {formatearMoneda(d.cuota_ideal)}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Botón archivar */}
            <button
              onClick={handleArchivar}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-3 text-sm font-semibold text-white transition-all hover:bg-emerald-700"
            >
              <Archive className="h-4 w-4" />
              Archivar mes y empezar limpio
            </button>

            {archivado && (
              <p className="mt-2 text-center text-[11px] text-slate-400">
                Informe guardado en el histórico.
              </p>
            )}
          </div>
        ) : (
          <div className="py-20 text-center">
            <p className="text-sm text-slate-500 dark:text-slate-400">
              No se pudo generar el informe.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
