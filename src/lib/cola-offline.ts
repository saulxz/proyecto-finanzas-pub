export interface TransaccionPendiente {
  id: string;
  tipo: "ingreso" | "gasto";
  cantidad: number;
  categoria: string;
  concepto: string;
  recurrente: boolean;
  creado_en: string;
}

const STORAGE_KEY = "transacciones_pendientes";

/** Guarda una transacción en la cola offline de localStorage. */
export function guardarEnCola(
  transaccion: Omit<TransaccionPendiente, "id" | "creado_en">
): void {
  const cola = obtenerCola();
  cola.push({
    ...transaccion,
    id: crypto.randomUUID(),
    creado_en: new Date().toISOString(),
  });
  localStorage.setItem(STORAGE_KEY, JSON.stringify(cola));
}

/** Recupera todas las transacciones pendientes de la cola. */
export function obtenerCola(): TransaccionPendiente[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

/** Vacía completamente la cola offline. */
export function limpiarCola(): void {
  localStorage.removeItem(STORAGE_KEY);
}

/** Elimina una transacción específica de la cola por su id. */
export function eliminarDeCola(id: string): void {
  const cola = obtenerCola().filter((t) => t.id !== id);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(cola));
}

/** Indica si hay transacciones pendientes en la cola. */
export function hayPendientes(): boolean {
  return obtenerCola().length > 0;
}

/** Cuenta las transacciones pendientes. */
export function contarPendientes(): number {
  return obtenerCola().length;
}
