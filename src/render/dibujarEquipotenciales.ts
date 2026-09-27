/**
 * Dibujo de las curvas equipotenciales y sus rótulos (E2.3 §4.6). Solo pinta:
 * las curvas salen de `curvasEquipotenciales` y los rótulos de `colocarRotulos`
 * (fisica/equipotenciales.ts).
 *
 * Ámbar `#fbbf24` (contraste ≈ 11:1 sobre el fondo): V > 0 continua, V < 0
 * discontinua (el signo no depende del color: daltonismo) y V = 0 más gruesa.
 * El rojo/azul se reserva a la polaridad de las cargas y el cian al acento
 * interactivo; ninguno se usa aquí. Un `stroke` por nivel.
 */
import { PAD_ROTULO_X, PAD_ROTULO_Y, type CurvasNivel, type Rotulo } from "../fisica/equipotenciales";
import type { Contexto2D } from "./ctx2d";
import { unidadTexto } from "./geometriaCargas";

export const COLOR_EQUIPOTENCIAL = "#fbbf24";
const RGB_AMBAR = "251, 191, 36";
// Grosores en px CSS objetivo (revisor-ui, fase 2 §B7 y §B6): >= 1.8 la curva normal, >= 3 la de V = 0.
// `unidadTexto` no los adelgaza en un proyector (canvas ampliado), a diferencia de `unidadCss`.
const GROSOR_CSS = 1.8;
const GROSOR_CERO_CSS = 3;
const RAYA_CSS = 6;
const HUECO_CSS = 4;
const FONDO_ROTULO = "rgba(5, 7, 13, 0.85)";
/** Tamaño del texto de los rótulos (px CSS). La spec dice 11; se usa 12 como el resto de etiquetas. */
export const ROTULO_CSS = 12;
const FUENTE = 'ui-monospace, "Cascadia Code", "SFMono-Regular", Consolas, monospace';

/** Fuente de los rótulos en px lógicos (compensada por `escalaCss`). */
export function fuenteRotulo(escalaCss: number): string {
  return `600 ${ROTULO_CSS * unidadTexto(escalaCss)}px ${FUENTE}`;
}
/** Altura del texto (px lógicos) que se pasa a `colocarRotulos`. */
export function alturaRotulo(escalaCss: number): number {
  return ROTULO_CSS * unidadTexto(escalaCss);
}

export function dibujarEquipotenciales(ctx: Contexto2D, curvas: CurvasNivel, escalaCss = 1): void {
  const u = unidadTexto(escalaCss);
  ctx.save();
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  for (const nivel of curvas.niveles) {
    const cero = nivel.n === 0;
    ctx.strokeStyle = cero ? COLOR_EQUIPOTENCIAL : `rgba(${RGB_AMBAR}, 0.9)`;
    ctx.lineWidth = (cero ? GROSOR_CERO_CSS : GROSOR_CSS) * u;
    ctx.setLineDash(nivel.n < 0 ? [RAYA_CSS * u, HUECO_CSS * u] : []);
    ctx.beginPath();
    for (const cadena of nivel.cadenas) {
      const p = cadena.puntos;
      const n = p.length / 2;
      if (n < 2) continue;
      ctx.moveTo(p[0], p[1]);
      for (let i = 1; i < n; i++) ctx.lineTo(p[2 * i], p[2 * i + 1]);
      if (cadena.cerrada) ctx.closePath();
    }
    ctx.stroke();
  }
  ctx.restore();
}

/** Rótulos en volts sobre una "píldora" oscura que interrumpe la curva. */
export function dibujarRotulos(
  ctx: Contexto2D,
  rotulos: Rotulo[],
  anchoTexto: (texto: string) => number,
  escalaCss = 1,
): void {
  if (rotulos.length === 0) return;
  const alto = alturaRotulo(escalaCss) + 2 * PAD_ROTULO_Y;
  ctx.save();
  ctx.font = fuenteRotulo(escalaCss);
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  for (const r of rotulos) {
    const w = anchoTexto(r.texto) + 2 * PAD_ROTULO_X;
    ctx.fillStyle = FONDO_ROTULO;
    ctx.fillRect(r.x - w / 2, r.y - alto / 2, w, alto);
    ctx.fillStyle = COLOR_EQUIPOTENCIAL;
    ctx.fillText(r.texto, r.x, r.y + 0.5);
  }
  ctx.restore();
}
