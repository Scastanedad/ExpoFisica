/**
 * Cuadrícula propia del canvas: un cuadro cada PX_POR_CUADRO px lógicos
 * (1 cm con la escala por defecto), línea mayor cada 5 cuadros. Va dentro del
 * canvas y en px del canvas a propósito: la cuadrícula del `body` (CSS) no
 * puede servir de escala (ver E0 §1). Se agrupa en dos trazos (menores y
 * mayores) por frame, así que no necesita pre-renderizarse en un offscreen.
 */
import { PX_POR_CUADRO } from "../fisica/escala";

const CUADROS_POR_LINEA_MAYOR = 5;
const COLOR_MENOR = "rgba(120, 170, 255, 0.12)";
const COLOR_MAYOR = "rgba(120, 170, 255, 0.22)";

/**
 * `escalaCss` = (ancho CSS)/(ancho lógico). El grosor se compensa (1/escalaCss,
 * acotado a 1-2 px lógicos) para que las líneas no se vuelvan invisibles cuando
 * el canvas se reduce en pantallas estrechas.
 */
export function dibujarCuadricula(
  ctx: CanvasRenderingContext2D,
  ancho: number,
  alto: number,
  escalaCss = 1,
) {
  const u = 1 / (escalaCss > 0 ? escalaCss : 1);
  const grosor = u >= 1.5 ? 2 : 1;
  const desfase = grosor === 1 ? 0.5 : 0; // trazo nítido sobre el píxel

  const nx = Math.floor(ancho / PX_POR_CUADRO);
  const ny = Math.floor(alto / PX_POR_CUADRO);

  ctx.save();
  ctx.lineWidth = grosor;
  for (const mayor of [false, true]) {
    ctx.beginPath();
    for (let k = 0; k <= nx; k++) {
      if ((k % CUADROS_POR_LINEA_MAYOR === 0) !== mayor) continue;
      const x = k * PX_POR_CUADRO + desfase;
      ctx.moveTo(x, 0);
      ctx.lineTo(x, alto);
    }
    for (let k = 0; k <= ny; k++) {
      if ((k % CUADROS_POR_LINEA_MAYOR === 0) !== mayor) continue;
      const y = k * PX_POR_CUADRO + desfase;
      ctx.moveTo(0, y);
      ctx.lineTo(ancho, y);
    }
    ctx.strokeStyle = mayor ? COLOR_MAYOR : COLOR_MENOR;
    ctx.stroke();
  }
  ctx.restore();
}
