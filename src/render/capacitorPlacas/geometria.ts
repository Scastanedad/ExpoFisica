/**
 * Geometría y escalas VISUALES de la estación 08 (capacitor de placas). Puro (sin DOM): se prueba en Node.
 *
 * Vista lateral en corte (contrato §9): placas horizontales, la lámina de dieléctrico entra por la derecha.
 * Coordenadas lógicas del lienzo (el bitmap real lo escala `useEscalaCss`). Nada de esto es física: la física
 * está en `fisica/capacitorPlacas/`. Aquí solo hay mapeos a píxeles, deliberadamente NO a escala:
 *  - d abarca 100× (0,1 a 10 mm) y se dibuja con escala logarítmica entre G_MIN y G_MAX px;
 *  - Q y E abarcan varios órdenes y se dibujan con un número de marcas logarítmico y saturante.
 */
import { A_MAX, A_MIN, D_MAX, D_MIN } from "../../fisica/capacitorPlacas/constantes";
import type { Parametros } from "../../fisica/capacitorPlacas/tipos";

export const ANCHO_PLACAS = 560;
export const ALTO_PLACAS = 340;
/** Línea central del hueco. */
export const YC = 170;
/** Borde izquierdo de las placas. */
export const X0 = 130;
export const GROSOR_PLACA = 10;
/** Largo de placa en px para A mínima y máxima. */
export const L_MIN = 110;
export const L_MAX = 200;
/** Hueco en px para d mínima y máxima. */
export const G_MIN = 14;
export const G_MAX = 100;
/**
 * Separación entre la lámina y las placas cuando f = 0. Es 0 a propósito: así la parte de la lámina que se ve
 * entre las placas mide exactamente f·L (una separación haría que el dibujo fuera por detrás de la física).
 */
export const APARCADA = 0;
/** Posición de la batería y de sus cables. */
export const X_BATERIA = 58;
export const X_CABLE = 118;
export const Y_TERMINAL_SUP = 70;
export const Y_TERMINAL_INF = 270;

