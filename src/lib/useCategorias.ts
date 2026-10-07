"use client";

import { useState, useEffect, useCallback } from "react";

export interface CategoriaItem {
  id: string;
  value: string;
  label: string;
  icon: string;
}

const STORAGE_KEY = "categorias_cache";

export function useCategorias() {
  const [categorias, setCategorias] = useState<CategoriaItem[]>([]);
  const [cargando, setCargando] = useState(true);

  const cargar = useCallback(async () => {
    try {
      const res = await fetch("/api/categorias");
      if (!res.ok) throw new Error("Error al cargar categorías");
      const data: CategoriaItem[] = await res.json();
      setCategorias(data);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch {
      // Fallback a caché local
      const cache = localStorage.getItem(STORAGE_KEY);
      if (cache) {
        try {
          setCategorias(JSON.parse(cache));
        } catch {
          /* ignore */
        }
      }
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const agregar = useCallback(
    async (value: string, label: string): Promise<string | null> => {
      const res = await fetch("/api/categorias", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ value, label }),
      });
      if (!res.ok) {
        const err = await res.json();
        return err.error || "Error al crear categoría";
      }
      await cargar();
      return null;
    },
    [cargar]
  );

  const eliminar = useCallback(
    async (id: string): Promise<string | null> => {
      const res = await fetch(`/api/categorias?id=${id}`, { method: "DELETE" });
      if (!res.ok) {
        const err = await res.json();
        return err.error || "Error al eliminar categoría";
      }
      await cargar();
      return null;
    },
    [cargar]
  );

  const obtenerLabel = useCallback(
    (value: string): string => {
      return categorias.find((c) => c.value === value)?.label || value;
    },
    [categorias]
  );

  return { categorias, cargando, agregar, eliminar, recargar: cargar, obtenerLabel };
}
