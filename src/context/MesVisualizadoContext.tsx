"use client";

import { createContext, useContext, useState, useCallback, type ReactNode } from "react";

interface MesInfo {
  year: number | null;
  month: number | null; // 0-11, null → "todas"
}

interface MesVisualizadoContextType {
  mes: MesInfo;
  /** Actualiza el mes que el usuario está visualizando. */
  setMes: (year: number | null, month: number | null) => void;
}

const MesVisualizadoContext = createContext<MesVisualizadoContextType | null>(null);

export function MesVisualizadoProvider({ children }: { children: ReactNode }) {
  const ahora = new Date();
  const [mes, setMesState] = useState<MesInfo>({
    year: ahora.getFullYear(),
    month: ahora.getMonth(),
  });

  const setMes = useCallback((year: number | null, month: number | null) => {
    setMesState({ year, month });
  }, []);

  return (
    <MesVisualizadoContext.Provider value={{ mes, setMes }}>
      {children}
    </MesVisualizadoContext.Provider>
  );
}

export function useMesVisualizado(): MesVisualizadoContextType {
  const ctx = useContext(MesVisualizadoContext);
  if (!ctx) {
    throw new Error("useMesVisualizado debe usarse dentro de <MesVisualizadoProvider>");
  }
  return ctx;
}

/** Helper: devuelve el mes como "YYYY-M" o "todas" */
export function mesKey(mes: MesInfo): string {
  if (mes.year === null || mes.month === null) return "todas";
  return `${mes.year}-${mes.month}`;
}
