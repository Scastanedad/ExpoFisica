/**
 * Geometría VISUAL y de agarre de las cargas, compensada por `escalaCss`
 * (ancho CSS del canvas / ancho lógico, ver hooks/useEscalaCss.ts). Con
 * `u = 1/escalaCss` un tamaño "de pantalla" se convierte a px lógicos.
 *
 * Importante: NO toca `RADIO_CARGA_PX` (el radio FÍSICO de 14 px que usan el
 * Worker y escala.ts). Aquí solo se decide cuánto se DIBUJA la carga y cuánta
 * zona de agarre tiene el puntero; en un móvil (escalaCss ≈ 0.5) el disco de
 * 14 px mediría 7 px CSS y sería casi imposible de agarrar con el dedo.
 *
 * Funciones puras (sin DOM): las usan el dibujo y el hook de interacción.
 */
import { RADIO_CARGA_PX } from "../fisica/escala";

/** Zona de agarre mínima en px lógicos (escala 1:1). */
export const RADIO_ARRASTRE = RADIO_CARGA_PX + 6;
/** Diámetro táctil mínimo recomendado (WCAG 2.5.5), en px CSS. */
export const OBJETIVO_TACTIL_CSS = 44;

/** Radio visual objetivo en pantalla (px CSS) cuando el canvas se reduce. */
const RADIO_VISUAL_CSS = 11;
/** Tope en px lógicos: más grande taparía el campo y se saldría del margen de arrastre. */
const RADIO_VISUAL_MAX = 20;
const FUENTE_SIGNO_BASE = 16;
const FUENTE_SIGNO_CSS = 14;

function inversa(escalaCss: number): number {
  return 1 / (escalaCss > 0 ? escalaCss : 1);
}

/** Radio con el que se dibuja la carga (px lógicos): max(14, 11·u), tope 20. */
export function radioVisualCarga(escalaCss: number): number {
  return Math.min(RADIO_VISUAL_MAX, Math.max(RADIO_CARGA_PX, RADIO_VISUAL_CSS * inversa(escalaCss)));
}

/** Tamaño de fuente del signo +/− (px lógicos): max(16, 14·u), sin pasar del disco. */
export function fuenteSignoCarga(escalaCss: number): number {
  const deseada = Math.max(FUENTE_SIGNO_BASE, FUENTE_SIGNO_CSS * inversa(escalaCss));
  return Math.min(deseada, radioVisualCarga(escalaCss) * 1.4);
}

/** Radio de la zona de agarre (px lógicos): max(20, 22/escalaCss) => ≥ 44 px CSS de diámetro. */
export function radioAgarre(escalaCss: number): number {
  return Math.max(RADIO_ARRASTRE, (OBJETIVO_TACTIL_CSS / 2) * inversa(escalaCss));
}

/** Compensación genérica de grosores: 1 px CSS en px lógicos. */
export function unidadCss(escalaCss: number): number {
  return inversa(escalaCss);
}

/**
 * Índice de la carga más cercana a (x, y) dentro de su zona de agarre, o -1.
 * Elige la más cercana (no la primera) para que dos cargas juntas sean separables.
 */
export function indiceCargaBajo(
  x: number,
  y: number,
  posiciones: ReadonlyArray<{ x: number; y: number } | undefined>,
  escalaCss: number,
): number {
  const limite = radioAgarre(escalaCss);
  let mejor = -1;
  let mejorDistancia = limite;
  for (let i = 0; i < posiciones.length; i++) {
    const p = posiciones[i];
    if (!p) continue;
    const d = Math.hypot(x - p.x, y - p.y);
    if (d < mejorDistancia) {
      mejorDistancia = d;
      mejor = i;
    }
  }
  return mejor;
}
