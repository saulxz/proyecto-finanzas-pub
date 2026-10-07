import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import * as XLSX from "xlsx";

/** Normaliza el nombre de una columna ignorando mayúsculas, acentos, espacios y guiones. */
function normalizarNombreColumna(nombre: string): string {
  return nombre
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[-\s_]+/g, "")
    .trim();
}

/** Parsea un valor numérico desde el Excel (puede venir como string "1.234,56" o número directo). */
function parsearImporte(valor: unknown): number | null {
  if (typeof valor === "number") return valor;
  if (typeof valor !== "string") return null;
  const limpio = valor.trim();
  if (!limpio) return null;

  // Detectar formato español: 1.234,56 → 1234.56
  const tienePuntoMiles = /\.\d{3}/.test(limpio);
  const tieneComaDecimal = /,\d{1,2}$/.test(limpio);
  if (tienePuntoMiles && tieneComaDecimal) {
    const normalizado = limpio.replace(/\./g, "").replace(",", ".");
    const n = parseFloat(normalizado);
    return isNaN(n) ? null : n;
  }

  // Formato inglés: 1234.56
  const n = parseFloat(limpio.replace(",", "."));
  return isNaN(n) ? null : n;
}

/** Parsea una fecha desde distintos formatos a ISO string (YYYY-MM-DD). */
function parsearFecha(valor: unknown): string | null {
  if (!valor) return null;

  // Si es número serial de Excel (fecha almacenada como número)
  if (typeof valor === "number") {
    try {
      // Convertir serial de Excel a fecha JS
      const epoch = new Date(1899, 11, 30);
      const fecha = new Date(epoch.getTime() + valor * 86400000);
      if (!isNaN(fecha.getTime())) {
        return fecha.toISOString().split("T")[0];
      }
    } catch {
      // fall through
    }
  }

  const str = String(valor).trim();
  if (!str) return null;

  // Intentar parsear con Date
  const fecha = new Date(str);
  if (!isNaN(fecha.getTime())) {
    return fecha.toISOString().split("T")[0];
  }

  // Formato DD/MM/YYYY o DD-MM-YYYY
  const partes = str.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (partes) {
    const dia = partes[1].padStart(2, "0");
    const mes = partes[2].padStart(2, "0");
    const anio = partes[3];
    return `${anio}-${mes}-${dia}`;
  }

  return null;
}

/** Map de columnas normalizadas a su campo destino. */
const MAPA_COLUMNAS: Record<string, string> = {
  fecha: "creado_en",
  concepto: "concepto",
  categoria: "categoria",
  importe: "cantidad",
  cantidad: "cantidad",
  usuario: "tipo",
  tipo: "tipo",
};

/** Tipo de transacción inferido desde el valor. */
function inferirTipo(valor: string): "ingreso" | "gasto" {
  const v = valor.toLowerCase().trim();
  if (/ingreso|salario|nomina|nómina|ingresos|ganancia/.test(v)) return "ingreso";
  if (/gasto|gasto|egreso|pago|compra|retiro/.test(v)) return "gasto";
  if (/^\d+(\.\d+)?$/.test(v)) return "ingreso";
  return "gasto";
}

