/**
 * Vibración háptica para feedback táctil en móvil.
 * Usa la API estándar `navigator.vibrate`.
 * No-op en navegadores que no la soporten.
 */

export function vibrar(ms = 10): void {
  if (typeof navigator !== "undefined" && "vibrate" in navigator) {
    try {
      navigator.vibrate(ms);
    } catch {
      // Silently fail — no es crítico
    }
  }
}
