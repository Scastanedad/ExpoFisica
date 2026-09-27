/**
 * Mapeo de la intensidad del campo a la longitud/opacidad de las flechas
 * (especificación E2.1 §3.1). Logarítmico y con REFERENCIA FIJA: `t` depende
 * solo de |E| en ese punto (nada de q, del número de cargas ni de autoescala),
 * así que duplicar una carga se ve. La longitud NO es proporcional al campo
 * (compresión log): lo que garantiza es la monotonía estricta.
 *
 * Separado de `dibujarVectores.ts` para poder probarlo en Node (sin tipos DOM).
 */

/**
 * |E| (unidades de simulación) que satura la flecha: el campo de una carga de
 * 5 µC a ~16 px (E = 25000/r²). Equivale a ≈ 4.49×10⁹ N/C. El dibujo usa ε² = 1 (SOFTENING2_ESTATICO): cerca de
 * una carga grande el campo de la malla puede superar el tope, y entonces
 * simplemente satura (dentro del disco, sin efecto visible). Está calibrado
 * contra `K_VISUAL`: si esa constante cambia, recalibrar (o definirlo en SI y
 * dividir por `factoresSim(K_VISUAL).campo`).
 */
export const E_TOPE_FLECHA = 100;

const LOG_TOPE = Math.log10(1 + E_TOPE_FLECHA);

/** t ∈ [0, 1]: 0 sin campo, 1 con |E| ≥ E_TOPE_FLECHA. */
export function escalaFlecha(campoSim: number): number {
  if (!(campoSim > 0)) return 0;
  return Math.min(1, Math.log10(1 + campoSim) / LOG_TOPE);
}
