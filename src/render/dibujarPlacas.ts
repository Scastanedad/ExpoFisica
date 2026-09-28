/**
 * Dibujo del capacitor de placas paralelas (E5.0 §4.1): dos barras gruesas en
 * los bordes del lienzo (según la orientación) y `N_LINEAS_PLACAS` líneas de
 * campo rectas y paralelas, con flechas de la placa + a la −. Mismo lenguaje
 * visual que `dibujarLineasCampo.ts` (color y grosor de línea reutilizados): la
 * única diferencia es que aquí las líneas son rectas fijas (el campo no varía
 * en el espacio, así que no hace falta integrar nada).
 *
 * Cada placa está cargada, así que su polaridad SÍ es rojo (+) o azul (−): la
 * barra entera lleva ese color y una fila de signos blancos (+ + + / − − −)
 * repartida entre las líneas de campo, como en un capacitor de libro. Los
 * signos quedan DENTRO de la barra (blanco sobre el mismo rojo/azul de los
 * discos de carga de `dibujarCargas.ts`, contraste >= 4.5:1) y en los huecos
 * entre líneas, nunca pegados a una línea de campo.
 *
 * Tamaños con `unidadTexto` (no `unidadCss`): igual que los trazos de las
 * demás estaciones, se compensan en pantallas chicas y CRECEN con el lienzo en
 * un proyector (16 px CSS de grosor de placa como mínimo en cualquier tamaño).
 */
import type { OrientacionPlacas } from "../fisica/campoExterno";
import { COLOR_LINEA_CAMPO } from "./dibujarLineasCampo";
import { unidadTexto } from "./geometriaCargas";

/** Impar, para que una línea caiga en el eje central (spec E5.0 §4.1). */
export const N_LINEAS_PLACAS = 7;
const GROSOR_PLACA_CSS = 16;
// Mismos tonos que los discos de `dibujarCargas.ts`: el signo blanco llega a >= 4.5:1 (WCAG 1.4.3).
const ROJO = "#dc2626";
const AZUL = "#2563eb";
const COLOR_SIGNO = "#ffffff";
const FUENTE_SIGNO_CSS = 15;
const GROSOR_LINEA_CSS = 1.4;
const FLECHA_CSS = 7;
const FUENTE = 'ui-monospace, "Cascadia Code", "SFMono-Regular", Consolas, monospace';

function colorSigno(signo: "+" | "−"): string {
  return signo === "+" ? ROJO : AZUL;
}

function dibujarLineaConFlecha(
  ctx: CanvasRenderingContext2D,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  tam: number,
): void {
  ctx.beginPath();
  ctx.moveTo(x0, y0);
  ctx.lineTo(x1, y1);
  ctx.stroke();

  const dx = x1 - x0;
  const dy = y1 - y0;
  const l = Math.hypot(dx, dy) || 1;
  const ux = dx / l;
  const uy = dy / l;
  const mx = (x0 + x1) / 2;
  const my = (y0 + y1) / 2;
  const px = -uy;
  const py = ux;
  ctx.beginPath();
  ctx.moveTo(mx + ux * tam * 0.6, my + uy * tam * 0.6);
  ctx.lineTo(mx - ux * tam * 0.4 + px * tam * 0.35, my - uy * tam * 0.4 + py * tam * 0.35);
  ctx.lineTo(mx - ux * tam * 0.4 - px * tam * 0.35, my - uy * tam * 0.4 - py * tam * 0.35);
  ctx.closePath();
  ctx.fill();
}

export function dibujarPlacas(
  ctx: CanvasRenderingContext2D,
  ancho: number,
  alto: number,
  orientacion: OrientacionPlacas,
  polaridad: 1 | -1,
  escalaCss = 1,
): void {
  const ut = unidadTexto(escalaCss);
  const grosor = GROSOR_PLACA_CSS * ut;
  const vertical = orientacion === "vertical";
  // Placa "de arriba/izquierda" (A) y "de abajo/derecha" (B): con polaridad = 1, A es la +.
  const signoA: "+" | "−" = polaridad === 1 ? "+" : "−";
  const signoB: "+" | "−" = polaridad === 1 ? "−" : "+";

  ctx.save();
  // Barras de las placas, coloreadas por su polaridad real.
  ctx.fillStyle = colorSigno(signoA);
  if (vertical) ctx.fillRect(0, 0, ancho, grosor);
  else ctx.fillRect(0, 0, grosor, alto);
  ctx.fillStyle = colorSigno(signoB);
  if (vertical) ctx.fillRect(0, alto - grosor, ancho, grosor);
  else ctx.fillRect(ancho - grosor, 0, grosor, alto);

  // Líneas de campo: de la placa + a la −, coherente con `campoPlacas` (polaridad=1: de "arriba/izquierda" a "abajo/derecha").
  ctx.strokeStyle = COLOR_LINEA_CAMPO;
  ctx.fillStyle = COLOR_LINEA_CAMPO;
  ctx.lineWidth = GROSOR_LINEA_CSS * ut;
  const tam = FLECHA_CSS * ut;
  for (let i = 1; i <= N_LINEAS_PLACAS; i++) {
    const t = i / (N_LINEAS_PLACAS + 1);
    if (vertical) {
      const x = t * ancho;
      const yIni = polaridad === 1 ? grosor : alto - grosor;
      const yFin = polaridad === 1 ? alto - grosor : grosor;
      dibujarLineaConFlecha(ctx, x, yIni, x, yFin, tam);
    } else {
      const y = t * alto;
      const xIni = polaridad === 1 ? grosor : ancho - grosor;
      const xFin = polaridad === 1 ? ancho - grosor : grosor;
      dibujarLineaConFlecha(ctx, xIni, y, xFin, y, tam);
    }
  }

  // Signos dentro de cada barra, a mitad de camino entre dos líneas de campo consecutivas (o entre
  // la última línea y el borde): 8 signos por placa, ninguno alineado con una línea.
  ctx.fillStyle = COLOR_SIGNO;
  ctx.font = `700 ${FUENTE_SIGNO_CSS * ut}px ${FUENTE}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  for (let k = 0; k <= N_LINEAS_PLACAS; k++) {
    const t = (k + 0.5) / (N_LINEAS_PLACAS + 1);
    if (vertical) {
      ctx.fillText(signoA, t * ancho, grosor / 2 + 1);
      ctx.fillText(signoB, t * ancho, alto - grosor / 2 + 1);
    } else {
      ctx.fillText(signoA, grosor / 2, t * alto + 1);
      ctx.fillText(signoB, ancho - grosor / 2, t * alto + 1);
    }
  }
  ctx.restore();
}
