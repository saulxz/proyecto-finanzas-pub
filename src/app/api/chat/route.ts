import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { llamarOpenRouter } from "@/lib/gemini-fallback";

/** Crea un part de functionResponse en formato Gemini (para el historial). */
function crearFunctionResponse(
  id: string | undefined,
  name: string,
  response: Record<string, unknown>
) {
  return {
    functionResponse: {
      name,
      id,
      response,
    },
  };
}

interface Mensaje {
  rol: "usuario" | "asistente";
  contenido: string;
}

interface CategoriaInfo {
  id: string;
  value: string;
  label: string;
  icon: string;
}

/** Construye las declaraciones de funciones dinámicamente con las categorías actuales. */
function construirFunciones(categorias: CategoriaInfo[]) {
  const values = categorias.map((c) => c.value);
  const labels = Object.fromEntries(categorias.map((c) => [c.value, c.label]));

  const FUNCION_REGISTRAR_TRANSACCION = {
    name: "registrar_transaccion",
    description:
      "Registra un gasto o ingreso en la aplicación financiera. " +
      "Llama a esta función cuando el usuario te pida apuntar una transacción, " +
      "por ejemplo: 'apunta 50€ de comida', 'he ingresado 2000€ de nómina', " +
      "'registra un gasto de 30€ en transporte'.",
    parametersJsonSchema: {
      type: "object",
      properties: {
        tipo: {
          type: "string",
          enum: ["ingreso", "gasto"],
          description:
            "Tipo de transacción: 'ingreso' si entra dinero, 'gasto' si sale dinero.",
        },
        cantidad: {
          type: "number",
          description:
            "Cantidad en euros. Usa punto como separador decimal (ej: 50.00).",
        },
        categoria: {
          type: "string",
          enum: values,
          description:
            `Categoría de la transacción. Categorías disponibles: ${values.join(", ")}. ` +
            "Si la categoría que necesita el usuario no está en la lista, " +
            "NO uses 'otros' — primero llama a crear_categoria para añadirla y luego llama a registrar_transaccion.",
        },
        concepto: {
          type: "string",
          description:
            "Descripción breve de la transacción (opcional pero recomendado).",
        },
      },
      required: ["tipo", "cantidad", "categoria"],
    },
  };

  const FUNCION_ELIMINAR_TRANSACCION = {
    name: "eliminar_transaccion",
    description:
      "Elimina un gasto o ingreso existente. " +
      "Llama a esta función cuando el usuario te pida borrar, eliminar o quitar " +
      "una transacción que ya está registrada.",
    parametersJsonSchema: {
      type: "object",
      properties: {
        tipo: {
          type: "string",
          enum: ["ingreso", "gasto"],
          description: "Tipo de transacción a eliminar.",
        },
        cantidad: {
          type: "number",
          description: "Cantidad en euros de la transacción a eliminar.",
        },
        categoria: {
          type: "string",
          enum: values,
          description: `Categoría de la transacción. Valores: ${values.join(", ")}.`,
        },
        concepto: {
          type: "string",
          description:
            "Texto del concepto o parte de él para identificar la transacción (opcional).",
        },
      },
      required: ["tipo", "cantidad", "categoria"],
    },
  };

  const FUNCION_GESTIONAR_PRESUPUESTO = {
    name: "gestionar_presupuesto",
    description:
      "Crea, actualiza o elimina un presupuesto mensual por categoría. " +
      "Llama a esta función cuando el usuario quiera establecer un límite de gasto " +
      "para una categoría.",
    parametersJsonSchema: {
      type: "object",
      properties: {
        accion: {
          type: "string",
          enum: ["crear", "eliminar"],
          description:
            "'crear' para establecer o actualizar un presupuesto, 'eliminar' para borrarlo.",
        },
        categoria: {
          type: "string",
          enum: values,
          description: `Categoría del presupuesto. Valores: ${values.join(", ")}.`,
        },
        limite_mensual: {
          type: "number",
          description:
            "Límite mensual en euros. Obligatorio si la acción es 'crear'. Ej: 200.00",
        },
      },
      required: ["accion", "categoria"],
    },
  };

  const FUNCION_CREAR_CATEGORIA = {
    name: "crear_categoria",
    description:
      "Crea una nueva categoría personalizada. " +
      "Llama a esta función cuando el usuario mencione una categoría que no existe en la lista actual " +
      "(por ejemplo: 'gasolina', 'suscripciones', 'gimnasio'). " +
      "Después de crearla, puedes usarla inmediatamente en registrar_transaccion. " +
      "No uses 'otros' como comodín — crea la categoría adecuada.",
    parametersJsonSchema: {
      type: "object",
      properties: {
        value: {
          type: "string",
          description:
            "Identificador único de la categoría en minúsculas y sin acentos (ej: 'gasolina', 'suscripciones').",
        },
        label: {
          type: "string",
          description:
            "Nombre visible de la categoría con formato amigable (ej: 'Gasolina', 'Suscripciones').",
        },
      },
      required: ["value", "label"],
    },
  };

  return {
    funciones: [
      FUNCION_REGISTRAR_TRANSACCION,
      FUNCION_ELIMINAR_TRANSACCION,
      FUNCION_GESTIONAR_PRESUPUESTO,
      FUNCION_CREAR_CATEGORIA,
    ],
    labels,
  };
}

