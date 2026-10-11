/**
 * Resumen de E6 derivado de las lecturas ya publicadas (10 Hz): resistencia equivalente, voltaje en los
 * bornes y avisos de la spec §5 (no limitan la simulación). Puro.
 */
import type { LecturasCircuito } from "../../store/circuitosStore";

/** Potencia a partir de la cual un resistor de ¼ W se quemaría [W]. */
export const P_RESISTOR_W = 0.25;
/** Corriente que una pila real no soporta [A]. */
export const I_PILA_A = 1;

export interface ResumenE6 {
  /** Resistencia equivalente del circuito (sin la interna de la batería) [Ω]. */
  rEq: number;
  /** Voltaje en los bornes de la batería [V] (= E si es ideal). */
  vBornes: number;
  iBat: number;
  pBat: number;
  pilaReal: boolean;
  /** Ids de los resistores que superan ¼ W. */
  quemados: string[];
}

export function resumenE6(l: LecturasCircuito | null, E: number): ResumenE6 | null {
  if (!l || !(l.iBat > 0)) return null;
  const rInt = l.elementos.r_int;
  const vBornes = E - (rInt ? rInt.v : 0);
  const quemados = Object.values(l.elementos)
    .filter((x) => x.tipo === "R" && x.id !== "r_int" && x.p > P_RESISTOR_W)
    .map((x) => x.id);
  return { rEq: vBornes / l.iBat, vBornes, iBat: l.iBat, pBat: l.pBat, pilaReal: l.iBat > I_PILA_A, quemados };
}

export function textosAvisos(r: ResumenE6): string[] {
  const out: string[] = [];
  if (r.pilaReal) out.push("Una pila real no soportaría esta corriente (más de 1 A).");
  if (r.quemados.length > 0) {
    out.push(`${r.quemados.join(", ")}: un resistor común de ¼ W se quemaría con esta potencia.`);
  }
  return out;
}
