/**
 * Escala física y unidades (especificación E0, decisión D6).
 *
 * Única fuente de verdad de la relación píxeles del canvas <-> metros y
 * unidades de carga <-> culombios. Todo lo demás se DERIVA de `ESCALA`:
 * cambiar sus tres números re-escala cuadrícula, leyenda y lecturas en SI sin
 * tocar ninguna fórmula. No se permiten literales `50` o `0.01` sueltos fuera
 * de este módulo.
 *
 * Son funciones puras (sin DOM ni estado): las importan el render, la UI y el
 * Worker. Los componentes de las lecturas usan convención matemática (y hacia
 * arriba); el canvas tiene y hacia abajo, así que `ey_lectura = -ey_canvas`.
 *
 * Las lecturas (`campoSI`, `potencialSI`, ...) usan la ley de Coulomb exacta
 * en SI, sin softening y sin pasar por `K_VISUAL`: el resultado no depende de
 * la constante de escala visual. `K_VISUAL` solo entra en `factoresSim`, para
 * convertir magnitudes de simulación (dibujo / energía del Worker) a SI.
 */
import type { PuntoCarga } from "./coulomb";

// ---- Constantes de escala (única fuente de verdad) ----

/** Configuración de escala. Los tres números de los que se deriva todo. */
export interface ConfigEscala {
  /** Píxeles lógicos del canvas por cuadro de cuadrícula. */
  pxPorCuadro: number;
  /** Metros que representa un cuadro (0.01 = 1 cm). */
  mPorCuadro: number;
  /** Culombios por unidad de carga (1e-6 = 1 µC). */
  cPorUnidad: number;
}

export const ESCALA: Readonly<ConfigEscala> = {
  pxPorCuadro: 50,
  mPorCuadro: 0.01,
  cPorUnidad: 1e-6,
};

/** k = 1/(4π ε0), N·m²/C² (CODATA 2018). */
export const K_COULOMB = 8.9875517923e9;

export const PX_POR_CUADRO = ESCALA.pxPorCuadro;
export const M_POR_CUADRO = ESCALA.mPorCuadro;
/** Metros por píxel lógico (2e-4 con la escala por defecto). */
export const M_POR_PX = M_POR_CUADRO / PX_POR_CUADRO;
export const C_POR_UNIDAD = ESCALA.cPorUnidad;

/** Radio dibujado de una carga. Única fuente: render y Worker importan de aquí. */
export const RADIO_CARGA_PX = 14;
/** Dentro de este radio una lectura no tiene sentido (interior de la carga dibujada). */
export const RADIO_MIN_LECTURA_PX = RADIO_CARGA_PX;
/** Softening (px²) para el dibujo estático (ε = 1 px). Aún sin usar: ver E0 §3.4. */
export const SOFTENING2_ESTATICO = 1;

// ---- Conversión geométrica y de carga ----

export function pxAMetros(px: number, esc: ConfigEscala = ESCALA): number {
  return px * (esc.mPorCuadro / esc.pxPorCuadro);
}

export function metrosAPx(m: number, esc: ConfigEscala = ESCALA): number {
  return m * (esc.pxPorCuadro / esc.mPorCuadro);
}

export function unidadesACoulomb(q: number, esc: ConfigEscala = ESCALA): number {
  return q * esc.cPorUnidad;
}

// ---- Lecturas físicas exactas (Coulomb sin softening) ----

/** Componentes en N/C (o N para fuerzas); `ey` hacia arriba. */
export interface CampoSI {
  ex: number;
  ey: number;
  modulo: number;
}

/** Evita devolver -0 (p. ej. tras cancelaciones por simetría). */
function sinCeroNegativo(v: number): number {
  return v + 0;
}

