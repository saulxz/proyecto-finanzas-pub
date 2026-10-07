"use client";

import { useState, useRef, useEffect } from "react";
import {
  Bot,
  Send,
  Loader2,
  Sparkles,
  User,
  AlertCircle,
  X,
  MessageCircle,
} from "lucide-react";
import { useMesVisualizado } from "@/context/MesVisualizadoContext";

interface Mensaje {
  rol: "usuario" | "asistente";
  contenido: string;
}

export default function ChatBubble() {
  const [abierto, setAbierto] = useState(false);
  const [mensaje, setMensaje] = useState("");
  const [historial, setHistorial] = useState<Mensaje[]>([
    {
      rol: "asistente",
      contenido:
        "¡Hola! Soy tu asistente financiero. Pregúntame sobre tus gastos, ingresos o presupuestos del mes.\n\n- **¿Cuánto llevamos en supermercados?**\n- **¿Nos queda presupuesto para ocio?**\n- **Dame un consejo para ahorrar**",
    },
  ]);
  const { mes: mesVisualizado } = useMesVisualizado();
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const finRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (abierto) {
      setTimeout(() => finRef.current?.scrollIntoView({ behavior: "smooth" }), 100);
      setTimeout(() => inputRef.current?.focus(), 200);
    }
  }, [abierto, historial]);

  const manejarEnviar = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!mensaje.trim() || enviando) return;

    const mensajeUsuario = mensaje.trim();
    setMensaje("");
    setError(null);

    const nuevoHistorial: Mensaje[] = [
      ...historial,
      { rol: "usuario", contenido: mensajeUsuario },
    ];
    setHistorial(nuevoHistorial);
    setEnviando(true);

    try {
      const body: Record<string, unknown> = {
        mensaje: mensajeUsuario,
        historial: nuevoHistorial.map((m) => ({
          rol: m.rol,
          contenido: m.contenido,
        })),
      };

      // Pasar el mes que el usuario está visualizando (si es un mes específico)
      if (mesVisualizado.year !== null && mesVisualizado.month !== null) {
        body.year = mesVisualizado.year;
        body.month = mesVisualizado.month;
      }

      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Error al obtener respuesta");
      }

      const datos = await res.json();
      setHistorial((prev) => [
        ...prev,
        { rol: "asistente", contenido: datos.respuesta },
      ]);

      // Si se registró una transacción, recargar la página para reflejar los cambios
      if (datos.recargar) {
        setTimeout(() => window.location.reload(), 1500);
      }
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Error de conexión"
      );
    } finally {
      setEnviando(false);
    }
  };

  const formatearRespuesta = (texto: string): string => {
    return texto
      .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
      .replace(/\n/g, "<br />");
  };

  return (
    <>
      {/* Botón flotante */}
      {!abierto && (
        <button
          onClick={() => setAbierto(true)}
          className="fixed bottom-20 right-4 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-emerald-500 to-emerald-600 text-white shadow-lg shadow-emerald-300/40 transition-all hover:scale-110 hover:shadow-xl active:scale-95 dark:shadow-emerald-950/40 md:bottom-6"
          aria-label="Abrir asistente IA"
        >
          <MessageCircle className="h-6 w-6" />
        </button>
      )}

      {/* Panel de chat */}
      {abierto && (
        <>
          {/* Overlay en móvil */}
          <div
            className="fixed inset-0 z-40 bg-black/20 md:bg-transparent md:pointer-events-none"
            onClick={() => setAbierto(false)}
          />

          <div className="fixed bottom-20 right-4 z-50 flex w-[calc(100vw-2rem)] max-w-[400px] flex-col rounded-2xl border border-slate-200 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-900 md:bottom-6 md:w-[380px]">
            {/* Cabecera */}
            <div className="flex items-center justify-between rounded-t-2xl border-b border-slate-200 bg-gradient-to-r from-emerald-600 to-emerald-500 px-4 py-3 dark:border-slate-700">
              <div className="flex items-center gap-2.5">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/20">
                  <Bot className="h-4 w-4 text-white" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-white">
                    Asistente IA
                  </h3>
                  <p className="text-[10px] text-white/70">
                    Consulta tus finanzas
                  </p>
                </div>
              </div>
              <button
                onClick={() => setAbierto(false)}
                className="flex h-7 w-7 items-center justify-center rounded-lg bg-white/10 text-white/80 transition-colors hover:bg-white/20"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Mensajes */}
            <div className="flex-1 overflow-y-auto px-4 py-4" style={{ maxHeight: "380px" }}>
              <div className="space-y-3">
                {historial.map((msg, i) => (
                  <div
                    key={i}
                    className={`flex gap-2 ${msg.rol === "usuario" ? "justify-end" : "justify-start"}`}
                  >
                    {msg.rol === "asistente" && (
                      <div className="mt-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-emerald-100 dark:bg-emerald-950/50">
                        <Sparkles className="h-3 w-3 text-emerald-600" />
                      </div>
                    )}

                    <div
                      className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed ${
                        msg.rol === "usuario"
                          ? "bg-emerald-600 text-white"
                          : "border border-slate-200 bg-slate-50 text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
                      }`}
                    >
                      {msg.rol === "asistente" ? (
                        <div
                          className="prose prose-sm max-w-none dark:prose-invert prose-strong:text-slate-800 dark:prose-strong:text-slate-100 [&>br]:leading-relaxed"
                          dangerouslySetInnerHTML={{
                            __html: formatearRespuesta(msg.contenido),
                          }}
                        />
                      ) : (
                        <p>{msg.contenido}</p>
                      )}
                    </div>

                    {msg.rol === "usuario" && (
                      <div className="mt-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-slate-200 dark:bg-slate-700">
                        <User className="h-3 w-3 text-slate-600 dark:text-slate-400" />
                      </div>
                    )}
                  </div>
                ))}

                {enviando && (
                  <div className="flex gap-2">
                    <div className="mt-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-emerald-100 dark:bg-emerald-950/50">
                      <Sparkles className="h-3 w-3 text-emerald-600" />
                    </div>
                    <div className="flex items-center gap-1.5 rounded-2xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 dark:border-slate-700 dark:bg-slate-800">
                      <Loader2 className="h-3.5 w-3.5 animate-spin text-emerald-600" />
                      <span className="text-xs text-slate-500 dark:text-slate-400">
                        Pensando...
                      </span>
                    </div>
                  </div>
                )}

                {error && (
                  <div className="flex items-start gap-1.5 rounded-xl bg-red-50 px-3 py-2 text-xs text-red-700 dark:bg-red-950/30 dark:text-red-400">
                    <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                    <span>{error}</span>
                  </div>
                )}

                <div ref={finRef} />
              </div>
            </div>

            {/* Input */}
            <form
              onSubmit={manejarEnviar}
              className="flex gap-2 border-t border-slate-200 p-3 dark:border-slate-700"
            >
              <input
                ref={inputRef}
                type="text"
                value={mensaje}
                onChange={(e) => setMensaje(e.target.value)}
                placeholder="Escribe tu pregunta..."
                disabled={enviando}
                className="flex-1 rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder-slate-400 outline-none transition-colors focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/20 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 dark:placeholder-slate-500"
              />
              <button
                type="submit"
                disabled={!mensaje.trim() || enviando}
                className="flex items-center justify-center rounded-xl bg-emerald-600 px-3.5 text-white transition-all hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {enviando ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
              </button>
            </form>
          </div>
        </>
      )}
    </>
  );
}
