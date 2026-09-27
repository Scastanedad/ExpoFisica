/**
 * Leyenda de escala (dos líneas: "5 cm" / "1 cuadro = 1 cm", y una barra de N
 * cuadros con marcas; con el canvas muy reducido, escalaCss < 0.6, una sola
 * línea "1 cuadro = 1 cm" + la barra) cerca de la esquina inferior izquierda del canvas. Todo
 * en px lógicos del canvas; texto y grosores se compensan con 1/escalaCss (ver
 * geometriaLeyenda). El largo de la barra no se compensa: escala junto con la
 * escena y sigue midiendo lo que dice. Es solo dibujo en el bitmap: no captura
 * eventos.
 *
 * - Texto de al menos 16 px a escala 1:1 (y 16 px CSS al reducir el canvas,
 *   con tope de 32 px lógicos).
 * - El origen de la barra cae sobre una línea de la cuadrícula (en x y en y),
 *   así las marcas coinciden con los cuadros.
 * - Si una carga cae dentro de la caja, la leyenda baja su opacidad (~0.35)
 *   para no tapar la carga ni el campo.
 *
 * `crearDibujanteLeyenda` cachea la geometría y las medidas de texto y solo
 * las recalcula si cambian el ancho o `escalaCss`, para no llamar a
 * measureText en cada frame.
 */
import type { PuntoCarga } from "../fisica/coulomb";
import { geometriaLeyenda, PX_POR_CUADRO, type GeometriaLeyenda } from "../fisica/escala";
import { RADIO_VISUAL_MAX } from "./geometriaCargas";

const FUENTE = 'ui-monospace, "Cascadia Code", "SFMono-Regular", Consolas, monospace';
const COLOR_TEXTO = "#e5e7eb"; // --text
const COLOR_TEXTO_TENUE = "#8b93a7"; // --text-dim
const COLOR_FONDO = "rgba(5, 7, 13, 0.75)";
const RADIO_ESQUINA = 3;
const LINEA = 1.2; // interlineado
const FUENTE_MIN_PX = 16;
const FUENTE_MAX_PX = 32;
const ALFA_CON_CARGA_DENTRO = 0.35;
/** Por debajo de esta escala (canvas muy reducido) la leyenda se compacta a una línea. */
const ESCALA_COMPACTA = 0.6;

interface Preparada {
  geo: GeometriaLeyenda;
  fuenteNegrita: string;
  fuente: string;
  fuentePx: number;
  /** Una sola línea ("1 cuadro = 1 cm") + barra, sin la etiqueta "5 cm". */
  compacta: boolean;
  cajaX: number;
  cajaY: number;
  cajaAncho: number;
  cajaAlto: number;
  /** Origen (x) y altura (y) de la barra, alineados a la cuadrícula. */
  barraX: number;
  barraY: number;
}

function preparar(
  ctx: CanvasRenderingContext2D,
  ancho: number,
  alto: number,
  escalaCss: number,
): Preparada {
  const geo = geometriaLeyenda(ancho, escalaCss);
  const u = geo.grosorPx / 2;
  const fuentePx = Math.min(FUENTE_MAX_PX, Math.max(FUENTE_MIN_PX, FUENTE_MIN_PX * u));
  const fuenteNegrita = `600 ${fuentePx}px ${FUENTE}`;
  const fuente = `${fuentePx}px ${FUENTE}`;

  ctx.save();
  ctx.font = fuenteNegrita;
  const compacta = escalaCss < ESCALA_COMPACTA;
  const anchoLargo = compacta ? 0 : ctx.measureText(geo.etiquetaLargo).width;
  ctx.font = fuente;
  const anchoCuadro = ctx.measureText(geo.etiquetaCuadro).width;
  ctx.restore();

  const { padPx, margenPx, marcaPx } = geo;
  const cajaAncho = Math.max(geo.largoPx, anchoLargo, anchoCuadro) + 2 * padPx;
  const lineas = compacta ? 1 : 2;
  const cajaAlto = padPx + lineas * fuentePx * LINEA + 2 * u + marcaPx + padPx;

  // Origen de la barra sobre una línea de la cuadrícula, lo más cerca posible de la esquina.
  const barraX = Math.ceil((margenPx + padPx) / PX_POR_CUADRO) * PX_POR_CUADRO;
  const barraYMax = alto - margenPx - padPx - marcaPx / 2;
  let barraY = Math.floor(barraYMax / PX_POR_CUADRO) * PX_POR_CUADRO;
  let cajaY = barraY + marcaPx / 2 + padPx - cajaAlto;
  if (cajaY < margenPx) {
    // Canvas muy bajo: sin alinear en y antes que salirse del recuadro.
    barraY = barraYMax;
    cajaY = alto - margenPx - cajaAlto;
  }
  return {
    geo,
    fuenteNegrita,
    fuente,
    fuentePx,
    compacta,
    cajaX: barraX - padPx,
    cajaY,
    cajaAncho,
    cajaAlto,
    barraX,
    barraY,
  };
}