export async function POST(request: NextRequest) {
  try {
    // ── 1. Autenticación ─────────────────────────────────────────
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

    // ── 2. Recibir archivo ───────────────────────────────────────
    const formData = await request.formData();
    const archivo = formData.get("archivo") as File | null;

    if (!archivo) {
      return NextResponse.json(
        { error: "No se envió ningún archivo" },
        { status: 400 }
      );
    }

    const buffer = Buffer.from(await archivo.arrayBuffer());

    // ── 3. Parsear Excel/CSV ─────────────────────────────────────
    const workbook = XLSX.read(buffer, { type: "buffer" });
    const hoja = workbook.Sheets[workbook.SheetNames[0]];
    const filas: Record<string, unknown>[] = XLSX.utils.sheet_to_json(hoja, {
      defval: null,
    });

    if (filas.length === 0) {
      return NextResponse.json(
        { error: "El archivo está vacío" },
        { status: 400 }
      );
    }

    // ── 4. Mapear columnas ───────────────────────────────────────
    const columnas = Object.keys(filas[0]);
    const mapeo: Record<string, string> = {};

    for (const col of columnas) {
      const normalizada = normalizarNombreColumna(col);
      const destino = MAPA_COLUMNAS[normalizada];
      if (destino) {
        mapeo[col] = destino;
      }
    }

    // Verificar columnas mínimas
    if (!mapeo[columnas.find((c) => MAPA_COLUMNAS[normalizarNombreColumna(c)] === "creado_en")!] ||
        !mapeo[columnas.find((c) => MAPA_COLUMNAS[normalizarNombreColumna(c)] === "cantidad")!]) {
      return NextResponse.json(
        {
          error:
            "El archivo debe contener al menos las columnas 'fecha' e 'importe'. " +
            "Columnas detectadas: " + columnas.join(", "),
        },
        { status: 400 }
      );
    }

    const transaccionesNuevas: any[] = [];
    const erroresFila: { fila: number; error: string }[] = [];

    for (let i = 0; i < filas.length; i++) {
      const fila = filas[i];
      const numFila = i + 2; // +1 por índice 0, +1 por cabecera

      const fecha = parsearFecha(
        Object.entries(mapeo).find(([, v]) => v === "creado_en")?.[0]
          ? fila[Object.entries(mapeo).find(([, v]) => v === "creado_en")![0]]
          : null
      );

      const importeRaw = Object.entries(mapeo).find(([, v]) => v === "cantidad")?.[0]
        ? fila[Object.entries(mapeo).find(([, v]) => v === "cantidad")![0]]
        : null;

      const conceptoRaw = Object.entries(mapeo).find(([, v]) => v === "concepto")?.[0]
        ? fila[Object.entries(mapeo).find(([, v]) => v === "concepto")![0]]
        : null;

      const categoriaRaw = Object.entries(mapeo).find(([, v]) => v === "categoria")?.[0]
        ? fila[Object.entries(mapeo).find(([, v]) => v === "categoria")![0]]
        : null;

      const tipoRaw = Object.entries(mapeo).find(([, v]) => v === "tipo")?.[0]
        ? fila[Object.entries(mapeo).find(([, v]) => v === "tipo")![0]]
        : null;

      if (!fecha) {
        erroresFila.push({ fila: numFila, error: "Fecha inválida o vacía" });
        continue;
      }

      const importe = parsearImporte(importeRaw);
      if (importe === null || importe <= 0) {
        erroresFila.push({ fila: numFila, error: "Importe inválido o vacío" });
        continue;
      }

      const conceptoNorm = conceptoRaw
        ? String(conceptoRaw).trim()
        : "(sin concepto)";

      const tipo = tipoRaw
        ? inferirTipo(String(tipoRaw))
        : "gasto" as const;

      // Normalizar categoría a slug
      let categoria = "otros";
      if (categoriaRaw) {
        const catStr = String(categoriaRaw).trim();
        if (catStr) {
          categoria = catStr
            .toLowerCase()
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "")
            .replace(/[^a-z0-9]+/g, "_")
            .replace(/^_|_$/g, "");
          if (!categoria) categoria = "otros";
        }
      }

      transaccionesNuevas.push({
        usuario_id: user.id,
        tipo,
        cantidad: importe,
        categoria,
        concepto: conceptoNorm,
        creado_en: fecha,
        recurrente: false,
        ultima_generacion: null,
      });
    }

    // ── 5. Obtener transacciones existentes para dedup ───────────
    const { data: existentes, error: errExistentes } = await supabase
      .from("transacciones")
      .select("creado_en, cantidad, concepto")
      .eq("usuario_id", user.id);

    if (errExistentes) {
      console.error("Error al leer transacciones existentes:", errExistentes);
      return NextResponse.json(
        { error: "Error al leer datos existentes" },
        { status: 500 }
      );
    }

    // ── 6. Deduplicar ────────────────────────────────────────────
    // Construir un Set con claves "fecha|importe|concepto" normalizadas
    const existentesSet = new Set<string>();
    for (const t of existentes ?? []) {
      const clave = [
        t.creado_en?.split("T")[0] ?? "",
        Number(t.cantidad).toFixed(2),
        String(t.concepto ?? "").trim().toLowerCase(),
      ].join("|");
      existentesSet.add(clave);
    }

    const añadidas: typeof transaccionesNuevas = [];
    let omitidas = 0;

    for (const t of transaccionesNuevas) {
      const clave = [
        t.creado_en,
        Number(t.cantidad).toFixed(2),
        String(t.concepto).trim().toLowerCase(),
      ].join("|");

      if (existentesSet.has(clave)) {
        omitidas++;
      } else {
        añadidas.push(t);
      }
    }

    // ── 7. Insertar solo las nuevas ──────────────────────────────
    if (añadidas.length > 0) {
      const { error: errInsert } = await supabase
        .from("transacciones")
        .insert(añadidas);

      if (errInsert) {
        console.error("Error al insertar transacciones:", errInsert);
        return NextResponse.json(
          { error: `Error al guardar: ${errInsert.message}` },
          { status: 500 }
        );
      }
    }

    return NextResponse.json({
      añadidas: añadidas.length,
      omitidas,
      errores: erroresFila.length > 0 ? erroresFila : undefined,
    });
  } catch (error) {
    console.error("Error en importar-excel:", error);
    return NextResponse.json(
      { error: "Error interno del servidor" },
      { status: 500 }
    );
  }
}
