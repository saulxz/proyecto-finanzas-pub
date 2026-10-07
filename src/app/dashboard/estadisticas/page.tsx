"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Transaccion } from "@/types";
import { useCategorias } from "@/lib/useCategorias";
import { esMesCerrado, esMesActual } from "@/lib/cache-mensual";
import type { DatosMesCacheados } from "@/lib/cache-mensual";
import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  ResponsiveContainer,
  Legend,
  XAxis,
  YAxis,
  CartesianGrid,
  AreaChart,
  Area,
  ReferenceLine,
} from "recharts";
import {
  Loader2,
} from "lucide-react";
import { useMesVisualizado } from "@/context/MesVisualizadoContext";
import { useTheme } from "@/context/ThemeContext";

// Paleta de colores para las categorías — funciona bien en claro y oscuro
const COLORES_CATEGORIAS: Record<string, string> = {
  alimentacion: "#10b981",
  transporte: "#f59e0b",
  vivienda: "#6366f1",
  servicios: "#06b6d4",
  ocio: "#ec4899",
  salud: "#ef4444",
  educacion: "#8b5cf6",
  ropa: "#f97316",
  salario: "#22c55e",
  freelance: "#3b82f6",
  inversiones: "#14b8a6",
  otros: "#94a3b8",
};

const COLORES_PREDETERMINADOS = [
  "#10b981", "#f59e0b", "#6366f1", "#06b6d4", "#ec4899",
  "#ef4444", "#8b5cf6", "#f97316", "#22c55e", "#3b82f6",
  "#14b8a6", "#94a3b8",
];

function obtenerColorCategoria(cat: string, index: number): string {
  return COLORES_CATEGORIAS[cat] || COLORES_PREDETERMINADOS[index % COLORES_PREDETERMINADOS.length];
}

