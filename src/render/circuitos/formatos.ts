/**
 * Dos formatos del lienzo de circuitos [px lógicos]: apaisado (sala, tablet, escritorio) y vertical
 * (ramas apiladas en pantallas estrechas). `elegirFormato` decide cuál da elementos más grandes EN
 * PANTALLA para el árbol actual y el espacio disponible (puro, con histéresis para que añadir un
 * elemento no haga saltar el lienzo de un formato a otro sin ganar claramente).
 */
import type { Bloque } from "../../fisica/circuitos";
import { distribuirCircuito } from "./distribucion";

export const FORMATOS_CIRCUITO = {
  ancho: { w: 960, h: 540 },
  alto: { w: 480, h: 640 },
} as const;

export type FormatoCircuito = keyof typeof FORMATOS_CIRCUITO;

/** Ancho máximo CSS del lienzo (`--lienzo-max` de `.circuito-lienzo`). */
export const LIENZO_MAX_CSS = 1100;
/** El otro formato debe dar elementos al menos un 20 % mayores para cambiar. */
export const HISTERESIS_FORMATO = 1.2;

/** Tamaño CSS (px por unidad de rejilla) que tendrían los elementos con cada formato. */
export function tamanoEnPantalla(
  arbol: Bloque,
  tipoHojas: "R" | "C",
  conRCarga: boolean,
  formato: FormatoCircuito,
  anchoZonaCss: number,
  altoDisponibleCss: number,
): number {
  const { w, h } = FORMATOS_CIRCUITO[formato];
  // Mismo cálculo que `.lienzo`: min(100%, alto disponible × proporción, --lienzo-max).
  const anchoCss = Math.min(anchoZonaCss, Math.max(altoDisponibleCss, 200) * (w / h), LIENZO_MAX_CSS);
  const g = distribuirCircuito(arbol, tipoHojas, { ancho: w, alto: h }, { rCarga: conRCarga });
  return (g.s * anchoCss) / w;
}

export function elegirFormato(
  arbol: Bloque,
  tipoHojas: "R" | "C",
  conRCarga: boolean,
  anchoZonaCss: number,
  altoDisponibleCss: number,
  actual: FormatoCircuito = "ancho",
): FormatoCircuito {
  const a = tamanoEnPantalla(arbol, tipoHojas, conRCarga, "ancho", anchoZonaCss, altoDisponibleCss);
  const v = tamanoEnPantalla(arbol, tipoHojas, conRCarga, "alto", anchoZonaCss, altoDisponibleCss);
  if (actual === "ancho") return v > a * HISTERESIS_FORMATO ? "alto" : "ancho";
  return a > v * HISTERESIS_FORMATO ? "ancho" : "alto";
}
