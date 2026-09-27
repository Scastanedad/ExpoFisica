/**
 * Geometría VISUAL y de agarre de las cargas, compensada por `escalaCss`
 * (ancho CSS del canvas / ancho lógico, ver hooks/useEscalaCss.ts). Con
 * `u = 1/escalaCss` un tamaño "de pantalla" se convierte a px lógicos.
 *
 * Importante: NO toca `RADIO_CARGA_PX` (el radio FÍSICO de 14 px que usan el
 * Worker y escala.ts). Aquí solo se decide cuánto se DIBUJA la carga y cuánta
 * zona de agarre tiene el puntero; las cargas son puntuales y el disco es solo
 * un símbolo. Desde E2.1 el radio visual crece con |q| (volumen ∝ carga); en un
 * móvil (escalaCss ≈ 0.5) el disco se compensa para poder agarrarlo con el dedo.
 *
 * Funciones puras (sin DOM): las usan el dibujo y el hook de interacción.
 */
import { RADIO_CARGA_PX } from "../fisica/escala";
import { Q_MAX } from "../fisica/carga";

/** Zona de agarre mínima en px lógicos (escala 1:1). No depende de q: un 0.5 µC sigue siendo fácil de tomar. */
export const RADIO_ARRASTRE = RADIO_CARGA_PX + 6;
/** Diámetro táctil mínimo recomendado (WCAG 2.5.5), en px CSS. */
export const OBJETIVO_TACTIL_CSS = 44;

/** Radio visual de la carga máxima (q = 5) y tope absoluto, px lógicos: coincide con el margen de arrastre. */
export const RADIO_VISUAL_MAX = 20;
/** Radio mínimo en px CSS de canvas reducido (diámetro ≥ 10 px CSS). */
const RADIO_VISUAL_MIN_CSS = 5;
/** Compensación máxima del radio al reducir el canvas. */
const COMPENSACION_MAX = 2;
const FUENTE_SIGNO_BASE = 16;
const FUENTE_SIGNO_CSS = 14;

/** Halo: alfa central a q = Q_MAX y anchura (px CSS) más allá del disco. */
export const ALFA_HALO_MAX = 0.6;
export const ANCHO_HALO_CSS = 10;

function inversa(escalaCss: number): number {
  return 1 / (escalaCss > 0 ? escalaCss : 1);
}

/** Radio base a escala 1:1: R = 20·(|q|/5)^{1/3} (esfera de densidad constante: volumen ∝ carga). */
export function radioBaseCarga(q: number): number {
  return RADIO_VISUAL_MAX * Math.cbrt(Math.abs(q) / Q_MAX);
}

/**
 * Radio con el que se dibuja la carga (px lógicos). Monótono no decreciente en
 * |q|, estrictamente creciente con escalaCss = 1, ≤ 20 siempre. Al reducir el
 * canvas se amplía (hasta ×2) y se garantiza ≥ 5 px CSS de radio; con canvas
 * muy reducido varios valores pueden empatar en 20 (por eso el tamaño no es el
 * único canal: hay etiqueta y halo). No se encoge al ampliar el canvas.
 */
export function radioVisualCarga(q: number, escalaCss: number): number {
  const u = inversa(escalaCss);
  const base = radioBaseCarga(q);
  return Math.min(
    RADIO_VISUAL_MAX,
    Math.max(base, RADIO_VISUAL_MIN_CSS * u, base * Math.min(u, COMPENSACION_MAX)),
  );
}

/** Tamaño de fuente del signo +/− (px lógicos): max(16, 14·u), sin pasar del disco. */
export function fuenteSignoCarga(q: number, escalaCss: number): number {
  const deseada = Math.max(FUENTE_SIGNO_BASE, FUENTE_SIGNO_CSS * inversa(escalaCss));
  return Math.min(deseada, radioVisualCarga(q, escalaCss) * 1.4);
}

/** Alfa central del halo: 0.6·|q|/5 (0.06 a 0.5 µC, 0.12 a 1 µC, 0.60 a 5 µC). Canal secundario de intensidad. */
export function alfaHalo(q: number): number {
  return (ALFA_HALO_MAX * Math.abs(q)) / Q_MAX;
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
 * Unidad de TEXTO Y GROSOR MÍNIMO LEGIBLE en px lógicos (etiquetas de carga,
 * rótulos de voltaje, trazos de equipotenciales/líneas de campo): un tamaño de
 * `T` px "de pantalla" en un canvas reducido (escalaCss < 1) se compensa como
 * `unidadCss` (T px CSS); en un canvas AMPLIADO (proyector, escalaCss > 1) NO
 * se encoge (a diferencia de `unidadCss`), sino que crece con la escena:
 * T·escalaCss px CSS. Así el texto de 12 px se ve a ≥ 12 px CSS en un móvil y
 * a ~21 px en un proyector 1920×1080 (`escalaCss` ≈ 1.79 con `--lienzo-max`
 * ampliado), y un trazo de 1.3 px lógicos pasa de 1.3 px CSS a ~2.3 px CSS.
 */
export function unidadTexto(escalaCss: number): number {
  return Math.max(1, inversa(escalaCss));
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
