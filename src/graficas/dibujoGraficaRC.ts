/**
 * Dibujo de la gráfica V(t) / I(t) de E7 «Capacitores» (Canvas 2D, sin React ni DOM). Reutiliza los colores,
 * el mapeo lineal, el trazo con cortes y el área de `dibujoGrafica.ts`; los ejes son propios porque el eje
 * horizontal es TIEMPO REAL con unidades (µs, ms, s) y marcas en múltiplos de τ, que `dibujarEjesLineales`
 * (rótulos «N s» enteros) no sabe rotular.
 *
 * Dos gráficas apiladas con el mismo eje de tiempo: arriba el voltaje de los capacitores (0 a E), abajo la
 * corriente (simétrica respecto a 0: positiva al cargar, negativa = sentido invertido al descargar).
 */
import { formatearSI } from "../fisica/circuitos";
import {
  COLOR_CERO,
  COLOR_EJE,
  COLOR_K,
  COLOR_SECUNDARIO,
  COLOR_TEXTO,
  dibujarTrazo,
  limpiarLienzo,
  mapeoLineal,
  type ContextoGrafica,
} from "./dibujoGrafica";

export const ANCHO_GRAFICA_RC = 360;
export const ALTO_GRAFICA_RC = 250;
/** Marcas máximas del eje de tiempo (en múltiplos de τ). */
const MARCAS_MAX = 6;
/** Mínimo del eje horizontal: 6 τ (la carga llega al 99,75 %). */
export const TAUS_MINIMOS = 6;
const FUENTE = "12px ui-monospace, monospace";

export interface DatosGraficaRC {
  /** Tiempo real [s], voltaje [V] y corriente con signo [A]; solo las primeras `n` muestras. */
  t: ArrayLike<number>;
  v: ArrayLike<number>;
  i: ArrayLike<number>;
  n: number;
  /** Constante de tiempo real [s]. */
  tau: number;
  /** Voltaje de la batería [V] y corriente máxima de referencia E/R [A]. */
  E: number;
  iRef: number;
  /** Título de la gráfica de corriente: «Corriente I» o «Corriente I (sentido invertido)». */
  rotuloI: string;
}

/** Extremo del eje de tiempo [s]: al menos 6 τ; si el registro es más largo, lo abarca con un margen. */
export function dominioTiempo(tau: number, tUltimo: number): number {
  return Math.max(TAUS_MINIMOS * tau, tUltimo * 1.04);
}

/** Marcas del eje horizontal: múltiplos enteros de τ, a lo sumo `MARCAS_MAX`, sin pasar del extremo. */
export function marcasTau(xmax: number, tau: number): number[] {
  const total = Math.floor(xmax / tau + 1e-9);
  const paso = Math.max(1, Math.ceil(total / MARCAS_MAX));
  const marcas: number[] = [];
  for (let k = paso; k <= total; k += paso) marcas.push(k);
  return marcas;
}

/** Rango del eje de corriente: ±max(E/R, |I| máxima), nunca 0. */
export function rangoCorriente(i: ArrayLike<number>, n: number, iRef: number): number {
  let m = iRef;
  for (let k = 0; k < n; k++) m = Math.max(m, Math.abs(i[k]));
  return m > 0 ? m : 1;
}

const menos = (t: string): string => t.replace("-", "−");

/** Geometría de las dos gráficas (px lógicos). */
export function disposicionGraficaRC(ancho: number, alto: number) {
  const izq = 58;
  const der = 10;
  const titulo = 16;
  const pie = 20;
  const hueco = 8;
  const alturaPlot = (alto - pie - 2 * titulo - hueco) / 2;
  const v = { x0: izq, x1: ancho - der, y0: titulo + 4, y1: titulo + 4 + alturaPlot - 4 };
  const i = { x0: izq, x1: ancho - der, y0: v.y1 + hueco + titulo + 4, y1: v.y1 + hueco + titulo + alturaPlot };
  return { v, i, tituloV: titulo - 3, tituloI: v.y1 + hueco + titulo - 3, ejeX: i.y1 + 15 };
}

