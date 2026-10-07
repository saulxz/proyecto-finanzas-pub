import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { llamarGeminiConFallback } from "@/lib/gemini-fallback";

const MapeoCategoria: Record<string, string> = {
  alimentacion: "alimentacion",
  comida: "alimentacion",
  supermercado: "alimentacion",
  restaurante: "alimentacion",
  transporte: "transporte",
  gasolina: "transporte",
  combustible: "transporte",
  parking: "transporte",
  vivienda: "vivienda",
  alquiler: "vivienda",
  hipoteca: "vivienda",
  servicios: "servicios",
  luz: "servicios",
  electricidad: "servicios",
  agua: "servicios",
  gas: "servicios",
  internet: "servicios",
  telefono: "servicios",
  ocio: "ocio",
  cine: "ocio",
  restaurantes: "ocio",
  viaje: "ocio",
  salud: "salud",
  farmacia: "salud",
  medico: "salud",
  educacion: "educacion",
  curso: "educacion",
  escuela: "educacion",
  ropa: "ropa",
  vestido: "ropa",
  salario: "salario",
  nomina: "salario",
  freelance: "freelance",
  inversiones: "inversiones",
  inversion: "inversiones",
  otros: "otros",
};

function normalizarCategoria(cat: string): string {
  const catLower = cat.toLowerCase().trim();
  // Intentar match directo
  if (MapeoCategoria[catLower]) return MapeoCategoria[catLower];
  // Intentar match parcial
  for (const [key, value] of Object.entries(MapeoCategoria)) {
    if (catLower.includes(key) || key.includes(catLower)) return value;
  }
  return "otros";
}

function limpiarJsonRespuesta(texto: string): string {
  // Eliminar posibles bloque de código ```json ... ```
  let limpio = texto.replace(/```(?:json)?\s*\n?/gi, "").trim();
  // Si hay texto antes del primer { o después del último }, lo eliminamos
  const inicio = limpio.indexOf("{");
  const fin = limpio.lastIndexOf("}");
  if (inicio !== -1 && fin !== -1) {
    limpio = limpio.slice(inicio, fin + 1);
  }
  return limpio;
}

// GET de diagnóstico: indica únicamente si la configuración está presente.
// Nunca devuelve el valor de ninguna clave ni prefijo.
export async function GET() {
  const keyPresente = !!process.env.OPENROUTER_API_KEY?.trim();
  return NextResponse.json({
    status: keyPresente ? "ok" : "error",
    openrouter_api_key: keyPresente ? "configurada" : "no configurada",
    next_public_supabase_url: process.env.NEXT_PUBLIC_SUPABASE_URL
      ? "configurada"
      : "no configurada",
  });
}

export async function POST(request: NextRequest) {
  try {
    // 1. Verificar autenticación con Supabase
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return request.cookies.getAll();
          },
          setAll() {
            // No necesitamos escribir cookies en esta ruta
          },
        },
      }
    );

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json(
        { error: "No autenticado" },
        { status: 401 }
      );
    }

    // 2. Obtener la imagen del FormData
    const formData = await request.formData();
    const archivo = formData.get("imagen");

    if (!archivo || !(archivo instanceof File)) {
      return NextResponse.json(
        { error: "No se recibió ninguna imagen" },
        { status: 400 }
      );
    }

    // Validar que sea una imagen
    if (!archivo.type.startsWith("image/")) {
      return NextResponse.json(
        { error: "El archivo debe ser una imagen" },
        { status: 400 }
      );
    }

    // 3. Convertir la imagen a base64
    const bytes = await archivo.arrayBuffer();
    const buffer = Buffer.from(bytes);
    const base64 = buffer.toString("base64");

    // 4. Llamar al modelo vía OpenRouter
    const prompt = `Eres un sistema de OCR especializado en tickets y facturas de compra en España.
Analiza la imagen y extrae los siguientes datos en formato JSON exacto, sin texto adicional:

{
  "comercio": "nombre del establecimiento",
  "importe": 0.00,
  "categoria": "categoria en español (alimentacion, transporte, vivienda, servicios, ocio, salud, educacion, ropa, salario, freelance, inversiones, otros)",
  "fecha": "YYYY-MM-DD"
}

Reglas:
- comercio: extrae el nombre del establecimiento (Mercadona, Carrefour, Lidl, Gasolinera Repsol, etc.). Si no aparece, usa "Compra".
- importe: el total de la compra como número. Si hay varios totales, usa el importe final. Sin símbolos, solo el número.
- categoria: elige la categoría más adecuada según el tipo de comercio.
- fecha: si aparece en el ticket, conviértela a formato YYYY-MM-DD. Si no aparece, usa la fecha actual: "${new Date().toISOString().split("T")[0]}".
- Si no puedes leer bien algún campo, usa valores por defecto sensatos.`;

    const response = await llamarGeminiConFallback(undefined, {
      contents: [
        {
          role: "user",
          parts: [
            { text: prompt },
            {
              inlineData: {
                mimeType: archivo.type,
                data: base64,
              },
            },
          ],
        },
      ],
    });

    const textoRespuesta = response.text;
    if (!textoRespuesta) {
      return NextResponse.json(
        { error: "El asistente no devolvió respuesta" },
        { status: 502 }
      );
    }

    // 5. Parsear el JSON de la respuesta
    let datos;
    try {
      const jsonLimpio = limpiarJsonRespuesta(textoRespuesta);
      datos = JSON.parse(jsonLimpio);
    } catch {
      return NextResponse.json(
        {
          error: "No se pudo interpretar la respuesta del asistente",
          raw: textoRespuesta,
        },
        { status: 422 }
      );
    }

    // 6. Validar y normalizar
    const resultado = {
      comercio: typeof datos.comercio === "string" ? datos.comercio.trim() : "Compra",
      importe:
        typeof datos.importe === "number" && datos.importe > 0
          ? datos.importe
          : typeof datos.importe === "string"
          ? parseFloat(datos.importe.replace(",", "."))
          : 0,
      categoria: normalizarCategoria(datos.categoria || "otros"),
      fecha: typeof datos.fecha === "string" ? datos.fecha : new Date().toISOString().split("T")[0],
    };

    if (resultado.importe <= 0 || isNaN(resultado.importe)) {
      resultado.importe = 0;
    }

    return NextResponse.json(resultado);
  } catch (error) {
    console.error("Error en OCR:", error);
    return NextResponse.json(
      { error: "Error interno del servidor" },
      { status: 500 }
    );
  }
}

// El body parsing lo maneja nativamente Next.js App Router con request.formData()