/** Campo eléctrico en (xPx, yPx). `null` si está a < RADIO_MIN_LECTURA_PX de alguna carga. */
export function campoSI(
  xPx: number,
  yPx: number,
  cargas: PuntoCarga[],
  esc: ConfigEscala = ESCALA,
): CampoSI | null {
  const s = esc.mPorCuadro / esc.pxPorCuadro;
  let exCanvas = 0;
  let eyCanvas = 0;
  for (const c of cargas) {
    const dxPx = xPx - c.x;
    const dyPx = yPx - c.y;
    if (Math.hypot(dxPx, dyPx) < RADIO_MIN_LECTURA_PX) return null;
    const dx = dxPx * s;
    const dy = dyPx * s;
    const r = Math.hypot(dx, dy);
    const factor = (K_COULOMB * c.q * esc.cPorUnidad) / (r * r * r);
    exCanvas += factor * dx;
    eyCanvas += factor * dy;
  }
  const ex = sinCeroNegativo(exCanvas);
  const ey = sinCeroNegativo(-eyCanvas);
  return { ex, ey, modulo: Math.hypot(ex, ey) };
}

/** Potencial en voltios (superposición). `null` en el mismo caso que `campoSI`. */
export function potencialSI(
  xPx: number,
  yPx: number,
  cargas: PuntoCarga[],
  esc: ConfigEscala = ESCALA,
): number | null {
  const s = esc.mPorCuadro / esc.pxPorCuadro;
  let v = 0;
  for (const c of cargas) {
    const rPx = Math.hypot(xPx - c.x, yPx - c.y);
    if (rPx < RADIO_MIN_LECTURA_PX) return null;
    v += (K_COULOMB * c.q * esc.cPorUnidad) / (rPx * s);
  }
  return sinCeroNegativo(v);
}

/** Fuerza sobre una carga de prueba `qPrueba` (unidades de carga): F = q0·E, en newtons. */
export function fuerzaSobrePruebaSI(
  qPrueba: number,
  campo: CampoSI,
  esc: ConfigEscala = ESCALA,
): CampoSI {
  const q0 = qPrueba * esc.cPorUnidad;
  const ex = sinCeroNegativo(q0 * campo.ex);
  const ey = sinCeroNegativo(q0 * campo.ey);
  return { ex, ey, modulo: Math.hypot(ex, ey) };
}

/** Fuerza de Coulomb entre dos cargas a distancia `rPx`, en N. >0 repulsiva, <0 atractiva. */
export function fuerzaParSI(
  qa: number,
  qb: number,
  rPx: number,
  esc: ConfigEscala = ESCALA,
): number {
  const r = rPx * (esc.mPorCuadro / esc.pxPorCuadro);
  return (K_COULOMB * qa * esc.cPorUnidad * qb * esc.cPorUnidad) / (r * r);
}

/** Energía potencial de un par, en J. >0 si tienen el mismo signo. */
export function energiaParSI(
  qa: number,
  qb: number,
  rPx: number,
  esc: ConfigEscala = ESCALA,
): number {
  const r = rPx * (esc.mPorCuadro / esc.pxPorCuadro);
  return (K_COULOMB * qa * esc.cPorUnidad * qb * esc.cPorUnidad) / r;
}

/** Energía potencial electrostática de todo el sistema (suma sobre pares), en J. */
export function energiaSistemaSI(cargas: PuntoCarga[], esc: ConfigEscala = ESCALA): number {
  let u = 0;
  for (let i = 0; i < cargas.length; i++) {
    for (let j = i + 1; j < cargas.length; j++) {
      const r = Math.hypot(cargas[i].x - cargas[j].x, cargas[i].y - cargas[j].y);
      u += energiaParSI(cargas[i].q, cargas[j].q, r, esc);
    }
  }
  return u;
}

/** Trabajo del campo sobre q0 al ir de A a B: W = q0 (V_A − V_B), en J. */
export function trabajoCampoSI(
  qPrueba: number,
  vA: number,
  vB: number,
  esc: ConfigEscala = ESCALA,
): number {
  return qPrueba * esc.cPorUnidad * (vA - vB);
}

// ---- Conversión de magnitudes de simulación a SI ----

export interface FactoresSim {
  /** N/C por unidad de E_sim. */
  campo: number;
  /** V por unidad de V_sim. */
  potencial: number;
  /** N por unidad de F_sim. */
  fuerza: number;
  /** J por unidad de U_sim. */
  energia: number;
}

