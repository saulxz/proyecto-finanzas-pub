"use client";

import { useState, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Transaccion, Perfil, Categoria, Presupuesto } from "@/types";
import { useCategorias } from "@/lib/useCategorias";
import {
  Plus,
  Minus,
  Loader2,
  Trash2,
  CloudOff,
} from "lucide-react";
import { useMesVisualizado } from "@/context/MesVisualizadoContext";
import { BotonGuardar } from "@/components/BotonGuardar";
import { vibrar } from "@/lib/vibracion";
import { guardarEnCola } from "@/lib/cola-offline";
import { normalizarComercio } from "@/lib/normalizar-comercio";

export default function DashboardPage() {
  const supabase = createClient();
  const { setMes } = useMesVisualizado();

  // Estados de datos
  const [transacciones, setTransacciones] = useState<Transaccion[]>([]);
  const [perfiles, setPerfiles] = useState<Map<string, Perfil>>(new Map());
  const [presupuestos, setPresupuestos] = useState<Presupuesto[]>([]);
  const [cargando, setCargando] = useState(true);
  const [usuarioId, setUsuarioId] = useState<string | null>(null);

  // Estado del formulario rápido
  const [mostrarFormulario, setMostrarFormulario] = useState(false);
  const [tipo, setTipo] = useState<"ingreso" | "gasto">("gasto");
  const [cantidad, setCantidad] = useState("");
  const [categoria, setCategoria] = useState<Categoria>("alimentacion");
  const [concepto, setConcepto] = useState("");
  const [recurrente, setRecurrente] = useState(false);
  const { categorias, obtenerLabel } = useCategorias();
  const [enviando, setEnviando] = useState(false);
  const [flash, setFlash] = useState(false);
  const [offlineGuardado, setOfflineGuardado] = useState(false);

  // Calculadora: resuelve sumas como "12.50 + 4.20" al salir del campo
  const calcularExpresion = (valor: string): string => {
    const limpio = valor.replace(",", ".");
    if (!/^[\d.+\s]+$/.test(limpio)) return valor;
    const partes = limpio
      .split("+")
      .map((p) => p.trim())
      .filter((p) => p.length > 0);
    if (partes.length <= 1) return valor;
    const nums = partes.map((p) => {
      const n = parseFloat(p);
      if (isNaN(n)) throw new Error("Número inválido");
      return n;
    });
    return nums.reduce((a, b) => a + b, 0).toFixed(2);
  };

  // Auto-generar gastos recurrentes para el mes actual
  const generarRecurrentes = useCallback(async (userId: string) => {
    const ahora = new Date();
    const inicioMes = new Date(ahora.getFullYear(), ahora.getMonth(), 1)
      .toISOString()
      .split("T")[0];

    const { data: pendientes } = await supabase
      .from("transacciones")
      .select("*")
      .eq("recurrente", true)
      .or(`ultima_generacion.is.null,ultima_generacion.lt.${inicioMes}`);

    if (!pendientes || pendientes.length === 0) return;

    const nuevas = pendientes.map((t: Transaccion) => ({
      tipo: t.tipo,
      cantidad: Number(t.cantidad),
      categoria: t.categoria,
      concepto: t.concepto,
      usuario_id: userId,
      recurrente: false,
      ultima_generacion: null,
    }));

    const ids = pendientes.map((t: Transaccion) => t.id);

    await supabase.from("transacciones").insert(nuevas);
    await supabase
      .from("transacciones")
      .update({ ultima_generacion: inicioMes })
      .in("id", ids);
  }, [supabase]);

  // Cargar datos
  const cargarDatos = useCallback(async () => {
    const { data: authData } = await supabase.auth.getUser();
    if (!authData.user) return;
    setUsuarioId(authData.user.id);

    // Generar transacciones recurrentes pendientes
    await generarRecurrentes(authData.user.id);

    const [transRes, perfilesRes, presRes] = await Promise.all([
      supabase
        .from("transacciones")
        .select("*")
        .order("creado_en", { ascending: false })
        .limit(20),
      supabase.from("perfiles").select("*"),
      supabase.from("presupuestos").select("*"),
    ]);

    if (transRes.data) setTransacciones(transRes.data);
    if (perfilesRes.data) {
      setPerfiles(
        new Map(perfilesRes.data.map((p: Perfil) => [p.id, p]))
      );
    }
    if (presRes.data) setPresupuestos(presRes.data);
    setCargando(false);
  }, [supabase, generarRecurrentes]);

  useEffect(() => {
    const ahora = new Date();
    setMes(ahora.getFullYear(), ahora.getMonth());
    cargarDatos();
  }, [cargarDatos, setMes]);

  // Calcular resúmenes
  const ahora = new Date();
  const mesActual = ahora.getMonth();
  const anioActual = ahora.getFullYear();

  const transaccionesMes = transacciones.filter((t) => {
    const fecha = new Date(t.creado_en);
    return (
      fecha.getMonth() === mesActual && fecha.getFullYear() === anioActual
    );
  });

  const ingresosMes = transaccionesMes
    .filter((t) => t.tipo === "ingreso")
    .reduce((sum, t) => sum + Number(t.cantidad), 0);

  const gastosMes = transaccionesMes
    .filter((t) => t.tipo === "gasto")
    .reduce((sum, t) => sum + Number(t.cantidad), 0);

  const balanceTotal = transacciones.reduce((sum, t) => {
    return t.tipo === "ingreso" ? sum + Number(t.cantidad) : sum - Number(t.cantidad);
  }, 0);

  const formatearMoneda = (valor: number) =>
    new Intl.NumberFormat("es-ES", {
      style: "currency",
      currency: "EUR",
    }).format(valor);

  // Enviar nueva transacción
  const manejarSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!cantidad || !usuarioId) return;

    setEnviando(true);
    setOfflineGuardado(false);

    const cantidadNum = parseFloat(cantidad.replace(",", "."));
    if (isNaN(cantidadNum) || cantidadNum <= 0) {
      setEnviando(false);
      return;
    }

    const hoy = new Date();
    const inicioMes = new Date(hoy.getFullYear(), hoy.getMonth(), 1)
      .toISOString()
      .split("T")[0];

    // === ESTRATEGIA OFFLINE-FIRST ===
    if (!navigator.onLine) {
      guardarEnCola({
        tipo,
        cantidad: cantidadNum,
        categoria,
        concepto: normalizarComercio(concepto),
        recurrente,
      });
      vibrar(10);
      setFlash(true);
      setOfflineGuardado(true);
      setEnviando(false);
      setTimeout(() => {
        setFlash(false);
        setOfflineGuardado(false);
        setCantidad("");
        setConcepto("");
        setTipo("gasto");
        setCategoria("alimentacion");
        setRecurrente(false);
        setMostrarFormulario(false);
      }, 800);
      return;
    }

    const { error } = await supabase.from("transacciones").insert({
      tipo,
      cantidad: cantidadNum,
      categoria,
      concepto: normalizarComercio(concepto),
      usuario_id: usuarioId,
      recurrente,
      ultima_generacion: recurrente ? inicioMes : null,
    });

    if (!error) {
      vibrar(10);
      setFlash(true);
      setTimeout(() => {
        setFlash(false);
        setCantidad("");
        setConcepto("");
        setTipo("gasto");
        setCategoria("alimentacion");
        setRecurrente(false);
        setMostrarFormulario(false);
        setEnviando(false);
        cargarDatos();
      }, 400);
      return;
    }
    setEnviando(false);
  };

  // Calcular gasto del mes por categoría para presupuestos
  const gastoPorCategoria: Record<string, number> = {};
  transaccionesMes
    .filter((t) => t.tipo === "gasto")
    .forEach((t) => {
      gastoPorCategoria[t.categoria] =
        (gastoPorCategoria[t.categoria] || 0) + Number(t.cantidad);
    });

  // Presupuestos únicos por categoría para las barras de progreso
  const presupuestosUnicos = presupuestos.filter(
    (p, i, arr) => arr.findIndex((x) => x.categoria === p.categoria) === i
  );

  const obtenerColorBarra = (categoria: string, limite: number) => {
    const gasto = gastoPorCategoria[categoria] || 0;
    const pct = (gasto / limite) * 100;
    if (pct >= 100) return "bg-red-500";
    if (pct >= 70) return "bg-amber-500";
    return "bg-emerald-500";
  };

  const obtenerPorcentaje = (categoria: string, limite: number) => {
    const gasto = gastoPorCategoria[categoria] || 0;
    return Math.min(Math.round((gasto / limite) * 100), 100);
  };

  const estaExcedido = (categoria: string, limite: number) => {
    return (gastoPorCategoria[categoria] || 0) >= limite;
  };

  // Eliminar transacción
  const manejarEliminarTransaccion = async (id: string) => {
    await supabase.from("transacciones").delete().eq("id", id);
    cargarDatos();
  };

  const obtenerNombreUsuario = (userId: string) => {
    const perfil = perfiles.get(userId);
    return perfil?.nombre || perfil?.email?.split("@")[0] || "Usuario";
  };

  const obtenerLabelCategoria = (cat: string) => {
    return obtenerLabel(cat);
  };

  if (cargando) {
    return (
      <div className="flex items-center justify-center p-12">
        <Loader2 className="h-6 w-6 animate-spin text-emerald-600" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl space-y-4 px-4 py-4 md:px-6 md:py-6">
      {/* ===== ENCABEZADO ===== */}
      <div>
        <h1 className="text-base font-medium dark:text-zinc-100 text-zinc-900">Inicio</h1>
        <p className="text-xs text-zinc-500">Resumen del mes actual</p>
      </div>

      {/* ===== TARJETAS DE RESUMEN ===== */}
      <div className="grid grid-cols-1 gap-px overflow-hidden rounded-lg border dark:border-zinc-800/40 border-zinc-200 dark:bg-zinc-800/40 bg-zinc-200 sm:grid-cols-3">
        <div className="dark:bg-black bg-white p-4">
          <p className="text-xs text-zinc-500">Balance Total</p>
          <p className={`mt-1 font-mono text-lg tracking-tight ${
            balanceTotal >= 0 ? "dark:text-zinc-100 text-zinc-900" : "text-rose-400"
          }`}>
            {balanceTotal >= 0 ? "+" : ""}{formatearMoneda(balanceTotal)}
          </p>
        </div>
        <div className="dark:bg-black bg-white p-4">
          <p className="text-xs text-zinc-500">Ingresos del mes</p>
          <p className="mt-1 font-mono text-lg tracking-tight text-emerald-400">
            +{formatearMoneda(ingresosMes)}
          </p>
        </div>
        <div className="dark:bg-black bg-white p-4">
          <p className="text-xs text-zinc-500">Gastos del mes</p>
          <p className="mt-1 font-mono text-lg tracking-tight text-rose-400">
            -{formatearMoneda(gastosMes)}
          </p>
        </div>
      </div>

      {/* ===== FORMULARIO DE REGISTRO RÁPIDO ===== */}
      <div className="rounded-lg border dark:border-zinc-800/40 border-zinc-200">
        <button
          onClick={() => setMostrarFormulario(!mostrarFormulario)}
          className="flex w-full items-center justify-between px-4 py-3 text-left transition-colors dark:hover:bg-zinc-900 hover:bg-zinc-100"
        >
          <span className="text-sm font-medium dark:text-zinc-100 text-zinc-900">
            Nueva transacción
          </span>
          <svg
            className={`h-4 w-4 text-zinc-500 transition-transform ${
              mostrarFormulario ? "rotate-180" : ""
            }`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M19 9l-7 7-7-7"
            />
          </svg>
        </button>

        {mostrarFormulario && (
          <form onSubmit={manejarSubmit} className="border-t dark:border-zinc-800/30 border-zinc-200/60 px-4 py-3">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
              {/* Tipo: ingreso/gasto */}
              <div>
                <label className="mb-1 block text-xs text-zinc-500">
                  Tipo
                </label>
                <div className="flex gap-px overflow-hidden rounded-md border dark:border-zinc-800/40 border-zinc-200 dark:bg-zinc-800/40 bg-zinc-200">
                  <button
                    type="button"
                    onClick={() => setTipo("gasto")}
                    className={`flex flex-1 items-center justify-center gap-1 px-3 py-1.5 text-xs transition-colors ${
                      tipo === "gasto"
                        ? "dark:bg-zinc-800 dark:text-rose-400 bg-rose-50 text-rose-600"
                        : "dark:bg-black bg-white dark:text-zinc-500 dark:hover:text-zinc-300 text-zinc-600 hover:text-zinc-900"
                    }`}
                  >
                    <Minus className="h-3 w-3" />
                    Gasto
                  </button>
                  <button
                    type="button"
                    onClick={() => { setTipo("ingreso"); setRecurrente(false); }}
                    className={`flex flex-1 items-center justify-center gap-1 px-3 py-1.5 text-xs transition-colors ${
                      tipo === "ingreso"
                        ? "dark:bg-zinc-800 dark:text-emerald-400 bg-emerald-50 text-emerald-600"
                        : "dark:bg-black bg-white dark:text-zinc-500 dark:hover:text-zinc-300 text-zinc-600 hover:text-zinc-900"
                    }`}
                  >
                    <Plus className="h-3 w-3" />
                    Ingreso
                  </button>
                </div>
              </div>

              {/* Cantidad */}
              <div>
                <label className="mb-1 block text-xs text-zinc-500">
                  Cantidad (€)
                </label>
                <input
                  id="cantidad"
                  type="text"
                  inputMode="decimal"
                  value={cantidad}
                  onChange={(e) => setCantidad(e.target.value)}
                  onBlur={() => setCantidad(calcularExpresion(cantidad))}
                  placeholder="0.00"
                  required
                  autoFocus
                  className="block w-full rounded-md border dark:border-zinc-800/40 border-zinc-200 dark:bg-black bg-white px-3 py-1.5 font-mono text-sm dark:text-zinc-100 text-zinc-900 dark:placeholder-zinc-600 placeholder-zinc-400 transition-colors focus:border-emerald-500 focus:outline-none"
                />
              </div>

              {/* Categoría */}
              <div>
                <label className="mb-1 block text-xs text-zinc-500">
                  Categoría
                </label>
                <select
                  id="categoria"
                  value={categoria}
                  onChange={(e) => setCategoria(e.target.value as Categoria)}
                  className="block w-full rounded-md border dark:border-zinc-800/40 border-zinc-200 dark:bg-black bg-white px-3 py-1.5 text-sm dark:text-zinc-300 text-zinc-700 transition-colors focus:border-emerald-500 focus:outline-none"
                >
                  {categorias.map((cat) => (
                    <option key={cat.value} value={cat.value}>
                      {cat.label}
                    </option>
                  ))}
                </select>
              </div>

              {/* Gasto recurrente */}
              {tipo === "gasto" && (
                <div className="flex items-center gap-2 sm:col-span-4">
                  <input
                    type="checkbox"
                    id="recurrente-rapido"
                    checked={recurrente}
                    onChange={(e) => setRecurrente(e.target.checked)}
                    className="h-3.5 w-3.5 rounded border-zinc-700 dark:bg-black bg-white text-emerald-600 focus:ring-emerald-500"
                  />
                  <label
                    htmlFor="recurrente-rapido"
                    className="cursor-pointer text-xs text-zinc-500"
                  >
                    Gasto fijo mensual
                  </label>
                </div>
              )}

              {/* Concepto + Botón */}
              <div className="sm:col-span-2">
                <label className="mb-1 block text-xs text-zinc-500">
                  Concepto (opcional)
                </label>
                <div className="flex gap-2">
                  <input
                    id="concepto"
                    type="text"
                    value={concepto}
                    onChange={(e) => setConcepto(e.target.value)}
                    placeholder="¿En qué?"
                    className="block flex-1 rounded-md border dark:border-zinc-800/40 border-zinc-200 dark:bg-black bg-white px-3 py-1.5 text-sm dark:text-zinc-100 text-zinc-900 dark:placeholder-zinc-600 placeholder-zinc-400 transition-colors focus:border-emerald-500 focus:outline-none"
                  />
                  <BotonGuardar
                    tipo={tipo}
                    enviando={enviando}
                    flash={flash}
                    label="Añadir"
                    compacto
                  />
                </div>
                {offlineGuardado && (
                  <div className="col-span-full mt-2 flex items-center gap-1.5 text-xs text-amber-400">
                    <CloudOff className="h-3 w-3" />
                    Guardado en local (sin conexión)
                  </div>
                )}
              </div>
            </div>
          </form>
        )}
      </div>

      {/* ===== PRESUPUESTOS DEL MES ===== */}
      {presupuestosUnicos.length > 0 && (
        <div className="rounded-lg border dark:border-zinc-800/40 border-zinc-200">
          <div className="flex items-center justify-between border-b dark:border-zinc-800/30 border-zinc-200/60 px-4 py-3">
            <h2 className="text-sm font-medium dark:text-zinc-100 text-zinc-900">
              Presupuestos del mes
            </h2>
            <a
              href="/dashboard/presupuestos"
              className="text-xs text-emerald-400 hover:text-emerald-300"
            >
              Gestionar
            </a>
          </div>

          <div className="divide-y divide-zinc-800/30 px-4">
            {presupuestosUnicos.map((pres) => {
              const gasto = gastoPorCategoria[pres.categoria] || 0;
              const pct = obtenerPorcentaje(pres.categoria, pres.limite_mensual);
              const excedido = estaExcedido(pres.categoria, pres.limite_mensual);

              return (
                <div key={pres.id} className="py-3">
                  <div className="mb-1.5 flex items-center justify-between">
                    <span className="text-sm dark:text-zinc-100 text-zinc-900">
                      {obtenerLabelCategoria(pres.categoria)}
                    </span>
                    <span className="text-xs text-zinc-500">
                      {formatearMoneda(gasto)} / {formatearMoneda(pres.limite_mensual)}
                    </span>
                  </div>

                  <div className="h-1 w-full overflow-hidden rounded-full dark:bg-zinc-900 bg-zinc-200/60">
                    <div
                      className={`h-full rounded-full transition-all duration-500 ${obtenerColorBarra(pres.categoria, pres.limite_mensual)}`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>

                  <div className="mt-1 flex justify-between">
                    <span className="text-xs text-zinc-500">{pct}% utilizado</span>
                    {excedido && (
                      <span className="text-xs text-rose-400">
                        {formatearMoneda(gasto - pres.limite_mensual)} por encima
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ===== HISTORIAL RECIENTE ===== */}
      <div className="rounded-lg border dark:border-zinc-800/40 border-zinc-200">
        <div className="flex items-center justify-between border-b dark:border-zinc-800/30 border-zinc-200/60 px-4 py-3">
          <h2 className="text-sm font-medium dark:text-zinc-100 text-zinc-900">
            Últimas transacciones
          </h2>
          {transacciones.length > 5 && (
            <a
              href="/dashboard/historial"
              className="text-xs text-emerald-400 hover:text-emerald-300"
            >
              Ver todas
            </a>
          )}
        </div>

        {transacciones.length === 0 ? (
          <div className="px-4 py-12 text-center">
            <p className="text-sm text-zinc-500">
              Aún no hay transacciones. ¡Añade la primera!
            </p>
          </div>
        ) : (
          <div>
            {/* Cabecera de tabla */}
            <div className="hidden border-b dark:border-zinc-800/30 border-zinc-200/60 px-4 py-2 text-xs text-zinc-500 sm:grid sm:grid-cols-12">
              <span className="col-span-5">Concepto</span>
              <span className="col-span-4">Usuario · Fecha</span>
              <span className="col-span-3 text-right">Importe</span>
            </div>
            <div className="divide-y divide-zinc-800/30">
              {transacciones.slice(0, 10).map((t) => (
                <div
                  key={t.id}
                  className="group grid grid-cols-1 gap-0 px-4 py-2.5 transition-colors dark:hover:bg-zinc-900 hover:bg-zinc-100 sm:grid-cols-12 sm:items-center"
                >
                  {/* Columna 1: Concepto */}
                  <div className="col-span-5">
                    <p className="text-sm dark:text-zinc-100 text-zinc-900">
                      {t.concepto || obtenerLabelCategoria(t.categoria)}
                    </p>
                    {t.concepto && (
                      <p className="text-xs text-zinc-500">
                        {obtenerLabelCategoria(t.categoria)}
                      </p>
                    )}
                  </div>

                  {/* Columna 2: Usuario + Fecha */}
                  <div className="col-span-4 mt-1 sm:mt-0">
                    <p className="text-xs text-zinc-500">
                      {obtenerNombreUsuario(t.usuario_id)}
                    </p>
                    <p className="text-xs dark:text-zinc-600 text-zinc-400">
                      {new Date(t.creado_en).toLocaleDateString("es-ES", {
                        day: "numeric",
                        month: "short",
                      })}
                    </p>
                  </div>

                  {/* Columna 3: Importe */}
                  <div className="col-span-3 mt-1 flex items-center justify-between sm:mt-0 sm:justify-end">
                    <span
                      className={`font-mono text-sm tracking-tight ${
                        t.tipo === "ingreso"
                          ? "text-emerald-400"
                          : "text-rose-400"
                      }`}
                    >
                      {t.tipo === "ingreso" ? "+" : "-"}
                      {formatearMoneda(Number(t.cantidad))}
                    </span>
                    <button
                      onClick={() => manejarEliminarTransaccion(t.id)}
                      className="ml-2 rounded p-1 text-zinc-700 opacity-0 transition-all hover:text-rose-400 group-hover:opacity-100"
                      title="Eliminar"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
