"use client";

import { useState, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { Categoria } from "@/types";
import { useCategorias } from "@/lib/useCategorias";
import {
  Plus,
  Minus,
  ArrowLeft,
  Loader2,
  Check,
  ImageUp,
  ScanLine,
  Sparkles,
  X,
  CloudOff,
} from "lucide-react";
import { BotonGuardar } from "@/components/BotonGuardar";
import { vibrar } from "@/lib/vibracion";
import { guardarEnCola } from "@/lib/cola-offline";
import { normalizarComercio } from "@/lib/normalizar-comercio";

export default function NuevaTransaccionPage() {
  const router = useRouter();
  const supabase = createClient();

  const [tipo, setTipo] = useState<"ingreso" | "gasto">("gasto");
  const [cantidad, setCantidad] = useState("");
  const [categoria, setCategoria] = useState<Categoria>("alimentacion");
  const [concepto, setConcepto] = useState("");
  const [recurrente, setRecurrente] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [flash, setFlash] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [offlineGuardado, setOfflineGuardado] = useState(false);
  const { categorias } = useCategorias();

  // OCR state
  const [imagen, setImagen] = useState<File | null>(null);
  const [imagenPreview, setImagenPreview] = useState<string | null>(null);
  const [procesandoOcr, setProcesandoOcr] = useState(false);
  const [ocrExitoso, setOcrExitoso] = useState(false);
  const [arrastrando, setArrastrando] = useState(false);
  const inputFileRef = useRef<HTMLInputElement>(null);

  // Auto-categorización por IA — SOLO se dispara con debounce (2s) o al perder el foco
  const [categorizando, setCategorizando] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const conceptoRef = useRef(concepto);
  conceptoRef.current = concepto;

  const categorizarConcepto = useCallback(async (texto: string) => {
    if (texto.trim().length < 2) return;
    setCategorizando(true);
    try {
      const res = await fetch("/api/categorizar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ concepto: texto }),
      });
      if (res.ok) {
        const datos = await res.json();
        if (datos.categoria && categorias.some((c) => c.value === datos.categoria)) {
          setCategoria(datos.categoria as Categoria);
        }
      }
    } catch {
      // Silencioso — si falla la IA, el usuario elige manualmente
    } finally {
      setCategorizando(false);
    }
  }, [categorias]);

  const manejarCambioConcepto = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const valor = e.target.value;
    setConcepto(valor);

    // Cancelar debounce anterior
    if (debounceRef.current) clearTimeout(debounceRef.current);

    // Programar categorización tras 2s sin escribir
    if (valor.trim().length >= 2) {
      debounceRef.current = setTimeout(() => categorizarConcepto(valor), 2000);
    }
  }, [categorizarConcepto]);

  const manejarBlurConcepto = useCallback(() => {
    // Cancelar debounce pendiente y categorizar inmediatamente
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }
    const textoActual = conceptoRef.current;
    if (textoActual.trim().length >= 2) {
      categorizarConcepto(textoActual);
    }
  }, [categorizarConcepto]);

  // Drag handlers
  const manejarDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setArrastrando(true);
  }, []);

  const manejarDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setArrastrando(false);
  }, []);

  const manejarDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setArrastrando(false);
    const file = e.dataTransfer.files?.[0];
    if (file && file.type.startsWith("image/")) {
      procesarImagen(file);
    }
  }, []);

  const procesarImagen = (file: File) => {
    setImagen(file);
    setOcrExitoso(false);
    setError(null);

    // Crear preview
    const reader = new FileReader();
    reader.onloadend = () => {
      setImagenPreview(reader.result as string);
    };
    reader.readAsDataURL(file);
  };

  const limpiarImagen = () => {
    setImagen(null);
    setImagenPreview(null);
    setOcrExitoso(false);
    if (inputFileRef.current) inputFileRef.current.value = "";
  };

  const manejarEscanearTicket = async () => {
    if (!imagen) return;

    setProcesandoOcr(true);
    setError(null);

    try {
      const formData = new FormData();
      formData.append("imagen", imagen);

      const res = await fetch("/api/ocr", {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || "Error al procesar la imagen");
      }

      const datos = await res.json();

      // Auto-rellenar el formulario
      if (datos.comercio) setConcepto(datos.comercio);
      if (datos.importe && datos.importe > 0) {
        setCantidad(datos.importe.toFixed(2));
      }
      if (datos.categoria && categorias.some((c) => c.value === datos.categoria)) {
        setCategoria(datos.categoria as Categoria);
      }

      setOcrExitoso(true);
      // Quitar el glow después de 3s
      setTimeout(() => setOcrExitoso(false), 3000);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Error al procesar la imagen"
      );
    } finally {
      setProcesandoOcr(false);
    }
  };

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

  const manejarSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const cantidadNum = parseFloat(cantidad.replace(",", "."));
    if (isNaN(cantidadNum) || cantidadNum <= 0) {
      setError("Introduce una cantidad válida mayor que 0.");
      return;
    }

    setEnviando(true);
    setOfflineGuardado(false);

    const { data: authData } = await supabase.auth.getUser();
    if (!authData.user) {
      router.push("/auth/login");
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
        router.push("/dashboard");
        router.refresh();
      }, 800);
      return;
    }

    const { error: insertError } = await supabase.from("transacciones").insert({
      tipo,
      cantidad: cantidadNum,
      categoria,
      concepto: normalizarComercio(concepto),
      usuario_id: authData.user.id,
      recurrente,
      ultima_generacion: recurrente ? inicioMes : null,
    });

    if (insertError) {
      setError(insertError.message);
      setEnviando(false);
      return;
    }

    vibrar(10);
    setFlash(true);
    setTimeout(() => {
      router.push("/dashboard");
      router.refresh();
    }, 400);
  };

  return (
    <div className="mx-auto max-w-lg px-4 py-6 md:px-6 md:py-8">
      <button
        onClick={() => router.back()}
        className="mb-6 flex items-center gap-2 text-sm font-medium text-zinc-400 hover:text-zinc-200"
      >
        <ArrowLeft className="h-4 w-4" />
        Volver
      </button>

      <h1 className="text-xl font-bold text-zinc-100">
        Nueva transacción
      </h1>
      <p className="mt-1 text-sm text-zinc-400">
        Registra un ingreso o gasto, o escanea un ticket
      </p>

      {/* ===== ZONA DE CARGA DE TICKET ===== */}
      <div className="mt-6">
        <div
          onDragOver={manejarDragOver}
          onDragLeave={manejarDragLeave}
          onDrop={manejarDrop}
          onClick={() => inputFileRef.current?.click()}
          className={`relative cursor-pointer rounded-2xl border-2 border-dashed p-6 text-center transition-all ${
            arrastrando
              ? "border-emerald-500 bg-emerald-950/30"
              : imagenPreview
              ? "border-emerald-800 bg-emerald-950/20"
              : "border-zinc-700 bg-zinc-900/40 hover:border-emerald-600 hover:bg-emerald-950/20"
          }`}
        >
          <input
            ref={inputFileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) procesarImagen(file);
            }}
          />

          {imagenPreview ? (
            <div className="relative inline-block">
              <img
                src={imagenPreview}
                alt="Vista previa del ticket"
                className="mx-auto max-h-40 rounded-xl object-contain shadow-sm"
              />
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  limpiarImagen();
                }}
                className="absolute -right-2 -top-2 flex h-6 w-6 items-center justify-center rounded-full bg-red-500 text-white shadow-sm transition-transform hover:scale-110"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-950/50">
                <ImageUp className="h-6 w-6 text-emerald-400" />
              </div>
              <div>
                <p className="text-sm font-medium text-zinc-100">
                  Sube un ticket o factura
                </p>
                <p className="mt-0.5 text-xs text-zinc-400">
                  Arrastra una imagen o haz clic para seleccionar
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Botón de escanear */}
        {imagen && !procesandoOcr && (
          <button
            type="button"
            onClick={manejarEscanearTicket}
            className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-emerald-600 to-emerald-500 px-4 py-3 text-sm font-semibold text-white shadow-sm transition-all hover:from-emerald-700 hover:to-emerald-600 active:scale-[0.98]"
          >
            <ScanLine className="h-5 w-5" />
            Escanear ticket con IA
          </button>
        )}

        {procesandoOcr && (
          <div className="mt-3 flex items-center justify-center gap-2 rounded-xl bg-emerald-950/30 px-4 py-3 text-sm font-medium text-emerald-400">
            <Loader2 className="h-4 w-4 animate-spin" />
            Analizando ticket...
          </div>
        )}

        {ocrExitoso && (
          <div className="mt-2 flex animate-pulse items-center justify-center gap-1.5 rounded-lg bg-emerald-950/40 px-3 py-2 text-xs font-medium text-emerald-400">
            <Sparkles className="h-3.5 w-3.5" />
            Datos extraídos — revisa y guarda
          </div>
        )}
      </div>

      <form onSubmit={manejarSubmit} className="mt-6 space-y-5">
        {/* Selector tipo */}
        <div>
          <label className="mb-2 block text-sm font-medium text-zinc-300">
            Tipo
          </label>
          <div className="flex gap-2 rounded-xl bg-zinc-800/40 p-1.5">
            <button
              type="button"
              onClick={() => { setTipo("gasto"); }}
              className={`flex flex-1 items-center justify-center gap-2 rounded-lg px-4 py-3 text-sm font-medium transition-all ${
                tipo === "gasto"
                  ? "bg-zinc-700 text-red-400 shadow-sm"
                  : "text-zinc-500 hover:text-zinc-300"
              }`}
            >
              <Minus className="h-4 w-4" />
              Gasto
            </button>
            <button
              type="button"
              onClick={() => { setTipo("ingreso"); setRecurrente(false); }}
              className={`flex flex-1 items-center justify-center gap-2 rounded-lg px-4 py-3 text-sm font-medium transition-all ${
                tipo === "ingreso"
                  ? "bg-zinc-700 text-emerald-400 shadow-sm"
                  : "text-zinc-500 hover:text-zinc-300"
              }`}
            >
              <Plus className="h-4 w-4" />
              Ingreso
            </button>
          </div>
        </div>

        {/* Cantidad */}
        <div>
          <label
            htmlFor="cantidad"
            className="mb-2 block text-sm font-medium text-zinc-300"
          >
            Cantidad (€)
          </label>
          <div className="relative">
            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-lg font-semibold text-zinc-500">
              €
            </span>
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
              className={`block w-full rounded-xl border bg-zinc-900/40 px-4 py-3.5 pl-8 text-lg font-semibold text-zinc-100 placeholder-zinc-600 transition-colors focus:outline-none focus:ring-2 ${
                ocrExitoso
                  ? "border-emerald-400 focus:border-emerald-500 focus:ring-emerald-500/20"
                  : "border-zinc-700 focus:border-emerald-500 focus:ring-emerald-500/20"
              }`}
            />
          </div>
        </div>

        {/* Categoría */}
        <div>
          <label
            htmlFor="categoria"
            className="mb-2 block text-sm font-medium text-zinc-300"
          >
            Categoría
          </label>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {categorias.map((cat) => {
              const seleccionada = categoria === cat.value;
              return (
                <button
                  key={cat.value}
                  type="button"
                  onClick={() => setCategoria(cat.value)}
                  className={`flex items-center gap-2 rounded-lg border px-3 py-2.5 text-sm font-medium transition-all ${
                    seleccionada
                      ? "border-emerald-600 bg-emerald-950/50 text-emerald-400"
                      : "border-zinc-700 bg-zinc-900/40 text-zinc-400 hover:border-zinc-600 hover:bg-zinc-800/40"
                  }`}
                >
                  {seleccionada && <Check className="h-3.5 w-3.5 shrink-0" />}
                  <span className="truncate">{cat.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Gasto recurrente */}
        {tipo === "gasto" && (
          <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-zinc-700 bg-zinc-900/40 px-4 py-3 transition-colors hover:bg-zinc-800/40">
            <input
              type="checkbox"
              checked={recurrente}
              onChange={(e) => setRecurrente(e.target.checked)}
              className="h-5 w-5 rounded border-zinc-600 text-emerald-600 focus:ring-emerald-500"
            />
            <div>
              <span className="text-sm font-medium text-zinc-100">
                Gasto fijo mensual
              </span>
              <p className="text-xs text-zinc-400">
                Se creará automáticamente el día 1 de cada mes
              </p>
            </div>
          </label>
        )}

        {/* Concepto + IA auto-categorización */}
        <div>
          <label
            htmlFor="concepto"
            className="mb-2 block text-sm font-medium text-zinc-300"
          >
            Concepto <span className="text-zinc-500">(opcional)</span>
          </label>
          <div className="relative">
            <input
              id="concepto"
              type="text"
              value={concepto}
              onChange={manejarCambioConcepto}
              onBlur={manejarBlurConcepto}
              placeholder="Ej: Compra semanal, Café, etc."
              className={`block w-full rounded-xl border bg-zinc-900/40 px-4 py-3 pr-10 text-sm text-zinc-100 placeholder-zinc-500 transition-colors focus:outline-none focus:ring-2 ${
                ocrExitoso
                  ? "border-emerald-400 focus:border-emerald-500 focus:ring-emerald-500/20"
                  : "border-zinc-700 focus:border-emerald-500 focus:ring-emerald-500/20"
              } ${categorizando ? "border-emerald-500/50" : ""}`}
            />
            {categorizando && (
              <div className="absolute right-3 top-1/2 -translate-y-1/2">
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-emerald-500 border-t-transparent" />
              </div>
            )}
          </div>
          {categorizando && (
            <p className="mt-1 text-xs text-emerald-500/70">
              <Sparkles className="mr-1 inline h-3 w-3" />
              Categorizando con IA…
            </p>
          )}
        </div>

        {error && (
          <div className="rounded-lg bg-red-950/50 px-4 py-3 text-sm text-red-400">
            {error}
          </div>
        )}

        {offlineGuardado && (
          <div className="flex items-center gap-2 rounded-lg bg-amber-950/40 px-4 py-3 text-sm text-amber-400">
            <CloudOff className="h-4 w-4 shrink-0" />
            Guardado en local (sin conexión) — se subirá cuando tengas internet
          </div>
        )}

        <BotonGuardar
          tipo={tipo}
          enviando={enviando}
          flash={flash}
        />
      </form>
    </div>
  );
}