/**
 * `kSim` = constante de la que salieron las magnitudes de simulación
 * (K_VISUAL para el dibujo; la del Worker para su energía). Cada factor es
 * proporcional a 1/kSim, de modo que el resultado en SI no depende de ella.
 */
export function factoresSim(kSim: number, esc: ConfigEscala = ESCALA): FactoresSim {
  const s = esc.mPorCuadro / esc.pxPorCuadro;
  const Qu = esc.cPorUnidad;
  const potencial = (K_COULOMB * Qu) / (s * kSim);
  const energia = (K_COULOMB * Qu * Qu) / (s * kSim);
  return { campo: potencial / s, potencial, fuerza: energia / s, energia };
}

/** Energía de simulación -> julios (misma conversión que el potencial, sin depender de la masa). */
export function energiaSimAJ(eSim: number, kSim: number, esc: ConfigEscala = ESCALA): number {
  return eSim * factoresSim(kSim, esc).energia;
}

// ---- Formato de números ----

const MENOS = "−"; // U+2212, mismo signo que formatCarga
const PREFIJOS: Record<number, string> = {
  [-4]: "p",
  [-3]: "n",
  [-2]: "µ", // µ (U+00B5, igual que unidades.ts)
  [-1]: "m",
  0: "",
  1: "k",
  2: "M",
  3: "G",
};
const SUPERINDICES: Record<string, string> = {
  "0": "⁰",
  "1": "¹",
  "2": "²",
  "3": "³",
  "4": "⁴",
  "5": "⁵",
  "6": "⁶",
  "7": "⁷",
  "8": "⁸",
  "9": "⁹",
  "-": "⁻",
};

function superindice(n: number): string {
  return String(n)
    .split("")
    .map((ch) => SUPERINDICES[ch] ?? ch)
    .join("");
}

/** Decimales para mostrar `mag` con `cifras` cifras significativas (mag ya redondeada). */
function decimalesPara(mag: number, cifras: number): number {
  if (mag === 0) return 0;
  return Math.max(0, cifras - 1 - Math.floor(Math.log10(mag)));
}

/**
 * Valor con prefijo SI y `cifras` cifras significativas ("89.9 N", "899 kV",
 * "3.60 mN"). Se conservan los ceros finales (indican precisión). La mantisa
 * queda en [1, 1000): al redondear a 1000 se sube de prefijo.
 */
export function formatSI(valor: number, unidad: string, cifras = 3): string {
  if (!Number.isFinite(valor)) return "—";
  if (valor === 0) return `0 ${unidad}`;
  const mag = Math.abs(valor);
  const signo = valor < 0 ? MENOS : "";

  // Fuera del rango de prefijos (p..G) no hay prefijo que dé mantisa en
  // [1, 1000): se usa notación científica en vez de "1000000 GV" o "0.05 pV".
  const grupoBruto = Math.floor(Math.floor(Math.log10(mag) + 1e-12) / 3);
  if (grupoBruto > 3 || grupoBruto < -4) return formatCientifica(valor, unidad, cifras);

  let grupo = grupoBruto;
  let mant = mag / Math.pow(1000, grupo);
  // Corrección por errores de coma flotante en el logaritmo.
  while (mant >= 1000 && grupo < 3) {
    grupo++;
    mant = mag / Math.pow(1000, grupo);
  }
  while (mant < 1 && grupo > -4) {
    grupo--;
    mant = mag / Math.pow(1000, grupo);
  }
  if (mant < 1 || mant >= 1000) return formatCientifica(valor, unidad, cifras);
  let redondeada = Number(mant.toPrecision(cifras));
  if (redondeada >= 1000) {
    // El redondeo llegó a 1000: es exactamente "1.00" del prefijo siguiente
    // (no se recalcula, para evitar 0.999 por ruido de coma flotante).
    if (grupo >= 3) return formatCientifica(valor, unidad, cifras);
    grupo++;
    redondeada = 1;
  }
  return `${signo}${redondeada.toFixed(decimalesPara(redondeada, cifras))} ${PREFIJOS[grupo]}${unidad}`;
}

