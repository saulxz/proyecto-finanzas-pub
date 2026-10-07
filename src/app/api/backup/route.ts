import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";

interface BackupData {
  version: number;
  exportado_en: string;
  transacciones: any[];
  presupuestos: any[];
  cierres_mensuales: any[];
}

const VERSION = 1;

/**
 * GET /api/backup
 *
 * Exporta todas las tablas en un JSON descargable.
 */
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

    const [transRes, presRes, cierresRes] = await Promise.all([
      supabase.from("transacciones").select("*").order("creado_en", { ascending: false }),
      supabase.from("presupuestos").select("*"),
      supabase.from("cierres_mensuales").select("*"),
    ]);

    const backup: BackupData = {
      version: VERSION,
      exportado_en: new Date().toISOString(),
      transacciones: transRes.data ?? [],
      presupuestos: presRes.data ?? [],
      cierres_mensuales: cierresRes.data ?? [],
    };

    return NextResponse.json(backup);
  } catch (error) {
    console.error("Error en GET /api/backup:", error);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}

/**
 * POST /api/backup
 *
 * Importa una copia de seguridad: borra los datos existentes
 * y restaura los del archivo subido.
 *
 * Body: BackupData (el mismo formato que devuelve GET)
 */
export async function POST(request: NextRequest) {
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

    const body: BackupData = await request.json();

    // Validar estructura mínima
    if (!body.version || !Array.isArray(body.transacciones)) {
      return NextResponse.json(
        { error: "Formato de copia de seguridad inválido" },
        { status: 400 }
      );
    }

    const resultados = {
      transacciones: 0,
      presupuestos: 0,
      cierres_mensuales: 0,
    };

    // ── 1. Limpiar datos existentes ──────────────────────────────
    // Nota: cierres_mensuales no tiene política DELETE, se maneja aparte con upsert

    const { error: errDelTrans } = await supabase
      .from("transacciones")
      .delete()
      .not("id", "is", null); // Condición que afecta a todas las filas

    if (errDelTrans) {
      console.error("Error eliminando transacciones:", errDelTrans);
      return NextResponse.json(
        { error: "Error al limpiar transacciones existentes" },
        { status: 500 }
      );
    }

    const { error: errDelPres } = await supabase
      .from("presupuestos")
      .delete()
      .not("id", "is", null);

    if (errDelPres) {
      console.error("Error eliminando presupuestos:", errDelPres);
      return NextResponse.json(
        { error: "Error al limpiar presupuestos existentes" },
        { status: 500 }
      );
    }

    // ── 2. Insertar datos del backup ─────────────────────────────

    // Transacciones (en lotes de 100 para evitar problemas de tamaño)
    if (body.transacciones.length > 0) {
      const { error: errInsTrans } = await supabase
        .from("transacciones")
        .insert(body.transacciones);

      if (errInsTrans) {
        console.error("Error insertando transacciones:", errInsTrans);
        return NextResponse.json(
          { error: `Error al restaurar transacciones: ${errInsTrans.message}` },
          { status: 500 }
        );
      }
      resultados.transacciones = body.transacciones.length;
    }

    // Presupuestos
    if (body.presupuestos.length > 0) {
      const { error: errInsPres } = await supabase
        .from("presupuestos")
        .insert(body.presupuestos);

      if (errInsPres) {
        console.error("Error insertando presupuestos:", errInsPres);
        return NextResponse.json(
          { error: `Error al restaurar presupuestos: ${errInsPres.message}` },
          { status: 500 }
        );
      }
      resultados.presupuestos = body.presupuestos.length;
    }

    // Cierres mensuales (upsert por unique year+month)
    if (body.cierres_mensuales.length > 0) {
      // Como cierres_mensuales solo tiene SELECT/INSERT policies,
      // recorremos uno a uno con upsert
      for (const cierre of body.cierres_mensuales) {
        const { error: errUpsert } = await supabase
          .from("cierres_mensuales")
          .upsert(
            {
              year: cierre.year,
              month: cierre.month,
              resumen: cierre.resumen,
            },
            { onConflict: "year, month", ignoreDuplicates: false }
          );

        if (errUpsert) {
          console.warn(
            `Error insertando cierre ${cierre.year}-${cierre.month}:`,
            errUpsert
          );
          // No bloquear — seguir con el resto
        }
      }
      resultados.cierres_mensuales = body.cierres_mensuales.length;
    }

    return NextResponse.json({
      ok: true,
      mensaje: "Copia de seguridad restaurada correctamente",
      resultados,
    });
  } catch (error) {
    console.error("Error en POST /api/backup:", error);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
