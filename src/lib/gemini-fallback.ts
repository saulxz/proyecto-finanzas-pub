// ---------------------------------------------------------------------------
// Adaptador OpenRouter — convierte el formato Gemini del route en llamadas
// a la API de OpenAI / OpenRouter y devuelve un resultado compatible.
// ---------------------------------------------------------------------------

const OPENROUTER_BASE = "https://openrouter.ai/api/v1";
const OPENROUTER_MODEL_TEXTO = "openrouter/free";
const OPENROUTER_MODEL_MULTIMODAL = "google/gemma-4-26b-a4b-it:free";

// ---------------------------------------------------------------------------
// Interfaces
// ---------------------------------------------------------------------------

interface OpenRouterChoice {
  message: {
    content: string | null;
    tool_calls?: Array<{
      id: string;
      type: "function";
      function: { name: string; arguments: string };
    }>;
  };
  finish_reason: string;
}

interface OpenRouterResponse {
  choices: OpenRouterChoice[];
}

export interface OpenRouterResult {
  text?: string;
  functionCalls?: Array<{
    name: string;
    id?: string;
    args: Record<string, unknown>;
  }>;
  candidates?: Array<{ content: { role: string; parts: unknown[] } }>;
}

// ---------------------------------------------------------------------------
// Conversión Gemini → OpenAI (OpenRouter)
// ---------------------------------------------------------------------------

/** Convierte un array de Gemini `parts` al formato `content` de OpenAI. */
function convertirPartsAMessages(contents: any[]): any[] {
  const messages: any[] = [];

  for (const c of contents) {
    const role = c.role === "model" ? "assistant" : c.role === "user" ? "user" : "user";
    const parts = c.parts || [];

    // ── Si el mensaje tiene functionCall parts → assistant message con tool_calls ──
    const functionCallParts = parts.filter((p: any) => p.functionCall);
    if (functionCallParts.length > 0 && role === "assistant") {
      const tool_calls = functionCallParts.map((p: any, idx: number) => ({
        id: p.functionCall.id || `call_${idx}`,
        type: "function" as const,
        function: {
          name: p.functionCall.name,
          arguments: JSON.stringify(p.functionCall.args),
        },
      }));
      messages.push({ role: "assistant", content: null, tool_calls });
      continue; // No procesamos este mensaje de otra forma
    }

    // ── functionResponse → tool message ──
    const funcionResponseParts = parts.filter((p: any) => p.functionResponse);
    if (funcionResponseParts.length > 0) {
      for (const p of funcionResponseParts) {
        messages.push({
          role: "tool",
          tool_call_id: p.functionResponse.id || p.functionResponse.name,
          content: JSON.stringify(p.functionResponse.response),
        });
      }
      continue; // No mezclamos tool responses con otros tipos
    }

    // ── El resto: texto y/o inlineData ──
    // Si solo hay texto y ningún inlineData → content es un string
    const soloTexto = parts.every(
      (p: any) =>
        p.text !== undefined &&
        !p.inlineData &&
        !p.functionCall &&
        !p.functionResponse
    );

    if (soloTexto) {
      const text = parts.map((p: any) => p.text).join("");
      messages.push({ role, content: text });
    } else {
      // Multimodal
      const content: any[] = [];

      for (const p of parts) {
        if (p.text !== undefined) {
          content.push({ type: "text", text: p.text });
        } else if (p.inlineData) {
          content.push({
            type: "image_url",
            image_url: {
              url: `data:${p.inlineData.mimeType};base64,${p.inlineData.data}`,
            },
          });
        }
      }

      if (content.length > 0) {
        messages.push({ role, content });
      }
    }
  }

  return messages;
}

/** Convierte `config.tools[].functionDeclarations` a tools de OpenAI. */
function convertirTools(config: any): any[] | undefined {
  if (!config?.tools) return undefined;

  const tools: any[] = [];

  for (const t of config.tools) {
    if (t.functionDeclarations) {
      for (const fd of t.functionDeclarations) {
        tools.push({
          type: "function",
          function: {
            name: fd.name,
            description: fd.description,
            parameters: fd.parametersJsonSchema || fd.parameters || {},
          },
        });
      }
    }
  }

  return tools.length > 0 ? tools : undefined;
}

