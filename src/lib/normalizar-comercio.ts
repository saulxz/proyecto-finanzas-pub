// ---------------------------------------------------------------------------
// Normalización de nombres de comercios (Alias)
// ---------------------------------------------------------------------------
// Analiza el concepto antes de guardarlo en Supabase y lo unifica usando
// reglas configurables. Cada regla asocia palabras clave (ej: "MERCADONA")
// con un nombre canónico (ej: "Mercadona").
//
// Si el concepto no coincide con ninguna regla, se limpian sufijos
// comunes (S.A., S.L., números de tienda, etc.) y se devuelve tal cual.
// ---------------------------------------------------------------------------

interface ReglaNormalizacion {
  /** Palabras clave en MAYÚSCULAS que activan esta regla. */
  palabrasClave: string[];
  /** Nombre limpio que se usará en su lugar. */
  nombre: string;
}

const REGLAS: ReglaNormalizacion[] = [
  // ===== Supermercados =====
  { palabrasClave: ["MERCADONA"], nombre: "Mercadona" },
  { palabrasClave: ["LIDL"], nombre: "Lidl" },
  { palabrasClave: ["CARREFOUR"], nombre: "Carrefour" },
  { palabrasClave: ["ALDI"], nombre: "Aldi" },
  { palabrasClave: ["DIA"], nombre: "Dia" },
  { palabrasClave: ["MAS"], nombre: "Mercadona" }, // "Mercadona" usa a veces "MAS"
  { palabrasClave: ["CONSUM"], nombre: "Consum" },
  { palabrasClave: ["BONPREU", "BON PREU", "ESCLAT"], nombre: "Bonpreu" },
  { palabrasClave: ["CAPRABO"], nombre: "Caprabo" },
  { palabrasClave: ["EL CORTE INGLES", "EL CORTE INGLÉS", "CORTE INGLES"], nombre: "El Corte Inglés" },
  { palabrasClave: ["ALCAMPO"], nombre: "Alcampo" },
  { palabrasClave: ["HIPERCOR"], nombre: "Hipercor" },
  { palabrasClave: ["MAKRO"], nombre: "Makro" },
  { palabrasClave: ["COSTCO"], nombre: "Costco" },
  { palabrasClave: ["FROIZ"], nombre: "Froiz" },
  { palabrasClave: ["GADIS"], nombre: "Gadis" },
  { palabrasClave: ["SUPERCOR"], nombre: "Supeco" },
  { palabrasClave: ["CONDIS"], nombre: "Condis" },
  { palabrasClave: ["SUMAS"], nombre: "Suma" },
  { palabrasClave: ["SPAR"], nombre: "Spar" },

  // ===== Grandes almacenes / Bricolaje =====
  { palabrasClave: ["IKEA"], nombre: "Ikea" },
  { palabrasClave: ["DECATHLON"], nombre: "Decathlon" },
  { palabrasClave: ["LEROY MERLIN"], nombre: "Leroy Merlin" },
  { palabrasClave: ["BRICO"], nombre: "Bricomart" }, // bricomart / bricodepot
  { palabrasClave: ["MEDIA MARKT", "MEDIAMARKT", "SATURN"], nombre: "MediaMarkt" },
  { palabrasClave: ["WORTEN"], nombre: "Worten" },
  { palabrasClave: ["FNA"], nombre: "Fnac" },
  { palabrasClave: ["AMAZON"], nombre: "Amazon" },
  { palabrasClave: ["ALIEXPRESS"], nombre: "AliExpress" },
  { palabrasClave: ["EBAY"], nombre: "eBay" },

  // ===== Restauración / Comida rápida =====
  { palabrasClave: ["MCDONALD", "MC DONALD", "MAC DONALD"], nombre: "McDonald's" },
  { palabrasClave: ["BURGER KING"], nombre: "Burger King" },
  { palabrasClave: ["KFC"], nombre: "KFC" },
  { palabrasClave: ["TELEPIZZA", "TELE PIZZA", "DOMINO", "PIZZA HUT"], nombre: "Pizzería" },
  { palabrasClave: ["STARBUCKS"], nombre: "Starbucks" },
  { palabrasClave: ["SUBWAY"], nombre: "Subway" },
  { palabrasClave: ["FOSTER"], nombre: "Foster's Hollywood" },
  { palabrasClave: ["GOYO"], nombre: "100 Montaditos" },
  { palabrasClave: ["VIPS"], nombre: "Vips" },
  { palabrasClave: ["RODILLA"], nombre: "Rodilla" },

  // ===== Gasolineras =====
  {
    palabrasClave: [
      "REPSOL",
      "CEPSA",
      "BP",
      "SHELL",
      "GASOLINERA",
      "ESTACION DE SERVICIO",
      "GASOIL",
      "GASOLI",
      "GAS STATION",
      "PETRONOR",
      "PLENOIL",
      "BALLENOIL",
      "GALP",
      "CAMPSA",
    ],
    nombre: "Gasolinera",
  },

  // ===== Transporte =====
  { palabrasClave: ["RENFE"], nombre: "Renfe" },
  { palabrasClave: ["AVE"], nombre: "Renfe" },
  { palabrasClave: ["CERCANIAS", "CERCANÍAS"], nombre: "Renfe" },
  { palabrasClave: ["ALSA"], nombre: "Alsa" },
  { palabrasClave: ["IBERIA", "VUELING", "RYANAIR", "EASYJET", "AIR EUROPA"], nombre: "Aerolínea" },
  { palabrasClave: ["UBER", "CABIFY", "BOLT", "FREENOW"], nombre: "VTC" },
  { palabrasClave: ["TAXI"], nombre: "Taxi" },
  { palabrasClave: ["BLABLA"], nombre: "BlaBlaCar" },

  // ===== Suministros / Hogar =====
  { palabrasClave: ["ENDESA"], nombre: "Endesa" },
  { palabrasClave: ["IBERDROLA"], nombre: "Iberdrola" },
  { palabrasClave: ["NATURGY", "GAS NATURAL"], nombre: "Naturgy" },
  { palabrasClave: ["ORANGE", "MOVISTAR", "VODAFONE", "YOIGO", "DIGI MOVIL", "MASMOVIL"], nombre: "Telefonía" },
  { palabrasClave: ["SEGUR CAIXA", "SEGURCAIXA", "ALLIANZ", "MAPFRE", "AXA"], nombre: "Seguros" },
];

