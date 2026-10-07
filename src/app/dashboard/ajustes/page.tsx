"use client";

import { useState, useRef, useCallback } from "react";
import { useTheme } from "@/context/ThemeContext";
import { useCategorias } from "@/lib/useCategorias";
import {
  Sun,
  Moon,
  Monitor,
  Smartphone,
  Download,
  Upload,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Plus,
  Trash2,
  FileSpreadsheet,
} from "lucide-react";

export default function AjustesPage() {
  const { tema, setTema, oled, setOled, oscuro } = useTheme();
  const { categorias, cargando, agregar, eliminar, recargar } = useCategorias();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [exportando, setExportando] = useState(false);
  const [importando, setImportando] = useState(false);
  const [mensaje, setMensaje] = useState<{
    tipo: "exito" | "error";
    texto: string;
  } | null>(null);
  const [nuevaCategoria, setNuevaCategoria] = useState("");
  const [errorCategoria, setErrorCategoria] = useState<string | null>(null);
  const [creandoCategoria, setCreandoCategoria] = useState(false);

  // ── Importar Excel ──────────────────────────────────────────────

  const excelInputRef = useRef<HTMLInputElement>(null);
  const [arrastrando, setArrastrando] = useState(false);
  const [importandoExcel, setImportandoExcel] = useState(false);

  const manejarImportarExcel = async (archivo: File) => {
    if (!archivo.name.match(/\.(xlsx|xls|csv)$/i)) {
      setMensaje({
        tipo: "error",
        texto: "El archivo debe ser .xlsx, .xls o .csv",
      });
      return;
    }

    setImportandoExcel(true);
    setMensaje(null);

    try {
      const formData = new FormData();
      formData.append("archivo", archivo);

      const res = await fetch("/api/importar-excel", {
        method: "POST",
        body: formData,
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Error al importar");
      }

      const texto = `Importación completada: ${data.añadidas} transacción${data.añadidas !== 1 ? "es" : ""} añadida${data.añadidas !== 1 ? "s" : ""}${data.omitidas > 0 ? `, ${data.omitidas} duplicado${data.omitidas !== 1 ? "s" : ""} omitido${data.omitidas !== 1 ? "s" : ""}` : ""}`;

      setMensaje({ tipo: "exito", texto });
    } catch (err) {
      setMensaje({
        tipo: "error",
        texto: err instanceof Error ? err.message : "Error al importar",
      });
    } finally {
      setImportandoExcel(false);
    }
  };

  const manejarDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setArrastrando(false);

    const archivo = e.dataTransfer.files?.[0];
    if (archivo) manejarImportarExcel(archivo);
  }, []);

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

  const manejarInputExcel = (e: React.ChangeEvent<HTMLInputElement>) => {
    const archivo = e.target.files?.[0];
    if (!archivo) return;
    e.target.value = "";
    manejarImportarExcel(archivo);
  };

  const opciones: {
    valor: "claro" | "oscuro" | "sistema";
    label: string;
    icono: typeof Sun;
  }[] = [
    { valor: "claro", label: "Claro", icono: Sun },
    { valor: "oscuro", label: "Oscuro", icono: Moon },
    { valor: "sistema", label: "Sistema", icono: Monitor },
  ];

  // ── Exportar ──────────────────────────────────────────────────

  const manejarExportar = async () => {
    setExportando(true);
    setMensaje(null);

    try {
      const res = await fetch("/api/backup");
      if (!res.ok) throw new Error("Error al generar la copia");

      const datos = await res.json();
      const blob = new Blob([JSON.stringify(datos, null, 2)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const fecha = new Date().toISOString().split("T")[0];
      a.download = `finanzas-respaldo-${fecha}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      setMensaje({
        tipo: "exito",
        texto: `Copia de seguridad descargada (${(blob.size / 1024).toFixed(1)} KB)`,
      });
    } catch (err) {
      setMensaje({
        tipo: "error",
        texto: err instanceof Error ? err.message : "Error al exportar",
      });
    } finally {
      setExportando(false);
    }
  };

  // ── Importar ───────────────────────────────────────────────────

  const manejarSeleccionarArchivo = () => {
    fileInputRef.current?.click();
  };

  const manejarImportar = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const archivo = e.target.files?.[0];
    if (!archivo) return;

    // Resetear el input para permitir re-seleccionar el mismo archivo
    e.target.value = "";

    if (archivo.type !== "application/json" && !archivo.name.endsWith(".json")) {
      setMensaje({ tipo: "error", texto: "El archivo debe ser .json" });
      return;
    }

    const confirmar = window.confirm(
      "¿Estás seguro? Esta acción borrará TODOS los datos actuales " +
        "(transacciones, presupuestos y cierres mensuales) y los " +
        "reemplazará con los del archivo de respaldo.\n\n" +
        "Esta operación no se puede deshacer."
    );

    if (!confirmar) return;

    setImportando(true);
    setMensaje(null);

    try {
      const texto = await archivo.text();
      const datos = JSON.parse(texto);

      const res = await fetch("/api/backup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(datos),
      });

      const respuesta = await res.json();

      if (!res.ok) {
        throw new Error(respuesta.error || "Error al importar");
      }

      setMensaje({
        tipo: "exito",
        texto: `Restaurados ${respuesta.resultados?.transacciones || 0} transacciones, ${respuesta.resultados?.presupuestos || 0} presupuestos y ${respuesta.resultados?.cierres_mensuales || 0} cierres.`,
      });
    } catch (err) {
      setMensaje({
        tipo: "error",
        texto: err instanceof Error ? err.message : "Error al importar",
      });
    } finally {
      setImportando(false);
    }
  };

  // ── Categorías ──────────────────────────────────────────────────

  const manejarAgregarCategoria = async () => {
    const label = nuevaCategoria.trim();
    if (!label) {
      setErrorCategoria("Escribe el nombre de la categoría");
      return;
    }
    const value = label.toLowerCase().replace(/\s+/g, "_").normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    setCreandoCategoria(true);
    setErrorCategoria(null);
    const err = await agregar(value, label);
    if (err) {
      setErrorCategoria(err);
    } else {
      setNuevaCategoria("");
    }
    setCreandoCategoria(false);
  };

  const manejarEliminarCategoria = async (id: string) => {
    if (!window.confirm("¿Eliminar esta categoría? Las transacciones existentes no se verán afectadas."))
      return;
    const err = await eliminar(id);
    if (err) setErrorCategoria(err);
  };

  return (
    <div className="mx-auto max-w-2xl space-y-4 px-4 py-4 md:px-6 md:py-6">
      <div>
        <h1 className="text-base font-medium dark:text-zinc-100 text-zinc-900">
          Ajustes
        </h1>
        <p className="text-xs text-zinc-500">
          Personaliza tu experiencia
        </p>
      </div>

      {/* Apariencia */}
      <div className="rounded-lg border dark:border-zinc-800/40 border-zinc-200 dark:bg-black bg-white">
        <div className="border-b dark:border-zinc-800/40 border-zinc-200 px-4 py-2.5">
          <h2 className="text-xs font-medium dark:text-zinc-100 text-zinc-900">
            Apariencia
          </h2>
          <p className="text-xs text-zinc-500">
            Selecciona tu modo de visualización preferido
          </p>
        </div>

        <div className="flex gap-px overflow-hidden rounded-md border dark:border-zinc-800/40 border-zinc-200 m-3">
          {opciones.map((op) => {
            const Icono = op.icono;
            const activo = tema === op.valor;
            return (
              <button
                key={op.valor}
                onClick={() => setTema(op.valor)}
                className={`flex flex-1 items-center justify-center gap-2 py-2 text-xs font-medium transition-colors ${
                  activo
                    ? "dark:bg-zinc-800 dark:text-zinc-100 bg-zinc-100 text-zinc-900"
                    : "dark:text-zinc-500 dark:hover:text-zinc-300 text-zinc-400 hover:text-zinc-600 dark:bg-black bg-white"
                }`}
              >
                <Icono className="h-3.5 w-3.5" />
                {op.label}
              </button>
            );
          })}
        </div>

        {/* Modo OLED — visible solo si el tema resuelto es oscuro */}
        {oscuro && (
          <div className="border-t dark:border-zinc-800/40 border-zinc-200 px-4 py-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Smartphone
                  className={`h-5 w-5 ${
                    oled ? "text-emerald-400" : "dark:text-zinc-500 text-zinc-400"
                  }`}
                />
                <div>
                  <p className="text-sm font-medium dark:text-zinc-100 text-zinc-900">
                    Negro puro (OLED)
                  </p>
                  <p className="text-xs dark:text-zinc-500 text-zinc-400">
                    Fondos completamente negros para ahorrar batería
                  </p>
                </div>
              </div>
              <button
                onClick={() => setOled(!oled)}
                className={`relative h-6 w-10 shrink-0 rounded-full transition-colors ${
                  oled ? "bg-emerald-600" : "dark:bg-zinc-700 bg-zinc-300"
                }`}
                aria-label="Activar modo OLED"
              >
                <span
                  className={`absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow-sm transition-transform ${
                    oled ? "translate-x-4" : "translate-x-0"
                  }`}
                />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Copia de seguridad */}
      <div className="rounded-lg border dark:border-zinc-800/40 border-zinc-200 dark:bg-black bg-white">
        <div className="border-b dark:border-zinc-800/40 border-zinc-200 px-4 py-2.5">
          <h2 className="text-xs font-medium dark:text-zinc-100 text-zinc-900">
            Copia de seguridad
          </h2>
          <p className="text-xs text-zinc-500">
            Exporta tus datos o restaura una copia previa
          </p>
        </div>

        <div className="space-y-2 p-4">
          {/* Botón exportar */}
          <button
            onClick={manejarExportar}
            disabled={exportando}
            className="flex w-full items-center gap-3 rounded-md border dark:border-zinc-800/40 border-zinc-200 px-3 py-2 text-sm font-medium dark:text-zinc-300 text-zinc-700 transition-colors dark:hover:bg-zinc-800/40 hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {exportando ? (
              <Loader2 className="h-4 w-4 animate-spin text-emerald-600" />
            ) : (
              <Download className="h-4 w-4 text-emerald-600" />
            )}
            <span className="flex-1 text-left text-xs">
              {exportando ? "Exportando..." : "Descargar copia de seguridad"}
            </span>
          </button>

          {/* Botón importar */}
          <input
            ref={fileInputRef}
            type="file"
            accept=".json"
            className="hidden"
            onChange={manejarImportar}
          />
          <button
            onClick={manejarSeleccionarArchivo}
            disabled={importando}
            className="flex w-full items-center gap-3 rounded-md border dark:border-zinc-800/40 border-zinc-200 px-3 py-2 text-sm font-medium dark:text-zinc-300 text-zinc-700 transition-colors dark:hover:bg-zinc-800/40 hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {importando ? (
              <Loader2 className="h-4 w-4 animate-spin text-amber-600" />
            ) : (
              <Upload className="h-4 w-4 text-amber-600" />
            )}
            <span className="flex-1 text-left text-xs">
              {importando
                ? "Restaurando..."
                : "Importar copia de seguridad"}
            </span>
          </button>

          {/* Aviso */}
          <p className="text-[11px] text-zinc-500">
            Al importar se sobrescribirán todos los datos actuales. Esta
            operación no se puede deshacer.
          </p>
        </div>
      </div>

      {/* Importar Excel / CSV */}
      <div className="rounded-lg border dark:border-zinc-800/40 border-zinc-200 dark:bg-black bg-white">
        <div className="border-b dark:border-zinc-800/40 border-zinc-200 px-4 py-2.5">
          <h2 className="text-xs font-medium dark:text-zinc-100 text-zinc-900">
            Importar Excel / CSV
          </h2>
          <p className="text-xs text-zinc-500">
            Fusiona transacciones desde una hoja de cálculo
          </p>
        </div>

        <div className="p-4">
          {/* Zona de drag & drop */}
          <div
            onDrop={manejarDrop}
            onDragOver={manejarDragOver}
            onDragLeave={manejarDragLeave}
            onClick={() => excelInputRef.current?.click()}
            className={`flex cursor-pointer flex-col items-center justify-center gap-2 rounded-md border-2 border-dashed px-4 py-8 transition-colors ${
              arrastrando
                ? "border-emerald-500 dark:bg-emerald-950/20 bg-emerald-50"
                : "dark:border-zinc-800/40 border-zinc-200 dark:hover:border-zinc-700 hover:border-zinc-300"
            }`}
          >
            <FileSpreadsheet
              className={`h-6 w-6 ${
                arrastrando ? "text-emerald-500" : "text-zinc-500"
              }`}
            />
            <p className="text-xs text-zinc-500">
              {arrastrando
                ? "Suelta el archivo aquí"
                : "Arrastra un archivo Excel o CSV, o haz clic para seleccionar"}
            </p>
            <p className="text-[11px] text-zinc-600">
              .xlsx &middot; .xls &middot; .csv
            </p>
          </div>

          <input
            ref={excelInputRef}
            type="file"
            accept=".xlsx,.xls,.csv"
            className="hidden"
            onChange={manejarInputExcel}
          />

          {/* Botón alternativo */}
          <button
            onClick={() => excelInputRef.current?.click()}
            disabled={importandoExcel}
            className="mt-3 flex w-full items-center gap-3 rounded-md border dark:border-zinc-800/40 border-zinc-200 px-3 py-2 text-sm font-medium dark:text-zinc-300 text-zinc-700 transition-colors dark:hover:bg-zinc-800/40 hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {importandoExcel ? (
              <Loader2 className="h-4 w-4 animate-spin text-emerald-600" />
            ) : (
              <Upload className="h-4 w-4 text-emerald-600" />
            )}
            <span className="flex-1 text-left text-xs">
              {importandoExcel
                ? "Importando..."
                : "Importar Excel / CSV"}
            </span>
          </button>
        </div>
      </div>

      {/* Categorías */}
      <div className="rounded-lg border dark:border-zinc-800/40 border-zinc-200 dark:bg-black bg-white">
        <div className="border-b dark:border-zinc-800/40 border-zinc-200 px-4 py-2.5">
          <h2 className="text-xs font-medium dark:text-zinc-100 text-zinc-900">
            Categorías
          </h2>
          <p className="text-xs text-zinc-500">
            Añade o elimina categorías para clasificar tus transacciones
          </p>
        </div>

        <div className="space-y-3 p-4">
          {/* Formulario añadir */}
          <div className="flex gap-2">
            <input
              type="text"
              value={nuevaCategoria}
              onChange={(e) => setNuevaCategoria(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") manejarAgregarCategoria(); }}
              placeholder="Nueva categoría (ej: Transporte)"
              className="min-w-0 flex-1 rounded-md border dark:border-zinc-800/40 border-zinc-200 dark:bg-black bg-white px-3 py-1.5 text-sm dark:text-zinc-100 text-zinc-900 placeholder-zinc-500 transition-colors focus:border-emerald-500 focus:outline-none"
            />
            <button
              onClick={manejarAgregarCategoria}
              disabled={creandoCategoria}
              className="flex items-center gap-1.5 rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {creandoCategoria ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Plus className="h-3.5 w-3.5" />
              )}
              Añadir
            </button>
          </div>

          {errorCategoria && (
            <p className="flex items-center gap-1.5 text-xs text-red-400">
              <AlertCircle className="h-3.5 w-3.5" />
              {errorCategoria}
            </p>
          )}

          {/* Lista de categorías */}
          {cargando ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-zinc-500" />
            </div>
          ) : categorias.length === 0 ? (
            <p className="py-4 text-center text-sm text-zinc-500">
              No hay categorías. Añade la primera usando el formulario de arriba.
            </p>
          ) : (
            <div className="grid gap-px overflow-hidden rounded-md border dark:border-zinc-800/40 border-zinc-200 dark:bg-zinc-800/40 bg-zinc-200">
              {categorias.map((cat) => (
                <div
                  key={cat.id}
                  className="flex items-center gap-3 px-3 py-2.5 dark:bg-black bg-white"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium dark:text-zinc-200 text-zinc-800">
                      {cat.label}
                    </p>
                    <p className="truncate text-[11px] text-zinc-500">
                      {cat.value}
                    </p>
                  </div>
                  <button
                    onClick={() => manejarEliminarCategoria(cat.id)}
                    className="shrink-0 rounded-md p-1.5 text-zinc-500 transition-colors dark:hover:bg-red-950/50 hover:bg-red-50 hover:text-red-400"
                    title="Eliminar categoría"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Mensaje de feedback */}
      {mensaje && (
        <div
          className={`flex items-start gap-2.5 rounded-lg px-4 py-3 text-sm ${
            mensaje.tipo === "exito"
              ? "dark:bg-emerald-950/30 dark:text-emerald-300 bg-emerald-50 text-emerald-700"
              : "dark:bg-red-950/30 dark:text-red-300 bg-red-50 text-red-700"
          }`}
        >
          {mensaje.tipo === "exito" ? (
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
          ) : (
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          )}
          <span>{mensaje.texto}</span>
        </div>
      )}
    </div>
  );
}
