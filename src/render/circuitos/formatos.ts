/**
 * Tamaño del lienzo de circuitos. El sistema de coordenadas lógico es IGUAL al tamaño en píxeles CSS
 * (escala ≈ 1), así los tamaños de fuente en px reales son los del diseño y el lienzo llena justo el
 * espacio disponible: se adapta a la caja (ancho de la zona × alto libre) sin saltar entre presets.
 */
export const LIENZO_MAX_CSS = 1100;
export const LIENZO_MAX_CSS_SALA = 1250;
/** A partir de este ancho de ventana el lienzo puede llegar a LIENZO_MAX_CSS_SALA. */
export const ANCHO_SALA_CSS = 1600;
/** Alto máximo como proporción del ancho (no estirar más que casi un cuadrado). */
export const PROPORCION_ALTO_MAX = 1.33;
/** El tamaño se redondea a múltiplos de este paso para no reconstruir por 1 px. */
export const PASO_TAMANO = 4;

export interface TamanoLienzo {
  ancho: number;
  alto: number;
}

/**
 * @param anchoZonaCss ancho de la zona del lienzo.
 * @param altoDisponibleCss alto que la página deja al lienzo (`--alto-lienzo`).
 * @param anchoVentanaCss ancho de la ventana (decide el máximo de sala).
 * El resultado nunca supera ni el ancho de la zona ni el alto disponible.
 */
export function tamanoLienzo(anchoZonaCss: number, altoDisponibleCss: number, anchoVentanaCss: number): TamanoLienzo {
  const maxAncho = anchoVentanaCss >= ANCHO_SALA_CSS ? LIENZO_MAX_CSS_SALA : LIENZO_MAX_CSS;
  const q = (v: number) => Math.max(PASO_TAMANO * 20, Math.floor(v / PASO_TAMANO) * PASO_TAMANO);
  const ancho = q(Math.min(anchoZonaCss, maxAncho));
  const alto = Math.min(q(Math.min(altoDisponibleCss, ancho * PROPORCION_ALTO_MAX)), Math.floor(Math.max(altoDisponibleCss, 160)));
  return { ancho: Math.min(ancho, Math.max(80, Math.floor(anchoZonaCss))), alto: Math.max(80, alto) };
}