/**
 * Notación científica ("8.99 × 10⁷ N/C"); decimal simple si 0.1 ≤ |x| < 1000.
 */
export function formatCientifica(valor: number, unidad: string, cifras = 3): string {
  if (!Number.isFinite(valor)) return "—";
  if (valor === 0) return `0 ${unidad}`;
  const mag = Math.abs(valor);
  const signo = valor < 0 ? MENOS : "";

  if (mag >= 0.1 && mag < 1000) {
    const redondeada = Number(mag.toPrecision(cifras));
    if (redondeada < 1000) {
      return `${signo}${redondeada.toFixed(decimalesPara(redondeada, cifras))} ${unidad}`;
    }
  }
  // toExponential redondea de una sola vez (sin doble redondeo) y ya sube el
  // exponente si la mantisa llega a 10 (9.996e7 -> "1.00e+8"); conserva ceros finales.
  const [mant, exp] = mag.toExponential(cifras - 1).split("e");
  return `${signo}${mant} × 10${superindice(Number(exp))} ${unidad}`;
}

/** Distancia legible: < 1 cm en mm, < 1 m en cm, resto en m. 3 cifras, sin ceros finales. */
export function formatDistancia(metros: number): string {
  const mag = Math.abs(metros);
  const signo = metros < 0 ? MENOS : "";
  let valor: number;
  let unidad: string;
  if (mag < 0.01) {
    valor = mag * 1000;
    unidad = "mm";
  } else if (mag < 1) {
    valor = mag * 100;
    unidad = "cm";
  } else {
    valor = mag;
    unidad = "m";
  }
  return `${signo}${Number(valor.toPrecision(3))} ${unidad}`;
}

/** Redondea a 1, 2 o 5 × 10ⁿ (el más cercano en escala logarítmica). */
export function pasoAgradable(valor: number): number {
  if (!(valor > 0) || !Number.isFinite(valor)) return 0;
  const exp = Math.floor(Math.log10(valor));
  const mant = valor / Math.pow(10, exp);
  let base: number;
  if (mant < Math.SQRT2) base = 1;
  else if (mant < Math.sqrt(10)) base = 2;
  else if (mant < 5 * Math.SQRT2) base = 5;
  else base = 10;
  return base * Math.pow(10, exp);
}

// ---- Leyenda ----

/** Cuadros de la barra: el mayor de {5, 2, 1} cuyo largo ≤ 40 % del ancho del canvas. */
export function cuadrosBarra(anchoCanvasPx: number, esc: ConfigEscala = ESCALA): 1 | 2 | 5 {
  for (const n of [5, 2] as const) {
    if (n * esc.pxPorCuadro <= 0.4 * anchoCanvasPx) return n;
  }
  return 1;
}

export interface GeometriaLeyenda {
  cuadros: number;
  largoPx: number;
  etiquetaLargo: string;
  etiquetaCuadro: string;
  fuentePx: number;
  margenPx: number;
  padPx: number;
  grosorPx: number;
  marcaPx: number;
}

/**
 * Geometría de la barra de escala en px del canvas. `escalaCss` es
 * (ancho CSS)/(ancho lógico): con `u = 1/escalaCss` se compensan texto y
 * grosores para que se vean iguales en pantalla; el largo de la barra NO se
 * compensa (escala junto con la escena y sigue siendo verdadero).
 */
export function geometriaLeyenda(
  anchoCanvasPx: number,
  escalaCss: number,
  esc: ConfigEscala = ESCALA,
): GeometriaLeyenda {
  const u = 1 / (escalaCss > 0 ? escalaCss : 1);
  const cuadros = cuadrosBarra(anchoCanvasPx, esc);
  return {
    cuadros,
    largoPx: cuadros * esc.pxPorCuadro,
    etiquetaLargo: formatDistancia(cuadros * esc.mPorCuadro),
    etiquetaCuadro: `1 cuadro = ${formatDistancia(esc.mPorCuadro)}`,
    fuentePx: Math.max(11, Math.min(26, 13 * u)),
    margenPx: 12 * u,
    padPx: 6 * u,
    grosorPx: 2 * u,
    marcaPx: 6 * u,
  };
}
