import type { UnidadCarga } from "../types/simulacion";

/**
 * 1 unidad de carga normalizada = 1 microCoulomb, por convención
 * (`C_POR_UNIDAD` en fisica/escala.ts, junto con 1 cuadro = 1 cm). El toggle de unidad solo cambia cómo se etiqueta el
 * número en la UI, nunca el valor numérico interno — así el mismo modelo
 * sirve tanto para lectura rápida ("carga: 1") como para lectura físicamente
 * precisa ("carga: +1 µC").
 */
export function formatCarga(q: number, unidad: UnidadCarga): string {
  const signo = q >= 0 ? "+" : "−";
  const magnitud = Math.abs(q);
  // Sin ceros sobrantes: "+0.5 µC", "+1 µC", "+1.25 µC" (2 decimales como máximo).
  const texto = Number(magnitud.toFixed(2)).toString();
  return unidad === "microC" ? `${signo}${texto} µC` : `${signo}${texto}`;
}
