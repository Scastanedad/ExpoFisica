import type { UnidadCarga } from "../types/simulacion";

/**
 * 1 unidad de carga normalizada = 1 microCoulomb, por convención (ver
 * fisica/coulomb.ts). El toggle de unidad solo cambia cómo se etiqueta el
 * número en la UI, nunca el valor numérico interno — así el mismo modelo
 * sirve tanto para lectura rápida ("carga: 1") como para lectura físicamente
 * precisa ("carga: +1 µC").
 */
export function formatCarga(q: number, unidad: UnidadCarga): string {
  const signo = q >= 0 ? "+" : "−";
  const magnitud = Math.abs(q);
  const texto = Number.isInteger(magnitud) ? String(magnitud) : magnitud.toFixed(2);
  return unidad === "microC" ? `${signo}${texto} µC` : `${signo}${texto}`;
}