export async function POST(request: NextRequest) {
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

    // 2. Leer body
    const body = await request.json();
    const mensaje = body.mensaje as string | undefined;
    const historial = (body.historial || []) as Mensaje[];

    if (!mensaje || mensaje.trim().length === 0) {
      return NextResponse.json(
        { error: "El mensaje no puede estar vacío" },
        { status: 400 }
      );
    }

    // 3. Determinar el mes a analizar (opcional, por defecto el actual)
    const yearParam = body.year as number | undefined;
    const monthParam = body.month as number | undefined;
    const ahora = new Date();
    const year = typeof yearParam === "number" && !isNaN(yearParam) ? yearParam : ahora.getFullYear();
    const month = typeof monthParam === "number" && !isNaN(monthParam) ? monthParam : ahora.getMonth();

    const inicioMes = new Date(year, month, 1).toISOString();
    const finMes = new Date(year, month + 1, 0, 23, 59, 59).toISOString();

    const [transaccionesRes, presupuestosRes, categoriasRes] = await Promise.all([
      supabase
        .from("transacciones")
        .select("*")
        .gte("creado_en", inicioMes)
        .lte("creado_en", finMes)
        .order("creado_en", { ascending: false }),
      supabase.from("presupuestos").select("*"),
      supabase.from("categorias").select("*").order("label", { ascending: true }),
    ]);

    const transacciones = transaccionesRes.data || [];
    const presupuestos = presupuestosRes.data || [];
    const categorias: CategoriaInfo[] = categoriasRes.data || [];

    // Construir funciones y etiquetas dinámicamente
    const { funciones, labels } = construirFunciones(categorias);

    // 4. Calcular resúmenes
    const ingresos = transacciones
      .filter((t: any) => t.tipo === "ingreso")
      .reduce((s: number, t: any) => s + Number(t.cantidad), 0);

    const gastos = transacciones
      .filter((t: any) => t.tipo === "gasto")
      .reduce((s: number, t: any) => s + Number(t.cantidad), 0);

    const gastoPorCategoria: Record<string, number> = {};
    transacciones
      .filter((t: any) => t.tipo === "gasto")
      .forEach((t: any) => {
        const cat = labels[t.categoria] || t.categoria;
        gastoPorCategoria[cat] = (gastoPorCategoria[cat] || 0) + Number(t.cantidad);
      });

    const gastosRecientes = transacciones
      .filter((t: any) => t.tipo === "gasto")
      .slice(0, 15)
      .map((t: any) => ({
        concepto: t.concepto || "(sin concepto)",
        cantidad: Number(t.cantidad),
        categoria: labels[t.categoria] || t.categoria,
        fecha: new Date(t.creado_en).toLocaleDateString("es-ES"),
      }));

    const presupuestosInfo = presupuestos.map((p: any) => {
      const gasto = gastoPorCategoria[labels[p.categoria] || p.categoria] || 0;
      return {
        categoria: labels[p.categoria] || p.categoria,
        limite: Number(p.limite_mensual),
        gastado: gasto,
        restante: Number(p.limite_mensual) - gasto,
      };
    });

    // 5. Construir system prompt con los datos
    const mesNombre = new Date(year, month).toLocaleString("es-ES", { month: "long" });

    const sistemaPrompt = `Eres un asesor financiero del hogar, amable y conciso. 
Actúas como compañero de piso que lleva las cuentas y ayuda a tomar mejores decisiones con el dinero.

DATOS FINANCIEROS DEL MES (${mesNombre} de ${year}):

- Total ingresos: ${ingresos.toFixed(2)} €
- Total gastos: ${gastos.toFixed(2)} €
- Balance: ${(ingresos - gastos).toFixed(2)} €

${
  presupuestosInfo.length > 0
    ? `PRESUPUESTOS POR CATEGORÍA:\n${presupuestosInfo
        .map(
          (p) =>
            `- ${p.categoria}: ${p.gastado.toFixed(2)}€ de ${p.limite.toFixed(2)}€ (${p.restante >= 0 ? `quedan ${p.restante.toFixed(2)}€` : `excedido en ${Math.abs(p.restante).toFixed(2)}€`})`
        )
        .join("\n")}`
    : "No hay presupuestos definidos."
}

${
  gastosRecientes.length > 0
    ? `GASTOS RECIENTES:\n${gastosRecientes
        .map(
          (g) =>
            `- ${g.fecha}: ${g.categoria} - ${g.concepto} (${g.cantidad.toFixed(2)}€)`
        )
        .join("\n")}`
    : "No hay gastos este mes."
}

INSTRUCCIONES:
- Responde SIEMPRE en español, de forma clara y empática.
- Usa formato Markdown básico: **negritas** para cifras importantes, listas con - para enumerar.
- Si te preguntan por algo que no tienes datos ("¿cuánto gastamos el mes pasado?"), dilo con honestidad: "Solo tengo los datos del mes que estás viendo."
- Si ves que se acerca el límite de un presupuesto, avísalo amablemente.
- Ofrece consejos prácticos de ahorro cuando sea relevante.
- Sé conciso: 3-4 párrafos máximo salvo que te pidan más detalle.
- No inventes datos que no estén en el contexto.

CATEGORÍAS DISPONIBLES:
${categorias.map((c) => `- "${c.value}" → ${c.label}`).join("\n")}

FUNCIONES DISPONIBLES:

1. registrar_transaccion:
Cuando el usuario te pida APUNTAR, REGISTRAR o GUARDAR un gasto o ingreso
("apunta 50€ de comida", "he ingresado 2000€ de nómina", "registra un gasto de 30€ en transporte"),
NO respondas con texto. En su lugar, llama SIEMPRE a la función 'registrar_transaccion'
con los datos que el usuario te haya proporcionado. La función se encargará de guardarlo.
Después de que la función se ejecute correctamente, responde confirmando lo registrado.
IMPORTANTE: Si la categoría que necesitas no está en la lista de CATEGORÍAS DISPONIBLES,
NO uses "otros" como comodín. Primero llama a 'crear_categoria' (función 4) y
luego usa la nueva categoría en 'registrar_transaccion'.

2. eliminar_transaccion:
Cuando el usuario te pida BORRAR, ELIMINAR o QUITAR un gasto o ingreso ya registrado
("quita el gasto de 50€ de comida", "elimina el ingreso de 2000€ de nómina",
"borra la transacción de 30€ en transporte"), llama a la función 'eliminar_transaccion'.
NO respondas con texto antes de llamar a la función. Después de ejecutarse, confirma qué se eliminó.

3. gestionar_presupuesto:
Cuando el usuario quiera ESTABLECER, CAMBIAR o ELIMINAR un presupuesto por categoría
("ponme 200€ de presupuesto en ocio", "aumenta el límite de alimentación a 400€",
"quita el presupuesto de transporte"), llama a la función 'gestionar_presupuesto'.
Si la acción es 'crear' y ya existe un presupuesto para esa categoría, lo actualizará solo.
Después de ejecutarla, confirma al usuario el cambio realizado.

4. crear_categoria:
Cuando el usuario mencione una categoría que NO está en la lista de CATEGORÍAS DISPONIBLES
(por ejemplo: "gasolina", "suscripciones", "gimnasio", "seguro"), NO uses "otros".
Llama a 'crear_categoria' con un identificador corto (value) y su nombre visible (label).
Después de crearla, la categoría estará disponible para usarla en 'registrar_transaccion'.
Usa siempre minúsculas sin acentos para el value: "gasolina", no "Gasolina".
Ejemplo: si el usuario dice "apunta 50€ de gasolina", primero crea la categoría con
crear_categoria(value="gasolina", label="Gasolina") y luego llama a
registrar_transaccion(tipo="gasto", cantidad=50, categoria="gasolina", concepto="Gasolina").`;

    // 6. Construir historial para Gemini
    const contents: any[] = [
      {
        role: "user",
        parts: [{ text: sistemaPrompt }],
      },
      {
        role: "model",
        parts: [
          {
            text: "Entendido. Soy el asistente financiero del hogar. Tengo los datos del mes actual y estoy listo para ayudar.",
          },
        ],
      },
    ];

    // Añadir historial de la conversación
    for (const msg of historial) {
      contents.push({
        role: msg.rol === "usuario" ? "user" : "model",
        parts: [{ text: msg.contenido }],
      });
    }

    // 7. Llamar al modelo via OpenRouter con las funciones disponibles
    const config = {
      tools: [
        {
          functionDeclarations: funciones,
        },
      ],
      toolConfig: {
        functionCallingConfig: {
          mode: "AUTO",
        },
      },
    };

    const response = await llamarOpenRouter({
      contents,
      config,
    });

    // ── 8. Manejar function calls ─────────────────────────────────
    let texto = response.text;
    const functionCalls = response.functionCalls;
    let recargar = false;

    if (functionCalls && functionCalls.length > 0) {
      // Añadir la respuesta del modelo (con las function calls) al historial
      if (response.candidates?.[0]?.content) {
        contents.push(response.candidates[0].content);
      }

      // Ejecutar cada function call
      for (const fc of functionCalls) {
        if (fc.name === "registrar_transaccion" && fc.args) {
          const { tipo, cantidad, categoria, concepto } = fc.args as {
            tipo: string;
            cantidad: number;
            categoria: string;
            concepto?: string;
          };

          const { error: errInsert } = await supabase
            .from("transacciones")
            .insert({
              usuario_id: user.id,
              tipo,
              cantidad,
              categoria,
              concepto: concepto?.trim() || "(sin concepto)",
              recurrente: false,
              ultima_generacion: null,
            });

          if (errInsert) {
            console.error("Error al insertar transacción desde chat:", errInsert);
            contents.push({
              role: "user",
              parts: [
                crearFunctionResponse(fc.id!, fc.name, {
                  exito: false,
                  error: errInsert.message,
                }),
              ],
            });
            } else {
            recargar = true;
            contents.push({
              role: "user",
              parts: [
                crearFunctionResponse(fc.id!, fc.name, {
                  exito: true,
                }),
              ],
            });
          }
        } else if (fc.name === "gestionar_presupuesto" && fc.args) {
          const { accion, categoria, limite_mensual } = fc.args as {
            accion: string;
            categoria: string;
            limite_mensual?: number;
          };

          if (accion === "crear") {
            if (limite_mensual === undefined || limite_mensual <= 0) {
              contents.push({
                role: "user",
                parts: [
                  crearFunctionResponse(fc.id!, fc.name, {
                    exito: false,
                    error: "Debes especificar un límite mensual válido.",
                  }),
                ],
              });
              continue;
            }

            // Buscar si ya existe un presupuesto para esta categoría
            const { data: existente } = await supabase
              .from("presupuestos")
              .select("id")
              .eq("categoria", categoria)
              .eq("user_id", user.id)
              .maybeSingle();

            let errInsert;

            if (existente) {
              const { error } = await supabase
                .from("presupuestos")
                .update({
                  limite_mensual,
                  actualizado_en: new Date().toISOString(),
                })
                .eq("id", existente.id);
              errInsert = error;
            } else {
              const { error } = await supabase
                .from("presupuestos")
                .insert({
                  user_id: user.id,
                  categoria,
                  limite_mensual,
                });
              errInsert = error;
            }

            if (errInsert) {
              console.error("Error al crear presupuesto:", errInsert);
              contents.push({
                role: "user",
                parts: [
                  crearFunctionResponse(fc.id!, fc.name, {
                    exito: false,
                    error: errInsert.message,
                  }),
                ],
              });
            } else {
              recargar = true;
              contents.push({
                role: "user",
                parts: [
                  crearFunctionResponse(fc.id!, fc.name, {
                    exito: true,
                  }),
                ],
              });
            }
          } else if (accion === "eliminar") {
            const { data: existente } = await supabase
              .from("presupuestos")
              .select("id")
              .eq("categoria", categoria)
              .eq("user_id", user.id)
              .maybeSingle();

            if (!existente) {
              contents.push({
                role: "user",
                parts: [
                  crearFunctionResponse(fc.id!, fc.name, {
                    exito: false,
                    error: `No hay ningún presupuesto para la categoría ${categoria}.`,
                  }),
                ],
              });
              continue;
            }

            const { error } = await supabase
              .from("presupuestos")
              .delete()
              .eq("id", existente.id);

            if (error) {
              console.error("Error al eliminar presupuesto:", error);
              contents.push({
                role: "user",
                parts: [
                  crearFunctionResponse(fc.id!, fc.name, {
                    exito: false,
                    error: error.message,
                  }),
                ],
              });
            } else {
              recargar = true;
              contents.push({
                role: "user",
                parts: [
                  crearFunctionResponse(fc.id!, fc.name, {
                    exito: true,
                  }),
                ],
              });
            }
          }
        } else if (fc.name === "eliminar_transaccion" && fc.args) {
          const { tipo, cantidad, categoria, concepto } = fc.args as {
            tipo: string;
            cantidad: number;
            categoria: string;
            concepto?: string;
          };

          // Buscar la transacción más reciente que coincida
          let query = supabase
            .from("transacciones")
            .select("id, concepto, creado_en")
            .eq("usuario_id", user.id)
            .eq("tipo", tipo)
            .eq("categoria", categoria)
            .eq("cantidad", cantidad);

          if (concepto?.trim()) {
            query = query.ilike("concepto", `%${concepto.trim()}%`);
          }

          const { data: coincidencias, error: errBuscar } = await query
            .order("creado_en", { ascending: false })
            .limit(5);

          if (errBuscar) {
            contents.push({
              role: "user",
              parts: [
                crearFunctionResponse(fc.id!, fc.name, {
                  exito: false,
                  error: errBuscar.message,
                }),
              ],
            });
            continue;
          }

          if (!coincidencias || coincidencias.length === 0) {
            contents.push({
              role: "user",
              parts: [
                crearFunctionResponse(fc.id!, fc.name, {
                  exito: false,
                  error: `No encontré ninguna transacción de ${tipo} por ${cantidad}€ en ${categoria}${concepto ? ` con "${concepto}"` : ""}.`,
                }),
              ],
            });
            continue;
          }

          // Eliminar la más reciente
          const { error: errEliminar } = await supabase
            .from("transacciones")
            .delete()
            .eq("id", coincidencias[0].id);

          if (errEliminar) {
            contents.push({
              role: "user",
              parts: [
                crearFunctionResponse(fc.id!, fc.name, {
                  exito: false,
                  error: errEliminar.message,
                }),
              ],
            });
          } else {
            recargar = true;
            const numExtra = coincidencias.length - 1;
            const mensajeExtra = numExtra > 0
              ? ` Se encontraron ${numExtra} coincidencia${numExtra > 1 ? "s" : ""} más que no se eliminaron.`
              : "";
            contents.push({
              role: "user",
              parts: [
                crearFunctionResponse(fc.id!, fc.name, {
                  exito: true,
                  mensaje: `Eliminada transacción de ${coincidencias[0].creado_en?.split("T")[0]}: ${coincidencias[0].concepto || "(sin concepto)"}.${mensajeExtra}`,
                }),
              ],
            });
          }
        } else if (fc.name === "crear_categoria" && fc.args) {
          const { value, label } = fc.args as {
            value: string;
            label: string;
          };

          const valueLimpio = value.toLowerCase().trim().replace(/\s+/g, "-");
          if (!valueLimpio) {
            contents.push({
              role: "user",
              parts: [
                crearFunctionResponse(fc.id!, fc.name, {
                  exito: false,
                  error: "El identificador de la categoría no puede estar vacío.",
                }),
              ],
            });
            continue;
          }

          const { data: existente } = await supabase
            .from("categorias")
            .select("id")
            .eq("value", valueLimpio)
            .maybeSingle();

          if (existente) {
            contents.push({
              role: "user",
              parts: [
                crearFunctionResponse(fc.id!, fc.name, {
                  exito: true,
                  ya_existia: true,
                  value: valueLimpio,
                }),
              ],
            });
          } else {
            const { error: errInsert } = await supabase
              .from("categorias")
              .insert({ value: valueLimpio, label: label?.trim() || valueLimpio });

            if (errInsert) {
              contents.push({
                role: "user",
                parts: [
                  crearFunctionResponse(fc.id!, fc.name, {
                    exito: false,
                    error: errInsert.message,
                  }),
                ],
              });
            } else {
              recargar = true;
              contents.push({
                role: "user",
                parts: [
                  crearFunctionResponse(fc.id!, fc.name, {
                    exito: true,
                    ya_existia: false,
                    value: valueLimpio,
                  }),
                ],
              });
            }
          }
        }
      }

      // Segunda llamada con los resultados de las funciones
      const response2 = await llamarOpenRouter({
        contents,
        config,
      });

      texto = response2.text;
    }

    if (!texto) {
      return NextResponse.json(
        { error: "El asistente no devolvió respuesta" },
        { status: 502 }
      );
    }

    return NextResponse.json({ respuesta: texto, recargar });
    } catch (error: any) {
    console.error("Error en chat:", error);

    // Mensajes de error más descriptivos según el tipo
    const mensajeError = (() => {
      const status = error?.status;
      if (status === 429 || status === "RESOURCE_EXHAUSTED") {
        return "El servicio de IA está temporalmente sobrecargado. Inténtalo de nuevo en unos segundos.";
      }
      if (status === 404) {
        return "El modelo de IA no está disponible en este momento. Inténtalo de nuevo más tarde.";
      }
      return "Error interno del servidor al procesar el mensaje.";
    })();

    return NextResponse.json(
      { error: mensajeError },
      { status: 500 }
    );
  }
}
