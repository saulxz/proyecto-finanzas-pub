"use client";

import { useState, useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import type { Perfil } from "@/types";
import {
  LayoutDashboard,
  PlusCircle,
  History,
  BarChart3,
  PiggyBank,
  Settings,
  Calendar,
  LogOut,
  User,
  Wallet,
  Menu,
  X,
} from "lucide-react";
import ChatBubble from "@/components/ChatBubble";
import SincronizadorOffline from "@/components/SincronizadorOffline";
import CierreMesModal from "@/components/CierreMesModal";
import { ThemeProvider } from "@/context/ThemeContext";
import { MesVisualizadoProvider } from "@/context/MesVisualizadoContext";
import { vibrar } from "@/lib/vibracion";

const itemsNav = [
  { href: "/dashboard", label: "Inicio", icon: LayoutDashboard },
  { href: "/dashboard/presupuestos", label: "Presupuestos", icon: PiggyBank },
  { href: "/dashboard/calendario", label: "Calendario", icon: Calendar },
  { href: "/dashboard/estadisticas", label: "Estadísticas", icon: BarChart3 },
  { href: "/dashboard/historial", label: "Historial", icon: History },
  { href: "/dashboard/ajustes", label: "Ajustes", icon: Settings },
];

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [perfil, setPerfil] = useState<Perfil | null>(null);
  const [cargando, setCargando] = useState(true);
  const [sidebarAbierta, setSidebarAbierta] = useState(false);
  const [cierreAbierto, setCierreAbierto] = useState(false);
  const [mesCierre, setMesCierre] = useState({ year: 0, month: 0 });
  const pathname = usePathname();
  const router = useRouter();
  const supabase = createClient();

  useEffect(() => {
    const obtenerPerfil = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        router.push("/auth/login");
        return;
      }

      const { data } = await supabase
        .from("perfiles")
        .select("*")
        .eq("id", user.id)
        .single();

      if (data) setPerfil(data);
      setCargando(false);
    };

    obtenerPerfil();
  }, [router, supabase]);

  // Detectar cambio de mes para mostrar informe de cierre
  useEffect(() => {
    const ahora = new Date();
    const clave = "ultimo-mes-visitado";
    const ultimo = localStorage.getItem(clave);
    const mesActual = `${ahora.getFullYear()}-${ahora.getMonth()}`;

    if (ultimo && ultimo !== mesActual) {
      // El navegador se usó por última vez en un mes anterior
      const [y, m] = ultimo.split("-").map(Number);
      setMesCierre({ year: y, month: m });
      setCierreAbierto(true);
    }

    localStorage.setItem(clave, mesActual);
  }, []);

  /* Vibración háptica al abrir la PWA en móvil */
  useEffect(() => {
    const esStandalone = window.matchMedia("(display-mode: standalone)").matches;
    if (esStandalone) {
      vibrar(8);
    }
  }, []);

  const cerrarSesion = async () => {
    await supabase.auth.signOut();
    router.push("/auth/login");
    router.refresh();
  };

  if (cargando) {
    return (
      <div className="flex min-h-dvh items-center justify-center" style={{ backgroundColor: 'var(--background)' }}>
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-emerald-600 border-t-transparent" />
          <p className="text-sm text-zinc-500">Cargando...</p>
        </div>
      </div>
    );
  }

  const primeraLetra = perfil?.nombre?.charAt(0).toUpperCase() || "?";

    return (
    <ThemeProvider>
    <MesVisualizadoProvider>
    <div className="flex min-h-dvh" style={{ backgroundColor: 'var(--background)' }}>
      {/* ===== SIDEBAR: visible en md+ ===== */}
      <aside
        className="hidden md:flex md:w-64 md:flex-col md:border-r md:border-zinc-800/60"
        style={{ backgroundColor: 'var(--sidebar)' }}
      >
        <div className="flex items-center gap-3 border-b border-zinc-800/60 px-6 py-5" style={{ backgroundColor: 'var(--sidebar)' }}>
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-600 text-white shadow-sm">
            <Wallet className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-zinc-100">
              Finance
            </h2>
            <p className="text-xs text-zinc-500">
              Control compartido
            </p>
          </div>
        </div>

        <nav className="flex-1 space-y-1 px-3 py-4">
          {itemsNav.map((item) => {
            const Icono = item.icon;
            const activo = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                  activo
                    ? "bg-emerald-950/50 text-emerald-400"
                    : "text-zinc-400 hover:bg-zinc-800/40"
                }`}
              >
                <Icono className="h-5 w-5" />
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="border-t border-zinc-800/60 px-4 py-4">
          <div className="mb-3 flex items-center gap-3 px-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-900 text-xs font-bold text-emerald-300">
              {primeraLetra}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-zinc-100">
                {perfil?.nombre || "Usuario"}
              </p>
              <p className="truncate text-xs text-zinc-500">
                {perfil?.email || ""}
              </p>
            </div>
          </div>
          <button
            onClick={cerrarSesion}
            className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-zinc-400 transition-colors hover:bg-red-950/50 hover:text-red-400"
          >
            <LogOut className="h-4 w-4" />
            Cerrar sesión
          </button>
        </div>
      </aside>

      {/* ===== MAIN CONTENT ===== */}
      <div className="flex flex-1 flex-col pb-20 md:pb-0">
        {/* Header móvil con menú hamburguesa */}
        <header className="flex items-center justify-between border-b border-zinc-800/60 px-4 py-3 md:hidden" style={{ backgroundColor: 'var(--sidebar)' }}>
          <div className="flex items-center gap-2">
            <Wallet className="h-5 w-5 text-emerald-600" />
            <span className="text-sm font-bold text-zinc-100">
              Finance
            </span>
          </div>
          <button
            onClick={() => setSidebarAbierta(!sidebarAbierta)}
            className="rounded-lg p-2 text-zinc-400 hover:bg-zinc-800/40"
          >
            {sidebarAbierta ? (
              <X className="h-5 w-5" />
            ) : (
              <Menu className="h-5 w-5" />
            )}
          </button>
        </header>

        {/* Overlay del menú móvil */}
        {sidebarAbierta && (
          <div
            className="fixed inset-0 z-40 bg-black/30 md:hidden"
            onClick={() => setSidebarAbierta(false)}
          />
        )}

        {/* Menú lateral desplegable en móvil */}
        <aside
          className={`fixed inset-y-0 right-0 z-50 w-80 transform shadow-xl transition-transform md:hidden ${
            sidebarAbierta ? "translate-x-0" : "translate-x-full"
          }`}
          style={{ backgroundColor: 'var(--sidebar)' }}
        >
          <div className="flex items-center justify-between border-b border-zinc-800/60 px-5 py-5">
            <div className="flex items-center gap-3">
              <Wallet className="h-7 w-7 text-emerald-600" />
              <span className="text-lg font-bold text-zinc-100">
                Finance
              </span>
            </div>
            <button
              onClick={() => setSidebarAbierta(false)}
              className="rounded-lg p-2 text-zinc-500 hover:bg-zinc-800/40"
            >
              <X className="h-6 w-6" />
            </button>
          </div>

          <nav className="space-y-1 px-4 py-5">
            {itemsNav.map((item) => {
              const Icono = item.icon;
              const activo = pathname === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setSidebarAbierta(false)}
                  className={`flex items-center gap-4 rounded-lg px-4 py-3.5 text-base font-medium transition-colors ${
                    activo
? "bg-emerald-950/50 text-emerald-400"
                    : "text-zinc-400 hover:bg-zinc-800/40"
                  }`}
                >
                  <Icono className="h-7 w-7" />
                  {item.label}
                </Link>
              );
            })}
            <button
              onClick={() => {
                setSidebarAbierta(false);
                cerrarSesion();
              }}
              className="flex w-full items-center gap-4 rounded-lg px-4 py-3.5 text-base font-medium text-zinc-400 transition-colors hover:bg-red-950/50 hover:text-red-400"
            >
              <LogOut className="h-7 w-7" />
              Cerrar sesión
            </button>
          </nav>
        </aside>

        {/* Contenido de la página */}
        <main className="flex-1">{children}</main>

        {/* Chat flotante */}
        <ChatBubble />

        {/* Sincronización offline */}
        <SincronizadorOffline />
      </div>

      {/* ===== BOTTOM NAV: visible solo en móvil ===== */}
      <nav className="fixed bottom-0 left-0 right-0 z-30 border-t border-zinc-800/60 backdrop-blur-md md:hidden" style={{ backgroundColor: 'var(--nav-bg)' }}>
        <div className="flex items-center justify-around px-1 py-1">
          <Link
            href="/dashboard"
            className={`flex flex-col items-center gap-0.5 px-2 py-2 text-[10px] font-medium transition-colors ${
              pathname === "/dashboard"
                ? "text-emerald-600 dark:text-emerald-400"
                : "text-zinc-500"
            }`}
          >
            <LayoutDashboard className="h-5 w-5" />
            <span>Inicio</span>
          </Link>

          <Link
            href="/dashboard/estadisticas"
            className={`flex flex-col items-center gap-0.5 px-2 py-2 text-[10px] font-medium transition-colors ${
              pathname === "/dashboard/estadisticas"
                ? "text-emerald-600 dark:text-emerald-400"
                : "text-zinc-500"
            }`}
          >
            <BarChart3 className="h-5 w-5" />
            <span>Estadísticas</span>
          </Link>

          <Link
            href="/dashboard/nueva"
            className="flex flex-col items-center gap-0.5 px-2 py-2 text-[10px] font-medium text-zinc-500"
          >
            <div className="-mt-6 flex h-12 w-12 items-center justify-center rounded-full bg-emerald-600 text-white shadow-lg shadow-emerald-200/50 transition-transform active:scale-95 dark:shadow-emerald-950/50">
              <PlusCircle className="h-6 w-6" />
            </div>
            <span>Añadir</span>
          </Link>

          <Link
            href="/dashboard/historial"
            className={`flex flex-col items-center gap-0.5 px-2 py-2 text-[10px] font-medium transition-colors ${
              pathname === "/dashboard/historial"
                ? "text-emerald-600 dark:text-emerald-400"
                : "text-zinc-500"
            }`}
          >
            <History className="h-5 w-5" />
            <span>Historial</span>
          </Link>

          <Link
            href="/dashboard/ajustes"
            className={`flex flex-col items-center gap-0.5 px-2 py-2 text-[10px] font-medium transition-colors ${
              pathname === "/dashboard/ajustes"
                ? "text-emerald-600 dark:text-emerald-400"
                : "text-zinc-500"
            }`}
          >
            <Settings className="h-5 w-5" />
            <span>Ajustes</span>
          </Link>
        </div>
      </nav>

      {/* Modal de cierre de mes */}
      <CierreMesModal
        abierto={cierreAbierto}
        cerrar={() => setCierreAbierto(false)}
        year={mesCierre.year}
        month={mesCierre.month}
      />
    </div>
    </MesVisualizadoProvider>
    </ThemeProvider>
  );
}