/** Convierte una respuesta de OpenRouter a nuestro formato interno. */
function convertirRespuestaOpenRouter(
  orResp: OpenRouterResponse
): OpenRouterResult {
  const choice = orResp.choices?.[0];
  if (!choice) {
    return { text: undefined, functionCalls: undefined };
  }

  const msg = choice.message;
  const textContent: string | undefined = msg.content ?? undefined;
  const toolCalls = msg.tool_calls?.map((tc) => ({
    name: tc.function.name,
    id: tc.id,
    args: (() => {
      try {
        return JSON.parse(tc.function.arguments);
      } catch {
        return tc.function.arguments;
      }
    })(),
  }));

  // Construir candidates para compatibilidad
  const parts: any[] = [];
  if (textContent) parts.push({ text: textContent });
  if (toolCalls) {
    for (const tc of toolCalls) {
      parts.push({
        functionCall: { name: tc.name, args: tc.args, id: tc.id },
      });
    }
  }

  return {
    text: textContent,
    functionCalls: toolCalls,
    candidates:
      parts.length > 0
        ? [{ content: { role: "model", parts } }]
        : undefined,
  };
}

/** Detecta si la petición contiene imágenes (multimodal). */
function tieneImagenes(contents: any[]): boolean {
  for (const c of contents) {
    const parts = c.parts || [];
    for (const p of parts) {
      if (p.inlineData || p.image_url) return true;
    }
  }
  return false;
}

/** Selecciona el modelo gratuito adecuado según el tipo de contenido. */
function elegirModeloOpenRouter(contents: any[]): string {
  return tieneImagenes(contents)
    ? OPENROUTER_MODEL_MULTIMODAL
    : OPENROUTER_MODEL_TEXTO;
}

// ---------------------------------------------------------------------------
// Llamada a OpenRouter con reintentos (sin fallback a Gemini)
// ---------------------------------------------------------------------------

async function intentarOpenRouterConReintentos(
  apiKey: string,
  params: { contents: any[]; config?: any }
): Promise<OpenRouterResult> {
  const MAX_REINTENTOS = 3;
  let ultimoError: any;

  const messages = convertirPartsAMessages(params.contents);
  const tools = convertirTools(params.config);
  const modelo = elegirModeloOpenRouter(params.contents);

  const body: Record<string, any> = {
    model: modelo,
    messages,
  };
  if (tools) body.tools = tools;

  for (let i = 0; i <= MAX_REINTENTOS; i++) {
    try {
      const res = await fetch(`${OPENROUTER_BASE}/chat/completions`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          "HTTP-Referer": "http://localhost:3000",
          "X-Title": "Proyecto Finanzas",
        },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const errBody = await res.text();
        let status: number | string = res.status;
        try {
          const parsed = JSON.parse(errBody);
          status = parsed.error?.code || parsed.status || status;
        } catch {
          // Usar el status HTTP directamente
        }
        const error: any = new Error(
          `OpenRouter HTTP ${res.status}: ${errBody.slice(0, 200)}`
        );
        error.status = status;
        throw error;
      }

      const data: OpenRouterResponse = await res.json();
      console.log(`[OpenRouter] Éxito — respuesta obtenida con ${modelo}`);
      return convertirRespuestaOpenRouter(data);
    } catch (error: any) {
      ultimoError = error;
      const status = error?.status;
      const esReintentable =
        (typeof status === "number" && status >= 429) ||
        status === "RESOURCE_EXHAUSTED" ||
        status === "UNAVAILABLE";

      if (!esReintentable || i === MAX_REINTENTOS) {
        throw error;
      }

      const espera = (i + 1) * 2000;
      console.warn(
        `[OpenRouter] Error ${status ?? "desconocido"} (intento ${i + 1}/${MAX_REINTENTOS}), reintentando en ${espera}ms...`
      );
      await new Promise((r) => setTimeout(r, espera));
    }
  }

  throw ultimoError;
}

// ---------------------------------------------------------------------------
// Llamada pública — solo OpenRouter
// ---------------------------------------------------------------------------

/**
 * Llama a OpenRouter con los parámetros en formato Gemini y devuelve
 * un resultado compatible con el resto del código.
 *
 * Requiere `OPENROUTER_API_KEY` en las variables de entorno.
 */
export async function llamarOpenRouter(
  params: { contents: any[]; config?: any }
): Promise<OpenRouterResult> {
  const apiKey = process.env.OPENROUTER_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("OPENROUTER_API_KEY no configurada");
  }

  return await intentarOpenRouterConReintentos(apiKey, params);
}

/**
 * @deprecated Usa `llamarOpenRouter` en adelante.
 * Wrapper que ignora el primer parámetro `_ai` (GoogleGenAI) para compatibilidad
 * con rutas que aún pasan la instancia de Gemini.
 */
export async function llamarGeminiConFallback(
  _ai: any,
  params: { contents: any[]; config?: any; model?: string }
): Promise<OpenRouterResult> {
  return llamarOpenRouter({ contents: params.contents, config: params.config });
}
