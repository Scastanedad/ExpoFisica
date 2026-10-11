/**
 * Partículas de corriente (spec E6-E7 §7), puras y con arrays tipados: NUNCA pasan por React ni Zustand
 * (viven en un ref de `CanvasCircuito`).
 *
 * - Densidad por unidad de longitud CONSTANTE (no codifica I); la misma I en serie da la misma rapidez.
 * - Rapidez lineal en |I| con I_ref común a todo el circuito (`velocidadParticula` del motor): doble de
 *   corriente = doble de rapidez. Con |I| < I_CERO se detienen. No es la velocidad de deriva.
 * - Las partículas nunca cruzan el dieléctrico de un capacitor (tramos `cuerpo: "C"` sin partículas).
 * - Se avanza con el signo de I a lo largo del polilínea; la vista de electrones solo invierte el
 *   sentido del DIBUJO (`signoVista = -1`), no los números.
 */
import { sumaTerminos, velocidadParticula, V_MAX_PX, type Resultado } from "../../fisica/circuitos";
import { puntoEnTramo, type GeometriaCircuito } from "./distribucion";

/** Separación aproximada entre puntos del cable [px lógicos]. */
export const ESPACIADO_PARTICULAS = 20;

export interface Particulas {
  /** Índice de la primera partícula de cada tramo. */
  inicio: Uint32Array;
  /** Nº de partículas de cada tramo. */
  cuenta: Uint16Array;
  /** Distancia recorrida desde el inicio del tramo [px]. */
  u: Float32Array;
  n: number;
}

export function crearParticulas(geom: GeometriaCircuito, espaciado = ESPACIADO_PARTICULAS): Particulas {
  const nt = geom.tramos.length;
  const inicio = new Uint32Array(nt);
  const cuenta = new Uint16Array(nt);
  let n = 0;
  geom.tramos.forEach((t, k) => {
    inicio[k] = n;
    cuenta[k] = t.cuerpo === "C" ? 0 : Math.max(0, Math.round(t.longitud / espaciado));
    n += cuenta[k];
  });
  const u = new Float32Array(n);
  geom.tramos.forEach((t, k) => {
    for (let j = 0; j < cuenta[k]; j++) u[inicio[k] + j] = ((j + 0.5) * t.longitud) / cuenta[k];
  });
  return { inicio, cuenta, u, n };
}

/** Rapidez máxima en px lógicos/s: 160 px/s a 1920 px de ancho, proporcional al ancho del lienzo. */
export const vMaxLogico = (geom: GeometriaCircuito): number => (V_MAX_PX * geom.ancho) / 1920;

/** Corriente (con signo, a favor del polilínea) de cada tramo [A]. */
export function corrientesTramos(geom: GeometriaCircuito, r: Resultado, out?: Float64Array): Float64Array {
  const res = out && out.length === geom.tramos.length ? out : new Float64Array(geom.tramos.length);
  geom.tramos.forEach((t, k) => {
    res[k] = sumaTerminos(r, t.terminos);
  });
  return res;
}

/** Velocidad con signo de las partículas de cada tramo [px/s] (lineal en I, suelo según estación). */
export function velocidadesTramos(
  geom: GeometriaCircuito,
  corrientes: ArrayLike<number>,
  iRef: number,
  suelo: number,
  out?: Float32Array,
): Float32Array {
  const res = out && out.length === geom.tramos.length ? out : new Float32Array(geom.tramos.length);
  const vMax = vMaxLogico(geom);
  for (let k = 0; k < geom.tramos.length; k++) res[k] = velocidadParticula(corrientes[k], iRef, suelo, vMax);
  return res;
}

/** Avanza todas las partículas `dt` segundos. `signoVista` = -1 en la vista de electrones. */
export function avanzarParticulas(
  p: Particulas,
  geom: GeometriaCircuito,
  velocidades: ArrayLike<number>,
  dt: number,
  signoVista: 1 | -1 = 1,
): void {
  for (let k = 0; k < geom.tramos.length; k++) {
    const c = p.cuenta[k];
    if (c === 0) continue;
    const v = velocidades[k] * signoVista;
    if (v === 0) continue;
    const L = geom.tramos[k].longitud;
    const i0 = p.inicio[k];
    for (let j = 0; j < c; j++) {
      let x = p.u[i0 + j] + v * dt;
      x %= L;
      if (x < 0) x += L;
      p.u[i0 + j] = x;
    }
  }
}

/** Posición de la partícula j del tramo k. */
export function posicionParticula(
  p: Particulas,
  geom: GeometriaCircuito,
  k: number,
  j: number,
  out: { x: number; y: number },
): { x: number; y: number } {
  return puntoEnTramo(geom.tramos[k], p.u[p.inicio[k] + j], out);
}
