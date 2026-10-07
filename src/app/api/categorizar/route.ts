import { NextRequest, NextResponse } from "next/server";
import { llamarGeminiConFallback } from "@/lib/gemini-fallback";

const CATEGORIAS = [
  "alimentacion", "transporte", "vivienda", "servicios",
  "ocio", "salud", "educacion", "ropa",
  "salario", "freelance", "inversiones", "otros",
] as const;

export async function POST(request: NextRequest) {
  try {
    const { concepto } = await request.json();

    if (!concepto || typeof concepto !== "string" || concepto.trim().length < 2) {
      return NextResponse.json({ categoria: null });
    }

    const prompt = `Eres un categorizador de gastos. Dado un concepto de compra, responde ÚNICAMENTE con la categoría más adecuada de esta lista (una sola palabra, sin puntuación ni texto adicional): ${CATEGORIAS.join(", ")}.

Ejemplos:
- "Mercadona" → alimentacion
- "Gasolina Repsol" → transporte
- "Netflix" → ocio
- "Farmacia" → salud
- "Luz" → servicios
- "Zara" → ropa

Concepto: "${concepto.trim()}"
Categoría:`;

    const response = await llamarGeminiConFallback(undefined, {
      contents: [{ role: "user", parts: [{ text: prompt }] }],
    });

    const texto = response.text?.trim().toLowerCase();
    if (!texto) {
      return NextResponse.json({ categoria: null });
    }

    // Buscar la categoría que coincida dentro del texto de respuesta
    const categoria = CATEGORIAS.find((c) => texto.includes(c)) || null;
    return NextResponse.json({ categoria });
  } catch (error) {
    console.error("Error en /api/categorizar:", error);
    return NextResponse.json({ categoria: null });
  }
}
