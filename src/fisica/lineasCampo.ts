/**
 * Líneas de campo eléctrico (especificación E2.3 §5): integración RK2 de punto
 * medio sobre la dirección normalizada del campo (longitud de arco), criterios
 * de parada y sembrado por sectores, con el número de líneas de cada carga
 * dado por `repartirLineas` (E2.1: 10 líneas/µC, tope 200, mínimo 4).
 *
 * Funciones puras, sin DOM: el render solo dibuja lo que devuelven. Todo el
 * dibujo usa `SOFTENING2_ESTATICO` (ε = 1 px) para que las líneas sean
 * coherentes con las equipotenciales y con las lecturas en SI.
 *
 * Simplificación honesta: es un corte plano de un campo 3D de cargas puntuales.
 * Con siembra uniforme en ángulo la densidad de líneas en el plano cae como
 * 1/r, así que NO mide |E| (sí la separación entre equipotenciales).
 */
import { K_VISUAL, type PuntoCarga } from "./coulomb";
import { PRESUPUESTO_LINEAS, repartirLineas } from "./carga";
import { RADIO_CARGA_PX, SOFTENING2_ESTATICO } from "./escala";

/** Longitud de arco de cada paso de integración (px). */
export const PASO_LINEA = 6;
/** Distancia del punto de siembra al centro de la carga (px). */
export const R_SEED = 16;
/** Una línea se absorbe a menos de esta distancia de cualquier carga (px). */
export const R_ABS = RADIO_CARGA_PX + 2;
/** Longitud máxima de una línea (px): ≈ 2× la diagonal del canvas. */
export const LONGITUD_MAX = 1600;
/** |E| (unidades de simulación) por debajo del cual la dirección deja de ser fiable. */
export const E_MIN = 1e-4;
/** Cargas con |q| menor que esto se ignoran (no siembran líneas). */
const Q_IGNORADA = 1e-9;

/** Escribe [Ex, Ey] (unidades de simulación) en `out`. */
export type CampoFn = (x: number, y: number, out: Float64Array) => void;

/**
 * Campo por superposición sobre arrays tipados (sin asignar `[Ex, Ey]` por
 * llamada). Hace exactamente las mismas operaciones, en el mismo orden, que
 * `campoEn`, así que da el mismo resultado bit a bit.
 */
export function crearCampo(cargas: PuntoCarga[], soft2: number = SOFTENING2_ESTATICO): CampoFn {
  const n = cargas.length;
  const xs = new Float64Array(n);
  const ys = new Float64Array(n);
  const kq = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    xs[i] = cargas[i].x;
    ys[i] = cargas[i].y;
    kq[i] = K_VISUAL * cargas[i].q;
  }
  return (x, y, out) => {
    let ex = 0;
    let ey = 0;
    for (let i = 0; i < n; i++) {
      const dx = x - xs[i];
      const dy = y - ys[i];
      const r2 = dx * dx + dy * dy + soft2;
      const r = Math.sqrt(r2);
      const factor = kq[i] / (r2 * r);
      ex += factor * dx;
      ey += factor * dy;
    }
    out[0] = ex;
    out[1] = ey;
  };
}

export type Metodo = "euler" | "rk2";

const scratchMedio = new Float64Array(2);
const scratchPaso = new Float64Array(2);

/**
 * Un paso de longitud de arco `h` desde (x, y) con el campo (ex, ey) ya
 * evaluado allí (|E| = m > 0). RK2 de punto medio: k1 = u(x); k2 = u(x + h/2·k1);
 * x' = x + h·k2, con u = dir·E/|E|.
 */
function pasoDesde(
  campo: CampoFn,
  x: number,
  y: number,
  ex: number,
  ey: number,
  m: number,
  h: number,
  dir: 1 | -1,
  metodo: Metodo,
  out: Float64Array,
): void {
  const k1x = (dir * ex) / m;
  const k1y = (dir * ey) / m;
  if (metodo === "euler") {
    out[0] = x + h * k1x;
    out[1] = y + h * k1y;
    return;
  }
  campo(x + 0.5 * h * k1x, y + 0.5 * h * k1y, scratchMedio);
  const mm = Math.sqrt(scratchMedio[0] * scratchMedio[0] + scratchMedio[1] * scratchMedio[1]);
  // Si el campo del punto medio se anula (raro), se cae a k1 en vez de dividir por 0.
  const k2x = mm > 0 ? (dir * scratchMedio[0]) / mm : k1x;
  const k2y = mm > 0 ? (dir * scratchMedio[1]) / mm : k1y;
  out[0] = x + h * k2x;
  out[1] = y + h * k2y;
}

/**
 * Un paso de longitud de arco `h` sobre `dir·E/|E|`. Escribe el punto nuevo en
 * `out`; si |E| = 0 (o no es finito) el punto no se mueve.
 */
