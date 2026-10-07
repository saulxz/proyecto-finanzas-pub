"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  obtenerCola,
  limpiarCola,
  hayPendientes,
  contarPendientes,
} from "@/lib/cola-offline";
import { Cloud, CloudOff, Loader2, Check } from "lucide-react";

type EstadoToast =
  | { tipo: "offline"; pendientes: number }
  | { tipo: "sincronizando" }
  | { tipo: "completado"; cuantos: number }
  | null;

export default function SincronizadorOffline() {
  const supabase = createClient();
  const [toast, setToast] = useState<EstadoToast>(null);
  const temporizador = useRef<ReturnType<typeof setTimeout> | null>(null);

  const ocultarToast = useCallback(() => {
    if (temporizador.current) clearTimeout(temporizador.current);
    temporizador.current = setTimeout(() => setToast(null), 4000);
  }, []);

  const procesarCola = useCallback(async () => {
    const pendientes = obtenerCola();
    if (pendientes.length === 0) return;

    setToast({ tipo: "sincronizando" });

    try {
      const { data: authData } = await supabase.auth.getUser();
      if (!authData.user) {
        setToast(null);
        return;
      }

      const inserts = pendientes.map((t) => ({
        tipo: t.tipo,
        cantidad: t.cantidad,
        categoria: t.categoria,
        concepto: t.concepto,
        usuario_id: authData.user.id,
        recurrente: t.recurrente,
      }));

      const { error } = await supabase.from("transacciones").insert(inserts);

      if (error) {
        setToast(null);
        return;
      }

      limpiarCola();
      setToast({ tipo: "completado", cuantos: pendientes.length });
      ocultarToast();
    } catch {
      setToast(null);
    }
  }, [supabase, ocultarToast]);

  // Al montar, si hay pendientes e internet, procesar inmediatamente
  useEffect(() => {
    if (navigator.onLine && hayPendientes()) {
      procesarCola();
    }
  }, [procesarCola]);

  // Escuchar reconexión
  useEffect(() => {
    const manejarOnline = () => {
      if (hayPendientes()) {
        procesarCola();
      }
    };
    window.addEventListener("online", manejarOnline);
    return () => window.removeEventListener("online", manejarOnline);
  }, [procesarCola]);

  // Notificar cuando el usuario pierde conexión teniendo datos
  useEffect(() => {
    const manejarOffline = () => {
      if (hayPendientes()) {
        setToast({ tipo: "offline", pendientes: contarPendientes() });
        ocultarToast();
      }
    };
    window.addEventListener("offline", manejarOffline);
    return () => window.removeEventListener("offline", manejarOffline);
  }, [ocultarToast]);

  // Mostrar indicador offline al inicio si ya hay pendientes
  useEffect(() => {
    if (!navigator.onLine && hayPendientes()) {
      setToast({ tipo: "offline", pendientes: contarPendientes() });
      ocultarToast();
    }
  }, [ocultarToast]);

  if (!toast) return null;

  return (
    <div className="fixed bottom-20 left-1/2 z-50 -translate-x-1/2 md:bottom-6">
      {toast.tipo === "offline" && (
        <div className="flex items-center gap-2 rounded-full border border-amber-200 bg-amber-50 px-4 py-2 text-xs font-medium text-amber-700 shadow-lg backdrop-blur-sm dark:border-amber-800/50 dark:bg-amber-950/80 dark:text-amber-400">
          <CloudOff className="h-3.5 w-3.5 shrink-0" />
          {toast.pendientes} transacción pendiente de subir
        </div>
      )}

      {toast.tipo === "sincronizando" && (
        <div className="flex items-center gap-2 rounded-full border border-sky-200 bg-sky-50 px-4 py-2 text-xs font-medium text-sky-700 shadow-lg backdrop-blur-sm dark:border-sky-800/50 dark:bg-sky-950/80 dark:text-sky-400">
          <Loader2 className="h-3.5 w-3.5 animate-spin shrink-0" />
          Sincronizando transacciones pendientes…
        </div>
      )}

      {toast.tipo === "completado" && (
        <div className="flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-4 py-2 text-xs font-medium text-emerald-700 shadow-lg backdrop-blur-sm dark:border-emerald-800/50 dark:bg-emerald-950/80 dark:text-emerald-400">
          <Check className="h-3.5 w-3.5 shrink-0" />
          {toast.cuantos} transaccione{toast.cuantos > 1 ? "s" : ""} sincronizada
          {toast.cuantos > 1 ? "s" : ""}
        </div>
      )}
    </div>
  );
}
