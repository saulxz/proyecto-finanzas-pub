"use client";

import { useState, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Presupuesto, Transaccion, Perfil } from "@/types";
import { useCategorias } from "@/lib/useCategorias";
import {
  PiggyBank,
  Plus,
  Pencil,
  Trash2,
  Loader2,
  Check,
  X,
} from "lucide-react";

const formatearMoneda = (valor: number) =>
  new Intl.NumberFormat("es-ES", {
    style: "currency",
    currency: "EUR",
  }).format(valor);

export default function PresupuestosPage() {
  const supabase = createClient();
  const { categorias, obtenerLabel } = useCategorias();

  const [presupuestos, setPresupuestos] = useState<Presupuesto[]>([]);
  const [transacciones, setTransacciones] = useState<Transaccion[]>([]);
  const [perfiles, setPerfiles] = useState<Map<string, Perfil>>(new Map());
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Estado del formulario
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [nuevaCategoria, setNuevaCategoria] = useState("");
  const [nuevoLimite, setNuevoLimite] = useState("");
  const [mostrarFormulario, setMostrarFormulario] = useState(false);
  const [enviando, setEnviando] = useState(false);

  const cargarDatos = useCallback(async () => {
    const [presRes, transRes, perfilesRes] = await Promise.all([
      supabase.from("presupuestos").select("*").order("categoria"),
      supabase.from("transacciones").select("*"),
      supabase.from("perfiles").select("*"),
    ]);

    if (presRes.data) setPresupuestos(presRes.data);
    if (transRes.data) setTransacciones(transRes.data);
    if (perfilesRes.data) {
      setPerfiles(new Map(perfilesRes.data.map((p: Perfil) => [p.id, p])));
    }
    setCargando(false);
  }, [supabase]);

  useEffect(() => {
    cargarDatos();
  }, [cargarDatos]);

  // Calcular gasto del mes actual por categoría
  const ahora = new Date();
  const mesActual = ahora.getMonth();
  const anioActual = ahora.getFullYear();

  const gastoPorCategoria: Record<string, number> = {};
  transacciones
    .filter((t) => {
      const fecha = new Date(t.creado_en);
      return (
        t.tipo === "gasto" &&
        fecha.getMonth() === mesActual &&
        fecha.getFullYear() === anioActual
      );
    })
    .forEach((t) => {
      gastoPorCategoria[t.categoria] =
        (gastoPorCategoria[t.categoria] || 0) + Number(t.cantidad);
    });

  const gastoActual = (categoria: string) => gastoPorCategoria[categoria] || 0;

  const colorBarra = (presupuesto: Presupuesto) => {
    const gasto = gastoActual(presupuesto.categoria);
    const pct = (gasto / presupuesto.limite_mensual) * 100;
    if (pct >= 100) return "bg-red-500";
    if (pct >= 70) return "bg-amber-500";
    return "bg-emerald-500";
  };

  const estaExcedido = (presupuesto: Presupuesto) => {
    return gastoActual(presupuesto.categoria) >= presupuesto.limite_mensual;
  };

  const obtenerNombreUsuario = (userId: string) => {
    const perfil = perfiles.get(userId);
    return perfil?.nombre || perfil?.email?.split("@")[0] || "Usuario";
  };

  // Guardar nuevo presupuesto
  const manejarCrear = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!nuevaCategoria || !nuevoLimite) return;

    const limite = parseFloat(nuevoLimite.replace(",", "."));
    if (isNaN(limite) || limite <= 0) {
      setError("Introduce una cantidad válida mayor que 0.");
      return;
    }

    setEnviando(true);

    // Obtener usuario directamente de auth para evitar race conditions
    const { data: authData } = await supabase.auth.getUser();
    if (!authData.user) {
      setError("Debes iniciar sesión.");
      setEnviando(false);
      return;
    }

    // Buscar si ya existe un presupuesto para esta categoría (compartido)
    const existente = presupuestos.find(
      (p) => p.categoria === nuevaCategoria
    );

    let result;
    if (existente) {
      result = await supabase
        .from("presupuestos")
        .update({
          user_id: authData.user.id,
          limite_mensual: limite,
          actualizado_en: new Date().toISOString(),
        })
        .eq("id", existente.id);
    } else {
      result = await supabase.from("presupuestos").insert({
        user_id: authData.user.id,
        categoria: nuevaCategoria,
        limite_mensual: limite,
      });
    }

    if (result.error) {
      setError(result.error.message);
      setEnviando(false);
      return;
    }

    setNuevaCategoria("");
    setNuevoLimite("");
    setMostrarFormulario(false);
    setEnviando(false);
    cargarDatos();
  };

  // Actualizar presupuesto existente (edición inline)
  const manejarActualizar = async (id: string, limite: number) => {
    const { data: authData } = await supabase.auth.getUser();
    if (!authData.user) return;

    await supabase
      .from("presupuestos")
      .update({
        user_id: authData.user.id,
        limite_mensual: limite,
        actualizado_en: new Date().toISOString(),
      })
      .eq("id", id);
    setEditandoId(null);
    cargarDatos();
  };

  // Eliminar presupuesto
  const manejarEliminar = async (id: string) => {
    await supabase.from("presupuestos").delete().eq("id", id);
    cargarDatos();
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
      {/* Encabezado */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-base font-medium dark:text-zinc-100 text-zinc-900">
            Presupuestos
          </h1>
          <p className="text-xs text-zinc-500">
            Define límites mensuales compartidos para cada categoría
          </p>
        </div>
        <button
          onClick={() => {
            setMostrarFormulario(!mostrarFormulario);
            setNuevaCategoria("");
            setNuevoLimite("");
            setError(null);
          }}
          className="flex items-center gap-1.5 rounded-md border border-emerald-800/40 px-3 py-1.5 text-xs font-medium text-emerald-400 transition-colors hover:bg-emerald-950/30"
        >
          {mostrarFormulario ? (
            <>
              <X className="h-3.5 w-3.5" /> Cancelar
            </>
          ) : (
            <>
              <Plus className="h-3.5 w-3.5" /> Nuevo presupuesto
            </>
          )}
        </button>
      </div>

      {/* Formulario para nuevo presupuesto */}
      {mostrarFormulario && (
        <div className="rounded-lg border dark:border-zinc-800/40 border-zinc-200 p-4">
          <h3 className="mb-3 text-sm dark:text-zinc-100 text-zinc-900">
            Nuevo límite mensual
          </h3>
          <form onSubmit={manejarCrear} className="flex flex-wrap items-end gap-3">
            <div className="min-w-[180px] flex-1">
              <label className="mb-1 block text-xs text-zinc-500">
                Categoría
              </label>
              <select
                value={nuevaCategoria}
                onChange={(e) => setNuevaCategoria(e.target.value)}
                required
                className="block w-full rounded-md border dark:border-zinc-800/40 border-zinc-200 dark:bg-black bg-white px-3 py-1.5 text-sm dark:text-zinc-300 text-zinc-700 transition-colors focus:border-emerald-500 focus:outline-none"
              >
                <option value="">Seleccionar...</option>
                {categorias.map((cat) => (
                  <option key={cat.value} value={cat.value}>
                    {cat.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="min-w-[140px] flex-1">
              <label className="mb-1 block text-xs text-zinc-500">
                Límite mensual (€)
              </label>
              <input
                type="text"
                inputMode="decimal"
                value={nuevoLimite}
                onChange={(e) => setNuevoLimite(e.target.value)}
                placeholder="0.00"
                required
                className="block w-full rounded-md border dark:border-zinc-800/40 border-zinc-200 dark:bg-black bg-white px-3 py-1.5 font-mono text-sm dark:text-zinc-100 text-zinc-900 placeholder-zinc-600 transition-colors focus:border-emerald-500 focus:outline-none"
              />
            </div>

            <button
              type="submit"
              disabled={enviando}
              className="flex items-center gap-1.5 rounded-md bg-emerald-600 px-4 py-1.5 text-xs font-medium text-white transition-colors hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {enviando ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Check className="h-3.5 w-3.5" />
              )}
              Guardar
            </button>
          </form>

          {error && (
            <p className="mt-3 text-xs text-rose-400">{error}</p>
          )}
        </div>
      )}

      {/* Lista de presupuestos */}
      {presupuestos.length === 0 ? (
        <div className="rounded-lg border dark:border-zinc-800/40 border-zinc-200 px-4 py-12 text-center">
          <p className="text-sm text-zinc-500">
            No hay presupuestos definidos.
          </p>
          <p className="mt-1 text-xs text-zinc-600">
            Crea tu primer presupuesto para controlar los gastos por categoría.
          </p>
        </div>
      ) : (
        <div className="divide-y divide-zinc-800/30 rounded-lg border dark:border-zinc-800/40 border-zinc-200">
          {presupuestos.map((pres) => {
            const gasto = gastoActual(pres.categoria);
            const pct = pres.limite_mensual > 0
              ? Math.round((gasto / pres.limite_mensual) * 100)
              : 0;
            const excedido = estaExcedido(pres);

            return (
              <div key={pres.id} className="px-4 py-3">
                {/* Cabecera */}
                <div className="mb-2 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-sm dark:text-zinc-100 text-zinc-900">
                      {obtenerLabel(pres.categoria)}
                    </span>
                    {excedido && (
                      <span className="text-xs text-rose-400">Excedido</span>
                    )}
                  </div>

                  <div className="flex items-center gap-1">
                    <span className="mr-2 font-mono text-xs tracking-tight text-zinc-500">
                      {formatearMoneda(gasto)} / {formatearMoneda(pres.limite_mensual)}
                    </span>
                    <button
                      onClick={() => setEditandoId(editandoId === pres.id ? null : pres.id)}
                      className="rounded p-1 text-zinc-600 transition-colors dark:hover:text-zinc-300 hover:text-zinc-700"
                      title="Editar límite"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button
                      onClick={() => manejarEliminar(pres.id)}
                      className="rounded p-1 text-zinc-600 transition-colors hover:text-rose-400"
                      title="Eliminar presupuesto"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>

                {/* Barra de progreso ultra-fina */}
                <div className="h-1 w-full overflow-hidden rounded-full bg-zinc-900">
                  <div
                    className={`h-full rounded-full transition-all duration-500 ${colorBarra(pres)}`}
                    style={{ width: `${Math.min(pct, 100)}%` }}
                  />
                </div>

                {/* Porcentaje y usuario */}
                <div className="mt-1 flex items-center justify-between">
                  <span className="text-xs text-zinc-500">{pct}% utilizado</span>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-zinc-600">
                      por {obtenerNombreUsuario(pres.user_id)}
                    </span>
                    {excedido && (
                      <span className="text-xs text-rose-400">
                        {formatearMoneda(gasto - pres.limite_mensual)} por encima
                      </span>
                    )}
                  </div>
                </div>

                {/* Edición inline del límite */}
                {editandoId === pres.id && (
                  <div className="mt-3 border-t border-zinc-800/30 pt-3">
                    <label className="mb-1 block text-xs text-zinc-500">
                      Nuevo límite mensual (€)
                    </label>
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        inputMode="decimal"
                        defaultValue={pres.limite_mensual}
                        id={`limite-${pres.id}`}
                        className="block w-40 rounded-md border dark:border-zinc-800/40 border-zinc-200 dark:bg-black bg-white px-3 py-1.5 font-mono text-sm dark:text-zinc-100 text-zinc-900 transition-colors focus:border-emerald-500 focus:outline-none"
                      />
                      <button
                        onClick={() => {
                          const input = document.getElementById(
                            `limite-${pres.id}`
                          ) as HTMLInputElement;
                          const val = parseFloat(
                            input.value.replace(",", ".")
                          );
                          if (!isNaN(val) && val > 0)
                            manejarActualizar(pres.id, val);
                        }}
                        className="rounded-md bg-emerald-600 p-1.5 text-white transition-colors hover:bg-emerald-700"
                        title="Guardar"
                      >
                        <Check className="h-3.5 w-3.5" />
                      </button>
                      <button
                        onClick={() => setEditandoId(null)}
                        className="rounded-md border dark:border-zinc-800/40 border-zinc-200 p-1.5 text-zinc-500 transition-colors hover:bg-zinc-800"
                        title="Cancelar"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