export function avanzar(
  campo: CampoFn,
  x: number,
  y: number,
  h: number,
  dir: 1 | -1,
  metodo: Metodo,
  out: Float64Array,
): void {
  campo(x, y, scratchPaso);
  const ex = scratchPaso[0];
  const ey = scratchPaso[1];
  const m = Math.sqrt(ex * ex + ey * ey);
  if (!(m > 0) || !Number.isFinite(m)) {
    out[0] = x;
    out[1] = y;
    return;
  }
  pasoDesde(campo, x, y, ex, ey, m, h, dir, metodo, out);
}

/** `n` pasos fijos sin criterios de parada (tests de convergencia). */
export function integrarPasos(
  campo: CampoFn,
  x0: number,
  y0: number,
  h: number,
  n: number,
  dir: 1 | -1,
  metodo: Metodo,
): [number, number] {
  const out = new Float64Array(2);
  let x = x0;
  let y = y0;
  for (let i = 0; i < n; i++) {
    avanzar(campo, x, y, h, dir, metodo, out);
    x = out[0];
    y = out[1];
  }
  return [x, y];
}

export interface LineaCampo {
  /** Índice (en el arreglo de cargas recibido) de la carga en cuyo sector se sembró. */
  origen: number;
  /** +1: sembrada hacia delante (+E) desde una positiva; −1: hacia atrás (−E) desde una negativa. */
  sentido: 1 | -1;
  /** [x0, y0, x1, y1, …] SIEMPRE en el sentido de +E (incluye el punto de siembra). */
  puntos: Float32Array;
  fin: "carga" | "borde" | "nulo" | "max";
  /** Índice de la carga donde terminó la línea (solo si `fin === "carga"`), o -1. */
  destino: number;
}

export interface OpcionesTrazado {
  soft2?: number;
  /** Longitud de arco por paso (px). */
  paso?: number;
  /** Presupuesto total de líneas para `repartirLineas`. */
  presupuesto?: number;
  /** Longitud máxima de una línea (px). */
  longitudMax?: number;
  /**
   * |E| mínimo (unidades de simulación) para seguir una línea; por defecto E_MIN.
   * Solo se baja en tests de dominio ilimitado (T-c-dip): a miles de px de un
   * dipolo |E| < E_MIN aunque la línea aún no haya cerrado su bucle.
   */
  eMin?: number;
}

interface ResultadoTrazo {
  /** Número de puntos escritos en el buffer (2 valores cada uno). */
  n: number;
  fin: LineaCampo["fin"];
  /** Índice (en la lista filtrada) de la carga que absorbió la línea, o -1. */
  destino: number;
}

/**
 * Traza una línea desde (x0, y0) en el sentido `dir` escribiendo los puntos en
 * `buf`. Se detiene por lo primero que ocurra: 'carga' (< R_ABS de cualquier
 * carga), 'borde' (sale del canvas; se conserva el punto de fuera), 'nulo'
 * (|E| < E_MIN) o 'max' (longitud máxima).
 */
function trazarUna(
  campo: CampoFn,
  cx: Float64Array,
  cy: Float64Array,
  ancho: number,
  alto: number,
  h: number,
  maxPasos: number,
  x0: number,
  y0: number,
  dir: 1 | -1,
  buf: Float32Array,
  eMin: number,
): ResultadoTrazo {
  const E = new Float64Array(2);
  const sig = new Float64Array(2);
  const r2Abs = R_ABS * R_ABS;
  const nCargas = cx.length;
  buf[0] = x0;
  buf[1] = y0;
  let n = 1;
  let x = x0;
  let y = y0;
  for (let paso = 0; paso < maxPasos; paso++) {
    campo(x, y, E);
    const m = Math.sqrt(E[0] * E[0] + E[1] * E[1]);
    if (!(m >= eMin) || !Number.isFinite(m)) return { n, fin: "nulo", destino: -1 };
    pasoDesde(campo, x, y, E[0], E[1], m, h, dir, "rk2", sig);
    x = sig[0];
    y = sig[1];
    buf[2 * n] = x;
    buf[2 * n + 1] = y;
    n++;
    for (let k = 0; k < nCargas; k++) {
      const dx = x - cx[k];
      const dy = y - cy[k];
      if (dx * dx + dy * dy < r2Abs) return { n, fin: "carga", destino: k };
    }
    if (x < 0 || x > ancho || y < 0 || y > alto) return { n, fin: "borde", destino: -1 };
  }
  return { n, fin: "max", destino: -1 };
}

/** Copia los `n` puntos del buffer; con `invertir` los guarda en orden inverso. */
function copiarPuntos(buf: Float32Array, n: number, invertir: boolean): Float32Array {
  if (!invertir) return buf.slice(0, 2 * n);
  const out = new Float32Array(2 * n);
  for (let i = 0; i < n; i++) {
    out[2 * i] = buf[2 * (n - 1 - i)];
    out[2 * i + 1] = buf[2 * (n - 1 - i) + 1];
  }
  return out;
}

