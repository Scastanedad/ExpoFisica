/**
 * Escalas visuales puras (spec E6-E7-circuitos §6-§7): tiempo logarítmico en E7, velocidad de
 * partículas lineal en |I| y nº de cargas en placas. Sin DOM.
 */
import type { Netlist, Resultado } from "./tipos";

export const TAU_MIN = 1e-6;
export const TAU_MAX = 10;
/** Velocidad máxima de partículas [px lógicos/s a 1920 px]. */
export const V_MAX_PX = 160;
/** Suelo visible de E6 (fracción de I_ref). */
export const SUELO_E6 = 0.04;
/**
 * Umbral único de «corriente nula»: por debajo, las partículas se detienen y los textos
 * muestran «≈ 0» (spec criterios §3: < 1 µA).
 */
export const I_CERO = 1e-6;
export const I_PARADA = I_CERO;

export const esCorrienteNula = (i: number): boolean => Math.abs(i) < I_CERO;

/** τ en pantalla [s] ∈ [0,5; 4]: 0,5 + 0,5·log10(clamp(τ_real, 1 µs, 10 s)/1 µs). */
export function tauVisual(tauReal: number): number {
  const t = Math.min(TAU_MAX, Math.max(TAU_MIN, tauReal));
  return 0.5 + 0.5 * Math.log10(t / TAU_MIN);
}

/** Factor F = τ_vis/τ_real (> 1: más lento que lo real). */
export function factorTiempo(tauReal: number): number {
  return tauVisual(tauReal) / tauReal;
}

/** I_ref de E6: máx |I| de resistores y fuente. */
export function iReferenciaE6(net: Netlist, r: Resultado): number {
  let m = 0;
  for (const el of net.elementos) if (el.tipo !== "C") m = Math.max(m, Math.abs(r.i[el.id] ?? 0));
  return m;
}

/**
 * Velocidad con signo de las partículas (lineal en I). `suelo` > 0 (E6: 0,04); 0 en E7 (sin suelo).
 * El signo es el de I; |I| < 1e-9 ⇒ 0.
 */
export function velocidadParticula(i: number, iRef: number, suelo = SUELO_E6, vMax = V_MAX_PX): number {
  if (!(iRef > 0) || esCorrienteNula(i)) return 0;
  return Math.sign(i) * vMax * Math.max(Math.abs(i) / iRef, suelo);
}

/** Nº de cargas dibujadas en una placa: round(8·|Q|/Q_ref), mínimo 1 si |Q| > 1 % de Q_ref. */
export function cargasEnPlaca(q: number, qRef: number): number {
  if (!(qRef > 0)) return 0;
  const f = Math.abs(q) / qRef;
  const n = Math.round(8 * f);
  return f > 0.01 ? Math.max(1, n) : n;
}