export default function EstadisticasPage() {
  const supabase = createClient();
  const { oscuro } = useTheme();
  const { setMes } = useMesVisualizado();
  const { obtenerLabel } = useCategorias();

  const [transacciones, setTransacciones] = useState<Transaccion[]>([]);
  const [cargando, setCargando] = useState(true);
  const [mesSeleccionado, setMesSeleccionado] = useState<{
    year: number;
    month: number;
  } | null>(null);
  const [fuenteDatos, setFuenteDatos] = useState<string>("vivo");
  const [mesesDisponibles, setMesesDisponibles] = useState<
    { year: number; month: number; label: string }[]
  >([]);

  // Cargar meses disponibles de la BD
  useEffect(() => {
    fetch("/api/meses-disponibles")
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data)) setMesesDisponibles(data);
      })
      .catch(() => {});
  }, []);

  const ahora = new Date();
  const mesActual = mesSeleccionado?.month ?? ahora.getMonth();
  const anioActual = mesSeleccionado?.year ?? ahora.getFullYear();

  /* ===== Estado para el gráfico de evolución con rango temporal ===== */
  type Rango = "1W" | "1M" | "6M" | "1Y" | "ALL";
  const [rango, setRango] = useState<Rango>("1M");
  const [todasTransacciones, setTodasTransacciones] = useState<
    { tipo: string; cantidad: number; creado_en: string; concepto: string }[]
  >([]);

  useEffect(() => {
    const fetchAll = async () => {
      const { data } = await supabase
        .from("transacciones")
        .select("tipo, cantidad, creado_en, concepto");
      if (data) setTodasTransacciones(data);
    };
    fetchAll();
  }, [supabase]);

  const cargarDatos = useCallback(
    async (mes: { year: number; month: number } | null) => {
      if (mes) {
        try {
          setCargando(true);
          const res = await fetch(
            `/api/cache/mes?year=${mes.year}&month=${mes.month}`
          );
          if (!res.ok) throw new Error("Error al cargar datos del mes");

          const datos: DatosMesCacheados & { fuente: string } =
            await res.json();
          setTransacciones(datos.transacciones);
          setFuenteDatos(datos.fuente || "vivo");
        } catch (err) {
          console.error("Error cargando caché mensual:", err);
          setFuenteDatos("error");
        } finally {
          setCargando(false);
        }
      } else {
        // Mes actual → vivo desde Postgres
        const { data } = await supabase
          .from("transacciones")
          .select("*")
          .order("creado_en", { ascending: false });

        if (data) setTransacciones(data);
        setFuenteDatos("vivo");
        setCargando(false);
      }
    },
    [supabase]
  );

  useEffect(() => {
    // Cargar mes actual al montar
    const d = new Date();
    const m = { year: d.getFullYear(), month: d.getMonth() };
    setMesSeleccionado(m);
    cargarDatos(m);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Filtrar transacciones del mes seleccionado (o mes actual por defecto)
  const transaccionesMes = transacciones.filter((t) => {
    const fecha = new Date(t.creado_en);
    return (
      fecha.getMonth() === mesActual && fecha.getFullYear() === anioActual
    );
  });

  // Datos para el gráfico de tarta: gastos por categoría
  const gastosPorCategoria: Record<string, number> = {};
  transaccionesMes
    .filter((t) => t.tipo === "gasto")
    .forEach((t) => {
      const cat = t.categoria;
      gastosPorCategoria[cat] = (gastosPorCategoria[cat] || 0) + Number(t.cantidad);
    });

  const datosTarta = Object.entries(gastosPorCategoria)
    .map(([categoria, cantidad], idx) => ({
            name: obtenerLabel(categoria),
      value: Math.round(cantidad * 100) / 100,
      color: obtenerColorCategoria(categoria, idx),
    }))
    .sort((a, b) => b.value - a.value);

  const totalGastos = datosTarta.reduce((sum, d) => sum + d.value, 0);

  // Totales para tarjetas de resumen
  const totalIngresos = transaccionesMes
    .filter((t) => t.tipo === "ingreso")
    .reduce((sum, t) => sum + Number(t.cantidad), 0);

  /* ===== Datos para el gráfico de evolución según rango ===== */
  const datosEvolucion = (() => {
    if (!todasTransacciones.length) return [];

    const hoy = new Date();
    let fechaInicio: Date;
    let granularidad: "dia" | "mes";

    switch (rango) {
      case "1W":
        fechaInicio = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate() - 6);
        granularidad = "dia";
        break;
      case "1M":
        fechaInicio = new Date(hoy.getFullYear(), hoy.getMonth(), 1);
        granularidad = "dia";
        break;
      case "6M":
        fechaInicio = new Date(hoy.getFullYear(), hoy.getMonth() - 5, 1);
        granularidad = "mes";
        break;
      case "1Y":
        fechaInicio = new Date(hoy.getFullYear() - 1, hoy.getMonth(), 1);
        granularidad = "mes";
        break;
      case "ALL":
        fechaInicio = new Date(2000, 0, 1);
        granularidad = "mes";
        break;
    }

    // Indice rápido: cantidad por día o mes
    const indice: Record<string, number> = {};
    todasTransacciones.forEach((t) => {
      const fecha = new Date(t.creado_en);
      if (fecha < fechaInicio) return;
      const key =
        granularidad === "dia"
          ? `${fecha.getFullYear()}-${fecha.getMonth()}-${fecha.getDate()}`
          : `${fecha.getFullYear()}-${fecha.getMonth()}`;
      const campo = t.tipo === "ingreso" ? "ingresos" : "gastos";
      if (!indice[key + "-" + campo]) indice[key + "-" + campo] = 0;
      indice[key + "-" + campo] += Number(t.cantidad);
    });

    const obtenerImporte = (key: string, campo: string) =>
      Math.round((indice[key + "-" + campo] || 0) * 100) / 100;

    // Generar timeline completo rellenando con 0
    const resultado: {
      key: string;
      label: string;
      fecha: string;
      ingresos: number;
      gastos: number;
      balance: number;
    }[] = [];

    if (granularidad === "dia") {
      const diff =
        Math.floor(
          (hoy.getTime() - fechaInicio.getTime()) / (1000 * 60 * 60 * 24)
        ) + 1;
      for (let i = 0; i < diff; i++) {
        const d = new Date(fechaInicio);
        d.setDate(d.getDate() + i);
        const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
        resultado.push({
          key,
          label: `${d.getDate()}`,
          fecha: d.toISOString(),
          ingresos: obtenerImporte(key, "ingresos"),
          gastos: obtenerImporte(key, "gastos"),
          balance: obtenerImporte(key, "ingresos") - obtenerImporte(key, "gastos"),
        });
      }
    } else {
      // mensual: iterar mes a mes desde fechaInicio hasta hoy
      const iter = new Date(fechaInicio);
      while (iter <= hoy) {
        const key = `${iter.getFullYear()}-${iter.getMonth()}`;
        const nombreM = iter.toLocaleDateString("es-ES", { month: "short" });
        resultado.push({
          key,
          label:
            nombreM +
            (iter.getFullYear() !== hoy.getFullYear()
              ? ` ${iter.getFullYear()}`
              : ""),
          fecha: iter.toISOString(),
          ingresos: obtenerImporte(key, "ingresos"),
          gastos: obtenerImporte(key, "gastos"),
          balance: obtenerImporte(key, "ingresos") - obtenerImporte(key, "gastos"),
        });
        iter.setMonth(iter.getMonth() + 1);
      }
    }

    return resultado;
  })();

  /* ===== Análisis de comercios ===== */
  const [busquedaComercio, setBusquedaComercio] = useState("");
  const [comercioSeleccionado, setComercioSeleccionado] = useState<
    string | null
  >(null);
  const [mostrarSugerencias, setMostrarSugerencias] = useState(false);
  const refAutocomplete = useRef<HTMLDivElement>(null);

  // Cerrar sugerencias al hacer clic fuera
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (
        refAutocomplete.current &&
        !refAutocomplete.current.contains(e.target as Node)
      ) {
        setMostrarSugerencias(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  // Lista única de comercios (solo gastos, concepto no vacío)
  const comercios = (() => {
    const set = new Set<string>();
    todasTransacciones
      .filter((t) => t.tipo === "gasto" && t.concepto?.trim())
      .forEach((t) => set.add(t.concepto.trim()));
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  })();

  const sugerencias = busquedaComercio.trim()
    ? comercios.filter((c) =>
        c.toLowerCase().includes(busquedaComercio.toLowerCase())
      )
    : [];

  // Stats del comercio seleccionado
  const statsComercio = (() => {
    if (!comercioSeleccionado) return null;
    const transacciones = todasTransacciones.filter(
      (t) =>
        t.tipo === "gasto" &&
        t.concepto?.trim().toLowerCase() === comercioSeleccionado.toLowerCase()
    );
    if (transacciones.length === 0) return null;
    const cantidades = transacciones.map((t) => Number(t.cantidad));
    return {
      max: Math.max(...cantidades),
      min: Math.min(...cantidades),
      media:
        cantidades.reduce((a, b) => a + b, 0) / cantidades.length,
      total: cantidades.reduce((a, b) => a + b, 0),
      visitas: cantidades.length,
    };
  })();

  const formatearMoneda = (valor: number) =>
    new Intl.NumberFormat("es-ES", {
      style: "currency",
      currency: "EUR",
    }).format(valor);

  // Colores del tema para recharts
  const colorTexto = oscuro ? "#94a3b8" : "#64748b";
  const colorGrid = oscuro ? "#1e293b" : "#e2e8f0";
  const colorTooltipBg = oscuro ? "#1e293b" : "#ffffff";
  const colorTooltipBorder = oscuro ? "#334155" : "#e2e8f0";
  const colorTooltipTexto = oscuro ? "#e2e8f0" : "#0f172a";
  const colorBalance = oscuro ? "#ffffff" : "#09090b";

  if (cargando) {
    return (
      <div className="flex items-center justify-center p-12">
        <Loader2 className="h-6 w-6 animate-spin text-emerald-600" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl space-y-4 px-4 py-4 md:px-6 md:py-6">
      {/* Encabezado */}
      <div>
        <h1 className="text-base font-medium dark:text-zinc-100 text-zinc-900">Estadísticas</h1>
        <div className="flex flex-wrap items-center gap-3">
          <p className="text-xs text-zinc-500">Análisis de gastos e ingresos</p>

          <select
            value={
              mesSeleccionado
                ? `${mesSeleccionado.year}-${mesSeleccionado.month}`
                : `${ahora.getFullYear()}-${ahora.getMonth()}`
            }
            onChange={(e) => {
              const [y, m] = e.target.value.split("-").map(Number);
              const mSel = { year: y, month: m };
              setMesSeleccionado(mSel);
              setMes(y, m);
              cargarDatos(mSel);
            }}
            className="rounded-md border dark:border-zinc-800/40 border-zinc-200 dark:bg-black bg-white px-2 py-1 text-xs dark:text-zinc-300 text-zinc-700 transition-colors focus:border-emerald-500 focus:outline-none"
          >
            {mesesDisponibles.map((m) => (
              <option key={`${m.year}-${m.month}`} value={`${m.year}-${m.month}`}>
                {m.label}
              </option>
            ))}
          </select>

          {fuenteDatos !== "vivo" && (
            <span className="text-xs text-zinc-500">{fuenteDatos}</span>
          )}
        </div>
      </div>

      {/* Tarjetas de resumen rápido */}
      <div className="grid grid-cols-3 gap-px overflow-hidden rounded-lg border dark:border-zinc-800/40 border-zinc-200 bg-zinc-800/40">
        <div className="dark:bg-black bg-white p-4">
          <p className="text-xs text-zinc-500">Total Ingresos</p>
          <p className="mt-1 font-mono text-lg tracking-tight text-emerald-400">
            +{formatearMoneda(totalIngresos)}
          </p>
        </div>
        <div className="dark:bg-black bg-white p-4">
          <p className="text-xs text-zinc-500">Total Gastos</p>
          <p className="mt-1 font-mono text-lg tracking-tight text-rose-400">
            -{formatearMoneda(totalGastos)}
          </p>
        </div>
        <div className="dark:bg-black bg-white p-4">
          <p className="text-xs text-zinc-500">Balance del mes</p>
          <p className={`mt-1 font-mono text-lg tracking-tight ${
            totalIngresos - totalGastos >= 0 ? "dark:text-zinc-100 text-zinc-900" : "text-rose-400"
          }`}>
            {totalIngresos - totalGastos >= 0 ? "+" : ""}
            {formatearMoneda(totalIngresos - totalGastos)}
          </p>
        </div>
      </div>

      {/* Gráfico de Evolución: Ingresos vs Gastos */}
      <div className="rounded-lg border dark:border-zinc-800/40 border-zinc-200 dark:bg-black bg-white">
        {/* Cabecera con selector de rango */}
        <div className="flex items-center justify-between border-b dark:border-zinc-800/40 border-zinc-200 px-4 py-2.5">
          <h2 className="text-xs font-medium dark:text-zinc-100 text-zinc-900">
            Evolución
          </h2>
          <div className="flex gap-px overflow-hidden rounded-md border dark:border-zinc-800/40 border-zinc-200">
            {(["1W", "1M", "6M", "1Y"] as const).map((r) => (
              <button
                key={r}
                onClick={() => setRango(r)}
                className={`px-2.5 py-1 text-xs font-medium transition-colors ${
                  rango === r
                    ? "bg-zinc-800 dark:text-zinc-100 text-zinc-900"
                    : "dark:bg-black bg-white text-zinc-500 dark:hover:text-zinc-300 hover:text-zinc-700"
                }`}
              >
                {r === "1W" ? "1S" : r}
              </button>
            ))}
          </div>
        </div>

        {datosEvolucion.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12">
            <p className="text-sm text-zinc-500">
              No hay datos en este periodo
            </p>
          </div>
        ) : (
          <div className="p-4">
            <ResponsiveContainer width="100%" height={320}>
              <AreaChart
                data={datosEvolucion}
                margin={{ top: 10, right: 8, left: -10, bottom: 0 }}
              >
                <defs>
                  <linearGradient id="gradIngresos" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#10B981" stopOpacity={0.2} />
                    <stop offset="100%" stopColor="#10B981" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="gradGastos" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#EF4444" stopOpacity={0.2} />
                    <stop offset="100%" stopColor="#EF4444" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="gradBalance" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={colorBalance} stopOpacity={0.08} />
                    <stop offset="100%" stopColor={colorBalance} stopOpacity={0} />
                  </linearGradient>
                </defs>

                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke={colorGrid}
                  vertical={false}
                />

                <XAxis
                  dataKey="label"
                  axisLine={false}
                  tickLine={false}
                  tick={{ fill: colorTexto, fontSize: 11 }}
                  dy={6}
                  interval="preserveStartEnd"
                />

                <YAxis
                  axisLine={false}
                  tickLine={false}
                  tick={{ fill: colorTexto, fontSize: 11 }}
                  tickFormatter={(v: number) => `${(v / 1000).toFixed(1)}k€`}
                  width={48}
                />

                <ReferenceLine y={0} stroke={colorGrid} strokeWidth={1} />

                <Tooltip
                  cursor={{
                    stroke: oscuro ? "#475569" : "#94a3b8",
                    strokeDasharray: "4 4",
                    strokeWidth: 1.5,
                  }}
                  content={({ active, payload, label }) => {
                    if (!active || !payload?.length) return null;
                    const ingresos = payload.find(
                      (p) => p.dataKey === "ingresos"
                    );
                    const gastos = payload.find(
                      (p) => p.dataKey === "gastos"
                    );
                    const item = payload[0].payload;
                    const fechaTooltip = item?.fecha
                      ? new Date(item.fecha).toLocaleDateString("es-ES", {
                          day: "numeric",
                          month: "long",
                          year:
                            rango === "6M" || rango === "1Y" || rango === "ALL"
                              ? "numeric"
                              : undefined,
                        })
                      : label;

                    return (
                      <div
                        className="rounded-md border px-3 py-2"
                        style={{
                          backgroundColor: oscuro
                            ? "#09090b"
                            : "#ffffff",
                          borderColor: colorTooltipBorder,
                          minWidth: 160,
                        }}
                      >
                        <p
                          className="mb-2 text-xs font-semibold"
                          style={{ color: colorTooltipTexto }}
                        >
                          {fechaTooltip}
                        </p>
                        <div className="space-y-1.5">
                          <div className="flex items-center justify-between gap-4">
                            <span className="flex items-center gap-1.5 text-xs text-zinc-400">
                              <span className="h-2 w-2 rounded-full bg-emerald-500" />
                              Ingresos
                            </span>
                            <span className="text-xs font-semibold text-emerald-400">
                              {ingresos
                                ? formatearMoneda(Number(ingresos.value))
                                : "€0"}
                            </span>
                          </div>
                          <div className="flex items-center justify-between gap-4">
                            <span className="flex items-center gap-1.5 text-xs text-zinc-400">
                              <span className="h-2 w-2 rounded-full bg-red-500" />
                              Gastos
                            </span>
                            <span className="text-xs font-semibold text-red-400">
                              {gastos
                                ? formatearMoneda(Number(gastos.value))
                                : "€0"}
                            </span>
                          </div>
                          {ingresos && gastos && (
                            <>
                              <hr className="border-zinc-800/60" />
                              <div className="flex items-center justify-between gap-4">
                                <span className="flex items-center gap-1.5 text-xs text-zinc-400">
                                  <span
                                    className="h-2 w-2 rounded-full"
                                    style={{ backgroundColor: colorBalance }}
                                  />
                                  Balance
                                </span>
                                <span
                                  className={`text-xs font-bold ${
                                    Number(ingresos.value) -
                                      Number(gastos.value) >=
                                      0
                                      ? "text-emerald-600"
                                      : "text-red-600"
                                  }`}
                                >
                                  {formatearMoneda(
                                    Number(ingresos.value) -
                                      Number(gastos.value)
                                  )}
                                </span>
                              </div>
                            </>
                          )}
                        </div>
                      </div>
                    );
                  }}
                />

                <Area
                  type="monotone"
                  dataKey="ingresos"
                  stroke="#10B981"
                  fill="url(#gradIngresos)"
                  strokeWidth={2}
                  dot={false}
                  activeDot={{
                    r: 5,
                    fill: "#10B981",
                    stroke: oscuro ? "#0f172a" : "#ffffff",
                    strokeWidth: 2.5,
                  }}
                />

                <Area
                  type="monotone"
                  dataKey="gastos"
                  stroke="#EF4444"
                  fill="url(#gradGastos)"
                  strokeWidth={2}
                  dot={false}
                  activeDot={{
                    r: 5,
                    fill: "#EF4444",
                    stroke: oscuro ? "#0f172a" : "#ffffff",
                    strokeWidth: 2.5,
                  }}
                />

                <Area
                  type="monotone"
                  dataKey="balance"
                  stroke={colorBalance}
                  fill="url(#gradBalance)"
                  strokeWidth={1.5}
                  dot={false}
                  activeDot={{
                    r: 3,
                    fill: colorBalance,
                    stroke: oscuro ? "#0f172a" : "#ffffff",
                    strokeWidth: 1.5,
                  }}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      {/* Análisis de Comercios */}
      <div className="rounded-lg border dark:border-zinc-800/40 border-zinc-200 dark:bg-black bg-white">
        <div className="border-b dark:border-zinc-800/40 border-zinc-200 px-4 py-2.5">
          <h2 className="text-xs font-medium dark:text-zinc-100 text-zinc-900">
            Análisis de comercios
          </h2>
        </div>

        <div className="p-4">
          {/* Buscador con autocompletado */}
          <div className="relative mb-4" ref={refAutocomplete}>
            <div className="relative">
              <input
                type="text"
                value={busquedaComercio}
                onChange={(e) => {
                  setBusquedaComercio(e.target.value);
                  setMostrarSugerencias(true);
                  setComercioSeleccionado(null);
                }}
                onFocus={() => setMostrarSugerencias(true)}
                placeholder="Buscar comercio…"
                className="w-full rounded-md border dark:border-zinc-800/40 border-zinc-200 dark:bg-black bg-white px-3 py-1.5 pl-8 text-sm dark:text-zinc-100 text-zinc-900 placeholder-zinc-500 transition-colors focus:border-emerald-500 focus:outline-none"
              />
              <svg className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-500" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" />
              </svg>
            </div>

            {mostrarSugerencias && sugerencias.length > 0 && (
              <div className="absolute z-10 mt-1 max-h-48 w-full overflow-y-auto rounded-md border dark:border-zinc-800/40 border-zinc-200 dark:bg-black bg-white">
                {sugerencias.slice(0, 30).map((comercio) => (
                  <button
                    key={comercio}
                    onClick={() => {
                      setComercioSeleccionado(comercio);
                      setBusquedaComercio(comercio);
                      setMostrarSugerencias(false);
                    }}
                      className="flex w-full items-center gap-3 px-3 py-2 text-left text-sm dark:text-zinc-300 text-zinc-700 transition-colors hover:bg-zinc-800/40"
                    >
                    {comercio}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Tarjetas de resultados */}
          {comercioSeleccionado && statsComercio && (
            <div>
              <div className="mb-4 flex items-center gap-2">
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-zinc-800/40 text-xs font-bold text-zinc-400">
                  {comercioSeleccionado.charAt(0).toUpperCase()}
                </span>
                <div>
                  <p className="text-sm font-medium dark:text-zinc-100 text-zinc-900">
                    {comercioSeleccionado}
                  </p>
                  <p className="text-xs text-zinc-500">
                    {statsComercio.visitas} visita{statsComercio.visitas !== 1 ? "s" : ""} ·{" "}
                    {formatearMoneda(statsComercio.total)} en total
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-px overflow-hidden rounded-lg border dark:border-zinc-800/40 border-zinc-200 bg-zinc-800/40">
                <div className="dark:bg-black bg-white p-3">
                  <p className="text-xs text-zinc-500">Precio Máximo</p>
                  <p className="mt-0.5 font-mono text-sm tracking-tight text-rose-400">
                    {formatearMoneda(statsComercio.max)}
                  </p>
                </div>
                <div className="dark:bg-black bg-white p-3">
                  <p className="text-xs text-zinc-500">Precio Mínimo</p>
                  <p className="mt-0.5 font-mono text-sm tracking-tight text-emerald-400">
                    {formatearMoneda(statsComercio.min)}
                  </p>
                </div>
                <div className="dark:bg-black bg-white p-3">
                  <p className="text-xs text-zinc-500">Gasto Medio</p>
                  <p className="mt-0.5 font-mono text-sm tracking-tight dark:text-zinc-100 text-zinc-900">
                    {formatearMoneda(statsComercio.media)}
                  </p>
                </div>
              </div>
            </div>
          )}

          {!comercioSeleccionado && comercios.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {comercios.slice(0, 20).map((c) => (
                <button
                  key={c}
                  onClick={() => {
                    setComercioSeleccionado(c);
                    setBusquedaComercio(c);
                  }}
                  className="rounded-md border dark:border-zinc-800/40 border-zinc-200 dark:bg-black bg-white px-2.5 py-1 text-xs font-medium text-zinc-500 transition-colors dark:hover:border-zinc-700 hover:border-zinc-300 dark:hover:text-zinc-300 hover:text-zinc-700"
                >
                  {c}
                </button>
              ))}
            </div>
          )}

          {comercios.length === 0 && (
            <p className="text-center text-sm text-zinc-500">
              No hay comercios registrados
            </p>
          )}
        </div>
      </div>

      {/* Gráfico de Tarta: Gastos por categoría */}
      <div className="rounded-lg border dark:border-zinc-800/40 border-zinc-200 dark:bg-black bg-white p-4">
        <div className="mb-4 flex items-center gap-2">
          <h2 className="text-xs font-medium dark:text-zinc-100 text-zinc-900">
            Gastos por categoría
          </h2>
          {totalGastos > 0 && (
            <span className="ml-auto text-xs text-zinc-500">
              {formatearMoneda(totalGastos)} total
            </span>
          )}
        </div>

        {datosTarta.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12">
            <p className="text-sm text-zinc-500">
              No hay gastos este mes
            </p>
          </div>
        ) : (
          <div className="flex flex-col items-center lg:flex-row lg:items-start lg:gap-6">
            <ResponsiveContainer width="100%" height={320}>
              <PieChart>
                <Pie
                  data={datosTarta}
                  cx="50%"
                  cy="50%"
                  innerRadius={70}
                  outerRadius={120}
                  paddingAngle={3}
                  dataKey="value"
                  stroke="none"
                >
                  {datosTarta.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{
                    backgroundColor: colorTooltipBg,
                    border: `1px solid ${colorTooltipBorder}`,
                    borderRadius: 6,
                    fontSize: 13,
                  }}
                  labelStyle={{ color: colorTooltipTexto, fontWeight: 600, marginBottom: 4 }}
                  formatter={(value, name) => [
                    value != null ? formatearMoneda(Number(value)) : "€0",
                    name,
                  ]}
                />
                <Legend
                  verticalAlign="bottom"
                  iconType="circle"
                  iconSize={10}
                  formatter={(value: string) => (
                    <span className="text-xs text-zinc-500">
                      {value}
                    </span>
                  )}
                />
              </PieChart>
            </ResponsiveContainer>

            {/* Lista de categorías con porcentajes (visible en lg+) */}
            <div className="hidden w-full max-w-xs space-y-2 lg:block">
              {datosTarta.map((item) => {
                const porcentaje =
                  totalGastos > 0
                    ? ((item.value / totalGastos) * 100).toFixed(1)
                    : "0";
                return (
                  <div
                    key={item.name}
                    className="flex items-center gap-3 rounded-lg px-3 py-2 transition-colors hover:bg-zinc-800/40"
                  >
                    <span
                      className="h-3 w-3 shrink-0 rounded-full"
                      style={{ backgroundColor: item.color }}
                    />
                    <span className="flex-1 truncate text-sm dark:text-zinc-300 text-zinc-700">
                      {item.name}
                    </span>
                    <span className="text-xs font-semibold dark:text-zinc-100 text-zinc-900">
                      {porcentaje}%
                    </span>
                    <span className="text-xs text-zinc-500">
                      {formatearMoneda(item.value)}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