function rectRedondeado(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

export type DibujanteLeyenda = (
  ctx: CanvasRenderingContext2D,
  ancho: number,
  alto: number,
  escalaCss: number,
  puntos: PuntoCarga[],
) => void;

/** ¿Alguna carga (con su radio visual) toca la caja de la leyenda? */
function hayCargaDentro(prep: Preparada, puntos: PuntoCarga[], escalaCss: number): boolean {
  // Peor caso: el disco de la carga máxima (E2.1: el radio visual depende de q).
  const radio = RADIO_VISUAL_MAX + 4 * (1 / (escalaCss > 0 ? escalaCss : 1));
  const { cajaX, cajaY, cajaAncho, cajaAlto } = prep;
  for (const p of puntos) {
    const dx = Math.max(cajaX - p.x, 0, p.x - (cajaX + cajaAncho));
    const dy = Math.max(cajaY - p.y, 0, p.y - (cajaY + cajaAlto));
    if (Math.hypot(dx, dy) < radio) return true;
  }
  return false;
}

export function crearDibujanteLeyenda(): DibujanteLeyenda {
  let clave = "";
  let prep: Preparada | null = null;

  return (ctx, ancho, alto, escalaCss, puntos) => {
    const claveActual = `${ancho}x${alto}@${escalaCss.toFixed(3)}`;
    if (!prep || claveActual !== clave) {
      prep = preparar(ctx, ancho, alto, escalaCss);
      clave = claveActual;
    }
    const { geo, cajaX, cajaY, cajaAncho, cajaAlto, barraX, barraY } = prep;

    ctx.save();
    if (hayCargaDentro(prep, puntos, escalaCss)) ctx.globalAlpha = ALFA_CON_CARGA_DENTRO;
    // Fondo semitransparente para que se lea sobre las curvas y líneas de campo.
    rectRedondeado(ctx, cajaX, cajaY, cajaAncho, cajaAlto, RADIO_ESQUINA);
    ctx.fillStyle = COLOR_FONDO;
    ctx.fill();

    // Rótulo: longitud de la barra y equivalencia de un cuadro (solo esta última si es compacta).
    const textoX = cajaX + geo.padPx;
    const textoY = cajaY + geo.padPx;
    ctx.textAlign = "left";
    ctx.textBaseline = "top";
    if (prep.compacta) {
      ctx.font = prep.fuente;
      ctx.fillStyle = COLOR_TEXTO;
      ctx.fillText(geo.etiquetaCuadro, textoX, textoY);
    } else {
      ctx.font = prep.fuenteNegrita;
      ctx.fillStyle = COLOR_TEXTO;
      ctx.fillText(geo.etiquetaLargo, textoX, textoY);
      ctx.font = prep.fuente;
      ctx.fillStyle = COLOR_TEXTO_TENUE;
      ctx.fillText(geo.etiquetaCuadro, textoX, textoY + prep.fuentePx * LINEA);
    }

    // Barra tipo regla: trazo horizontal + una marca por cuadro.
    ctx.strokeStyle = COLOR_TEXTO;
    ctx.lineWidth = geo.grosorPx;
    ctx.lineCap = "butt";
    ctx.beginPath();
    ctx.moveTo(barraX, barraY);
    ctx.lineTo(barraX + geo.largoPx, barraY);
    for (let i = 0; i <= geo.cuadros; i++) {
      const x = barraX + i * PX_POR_CUADRO;
      ctx.moveTo(x, barraY - geo.marcaPx / 2);
      ctx.lineTo(x, barraY + geo.marcaPx / 2);
    }
    ctx.stroke();
    ctx.restore();
  };
}
