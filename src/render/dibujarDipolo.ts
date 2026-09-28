/**
 * Dibujo del cuerpo rígido del dipolo (E5.1): la varilla que une +q y −q, el
 * anillo de selección y el asa cian del centro (punto de referencia para
 * TRASLADARLO -- cian, el único acento interactivo de la app; girar el dipolo
 * es siempre por botones, ver `ui/PanelDipolo.tsx`). Las dos cargas de los
 * extremos se dibujan con `dibujarCargas.ts` (mismo rojo/azul que las cargas
 * fuente de las otras estaciones): este módulo solo pinta lo demás.
 *
 * Orden de dibujo (lo decide `CanvasDipolo.tsx`): varilla (+ anillo si está
 * elegido) -> cargas -> asa. El asa va DESPUÉS de las cargas: con la separación
 * mínima los discos se solapan sobre el centro y la taparían.
 *
 * Tamaños con `unidadTexto` (no `unidadCss`): igual que texto y trazos de las
 * otras estaciones, se compensan en pantallas chicas y CRECEN con el lienzo en
 * un proyector, así que la varilla y el asa no se vuelven finitas ahí.
 */
import type { ExtremosDipolo } from "../fisica/dipolo";
import { radioVisualCarga, unidadTexto } from "./geometriaCargas";

export const COLOR_VARILLA = "rgba(203, 213, 225, 0.9)";
export const COLOR_ASA = "#22d3ee"; // --accent
const COLOR_CONTORNO = "rgba(5, 7, 13, 0.9)"; // mismo halo oscuro que los anillos de dibujarCargas.ts
/** Grosor de la varilla, px CSS: >= 6 también con el lienzo reducido o ampliado (ver `unidadTexto`). */
const GROSOR_VARILLA_CSS = 6;
const CONTORNO_VARILLA_CSS = 2;
/** Radio del asa, px CSS: un círculo de >= 14 px de diámetro, legible con el dedo encima. */
const RADIO_ASA_CSS = 7;
const CONTORNO_ASA_CSS = 2.5;
/** Holgura del anillo de selección alrededor de los discos de las cargas, px CSS. */
const HOLGURA_ANILLO_CSS = 6;

/** Varilla rígida entre +q y −q; si `seleccionado`, además el anillo cian que envuelve todo el cuerpo. */
export function dibujarVarillaDipolo(
  ctx: CanvasRenderingContext2D,
  ext: ExtremosDipolo,
  q: number,
  escalaCss = 1,
  seleccionado = false,
): void {
  const u = unidadTexto(escalaCss);
  ctx.save();
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  if (seleccionado) {
    // Cápsula (dos semicírculos + dos rectas) a distancia `r` del segmento +q — −q.
    const r = radioVisualCarga(q, escalaCss) + HOLGURA_ANILLO_CSS * u;
    const theta = Math.atan2(ext.masY - ext.menosY, ext.masX - ext.menosX);
    ctx.beginPath();
    ctx.arc(ext.masX, ext.masY, r, theta - Math.PI / 2, theta + Math.PI / 2);
    ctx.arc(ext.menosX, ext.menosY, r, theta + Math.PI / 2, theta + (3 * Math.PI) / 2);
    ctx.closePath();
    ctx.lineWidth = 5 * u;
    ctx.strokeStyle = COLOR_CONTORNO;
    ctx.stroke();
    ctx.lineWidth = 2.5 * u;
    ctx.strokeStyle = COLOR_ASA;
    ctx.stroke();
  }

  ctx.beginPath();
  ctx.moveTo(ext.masX, ext.masY);
  ctx.lineTo(ext.menosX, ext.menosY);
  ctx.lineWidth = (GROSOR_VARILLA_CSS + 2 * CONTORNO_VARILLA_CSS) * u;
  ctx.strokeStyle = COLOR_CONTORNO;
  ctx.stroke();
  ctx.lineWidth = GROSOR_VARILLA_CSS * u;
  ctx.strokeStyle = COLOR_VARILLA;
  ctx.stroke();
  ctx.restore();
}

/** Asa cian del centro de masa, con contorno oscuro; se dibuja encima de las cargas. */
export function dibujarAsaDipolo(ctx: CanvasRenderingContext2D, cx: number, cy: number, escalaCss = 1): void {
  const u = unidadTexto(escalaCss);
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, RADIO_ASA_CSS * u, 0, Math.PI * 2);
  ctx.lineWidth = 2 * CONTORNO_ASA_CSS * u;
  ctx.strokeStyle = COLOR_CONTORNO;
  ctx.stroke();
  ctx.fillStyle = COLOR_ASA;
  ctx.fill();
  ctx.restore();
}
