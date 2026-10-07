import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import type { Transaccion } from "@/types";
import {
  NOMBRE_BUCKET,
  esMesCerrado,
  esMesActual,
  generarRutaCache,
  generarDatosMes,
} from "@/lib/cache-mensual";

/**
 * GET /api/cache/mes?year=2026&month=5
 *
 * Devuelve las transacciones de un mes específico.
 * - Mes actual → consulta en vivo desde Postgres.
 * - Mes cerrado  → intenta servir desde Storage cache; si no existe,
 *                  lo genera desde Postgres, lo guarda en Storage y lo devuelve.
 */
export async function GET(request: NextRequest) {
  try {
    // 1. Autenticación
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return request.cookies.getAll();
          },
          setAll() {
            // No necesitamos escribir cookies en GET
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

    // 2. Parsear año y mes
    const { searchParams } = new URL(request.url);
    const year = parseInt(searchParams.get("year") || "", 10);
    const month = parseInt(searchParams.get("month") || "", 10);

    if (isNaN(year) || isNaN(month) || month < 0 || month > 11) {
      return NextResponse.json(
        { error: "Parámetros year y month inválidos. month debe ser 0-11." },
        { status: 400 }
      );
    }

    // 3. Mes actual → vivo desde Postgres
    if (esMesActual(year, month)) {
      const inicioMes = new Date(year, month, 1).toISOString();
      const finMes = new Date(year, month + 1, 0, 23, 59, 59).toISOString();

      const { data, error } = await supabase
        .from("transacciones")
        .select("*")
        .gte("creado_en", inicioMes)
        .lte("creado_en", finMes)
        .order("creado_en", { ascending: false });

      if (error) {
        console.error("Error querying current month:", error);
        return NextResponse.json(
          { error: "Error al consultar transacciones" },
          { status: 500 }
        );
      }

      const datos = generarDatosMes((data || []) as Transaccion[], year, month);
      return NextResponse.json({ ...datos, fuente: "vivo" });
    }

    // 4. Mes cerrado → intentar desde Storage
    if (!esMesCerrado(year, month)) {
      // No es mes actual ni cerrado (mes futuro) → devolver vacío
      const datos = generarDatosMes([], year, month);
      return NextResponse.json({ ...datos, fuente: "vacio" });
    }

    const ruta = generarRutaCache(year, month);

    // Intentar crear el bucket por si es la primera vez
    try {
      await supabase.storage.createBucket(NOMBRE_BUCKET, {
        public: true,
      });
    } catch {
      // El bucket ya existe → ignorar
    }

    // 4a. Leer de caché
    const { data: archivo, error: errorLectura } = await supabase.storage
      .from(NOMBRE_BUCKET)
      .download(ruta);

    if (archivo && !errorLectura) {
      const texto = await archivo.text();
      const datosCache = JSON.parse(texto);
      return NextResponse.json({ ...datosCache, fuente: "cache" });
    }

    // 4b. No existe en caché → generar desde Postgres
    const inicioMes = new Date(year, month, 1).toISOString();
    const finMes = new Date(year, month + 1, 0, 23, 59, 59).toISOString();

    const { data, error: errorDb } = await supabase
      .from("transacciones")
      .select("*")
      .gte("creado_en", inicioMes)
      .lte("creado_en", finMes)
      .order("creado_en", { ascending: false });

    if (errorDb) {
      console.error("Error querying closed month:", errorDb);
      return NextResponse.json(
        { error: "Error al consultar transacciones" },
        { status: 500 }
      );
    }

    const datos = generarDatosMes((data || []) as Transaccion[], year, month);

    // Guardar en Storage (sobrescribir si ya existe)
    const blob = new Blob([JSON.stringify(datos)], { type: "application/json" });
    const archivoUpload = new File([blob], `${month}.json`, {
      type: "application/json",
    });

    const { error: errorUpload } = await supabase.storage
      .from(NOMBRE_BUCKET)
      .upload(ruta, archivoUpload, { upsert: true });

    if (errorUpload) {
      console.error("Error guardando caché en Storage:", errorUpload);
      // No bloquear la respuesta si falla la escritura del caché
    }

    return NextResponse.json({ ...datos, fuente: "generado" });
  } catch (error) {
    console.error("Error en /api/cache/mes:", error);
    return NextResponse.json(
      { error: "Error interno del servidor" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/cache/mes?year=2026&month=5
 *
 * Fuerza la regeneración del caché para un mes específico.
 * Útil después de editar o eliminar transacciones de un mes cerrado.
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

    const { searchParams } = new URL(request.url);
    const year = parseInt(searchParams.get("year") || "", 10);
    const month = parseInt(searchParams.get("month") || "", 10);

    if (isNaN(year) || isNaN(month) || month < 0 || month > 11) {
      return NextResponse.json(
        { error: "Parámetros year y month inválidos." },
        { status: 400 }
      );
    }

    const inicioMes = new Date(year, month, 1).toISOString();
    const finMes = new Date(year, month + 1, 0, 23, 59, 59).toISOString();

    const { data, error: errorDb } = await supabase
      .from("transacciones")
      .select("*")
      .gte("creado_en", inicioMes)
      .lte("creado_en", finMes)
      .order("creado_en", { ascending: false });

    if (errorDb) {
      return NextResponse.json(
        { error: "Error al consultar transacciones" },
        { status: 500 }
      );
    }

    const datos = generarDatosMes((data || []) as Transaccion[], year, month);
    const ruta = generarRutaCache(year, month);

    // Intentar crear el bucket
    try {
      await supabase.storage.createBucket(NOMBRE_BUCKET, { public: true });
    } catch {
      // Ya existe
    }

    const blob = new Blob([JSON.stringify(datos)], { type: "application/json" });
    const archivoUpload = new File([blob], `${month}.json`, {
      type: "application/json",
    });

    const { error: errorUpload } = await supabase.storage
      .from(NOMBRE_BUCKET)
      .upload(ruta, archivoUpload, { upsert: true });

    if (errorUpload) {
      return NextResponse.json(
        { error: "Error al guardar caché en Storage" },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true, ruta });
  } catch (error) {
    console.error("Error en POST /api/cache/mes:", error);
    return NextResponse.json(
      { error: "Error interno del servidor" },
      { status: 500 }
    );
  }
}
