"use client";

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  type ReactNode,
} from "react";

type Tema = "claro" | "oscuro" | "sistema";

interface ThemeContextType {
  tema: Tema;
  /** true si el tema actual (resuelto) es oscuro */
  oscuro: boolean;
  /** true si el modo OLED (negro puro) está activo */
  oled: boolean;
  /** Cambia el tema: "claro", "oscuro" o "sistema" (sigue al sistema) */
  setTema: (tema: Tema) => void;
  /** Alterna entre claro y oscuro (ignora sistema) */
  toggleTema: () => void;
  /** Activa o desactiva el modo OLED (solo afecta en oscuro) */
  setOled: (activo: boolean) => void;
}

const ThemeContext = createContext<ThemeContextType | null>(null);

const STORAGE_KEY = "theme";
const STORAGE_KEY_OLED = "oled-mode";

function obtenerTemaInicial(): Tema {
  if (typeof window === "undefined") return "sistema";
  try {
    const guardado = localStorage.getItem(STORAGE_KEY) as Tema | null;
    if (guardado === "claro" || guardado === "oscuro") return guardado;
  } catch {
    // localStorage no disponible
  }
  return "sistema";
}

function obtenerOledInicial(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return localStorage.getItem(STORAGE_KEY_OLED) === "true";
  } catch {
    return false;
  }
}

function resolverOscuro(tema: Tema): boolean {
  if (tema === "oscuro") return true;
  if (tema === "claro") return false;
  if (typeof window === "undefined") return false;
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

function actualizarClasesHtml(oscuro: boolean, oled: boolean) {
  const root = document.documentElement;
  root.classList.toggle("dark", oscuro);
  root.classList.toggle("oled", oscuro && oled);
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [tema, setTemaState] = useState<Tema>(obtenerTemaInicial);
  const [oscuro, setOscuro] = useState(true);
  const [oled, setOledState] = useState(obtenerOledInicial);

  // Sincronizar el estado con el DOM
  useEffect(() => {
    const esOscuro = resolverOscuro(tema);
    setOscuro(esOscuro);
    actualizarClasesHtml(esOscuro, oled);

    try {
      if (tema === "sistema") {
        localStorage.removeItem(STORAGE_KEY);
      } else {
        localStorage.setItem(STORAGE_KEY, tema);
      }
    } catch {
      // localStorage no disponible
    }
  }, [tema, oled]);

  // Escuchar cambios del sistema cuando está en modo "sistema"
  useEffect(() => {
    if (tema !== "sistema") return;

    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = (e: MediaQueryListEvent) => {
      const esOscuro = e.matches;
      setOscuro(esOscuro);
      actualizarClasesHtml(esOscuro, oled);
    };

    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, [tema, oled]);

  const setTema = useCallback((nuevoTema: Tema) => {
    setTemaState(nuevoTema);
  }, []);

  const toggleTema = useCallback(() => {
    setTemaState((prev) => {
      if (prev === "claro") return "oscuro";
      if (prev === "oscuro") return "claro";
      const esOscuro = resolverOscuro(prev);
      return esOscuro ? "claro" : "oscuro";
    });
  }, []);

  const setOled = useCallback((activo: boolean) => {
    setOledState(activo);
    try {
      if (activo) {
        localStorage.setItem(STORAGE_KEY_OLED, "true");
      } else {
        localStorage.removeItem(STORAGE_KEY_OLED);
      }
    } catch {
      // localStorage no disponible
    }
  }, []);

  return (
    <ThemeContext.Provider
      value={{ tema, oscuro, oled, setTema, toggleTema, setOled }}
    >
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextType {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error("useTheme debe usarse dentro de <ThemeProvider>");
  }
  return ctx;
}
