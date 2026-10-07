import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";

export async function GET(request: NextRequest) {
  try {
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return request.cookies.getAll();
          },
          setAll() {
            // No necesitamos escribir cookies
          },
        },
      }
    );

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "No autenticado" }, { status: 401 });
    }

    // Obtener meses distintos con transacciones
    const { data, error } = await supabase.rpc("meses_con_transacciones");

    if (error) {
      // Fallback: consulta directa si la función RPC no existe
      const { data: fallback, error: fallbackError } = await supabase
        .from("transacciones")
        .select("creado_en")
        .order("creado_en", { ascending: false });

      if (fallbackError) {
        return NextResponse.json(
          { error: "Error al consultar meses" },
          { status: 500 }
        );
      }

      // Extraer meses únicos del array de fechas
      const mesesSet = new Set<string>();
      for (const t of fallback) {
        const d = new Date(t.creado_en);
        mesesSet.add(`${d.getFullYear()}-${d.getMonth()}`);
      }

      // Añadir mes actual si no está
      const ahora = new Date();
      mesesSet.add(`${ahora.getFullYear()}-${ahora.getMonth()}`);

      const meses = Array.from(mesesSet)
        .map((key) => {
          const [year, month] = key.split("-").map(Number);
          return {
            year,
            month,
            label: new Date(year, month).toLocaleDateString("es-ES", {
              month: "long",
              year: "numeric",
            }),
          };
        })
        .sort((a, b) => b.year - a.year || b.month - a.month);

      return NextResponse.json(meses);
    }

    return NextResponse.json(data);
  } catch (error) {
    console.error("Error en /api/meses-disponibles:", error);
    return NextResponse.json(
      { error: "Error interno del servidor" },
      { status: 500 }
    );
  }
}