/**
 * Traza las líneas de campo de una escena (E2.3 §5.3).
 *
 * Cada carga i tiene N_i = `repartirLineas(qs)[i]` sectores angulares de
 * amplitud 2π/N_i con centros en θ_s = 2π·s/N_i (patrón fijo: no depende de las
 * otras cargas). La semilla está a R_SEED del centro.
 *
 * - Pasada 1: desde cada positiva, +E, un sector cada línea. Si la línea llega
 *   a una negativa j, se marca la llegada en el sector de j que apunta hacia
 *   donde llegó.
 * - Pasada 2: cada negativa j siembra hacia atrás (−E) solo `max(0, N_j − a_j)`
 *   líneas, repartidas entre los sectores SIN llegadas (sin duplicar líneas). La
 *   polilínea se invierte al guardarla: `puntos` siempre sigue +E.
 * - Sin positivas, todo se siembra desde las negativas.
 *
 * Los índices `origen`/`destino` son posiciones en `cargas` (las cargas con
 * |q| < 1e-9 se ignoran).
 */
export function trazarLineasCampo(
  cargas: PuntoCarga[],
  ancho: number,
  alto: number,
  opts: OpcionesTrazado = {},
): LineaCampo[] {
  const {
    soft2 = SOFTENING2_ESTATICO,
    paso = PASO_LINEA,
    presupuesto = PRESUPUESTO_LINEAS,
    longitudMax = LONGITUD_MAX,
    eMin = E_MIN,
  } = opts;

  const indices: number[] = [];
  cargas.forEach((c, i) => {
    if (Math.abs(c.q) >= Q_IGNORADA) indices.push(i);
  });
  if (indices.length === 0) return [];
  const cs = indices.map((i) => cargas[i]);
  const nCs = cs.length;
  const cx = Float64Array.from(cs, (c) => c.x);
  const cy = Float64Array.from(cs, (c) => c.y);
  const campo = crearCampo(cs, soft2);
  const sectores = repartirLineas(
    cs.map((c) => c.q),
    presupuesto,
  );
  const maxPasos = Math.ceil(longitudMax / paso);
  const buf = new Float32Array((maxPasos + 2) * 2);

  const lineas: LineaCampo[] = [];
  // Llegadas por sector de cada negativa (en índices filtrados).
  const ocupacion: Array<Int32Array | null> = cs.map((c, k) => (c.q < 0 ? new Int32Array(sectores[k]) : null));
  const llegadas = new Int32Array(nCs);

  const sembrar = (k: number, s: number, dir: 1 | -1) => {
    const theta = (2 * Math.PI * s) / sectores[k];
    const x0 = cx[k] + R_SEED * Math.cos(theta);
    const y0 = cy[k] + R_SEED * Math.sin(theta);
    const r = trazarUna(campo, cx, cy, ancho, alto, paso, maxPasos, x0, y0, dir, buf, eMin);
    const destino = r.fin === "carga" ? indices[r.destino] : -1;
    lineas.push({
      origen: indices[k],
      sentido: dir,
      puntos: copiarPuntos(buf, r.n, dir === -1),
      fin: r.fin,
      destino,
    });
    return r;
  };

  // Pasada 1: positivas hacia delante.
  for (let k = 0; k < nCs; k++) {
    if (cs[k].q <= 0) continue;
    for (let s = 0; s < sectores[k]; s++) {
      const r = sembrar(k, s, 1);
      if (r.fin === "carga" && cs[r.destino].q < 0) {
        const j = r.destino;
        const nj = sectores[j];
        // Ángulo del último punto respecto de j.
        const ultimoX = buf[2 * (r.n - 1)];
        const ultimoY = buf[2 * (r.n - 1) + 1];
        const alfa = Math.atan2(ultimoY - cy[j], ultimoX - cx[j]);
        const sector = ((Math.round(alfa / ((2 * Math.PI) / nj)) % nj) + nj) % nj;
        (ocupacion[j] as Int32Array)[sector]++;
        llegadas[j]++;
      }
    }
  }

  // Pasada 2: negativas hacia atrás, solo donde falta flujo.
  for (let k = 0; k < nCs; k++) {
    if (cs[k].q >= 0) continue;
    const nk = sectores[k];
    const deficit = Math.max(0, nk - llegadas[k]);
    if (deficit === 0) continue;
    const ocup = ocupacion[k] as Int32Array;
    const libres: number[] = [];
    for (let s = 0; s < nk; s++) if (ocup[s] === 0) libres.push(s);
    // Principio del palomar: libres.length ≥ deficit.
    for (let m = 0; m < deficit && libres.length > 0; m++) {
      const idx = Math.min(libres.length - 1, Math.floor(((m + 0.5) * libres.length) / deficit));
      sembrar(k, libres[idx], -1);
    }
  }
  return lineas;
}