/**
 * Limpia sufijos/ prefijos residuales comunes (S.A., S.L., números, guiones
 * con localidades, etc.) de un texto que ya ha sido normalizado o que no
 * ha coincidido con ninguna regla.
 */
function limpiarSufijos(texto: string): string {
  return texto
    .trim()
    // "NOMBRE - LOCALIDAD" → "NOMBRE"
    .replace(/\s*[-–—]\s*[A-ZÁÉÍÓÚÑ\s]+$/i, "")
    // "NOMBRE LOCALIDAD" (si la segunda palabra es una localidad conocida)
    // mejor usar enfoque genérico: eliminar palabras sueltas numéricas al final
    .replace(/\s+\d{3,5}\s*$/, "") // códigos postales / números de tienda grandes
    .replace(/\s+\d{1,2}$/, "") // números pequeños al final
    // Eliminar sufijos societarios
    .replace(/\s*S\.\s*A\.\s*$/i, "")
    .replace(/\s*S\.\s*L\.\s*$/i, "")
    .replace(/\s*S\.?\s*L\.?\s*U\.?\s*$/i, "")
    .replace(/\s*S\.?\s*A\.?\s*$/, "")
    .replace(/\s*S\.?\s*L\.?\s*$/, "")
    .replace(/\s*SLU\s*$/i, "")
    .replace(/\s*S\.?\s*L\.?\s*N\.?\s*E\.?\s*$/i, "")
    .replace(/\s*S\.?\s*C\.?\s*P\.?\s*$/i, "")
    // Eliminar "NIF:", "CIF:", "Nº" y similares
    .replace(/\s*(NIF|CIF|Nº|NUMERO):?.+$/i, "")
    // Eliminar "TELF:", "TEL:" y similares
    .replace(/\s*(TELF?|TELÉFONO|TFNO):?.+$/i, "")
    .trim();
}

/**
 * Normaliza el nombre de un comercio según las reglas de alias.
 *
 * Ejemplos:
 *   "MERCADONA S.A. 42 SEVILLA"    → "Mercadona"
 *   "LIDL SUPERMERCADO"            → "Lidl"
 *   "GASOLINERA REPSOL"            → "Gasolinera"
 *   "MCDONALD'S - GRAN VÍA"        → "McDonald's"
 *   "CAFETERÍA PEPE"               → "Cafetería Pepe" (sin cambios)
 */
export function normalizarComercio(concepto: string): string {
  const original = concepto?.trim() || "";
  if (!original) return "";

  const mayusculas = original.toUpperCase();

  // Buscar la primera regla que coincida
  for (const regla of REGLAS) {
    const coincide = regla.palabrasClave.some((kw) => {
      // Usar \b (límite de palabra) para evitar falsos positivos
      // Ej: que "MAS" no coincida dentro de "MASTER"
      const patron = new RegExp(`\\b${kw.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`);
      return patron.test(mayusculas);
    });
    if (coincide) {
      return regla.nombre;
    }
  }

  // Si no hay regla, al menos limpiar sufijos residuales
  return limpiarSufijos(original);
}
