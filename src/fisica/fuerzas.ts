/**
 * Fuerza individual sobre cada carga (especificación E3.2): `F_i = q_i·Σ_{j≠i}
 * E_j`, excluyendo la autofuerza. En "Cargas en reposo" se usa la ley EXACTA
 * de Coulomb en SI, sin softening (misma convención que `fuerzaParSI`/
 * `energiaParSI` de escala.ts): son cargas fuente reales, no un punto
 * arbitrario del plano (a diferencia de q₀ en cargaPrueba.ts, que sí usa
 * `SOFTENING2_ESTATICO`). En "Cargas en movimiento" NO se usa este módulo: se
 * reutiliza la fuerza que el motor ya calcula (`SistemaDinamico.fx/fy`,
 * expuesta por el Worker — ver worker/protocolo.ts).
 *
 * Convención de signos: igual que `campoSI` (escala.ts), los vectores están
 * en la convención de LECTURA (y hacia arriba): `fy = -fyCanvas`.
 *
 * Funciones puras, sin DOM.
 */
import { K_COULOMB, ESCALA, type ConfigEscala } from "./escala";
import type { PuntoCarga } from "./coulomb";

/** Distancia física por debajo de la cual dos cargas se consideran "coincidentes" (1 µm). */
export const UMBRAL_COINCIDENCIA_M = 1e-6;

export interface VectorFuerzaSI {
  fx: number;
  fy: number;
  modulo: number; // N
}

function sinCeroNegativo(v: number): number {
  return v + 0;
}

/**
 * Fuerza neta sobre `cargas[i]` debida a las demás (excluye j = i), ley
 * exacta de Coulomb en SI (sin softening). `null` si `cargas[i]` coincide (a
 * menos de `UMBRAL_COINCIDENCIA_M`) con alguna otra carga: la ley 1/r²
 * diverge de verdad ahí, no es un artefacto numérico que suavizar (E3.2 §5).
 */
export function fuerzaNetaSI(
  i: number,
  cargas: readonly PuntoCarga[],
  esc: ConfigEscala = ESCALA,
): VectorFuerzaSI | null {
  const ci = cargas[i];
  if (!ci) return null;
  const s = esc.mPorCuadro / esc.pxPorCuadro; // metros por px
  const rMinPx = UMBRAL_COINCIDENCIA_M / s;
  let fxCanvas = 0;
  let fyCanvas = 0;
  for (let j = 0; j < cargas.length; j++) {
    if (j === i) continue;
    const cj = cargas[j];
    const dxPx = ci.x - cj.x;
    const dyPx = ci.y - cj.y;
    const rPx = Math.hypot(dxPx, dyPx);
    if (rPx < rMinPx) return null;
    const dx = dxPx * s;
    const dy = dyPx * s;
    const r = Math.hypot(dx, dy);
    const factor = (K_COULOMB * ci.q * esc.cPorUnidad * cj.q * esc.cPorUnidad) / (r * r * r);
    fxCanvas += factor * dx;
    fyCanvas += factor * dy;
  }
  const fx = sinCeroNegativo(fxCanvas);
  const fy = sinCeroNegativo(-fyCanvas);
  return { fx, fy, modulo: Math.hypot(fx, fy) };
}

/**
 * Fuerza sobre TODAS las cargas (para el test de cierre Σ F_i = 0 y para no
 * recalcular O(n) veces si se necesitan varias lecturas del mismo frame).
 */
export function fuerzasNetasSI(
  cargas: readonly PuntoCarga[],
  esc: ConfigEscala = ESCALA,
): (VectorFuerzaSI | null)[] {
  return cargas.map((_, i) => fuerzaNetaSI(i, cargas, esc));
}

/**
 * Suma vectorial de todas las fuerzas devueltas por `fuerzasNetasSI` (≈ 0
 * para un sistema aislado, 3ª ley de Newton; test de cierre F2).
 */
export function sumaFuerzasSI(fuerzas: readonly (VectorFuerzaSI | null)[]): { fx: number; fy: number } {
  let fx = 0;
  let fy = 0;
  for (const f of fuerzas) {
    if (!f) continue;
    fx += f.fx;
    fy += f.fy;
  }
  return { fx: sinCeroNegativo(fx), fy: sinCeroNegativo(fy) };
}

// Re-exportado solo para que los tests puedan importar `ConfigEscala`/`ESCALA` desde un único
// módulo si lo prefieren; no se usa dentro de este archivo más allá de los tipos de arriba.
export type { ConfigEscala };
export { ESCALA, K_COULOMB };
