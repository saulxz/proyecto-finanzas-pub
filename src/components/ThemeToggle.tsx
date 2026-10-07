"use client";

import { Sun, Moon } from "lucide-react";
import { useTheme } from "@/context/ThemeContext";

export default function ThemeToggle() {
  const { tema, setTema } = useTheme();

  // Resolver qué opción está activa (claro / oscuro)
  // Si está en "sistema", mostramos la opción resuelta
  const activo: "claro" | "oscuro" =
    tema === "sistema"
      ? window.matchMedia("(prefers-color-scheme: dark)").matches
        ? "oscuro"
        : "claro"
      : tema;

  return (
    <div className="relative flex h-9 w-[4.25rem] items-center rounded-full bg-slate-200/80 backdrop-blur-md dark:bg-slate-700/80">
      {/* Pastilla deslizante */}
      <div
        className={`absolute left-0.5 top-0.5 h-8 w-8 rounded-full bg-white shadow-sm transition-all duration-300 ease-in-out dark:bg-slate-800 ${
          activo === "oscuro" ? "translate-x-[1.625rem]" : "translate-x-0"
        }`}
      />

      {/* Botón Claro */}
      <button
        onClick={() => setTema("claro")}
        className={`relative z-10 flex h-full w-1/2 items-center justify-center rounded-full transition-colors ${
          activo === "claro"
            ? "text-amber-500"
            : "text-slate-500 dark:text-slate-400"
        }`}
        aria-label="Modo claro"
      >
        <Sun className="h-4 w-4" />
      </button>

      {/* Botón Oscuro */}
      <button
        onClick={() => setTema("oscuro")}
        className={`relative z-10 flex h-full w-1/2 items-center justify-center rounded-full transition-colors ${
          activo === "oscuro"
            ? "text-slate-900 dark:text-blue-400"
            : "text-slate-500 dark:text-slate-400"
        }`}
        aria-label="Modo oscuro"
      >
        <Moon className="h-4 w-4" />
      </button>
    </div>
  );
}