export type Zona = "placa-sup" | "placa-inf" | "lamina" | "interruptor";

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Geometria {
  /** Largo de placa [px]. */
  L: number;
  /** Hueco [px]. */
  g: number;
  x0: number;
  xDer: number;
  /** y de la cara interior (hacia el hueco) de cada placa. */
  yHuecoSup: number;
  yHuecoInf: number;
  placaSup: Rect;
  placaInf: Rect;
  /** Lámina completa (aparcada o dentro): ocupa el hueco en espesor. */
  lamina: Rect;
  /** Parte de la lámina que está entre las placas. */
  laminaDentro: Rect | null;
  interruptor: Rect;
  /** Centro vertical de cada placa (donde se unen los cables). */
  yPlacaSup: number;
  yPlacaInf: number;
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const acotar = (x: number, min: number, max: number) => Math.min(max, Math.max(min, x));

/** Largo de placa [px] según el área: ∝ √A (lado del cuadrado). */
export function largoPlacaPx(A: number): number {
  const t = (Math.sqrt(A) - Math.sqrt(A_MIN)) / (Math.sqrt(A_MAX) - Math.sqrt(A_MIN));
  return lerp(L_MIN, L_MAX, acotar(t, 0, 1));
}

/** Hueco [px] según d: logarítmico. */
export function huecoPx(d: number): number {
  const t = Math.log(acotar(d, D_MIN, D_MAX) / D_MIN) / Math.log(D_MAX / D_MIN);
  return lerp(G_MIN, G_MAX, t);
}

/** Inverso de `huecoPx`: d [m] a partir de un hueco en px (acotado al rango). */
export function dDesdeHuecoPx(g: number): number {
  const t = acotar((g - G_MIN) / (G_MAX - G_MIN), 0, 1);
  return D_MIN * (D_MAX / D_MIN) ** t;
}

/** Fracción insertada f a partir del borde izquierdo de la lámina en px (acotada a 0..1). */
export function fDesdeBordeLamina(left: number, L: number): number {
  const xDer = X0 + L;
  return acotar((xDer + APARCADA - left) / (L + APARCADA), 0, 1);
}

/** Borde izquierdo de la lámina para una fracción f. */
export function bordeLamina(f: number, L: number): number {
  return X0 + L + APARCADA - f * (L + APARCADA);
}

export function calcularGeometria(p: Pick<Parametros, "A" | "d" | "f">): Geometria {
  const L = largoPlacaPx(p.A);
  const g = huecoPx(p.d);
  const xDer = X0 + L;
  const yHuecoSup = YC - g / 2;
  const yHuecoInf = YC + g / 2;
  const left = bordeLamina(p.f, L);
  const dentroIzq = Math.max(left, X0);
  const dentroDer = Math.min(left + L, xDer);
  return {
    L,
    g,
    x0: X0,
    xDer,
    yHuecoSup,
    yHuecoInf,
    placaSup: { x: X0, y: yHuecoSup - GROSOR_PLACA, w: L, h: GROSOR_PLACA },
    placaInf: { x: X0, y: yHuecoInf, w: L, h: GROSOR_PLACA },
    lamina: { x: left, y: yHuecoSup, w: L, h: g },
    laminaDentro: dentroDer > dentroIzq ? { x: dentroIzq, y: yHuecoSup, w: dentroDer - dentroIzq, h: g } : null,
    interruptor: { x: X_BATERIA - 6, y: Y_TERMINAL_SUP - 34, w: X_CABLE - X_BATERIA + 12, h: 68 },
    yPlacaSup: yHuecoSup - GROSOR_PLACA / 2,
    yPlacaInf: yHuecoInf + GROSOR_PLACA / 2,
  };
}

const dentro = (r: Rect, x: number, y: number, m: number) =>
  x >= r.x - m && x <= r.x + r.w + m && y >= r.y - m && y <= r.y + r.h + m;

/** Qué hay bajo un punto lógico. `margen` ya viene en px lógicos (objetivo táctil). */
export function zonaEn(g: Geometria, x: number, y: number, margen: number): Zona | null {
  if (dentro(g.interruptor, x, y, 0)) return "interruptor";
  if (dentro({ ...g.lamina, y: g.yHuecoSup + 1, h: Math.max(0, g.g - 2) }, x, y, 0)) return "lamina";
  if (dentro(g.placaSup, x, y, margen)) return "placa-sup";
  if (dentro(g.placaInf, x, y, margen)) return "placa-inf";
  return null;
}

/** Número de marcas ⊕/⊖ por placa: 0 con Q = 0; crece con log10(Q) y satura (1 nC → 5, 1 mC → 22). */
export function numeroCargas(Q: number): number {
  if (!(Q > 0)) return 0;
  const s = acotar((Math.log10(Q) + 10) / 7, 0, 1);
  return Math.round(2 + 20 * s);
}

/** Número de líneas de campo: crece con log10(E) y satura (1 kV/m → 4, 60 MV/m → 18). */
export function numeroLineas(E: number): number {
  if (!(E > 0)) return 0;
  const s = acotar((Math.log10(E) - 3) / 4.8, 0, 1);
  return Math.round(4 + 14 * s);
}

/**
 * Posiciones x [0, L] de las `n` marcas de carga libre sobre una placa. La densidad es ∝ σ de cada zona: la
 * zona del dieléctrico (a la derecha, ancho f·L) lleva κ_eff veces más marcas por px que la de aire.
 */
export function posicionesCargas(n: number, f: number, L: number, sigmaDiel: number, sigmaAire: number): number[] {
  if (n <= 0) return [];
  const wA = (1 - f) * sigmaAire;
  const wD = f * sigmaDiel;
  const total = wA + wD;
  const margen = 8;
  const salida: number[] = [];
  for (let i = 0; i < n; i++) {
    const u = ((i + 0.5) / n) * total;
    let x: number;
    if (u <= wA) x = sigmaAire > 0 ? u / sigmaAire : 0;
    else x = (1 - f) + (u - wA) / sigmaDiel;
    salida.push(acotar(x * L, margen, L - margen));
  }
  return salida;
}

/** Ángulo inicial «desordenado» de un dipolo (determinista: sin azar en el dibujo). */
export function anguloAleatorio(i: number): number {
  const h = Math.imul(i + 1, 2654435761) >>> 0;
  return ((h % 1000) / 1000) * 2 * Math.PI - Math.PI;
}
