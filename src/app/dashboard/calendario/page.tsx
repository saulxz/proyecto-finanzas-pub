"use client";

import { useState, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Transaccion } from "@/types";
import { useCategorias } from "@/lib/useCategorias";
import { ChevronLeft, ChevronRight, Loader2 } from "lucide-react";
import { useMesVisualizado } from "@/context/MesVisualizadoContext";

const DIAS_SEMANA = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];

function formatearMoneda(valor: number) {
  return new Intl.NumberFormat("es-ES", {
    style: "currency",
    currency: "EUR",
  }).format(valor);
}

export default function CalendarioPage() {
  const supabase = createClient();
  const { setMes } = useMesVisualizado();
  const { obtenerLabel } = useCategorias();

  const [transacciones, setTransacciones] = useState<Transaccion[]>([]);
  const [cargando, setCargando] = useState(true);
  const [diaSeleccionado, setDiaSeleccionado] = useState<number | null>(null);

  const ahora = new Date();
  const [anio, setAnio] = useState(ahora.getFullYear());
  const [mes, setMesLocal] = useState(ahora.getMonth());

  // Cambiar mes y notificar al contexto
  const cambiarMes = useCallback(
    (nuevoAnio: number, nuevoMes: number) => {
      setAnio(nuevoAnio);
      setMesLocal(nuevoMes);
      setMes(nuevoAnio, nuevoMes);
      setDiaSeleccionado(null);
    },
    [setMes]
  );

  const mesAnterior = () => {
    if (mes === 0) cambiarMes(anio - 1, 11);
    else cambiarMes(anio, mes - 1);
  };

  const mesSiguiente = () => {
    if (mes === 11) cambiarMes(anio + 1, 0);
    else cambiarMes(anio, mes + 1);
  };

  // Cargar transacciones del mes seleccionado
  useEffect(() => {
    const cargar = async () => {
      setCargando(true);
      const inicio = new Date(anio, mes, 1).toISOString().split("T")[0];
      const fin = new Date(anio, mes + 1, 0).toISOString().split("T")[0];

      const { data } = await supabase
        .from("transacciones")
        .select("*")
        .gte("creado_en", inicio)
        .lte("creado_en", fin)
        .order("creado_en", { ascending: true });

      if (data) setTransacciones(data);
      setCargando(false);
    };
    cargar();
  }, [supabase, anio, mes]);

  // --- Lógica del calendario ---
  const diasEnMes = new Date(anio, mes + 1, 0).getDate();
  const primerDiaSemana = new Date(anio, mes, 1).getDay(); // 0=Dom, 1=Lun...
  // Convertir a Lun=0, Dom=6
  const offset = primerDiaSemana === 0 ? 6 : primerDiaSemana - 1;

  // Agrupar gastos por día
  const gastosPorDia: Record<number, number> = {};
  transacciones
    .filter((t) => t.tipo === "gasto")
    .forEach((t) => {
      const dia = new Date(t.creado_en).getDate();
      gastosPorDia[dia] = (gastosPorDia[dia] || 0) + Number(t.cantidad);
    });

  // Transacciones del día seleccionado
  const transaccionesDia =
    diaSeleccionado !== null
      ? transacciones.filter(
          (t) => new Date(t.creado_en).getDate() === diaSeleccionado
        )
      : [];

  const totalDia = transaccionesDia.reduce(
    (sum, t) =>
      t.tipo === "gasto"
        ? sum + Number(t.cantidad)
        : sum - Number(t.cantidad),
    0
  );

  // Color de celda según umbral
  const colorCelda = (gasto: number) => {
    if (gasto === 0) return "dark:border-zinc-800/40 border-zinc-200 bg-transparent";
    if (gasto < 15) return "border-zinc-700";
    if (gasto <= 50)
      return "border-amber-500/30 bg-amber-500/5";
    return "border-red-500/30 bg-red-500/10";
  };

  const colorTexto = (gasto: number) => {
    if (gasto === 0) return "text-emerald-500";
    if (gasto < 15) return "text-zinc-300";
    if (gasto <= 50) return "text-amber-400";
    return "text-red-400";
  };

  const nombreMes = new Date(anio, mes).toLocaleDateString("es-ES", {
    month: "long",
  });

  // Generar filas del calendario
  const celdas: ({ tipo: "vacio" } | { tipo: "dia"; dia: number })[] = [];
  for (let i = 0; i < offset; i++) celdas.push({ tipo: "vacio" });
  for (let d = 1; d <= diasEnMes; d++) celdas.push({ tipo: "dia", dia: d });

  // Rellenar última fila
  while (celdas.length % 7 !== 0) celdas.push({ tipo: "vacio" });

  const totalIngresos = transacciones
    .filter((t) => t.tipo === "ingreso")
    .reduce((sum, t) => sum + Number(t.cantidad), 0);

  const totalGastos = transacciones
    .filter((t) => t.tipo === "gasto")
    .reduce((sum, t) => sum + Number(t.cantidad), 0);

  const hoy = new Date();
  const esMesActual = anio === hoy.getFullYear() && mes === hoy.getMonth();

  return (
    <div className="mx-auto max-w-4xl space-y-4 px-4 py-4 md:px-6 md:py-6">
      {/* Encabezado */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-base font-medium dark:text-zinc-100 text-zinc-900">Calendario</h1>
          <p className="text-xs text-zinc-500">Vista mensual de gastos</p>
        </div>
      </div>

      {/* Tarjetas resumen del mes — plano, compacto */}
      <div className="grid grid-cols-3 gap-px overflow-hidden rounded-lg border dark:border-zinc-800/40 border-zinc-200 bg-zinc-800/40">
        <div className="dark:bg-black bg-white p-4">
          <p className="text-xs text-zinc-500">Ingresos</p>
          <p className="mt-1 font-mono text-lg tracking-tight text-emerald-400">
            +{formatearMoneda(totalIngresos)}
          </p>
        </div>
        <div className="dark:bg-black bg-white p-4">
          <p className="text-xs text-zinc-500">Gastos</p>
          <p className="mt-1 font-mono text-lg tracking-tight text-rose-400">
            -{formatearMoneda(totalGastos)}
          </p>
        </div>
        <div className="dark:bg-black bg-white p-4">
          <p className="text-xs text-zinc-500">Balance</p>
          <p className={`mt-1 font-mono text-lg tracking-tight ${
            totalIngresos - totalGastos >= 0 ? "dark:text-zinc-100 text-zinc-900" : "text-rose-400"
          }`}>
            {totalIngresos - totalGastos >= 0 ? "+" : ""}
            {formatearMoneda(totalIngresos - totalGastos)}
          </p>
        </div>
      </div>

      {/* Navegación de meses */}
      <div className="flex items-center justify-between rounded-lg border dark:border-zinc-800/40 border-zinc-200 px-4 py-2">
        <button
          onClick={mesAnterior}
          className="rounded p-1.5 text-zinc-400 transition-colors dark:hover:bg-zinc-900 hover:bg-zinc-100 dark:hover:text-zinc-200 hover:text-zinc-800"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <span className="text-sm capitalize dark:text-zinc-100 text-zinc-900">
          {nombreMes} {anio}
        </span>
        <button
          onClick={mesSiguiente}
          className="rounded p-1.5 text-zinc-400 transition-colors dark:hover:bg-zinc-900 hover:bg-zinc-100 dark:hover:text-zinc-200 hover:text-zinc-800"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>

      {/* Calendario */}
      {cargando ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-5 w-5 animate-spin text-emerald-400" />
        </div>
      ) : (
        <>
          <div className="overflow-hidden rounded-lg border dark:border-zinc-800/40 border-zinc-200">
            <div className="grid grid-cols-7 gap-px bg-zinc-800/30">
              {DIAS_SEMANA.map((d) => (
                <div
                  key={d}
                  className="dark:bg-black bg-white px-2 py-1.5 text-center text-[10px] font-semibold uppercase tracking-wider text-zinc-500"
                >
                  {d}
                </div>
              ))}

              {celdas.map((celda, idx) =>
                celda.tipo === "vacio" ? (
                  <div key={`e-${idx}`} className="dark:bg-black bg-white p-1" />
                ) : (
                  <button
                    key={`d-${celda.dia}`}
                    onClick={() =>
                      setDiaSeleccionado(
                        diaSeleccionado === celda.dia ? null : celda.dia
                      )
                    }
                    className={`group relative flex min-h-[72px] flex-col border dark:bg-black bg-white p-1.5 text-left transition-all hover:z-10 sm:min-h-[84px] sm:p-2 ${
                      diaSeleccionado === celda.dia
                        ? "z-10 border-emerald-500"
                        : esMesActual && celda.dia === hoy.getDate()
                        ? "border-emerald-500/50"
                        : "border-transparent"
                    }`}
                  >
                    <span
                      className={`text-[10px] leading-none ${
                        esMesActual && celda.dia === hoy.getDate()
                          ? "flex h-4 w-4 items-center justify-center rounded-full bg-emerald-600 text-white"
                          : "text-zinc-500"
                      }`}
                    >
                      {celda.dia}
                    </span>

                    {(gastosPorDia[celda.dia] || 0) > 0 && (
                      <span
                        className={`mt-auto truncate font-mono text-[9px] leading-tight tracking-tight sm:text-[10px] ${
                          gastosPorDia[celda.dia] >= 50
                            ? "text-rose-400"
                            : gastosPorDia[celda.dia] >= 15
                            ? "text-amber-400"
                            : "text-emerald-400"
                        }`}
                        title={formatearMoneda(gastosPorDia[celda.dia] || 0)}
                      >
                        {formatearMoneda(gastosPorDia[celda.dia] || 0)}
                      </span>
                    )}
                  </button>
                )
              )}
            </div>
          </div>

          {/* Desglose del día seleccionado */}
          {diaSeleccionado !== null && (
            <div className="rounded-lg border dark:border-zinc-800/40 border-zinc-200">
              <div className="flex items-center justify-between border-b border-zinc-800/30 px-4 py-2.5">
                <span className="text-sm dark:text-zinc-100 text-zinc-900">
                  {new Date(anio, mes, diaSeleccionado).toLocaleDateString(
                    "es-ES",
                    { day: "numeric", month: "long" }
                  )}
                </span>
                <div className="flex items-center gap-3">
                  {totalDia !== 0 && (
                    <span
                      className={`font-mono text-xs tracking-tight ${
                        totalDia >= 0 ? "text-emerald-400" : "text-rose-400"
                      }`}
                    >
                      {totalDia >= 0 ? "+" : "-"}
                      {formatearMoneda(Math.abs(totalDia))}
                    </span>
                  )}
                  <button
                    onClick={() => setDiaSeleccionado(null)}
                    className="text-xs text-zinc-500 dark:hover:text-zinc-300 hover:text-zinc-700"
                  >
                    Cerrar
                  </button>
                </div>
              </div>

              {transaccionesDia.length === 0 ? (
                <div className="px-4 py-8 text-center">
                  <p className="text-sm text-zinc-500">
                    No hay transacciones este día
                  </p>
                </div>
              ) : (
                <div className="divide-y divide-zinc-800/30">
                  {transaccionesDia.map((t) => (
                    <div
                      key={t.id}
                      className="flex items-center justify-between px-4 py-2.5 transition-colors dark:hover:bg-zinc-900 hover:bg-zinc-100"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm dark:text-zinc-100 text-zinc-900">
                          {t.concepto || obtenerLabel(t.categoria)}
                        </p>
                        <p className="text-xs text-zinc-500">
                          {obtenerLabel(t.categoria)}
                        </p>
                      </div>
                      <span
                        className={`ml-3 shrink-0 font-mono text-sm tracking-tight ${
                          t.tipo === "ingreso" ? "text-emerald-400" : "text-rose-400"
                        }`}
                      >
                        {t.tipo === "ingreso" ? "+" : "-"}
                        {formatearMoneda(Number(t.cantidad))}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
