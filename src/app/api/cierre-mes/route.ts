import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import type { CierreResumen } from "@/types";
import { CATEGORIAS } from "@/types";

/**
 * GET /api/cierre-mes?year=2026&month=5
 *
 * Devuelve el cierre del mes especificado (si existe).
 * Si no se pasan parámetros, usa el mes anterior al actual.
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

    const { searchParams } = new URL(request.url);
    let year = parseInt(searchParams.get("year") || "", 10);
    let month = parseInt(searchParams.get("month") || "", 10);

    // Si no se especifica, usar el mes anterior
    if (isNaN(year) || isNaN(month)) {
      const ahora = new Date();
      const mesPasado = new Date(ahora.getFullYear(), ahora.getMonth() - 1, 1);
      year = mesPasado.getFullYear();
      month = mesPasado.getMonth();
    }

    // Buscar el cierre en la BD
    const { data } = await supabase
      .from("cierres_mensuales")
      .select("*")
      .eq("year", year)
      .eq("month", month)
      .maybeSingle();

    if (!data) {
      return NextResponse.json({ existe: false, year, month });
    }

    return NextResponse.json({ existe: true, ...data });
  } catch (error) {
    console.error("Error en GET /api/cierre-mes:", error);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}

/**
 * POST /api/cierre-mes
 *
 * Genera y guarda el informe de cierre del mes anterior.
 * Body: { year, month } (opcional, por defecto mes anterior)
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

    const body = await request.json().catch(() => ({}));
    let year: number = body.year;
    let month: number = body.month;

    // Por defecto mes anterior
    if (!year || !month) {
      const ahora = new Date();
      const mesPasado = new Date(ahora.getFullYear(), ahora.getMonth() - 1, 1);
      year = mesPasado.getFullYear();
      month = mesPasado.getMonth();
    }

    // Verificar que no esté ya generado
    const { data: existente } = await supabase
      .from("cierres_mensuales")
      .select("id")
      .eq("year", year)
      .eq("month", month)
      .maybeSingle();

    if (existente) {
      return NextResponse.json(
        { error: "El cierre de este mes ya existe" },
        { status: 409 }
      );
    }

    // ─── Recopilar datos ─────────────────────────────────────────

    const inicioMes = new Date(year, month, 1).toISOString();
    const finMes = new Date(year, month + 1, 0, 23, 59, 59).toISOString();

    // Transacciones del mes
    const { data: transacciones } = await supabase
      .from("transacciones")
      .select("*")
      .gte("creado_en", inicioMes)
      .lte("creado_en", finMes);

    if (!transacciones) {
      return NextResponse.json(
        { error: "Error al leer transacciones" },
        { status: 500 }
      );
    }

    // Transacciones del mes anterior (para comparativa)
    const inicioMesAnterior = new Date(year, month - 1, 1).toISOString();
    const finMesAnterior = new Date(year, month, 0, 23, 59, 59).toISOString();

    const { data: transaccionesAnterior } = await supabase
      .from("transacciones")
      .select("*")
      .gte("creado_en", inicioMesAnterior)
      .lte("creado_en", finMesAnterior);

    // Perfiles de usuarios
    const { data: perfiles } = await supabase.from("perfiles").select("*");

    const mapaPerfiles = new Map(
      (perfiles || []).map((p: any) => [p.id, p])
    );

    // ─── Calcular resumen ────────────────────────────────────────

    // Totales
    const totalIngresos = transacciones
      .filter((t: any) => t.tipo === "ingreso")
      .reduce((s: number, t: any) => s + Number(t.cantidad), 0);

    const totalGastos = transacciones
      .filter((t: any) => t.tipo === "gasto")
      .reduce((s: number, t: any) => s + Number(t.cantidad), 0);

    const ahorro = totalIngresos - totalGastos;
    const esAhorro = ahorro >= 0;

    // Mensaje personalizado
    const mensaje = esAhorro
      ? `¡Buen trabajo! Ahorraste ${formatearNumero(ahorro)}€ este mes. Si sigues así, tus finanzas irán viento en popa.`
      : `¡Alerta! Te has sobregirado en ${formatearNumero(Math.abs(ahorro))}€ este mes. Revisa tus gastos para el próximo mes.`;

    // Categoría con más gasto (y comparativa)
    const gastosPorCategoria: Record<string, number> = {};
    const gastosPorCategoriaAnterior: Record<string, number> = {};

    transacciones
      .filter((t: any) => t.tipo === "gasto")
      .forEach((t: any) => {
        gastosPorCategoria[t.categoria] =
          (gastosPorCategoria[t.categoria] || 0) + Number(t.cantidad);
      });

    (transaccionesAnterior || [])
      .filter((t: any) => t.tipo === "gasto")
      .forEach((t: any) => {
        gastosPorCategoriaAnterior[t.categoria] =
          (gastosPorCategoriaAnterior[t.categoria] || 0) + Number(t.cantidad);
      });

    // Categoría con mayor gasto del mes
    let categoriaTop: CierreResumen["categoria_top"] = null;
    if (totalGastos > 0) {
      const entries = Object.entries(gastosPorCategoria).sort(
        (a, b) => b[1] - a[1]
      );
      if (entries.length > 0) {
        const [cat, gasto] = entries[0];
        const labelCat =
          CATEGORIAS.find((c) => c.value === cat)?.label || cat;
        const porcentaje = (gasto / totalGastos) * 100;
        categoriaTop = {
          categoria: cat,
          label: labelCat,
          gasto: Math.round(gasto * 100) / 100,
          porcentaje: Math.round(porcentaje * 10) / 10,
        };
      }
    }

    // Reparto de deudas (asumiendo gastos compartidos a partes iguales)
    const usuariosEnMes = new Set(
      transacciones.map((t: any) => t.usuario_id)
    );
    const numUsuarios = usuariosEnMes.size || 1;

    const gastoPorUsuario: Record<string, number> = {};
    transacciones
      .filter((t: any) => t.tipo === "gasto")
      .forEach((t: any) => {
        gastoPorUsuario[t.usuario_id] =
          (gastoPorUsuario[t.usuario_id] || 0) + Number(t.cantidad);
      });

    const cuotaIdeal = totalGastos / numUsuarios;

    const deudas = Array.from(usuariosEnMes).map((uid: string) => {
      const perfil = mapaPerfiles.get(uid) || {};
      const nombre =
        perfil.nombre || perfil.email?.split("@")[0] || "Usuario";
      const totalGastado = gastoPorUsuario[uid] || 0;
      const saldo = Math.round((totalGastado - cuotaIdeal) * 100) / 100;

      return {
        usuario_id: uid,
        nombre,
        total_gastado: Math.round(totalGastado * 100) / 100,
        cuota_ideal: Math.round(cuotaIdeal * 100) / 100,
        saldo,
        es_deudor: saldo < 0,
      };
    });

    // Nombre del mes
    const mesNombre = new Date(year, month).toLocaleDateString("es-ES", {
      month: "long",
      year: "numeric",
    });

    // ─── Guardar en BD ───────────────────────────────────────────

    const resumen: CierreResumen = {
      balance: {
        ingresos: Math.round(totalIngresos * 100) / 100,
        gastos: Math.round(totalGastos * 100) / 100,
        ahorro: Math.round(ahorro * 100) / 100,
        es_ahorro: esAhorro,
      },
      mensaje,
      categoria_top: categoriaTop,
      deudas,
      total_transacciones: transacciones.length,
      mes_nombre: mesNombre,
      year,
      month,
    };

    const { error: errorInsert } = await supabase
      .from("cierres_mensuales")
      .insert({
        year,
        month,
        resumen,
      });

    if (errorInsert) {
      console.error("Error guardando cierre:", errorInsert);
      return NextResponse.json(
        { error: "Error al guardar el cierre" },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true, resumen });
  } catch (error) {
    console.error("Error en POST /api/cierre-mes:", error);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}

function formatearNumero(valor: number): string {
  return Math.abs(valor).toLocaleString("es-ES", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}