export function dibujarGraficaRC(ctx: ContextoGrafica, ancho: number, alto: number, d: DatosGraficaRC): void {
  limpiarLienzo(ctx, ancho, alto);
  const g = disposicionGraficaRC(ancho, alto);
  const tUltimo = d.n > 0 ? d.t[d.n - 1] : 0;
  const xmax = dominioTiempo(d.tau, tUltimo);
  let vMax = d.E;
  for (let k = 0; k < d.n; k++) vMax = Math.max(vMax, d.v[k]);
  const iMax = rangoCorriente(d.i, d.n, d.iRef);
  const mapX = mapeoLineal([0, xmax], [g.v.x0, g.v.x1]);
  const mapV = mapeoLineal([0, vMax], [g.v.y1, g.v.y0]);
  const mapI = mapeoLineal([-iMax, iMax], [g.i.y1, g.i.y0]);

  ctx.save();
  ctx.font = FUENTE;
  ctx.fillStyle = COLOR_TEXTO;
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  ctx.fillText("Voltaje de los capacitores", g.v.x0, g.tituloV);
  ctx.fillText(d.rotuloI, g.i.x0, g.tituloI);

  // Marcos y marcas de τ (líneas punteadas que atraviesan las dos gráficas).
  ctx.strokeStyle = COLOR_EJE;
  ctx.lineWidth = 1;
  ctx.strokeRect(g.v.x0, g.v.y0, g.v.x1 - g.v.x0, g.v.y1 - g.v.y0);
  ctx.strokeRect(g.i.x0, g.i.y0, g.i.x1 - g.i.x0, g.i.y1 - g.i.y0);
  ctx.setLineDash([2, 4]);
  const marcas = marcasTau(xmax, d.tau);
  for (const k of marcas) {
    const x = mapX(k * d.tau);
    ctx.beginPath();
    ctx.moveTo(x, g.v.y0);
    ctx.lineTo(x, g.v.y1);
    ctx.moveTo(x, g.i.y0);
    ctx.lineTo(x, g.i.y1);
    ctx.stroke();
  }
  // Línea de corriente cero.
  ctx.strokeStyle = COLOR_CERO;
  ctx.setLineDash([3, 3]);
  ctx.beginPath();
  ctx.moveTo(g.i.x0, mapI(0));
  ctx.lineTo(g.i.x1, mapI(0));
  ctx.stroke();
  ctx.setLineDash([]);

  // Rótulos de los ejes verticales (extremos).
  ctx.fillStyle = COLOR_TEXTO;
  ctx.textAlign = "right";
  ctx.textBaseline = "middle";
  ctx.fillText(formatearSI(vMax, "V"), g.v.x0 - 4, g.v.y0 + 6);
  ctx.fillText("0", g.v.x0 - 4, g.v.y1 - 6);
  ctx.fillText(formatearSI(iMax, "A"), g.i.x0 - 4, g.i.y0 + 6);
  ctx.fillText(menos(formatearSI(-iMax, "A")), g.i.x0 - 4, g.i.y1 - 6);
  ctx.fillText("0", g.i.x0 - 4, mapI(0));

  // Eje de tiempo: 0 y múltiplos de τ.
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  ctx.fillText("0", g.i.x0, g.ejeX);
  for (const k of marcas) ctx.fillText(`${k}τ`, mapX(k * d.tau), g.ejeX);
  ctx.restore();

  if (d.n === 0) return;
  const px = (m: (v: number) => number, serie: ArrayLike<number>) => {
    const out: { x: number; y: number }[] = [];
    for (let k = 0; k < d.n; k++) out.push({ x: mapX(d.t[k]), y: m(serie[k]) });
    return out;
  };
  const pv = px(mapV, d.v);
  const pi = px(mapI, d.i);
  dibujarTrazo(ctx, pv, COLOR_K, { grosor: 2 });
  dibujarTrazo(ctx, pi, COLOR_SECUNDARIO, { grosor: 2 });
  // Punto de «ahora».
  ctx.save();
  for (const [puntos, color] of [
    [pv, COLOR_K],
    [pi, COLOR_SECUNDARIO],
  ] as const) {
    const p = puntos[puntos.length - 1];
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(p.x, p.y, 3.2, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

/** Texto bajo la gráfica: qué significa el eje horizontal, en tiempo real. */
export function pieGraficaRC(tau: number, tUltimo: number): string {
  const xmax = dominioTiempo(tau, tUltimo);
  return `Eje horizontal: tiempo real, de 0 a ${formatearSI(xmax, "s")}. Cada marca es 1 τ = ${formatearSI(tau, "s")}.`;
}
