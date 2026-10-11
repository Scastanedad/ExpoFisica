/**
 * Textos de lectura de los circuitos (sin DOM ni React): formato SI de los rótulos, de la sonda y de
 * los anuncios para lectores de pantalla. Un único umbral de «corriente nula» (I_CERO = 1 nA).
 */
import {
  esCorrienteNula,
  formatearSI,
  type LecturaElemento,
} from "../../fisica/circuitos";
import type { LecturaSondaCircuito } from "./sonda";

const menos = (t: string) => t.replace("-", "−");

export const textoVoltaje = (v: number): string => menos(formatearSI(Math.abs(v) < 1e-12 ? 0 : v, "V"));
export const textoCorriente = (i: number): string => (esCorrienteNula(i) ? "≈ 0 A" : menos(formatearSI(i, "A")));
export const textoPotencia = (p: number): string => (Math.abs(p) < 1e-12 ? "0 W" : menos(formatearSI(p, "W")));
export const textoValorElemento = (tipo: "R" | "C" | "V", valor: number): string =>
  tipo === "R" ? formatearSI(valor, "Ω") : tipo === "C" ? formatearSI(valor, "F") : formatearSI(valor, "V");

export interface TextosElemento {
  v: string;
  i: string;
}

/** Rótulos V / I de cada elemento (solo resistores y capacitores). */
export function textosElementos(lecturas: Record<string, LecturaElemento>): Record<string, TextosElemento> {
  const out: Record<string, TextosElemento> = {};
  for (const l of Object.values(lecturas)) {
    if (l.tipo === "V") continue;
    out[l.id] = { v: textoVoltaje(l.v), i: textoCorriente(l.i) };
  }
  return out;
}

export function textoSonda(l: LecturaSondaCircuito): string {
  const donde = l.sobreCuerpo && l.elemento ? `dentro de ${l.elemento}` : l.elemento ? `en el cable de ${l.elemento}` : "en el cable";
  return `Sonda ${donde}: ${textoVoltaje(l.v)} · ${textoCorriente(l.i)}`;
}

/** Texto largo para la región viva: solo cuando el visitante mueve la sonda. */
export function anuncioSonda(l: LecturaSondaCircuito): string {
  const donde = l.sobreCuerpo && l.elemento ? `dentro de ${l.elemento}` : l.elemento ? `en el cable de ${l.elemento}` : "en el cable";
  const i = esCorrienteNula(l.i)
    ? "no pasa corriente"
    : `corriente ${textoCorriente(Math.abs(l.i))} ${l.i > 0 ? "a favor" : "en contra"} de la flecha dibujada`;
  return `Sonda ${donde}: potencial ${textoVoltaje(l.v)} respecto al borne negativo de la batería, ${i}.`;
}

export function anuncioElemento(id: string, tipo: "R" | "C", valor: number, l: LecturaElemento | undefined): string {
  const nombre = tipo === "R" ? "Resistor" : "Capacitor";
  const base = `${nombre} ${id} de ${textoValorElemento(tipo, valor)}.`;
  if (!l) return base;
  return `${base} Voltaje ${textoVoltaje(l.v)}, corriente ${textoCorriente(l.i)}.`;
}
