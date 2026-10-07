"use client";

import { useState, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Transaccion, Perfil, Categoria } from "@/types";
import { useCategorias } from "@/lib/useCategorias";
import { esMesCerrado, esMesActual } from "@/lib/cache-mensual";
import type { DatosMesCacheados } from "@/lib/cache-mensual";
import { Loader2, Search, X, Pencil, Trash2, Check } from "lucide-react";
import { useMesVisualizado } from "@/context/MesVisualizadoContext";

const formatearMoneda = (valor: number) =>
  new Intl.NumberFormat("es-ES", {
    style: "currency",
    currency: "EUR",
  }).format(valor);

export default function HistorialPage() {
  const supabase = createClient();
  const { setMes } = useMesVisualizado();
  const { categorias, obtenerLabel } = useCategorias();

  const [transacciones, setTransacciones] = useState<Transaccion[]>([]);
  const [perfiles, setPerfiles] = useState<Map<string, Perfil>>(new Map());
  const [cargando, setCargando] = useState(true);
  const [mesSeleccionado, setMesSeleccionado] = useState<{ year: number; month: number } | null>(null);
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
  const [filtroTipo, setFiltroTipo] = useState<"todas" | "ingreso" | "gasto">("todas");
  const [filtroCategoria, setFiltroCategoria] = useState<string>("todas");
  const [busqueda, setBusqueda] = useState("");

  // Estado para edición inline
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [editTipo, setEditTipo] = useState<"ingreso" | "gasto">("gasto");
  const [editCantidad, setEditCantidad] = useState("");
  const [editCategoria, setEditCategoria] = useState<Categoria>("alimentacion");
  const [editConcepto, setEditConcepto] = useState("");

  const cargarDatos = useCallback(
    async (mes: { year: number; month: number } | null, cargarPerfiles: boolean = true) => {
      if (mes) {
        // Modo mes específico → cargar desde API cache
        try {
          setCargando(true);
          const res = await fetch(`/api/cache/mes?year=${mes.year}&month=${mes.month}`);
          if (!res.ok) throw new Error("Error al cargar datos del mes");

          const datos: DatosMesCacheados & { fuente: string } = await res.json();
          setTransacciones(datos.transacciones);
          setFuenteDatos(datos.fuente || "vivo");
        } catch (err) {
          console.error("Error cargando caché mensual:", err);
          setFuenteDatos("error");
        } finally {
          setCargando(false);
        }
      } else {
        // Modo "Todas" → cargar todo desde Postgres (comportamiento original)
        const [transRes, perfilesRes] = await Promise.all([
          supabase
            .from("transacciones")
            .select("*")
            .order("creado_en", { ascending: false }),
          supabase.from("perfiles").select("*"),
        ]);

        if (transRes.data) setTransacciones(transRes.data);
        if (perfilesRes.data && cargarPerfiles) {
          setPerfiles(
            new Map(perfilesRes.data.map((p: Perfil) => [p.id, p]))
          );
        }
        setFuenteDatos("vivo");
        setCargando(false);
      }
    },
    [supabase]
  );

  useEffect(() => {
    cargarDatos(null);
  }, [cargarDatos]);

  const obtenerNombreUsuario = (userId: string) => {
    const perfil = perfiles.get(userId);
    return perfil?.nombre || perfil?.email?.split("@")[0] || "Usuario";
  };

  // Iniciar edición de una transacción
  const iniciarEdicion = (t: Transaccion) => {
    setEditandoId(t.id);
    setEditTipo(t.tipo);
    setEditCantidad(String(t.cantidad));
    setEditCategoria(t.categoria as Categoria);
    setEditConcepto(t.concepto || "");
  };

  // Forzar regeneración de caché para un mes
  const regenerarCacheMes = async (year: number, month: number) => {
    try {
      await fetch(`/api/cache/mes?year=${year}&month=${month}`, {
        method: "POST",
      });
    } catch {
      // Silencioso — el caché se regenerará en la próxima lectura
    }
  };

  // Guardar edición
  const guardarEdicion = async (id: string) => {
    const cantidadNum = parseFloat(editCantidad.replace(",", "."));
    if (isNaN(cantidadNum) || cantidadNum <= 0) return;

    await supabase
      .from("transacciones")
      .update({
        tipo: editTipo,
        cantidad: cantidadNum,
        categoria: editCategoria,
        concepto: editConcepto.trim(),
      })
      .eq("id", id);

    setEditandoId(null);

    // Si estamos viendo un mes específico, regenerar su caché y recargar
    if (mesSeleccionado) {
      await regenerarCacheMes(mesSeleccionado.year, mesSeleccionado.month);
    }
    cargarDatos(mesSeleccionado);
  };

  // Cancelar edición
  const cancelarEdicion = () => {
    setEditandoId(null);
  };

  // Eliminar transacción
  const manejarEliminar = async (id: string) => {
    await supabase.from("transacciones").delete().eq("id", id);
    if (mesSeleccionado) {
      await regenerarCacheMes(mesSeleccionado.year, mesSeleccionado.month);
    }
    cargarDatos(mesSeleccionado);
  };

  // Aplicar filtros
  const filtradas = transacciones.filter((t) => {
    if (filtroTipo !== "todas" && t.tipo !== filtroTipo) return false;
    if (filtroCategoria !== "todas" && t.categoria !== filtroCategoria) return false;
    if (busqueda) {
      const q = busqueda.toLowerCase();
      const coincideConcepto = t.concepto?.toLowerCase().includes(q);
      const coincideCategoria = obtenerLabel(t.categoria)
        .toLowerCase()
        .includes(q);
      const coincideUsuario = obtenerNombreUsuario(t.usuario_id)
        .toLowerCase()
        .includes(q);
      if (!coincideConcepto && !coincideCategoria && !coincideUsuario)
        return false;
    }
    return true;
  });

  const hayFiltrosActivos =
    filtroTipo !== "todas" || filtroCategoria !== "todas" || busqueda !== "";

  if (cargando) {
    return (
      <div className="flex items-center justify-center p-12">
        <Loader2 className="h-6 w-6 animate-spin text-emerald-600" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl space-y-4 px-4 py-4 md:px-6 md:py-6">
      <div>
        <h1 className="text-base font-medium dark:text-zinc-100 text-zinc-900">Historial</h1>
        <p className="text-xs text-zinc-500">Todas las transacciones registradas</p>
      </div>

      {/* ===== SELECTOR DE MES ===== */}
      <div className="flex flex-wrap items-center gap-2 rounded-lg border dark:border-zinc-800/40 border-zinc-200 px-4 py-3">
        <label className="text-xs text-zinc-500">Filtrar por mes:</label>
        <select
          value={
            mesSeleccionado
              ? `${mesSeleccionado.year}-${mesSeleccionado.month}`
              : "todas"
          }
          onChange={(e) => {
            const val = e.target.value;
            if (val === "todas") {
              setMesSeleccionado(null);
              setMes(null, null);
              cargarDatos(null);
            } else {
              const [y, m] = val.split("-").map(Number);
              const mSel = { year: y, month: m };
              setMesSeleccionado(mSel);
              setMes(y, m);
              cargarDatos(mSel);
            }
          }}
          className="rounded-md border dark:border-zinc-800/40 border-zinc-200 dark:bg-black bg-white px-2 py-1 text-xs dark:text-zinc-300 text-zinc-700 transition-colors focus:border-emerald-500 focus:outline-none"
        >
          <option value="todas">Todas las transacciones</option>
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

      {/* ===== FILTROS ===== */}
      <div className="rounded-lg border dark:border-zinc-800/40 border-zinc-200 px-4 py-3">
        <div className="flex flex-row flex-wrap items-center gap-2">
          <div className="relative min-w-[160px] flex-1">
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-600" />
            <input
              type="text"
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              placeholder="Buscar..."
              className="w-full rounded-md border dark:border-zinc-800/40 border-zinc-200 dark:bg-black bg-white py-1.5 pl-8 pr-2.5 text-xs dark:text-zinc-100 text-zinc-900 placeholder-zinc-600 transition-colors focus:border-emerald-500 focus:outline-none"
            />
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            <div className="flex gap-px overflow-hidden rounded-md border dark:border-zinc-800/40 border-zinc-200 bg-zinc-800/40">
              {(["todas", "ingreso", "gasto"] as const).map((opcion) => (
                <button
                  key={opcion}
                  onClick={() => setFiltroTipo(opcion)}
                  className={`px-2.5 py-1 text-xs transition-colors ${
                    filtroTipo === opcion
                      ? "bg-zinc-800 dark:text-zinc-100 text-zinc-900"
                      : "dark:bg-black bg-white text-zinc-500 dark:hover:text-zinc-300 hover:text-zinc-700"
                  }`}
                >
                  {opcion === "todas" ? "Todas" : opcion === "ingreso" ? "Ingresos" : "Gastos"}
                </button>
              ))}
            </div>

            <select
              value={filtroCategoria}
              onChange={(e) => setFiltroCategoria(e.target.value)}
              className="rounded-md border dark:border-zinc-800/40 border-zinc-200 dark:bg-black bg-white px-2 py-1 text-xs dark:text-zinc-300 text-zinc-700 transition-colors focus:border-emerald-500 focus:outline-none"
            >
              <option value="todas">Todas las categorías</option>
              {categorias.map((cat) => (
                <option key={cat.value} value={cat.value}>
                  {cat.label}
                </option>
              ))}
            </select>

            {hayFiltrosActivos && (
              <button
                onClick={() => {
                  setFiltroTipo("todas");
                  setFiltroCategoria("todas");
                  setBusqueda("");
                }}
                className="flex items-center gap-1 rounded-md px-2.5 py-1 text-xs text-rose-400 transition-colors hover:bg-zinc-900"
              >
                <X className="h-3 w-3" />
                Limpiar
              </button>
            )}
          </div>
        </div>
      </div>

      {/* ===== LISTA DE TRANSACCIONES ===== */}
      <div className="rounded-lg border dark:border-zinc-800/40 border-zinc-200">
        {/* Cabecera de tabla */}
        <div className="hidden border-b border-zinc-800/30 px-4 py-2 text-xs text-zinc-500 sm:grid sm:grid-cols-12">
          <span className="col-span-5">Concepto</span>
          <span className="col-span-4">Usuario · Fecha</span>
          <span className="col-span-3 text-right">Importe</span>
        </div>

        {filtradas.length === 0 ? (
          <div className="px-4 py-12 text-center">
            <p className="text-sm text-zinc-500">
              {hayFiltrosActivos
                ? "No hay transacciones que coincidan con los filtros."
                : "Aún no hay transacciones registradas."}
            </p>
          </div>
        ) : (
          <div className="divide-y divide-zinc-800/30">
            {filtradas.map((t) => {
              const esEditando = editandoId === t.id;

              if (esEditando) {
                return (
                  <div key={t.id} className="border-l-2 border-emerald-600 bg-zinc-900 px-4 py-3">
                    <div className="mb-2 flex items-center gap-2">
                      <span className="text-xs text-zinc-500">Editando transacción</span>
                      <span className="text-xs text-zinc-600">
                        por {obtenerNombreUsuario(t.usuario_id)}
                      </span>
                    </div>
                    <div className="flex flex-wrap items-end gap-2">
                      <div className="flex gap-px overflow-hidden rounded-md border dark:border-zinc-800/40 border-zinc-200 bg-zinc-800/40">
                        <button
                          type="button"
                          onClick={() => setEditTipo("gasto")}
                          className={`px-2.5 py-1.5 text-xs transition-colors ${
                            editTipo === "gasto"
                              ? "bg-zinc-800 text-rose-400"
                              : "dark:bg-black bg-white text-zinc-500"
                          }`}
                        >
                          Gasto
                        </button>
                        <button
                          type="button"
                          onClick={() => setEditTipo("ingreso")}
                          className={`px-2.5 py-1.5 text-xs transition-colors ${
                            editTipo === "ingreso"
                              ? "bg-zinc-800 text-emerald-400"
                              : "dark:bg-black bg-white text-zinc-500"
                          }`}
                        >
                          Ingreso
                        </button>
                      </div>
                      <input
                        type="text"
                        inputMode="decimal"
                        value={editCantidad}
                        onChange={(e) => setEditCantidad(e.target.value)}
                        className="w-24 rounded-md border dark:border-zinc-800/40 border-zinc-200 dark:bg-black bg-white px-2.5 py-1.5 font-mono text-xs dark:text-zinc-100 text-zinc-900 transition-colors focus:border-emerald-500 focus:outline-none"
                      />
                      <select
                        value={editCategoria}
                        onChange={(e) => setEditCategoria(e.target.value as Categoria)}
                        className="rounded-md border dark:border-zinc-800/40 border-zinc-200 dark:bg-black bg-white px-2.5 py-1.5 text-xs dark:text-zinc-300 text-zinc-700 transition-colors focus:border-emerald-500 focus:outline-none"
                      >
                        {categorias.map((cat) => (
                          <option key={cat.value} value={cat.value}>
                            {cat.label}
                          </option>
                        ))}
                      </select>
                      <input
                        type="text"
                        value={editConcepto}
                        onChange={(e) => setEditConcepto(e.target.value)}
                        placeholder="Concepto"
                        className="min-w-[100px] flex-1 rounded-md border dark:border-zinc-800/40 border-zinc-200 dark:bg-black bg-white px-2.5 py-1.5 text-xs dark:text-zinc-100 text-zinc-900 placeholder-zinc-600 transition-colors focus:border-emerald-500 focus:outline-none"
                      />
                      <button
                        onClick={() => guardarEdicion(t.id)}
                        className="rounded-md bg-emerald-600 p-1.5 text-white transition-colors hover:bg-emerald-700"
                        title="Guardar"
                      >
                        <Check className="h-3.5 w-3.5" />
                      </button>
                      <button
                        onClick={cancelarEdicion}
                        className="rounded-md border dark:border-zinc-800/40 border-zinc-200 p-1.5 text-zinc-500 transition-colors hover:bg-zinc-800"
                        title="Cancelar"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                );
              }

              return (
                <div
                  key={t.id}
                  className="group grid grid-cols-1 gap-0 px-4 py-2.5 transition-colors hover:bg-zinc-900 sm:grid-cols-12 sm:items-center"
                >
                  {/* Columna 1: Concepto */}
                  <div className="col-span-5">
                    <p className="text-sm dark:text-zinc-100 text-zinc-900">
                      {t.concepto || obtenerLabel(t.categoria)}
                    </p>
                    {t.concepto && (
                      <p className="text-xs text-zinc-500">
                        {obtenerLabel(t.categoria)}
                      </p>
                    )}
                  </div>

                  {/* Columna 2: Usuario + Fecha */}
                  <div className="col-span-4 mt-1 sm:mt-0">
                    <p className="text-xs text-zinc-500">
                      {obtenerNombreUsuario(t.usuario_id)}
                    </p>
                    <p className="text-xs text-zinc-600">
                      {new Date(t.creado_en).toLocaleDateString("es-ES", {
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </p>
                  </div>

                  {/* Columna 3: Importe + acciones */}
                  <div className="col-span-3 mt-1 flex items-center justify-between sm:mt-0 sm:justify-end">
                    <span
                      className={`font-mono text-sm tracking-tight ${
                        t.tipo === "ingreso" ? "text-emerald-400" : "text-rose-400"
                      }`}
                    >
                      {t.tipo === "ingreso" ? "+" : "-"}
                      {formatearMoneda(Number(t.cantidad))}
                    </span>
                    <div className="ml-2 flex gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
                      <button
                        onClick={() => iniciarEdicion(t)}
                        className="rounded p-1 text-zinc-600 transition-colors dark:hover:text-zinc-300 hover:text-zinc-700"
                        title="Editar"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button
                        onClick={() => manejarEliminar(t.id)}
                        className="rounded p-1 text-zinc-600 transition-colors hover:text-rose-400"
                        title="Eliminar"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {filtradas.length > 0 && (
          <div className="border-t border-zinc-800/30 px-4 py-2.5 text-center text-xs text-zinc-600">
            {filtradas.length}{" "}
            {filtradas.length === 1 ? "transacción" : "transacciones"}
            {hayFiltrosActivos && " encontradas"}
          </div>
        )}
      </div>
    </div>
  );
}
