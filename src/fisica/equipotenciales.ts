/**
 * Curvas equipotenciales por marching squares (especificación E2.3 §4).
 *
 * El potencial se evalúa en una malla de nodos (`mallaPotencial`, 10 px de
 * paso en alta calidad) con `SOFTENING2_ESTATICO`, y las curvas son los niveles
 * `V_n = n·ΔV` con ΔV = 200 kV FIJO en volts SI (independiente de las cargas y
 * de sus posiciones: duplicar q acerca las curvas y añade más). Los rótulos
 * están en volts con `formatSI`.
 *
 * Funciones puras, sin DOM: el render solo dibuja las cadenas y los rótulos.
 * Es un corte plano de un campo 3D: la separación entre curvas mide |E|
 * (`E ≈ ΔV/d`), la densidad de las líneas de campo no.
 */
import { K_VISUAL, type PuntoCarga } from "./coulomb";
import { RADIO_CARGA_PX, SOFTENING2_ESTATICO, factoresSim, formatSI } from "./escala";

/** Diferencia de potencial entre curvas vecinas (V, SI). */
export const DELTA_V_SI = 2e5;
/** Paso de la malla en alta calidad (px): 5 celdas por cuadro de 1 cm. */
export const CELDA_POTENCIAL = 10;
/** Las curvas se omiten donde estarían a menos de esto (px) unas de otras. */
export const ESPACIADO_MIN_PX = 4;
/** Salvaguarda de memoria: |n| máximo (con el filtro de espaciado no debería activarse). */
export const N_MAX_NIVEL = 200;
/**
 * Longitud mínima (px) de una cadena para dibujarla. El filtro de espaciado y la
 * exclusión bajo las cargas dejan, sobre todo con muchas cargas, trozos de curva
 * de pocos píxeles que solo son ruido visual (con 30 cargas: ~40 % de las cadenas
 * y ~7 % de la longitud dibujada). Se conservan las cadenas abiertas que llegan
 * al borde de la malla: son curvas legítimas recortadas por el canvas.
 */
export const LONGITUD_MIN_CADENA_PX = 20;

/** ΔV en unidades de simulación (22.25). No recibe cargas: no depende de la escena. */
export function deltaVSim(): number {
  return DELTA_V_SI / factoresSim(K_VISUAL).potencial;
}

export interface MallaPotencial {
  nx: number;
  ny: number;
  /** Paso de la malla (px). */
  celda: number;
  /** Potencial (unidades de simulación) en el nodo (i, j) = v[j·nx + i], en x = i·celda, y = j·celda. */
  v: Float64Array;
}

/**
 * Potencial en los nodos de una malla que cubre [0,ancho]×[0,alto]
 * (`nx = ceil(ancho/celda)+1`). Mismas operaciones que `potencialEn`.
 */
export function mallaPotencial(
  cargas: PuntoCarga[],
  ancho: number,
  alto: number,
  celda: number = CELDA_POTENCIAL,
  soft2: number = SOFTENING2_ESTATICO,
): MallaPotencial {
  const nx = Math.ceil(ancho / celda) + 1;
  const ny = Math.ceil(alto / celda) + 1;
  const v = new Float64Array(nx * ny);
  const n = cargas.length;
  const xs = Float64Array.from(cargas, (c) => c.x);
  const ys = Float64Array.from(cargas, (c) => c.y);
  const kq = Float64Array.from(cargas, (c) => K_VISUAL * c.q);
  for (let j = 0; j < ny; j++) {
    const y = j * celda;
    for (let i = 0; i < nx; i++) {
      const x = i * celda;
      let s = 0;
      for (let k = 0; k < n; k++) {
        const dx = x - xs[k];
        const dy = y - ys[k];
        s += kq[k] / Math.sqrt(dx * dx + dy * dy + soft2);
      }
      v[j * nx + i] = s;
    }
  }
  return { nx, ny, celda, v };
}

export interface CadenaNivel {
  /** [x0, y0, x1, y1, …]. */
  puntos: Float32Array;
  /** Si es un bucle cerrado (el último punto se une con el primero). */
  cerrada: boolean;
}
export interface NivelEquipotencial {
  /** Índice del nivel: V = n·ΔV. */
  n: number;
  /** n·ΔV en volts (SI). */
  valorV: number;
  cadenas: CadenaNivel[];
}
export interface CurvasNivel {
  /** ΔV en volts (SI). */
  pasoV: number;
  /** Ordenados por n creciente; solo los niveles que la malla cruza. */
  niveles: NivelEquipotencial[];
}

export interface Segmento {
  n: number;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

/** Segmentos de un nivel con los ids de arista de sus extremos (para encadenar). */
interface SegsNivel {
  ida: number[];
  idb: number[];
  /** x0, y0, x1, y1 por segmento (x0,y0 ↔ ida; x1,y1 ↔ idb). */
  c: number[];
}

/** Aristas de la celda: 0 arriba, 1 derecha, 2 abajo, 3 izquierda. */
const ESQUINA_ARISTAS: ReadonlyArray<readonly [number, number]> = [
  [0, 3], // esquina a (arriba-izquierda): aristas arriba e izquierda
  [0, 1], // b
  [1, 2], // c
  [2, 3], // d
];

/**
 * Marching squares multinivel. Recorre las celdas una sola vez; en cada una,
 * los niveles que cruza son los enteros n con mn ≤ n·ΔV ≤ mx. Salta las celdas
 * donde las curvas quedarían a menos de ESPACIADO_MIN_PX (estimador por
 * esquinas g = (mx − mn)/h) y las que quedan bajo el disco de una carga.
 */
function generarSegmentos(m: MallaPotencial, cargas: PuntoCarga[]): Map<number, SegsNivel> {
  const { nx, ny, celda: h, v } = m;
  const dv = deltaVSim();
  const umbralSalto = (dv * h) / ESPACIADO_MIN_PX;
  const porNivel = new Map<number, SegsNivel>();
  const nc = cargas.length;
  const cxs = Float64Array.from(cargas, (c) => c.x);
  const cys = Float64Array.from(cargas, (c) => c.y);
  const r2Excl = RADIO_CARGA_PX * RADIO_CARGA_PX;

  // Coordenadas del corte en la arista `e` de la celda (i, j) para el nivel L.
  // Siempre se calcula desde el nodo de menor índice: el mismo corte visto
  // desde la celda vecina es bit a bit igual.
  const px = new Float64Array(4);
  const py = new Float64Array(4);
  const idArista = new Int32Array(4);

  for (let j = 0; j < ny - 1; j++) {
    for (let i = 0; i < nx - 1; i++) {
      const a = v[j * nx + i];
      const b = v[j * nx + i + 1];
      const c = v[(j + 1) * nx + i + 1];
      const d = v[(j + 1) * nx + i];
      const mn = Math.min(a, b, c, d);
      const mx = Math.max(a, b, c, d);
      if (mx - mn > umbralSalto) continue;
      let nMin = Math.ceil(mn / dv);
      let nMax = Math.floor(mx / dv);
      if (nMin > nMax) continue;
      if (nMin < -N_MAX_NIVEL) nMin = -N_MAX_NIVEL;
      if (nMax > N_MAX_NIVEL) nMax = N_MAX_NIVEL;
      if (nMin > nMax) continue;

      // Bajo el disco de una carga no se dibuja nada.
      const ccx = (i + 0.5) * h;
      const ccy = (j + 0.5) * h;
      let excluida = false;
      for (let k = 0; k < nc; k++) {
        const dx = ccx - cxs[k];
        const dy = ccy - cys[k];
        if (dx * dx + dy * dy < r2Excl) {
          excluida = true;
          break;
        }
      }
      if (excluida) continue;

      const x0 = i * h;
      const y0 = j * h;
      idArista[0] = 2 * (j * nx + i);
      idArista[1] = 2 * (j * nx + i + 1) + 1;
      idArista[2] = 2 * ((j + 1) * nx + i);
      idArista[3] = 2 * (j * nx + i) + 1;

      for (let n = nMin; n <= nMax; n++) {
        const L = n * dv;
        const ha = a >= L;
        const hb = b >= L;
        const hc = c >= L;
        const hd = d >= L;
        const cruza0 = ha !== hb; // arriba: a → b
        const cruza1 = hb !== hc; // derecha: b → c
        const cruza2 = hd !== hc; // abajo: d → c
        const cruza3 = ha !== hd; // izquierda: a → d
        const cuenta = (cruza0 ? 1 : 0) + (cruza1 ? 1 : 0) + (cruza2 ? 1 : 0) + (cruza3 ? 1 : 0);
        if (cuenta === 0) continue;

        if (cruza0) {
          const t = (L - a) / (b - a);
          px[0] = x0 + t * h;
          py[0] = y0;
        }
        if (cruza1) {
          const t = (L - b) / (c - b);
          px[1] = x0 + h;
          py[1] = y0 + t * h;
        }
        if (cruza2) {
          const t = (L - d) / (c - d);
          px[2] = x0 + t * h;
          py[2] = y0 + h;
        }
        if (cruza3) {
          const t = (L - a) / (d - a);
          px[3] = x0;
          py[3] = y0 + t * h;
        }

        let segs = porNivel.get(n);
        if (!segs) {
          segs = { ida: [], idb: [], c: [] };
          porNivel.set(n, segs);
        }
        const emitir = (e1: number, e2: number) => {
          segs.ida.push(idArista[e1]);
          segs.idb.push(idArista[e2]);
          segs.c.push(px[e1], py[e1], px[e2], py[e2]);
        };

        if (cuenta === 2) {
          let e1 = -1;
          let e2 = -1;
          const flags = [cruza0, cruza1, cruza2, cruza3];
          for (let e = 0; e < 4; e++) {
            if (!flags[e]) continue;
            if (e1 < 0) e1 = e;
            else e2 = e;
          }
          emitir(e1, e2);
        } else {
          // Silla (casos 5 y 10): se resuelve con el valor central.
          const centroAlto = (a + b + c + d) / 4 >= L;
          const altas = [ha, hb, hc, hd];
          // Se rodean las esquinas bajas si el centro es alto; si no, las altas.
          const rodear = !centroAlto;
          for (let esq = 0; esq < 4; esq++) {
            if (altas[esq] !== rodear) continue;
            emitir(ESQUINA_ARISTAS[esq][0], ESQUINA_ARISTAS[esq][1]);
          }
        }
      }
    }
  }
  return porNivel;
}

/** Los segmentos de todos los niveles (para tests). */
export function segmentosNivel(m: MallaPotencial, cargas: PuntoCarga[]): Segmento[] {
  const out: Segmento[] = [];
  for (const [n, s] of generarSegmentos(m, cargas)) {
    for (let k = 0; k < s.ida.length; k++) {
      out.push({ n, x1: s.c[4 * k], y1: s.c[4 * k + 1], x2: s.c[4 * k + 2], y2: s.c[4 * k + 3] });
    }
  }
  return out;
}

/**
 * Une los segmentos de un nivel en polilíneas por identificador de arista.
 * Primero desde los extremos abiertos y luego los bucles cerrados.
 */
function encadenar(segs: SegsNivel, primero: Int32Array, segundo: Int32Array): CadenaNivel[] {
  const nSeg = segs.ida.length;
  const visitado = new Uint8Array(nSeg);
  const registrar = (id: number, s: number) => {
    if (primero[id] < 0) primero[id] = s;
    else segundo[id] = s;
  };
  for (let s = 0; s < nSeg; s++) {
    registrar(segs.ida[s], s);
    registrar(segs.idb[s], s);
  }

  const cadenas: CadenaNivel[] = [];
  const caminar = (inicio: number, idInicio: number, cerrada: boolean) => {
    const pts: number[] = [];
    let s = inicio;
    let idActual = idInicio;
    // Punto del extremo de entrada del primer segmento.
    if (segs.ida[s] === idInicio) pts.push(segs.c[4 * s], segs.c[4 * s + 1]);
    else pts.push(segs.c[4 * s + 2], segs.c[4 * s + 3]);
    for (;;) {
      visitado[s] = 1;
      let salida: number;
      if (segs.ida[s] === idActual) {
        pts.push(segs.c[4 * s + 2], segs.c[4 * s + 3]);
        salida = segs.idb[s];
      } else {
        pts.push(segs.c[4 * s], segs.c[4 * s + 1]);
        salida = segs.ida[s];
      }
      const sig = primero[salida] === s ? segundo[salida] : primero[salida];
      idActual = salida;
      if (sig < 0 || visitado[sig]) break;
      s = sig;
    }
    // En un bucle el último punto repite el primero: se quita.
    if (cerrada) {
      pts.length -= 2;
    }
    cadenas.push({ puntos: Float32Array.from(pts), cerrada });
  };

  // Extremos abiertos: ids con un solo segmento.
  for (let s = 0; s < nSeg; s++) {
    if (visitado[s]) continue;
    for (const id of [segs.ida[s], segs.idb[s]]) {
      if (!visitado[s] && segundo[id] < 0) caminar(s, id, false);
    }
  }
  // Bucles cerrados.
  for (let s = 0; s < nSeg; s++) {
    if (!visitado[s]) caminar(s, segs.ida[s], true);
  }

  // Limpia solo lo tocado para reutilizar los arrays con el siguiente nivel.
  for (let s = 0; s < nSeg; s++) {
    primero[segs.ida[s]] = -1;
    segundo[segs.ida[s]] = -1;
    primero[segs.idb[s]] = -1;
    segundo[segs.idb[s]] = -1;
  }
  return cadenas;
}

export interface OpcionesCurvas {
  celda?: number;
  soft2?: number;
  /** Cadenas más cortas que esto (px) se descartan salvo que toquen el borde; 0 desactiva el filtro. */
  longitudMinCadena?: number;
}

function longitudPolilinea(p: Float32Array, cerrada: boolean): number {
  const n = p.length / 2;
  let total = 0;
  for (let i = 1; i < n; i++) total += Math.hypot(p[2 * i] - p[2 * i - 2], p[2 * i + 1] - p[2 * i - 1]);
  if (cerrada && n > 1) total += Math.hypot(p[0] - p[2 * n - 2], p[1] - p[2 * n - 1]);
  return total;
}

/** ¿El punto (x, y) está en el borde de la malla (donde el canvas recorta la curva)? */
function enBordeMalla(x: number, y: number, m: MallaPotencial): boolean {
  const eps = 1e-3;
  return x <= eps || y <= eps || x >= (m.nx - 1) * m.celda - eps || y >= (m.ny - 1) * m.celda - eps;
}

/**
 * Curvas de nivel n·ΔV (ΔV = 200 kV en SI) de un conjunto de cargas. `pasoV`
 * vale siempre `DELTA_V_SI`: no depende de q ni de las posiciones.
 */
export function curvasEquipotenciales(
  cargas: PuntoCarga[],
  ancho: number,
  alto: number,
  opts: OpcionesCurvas = {},
): CurvasNivel {
  const { celda = CELDA_POTENCIAL, soft2 = SOFTENING2_ESTATICO, longitudMinCadena = LONGITUD_MIN_CADENA_PX } = opts;
  const malla = mallaPotencial(cargas, ancho, alto, celda, soft2);
  const porNivel = generarSegmentos(malla, cargas);
  const nIds = 2 * malla.nx * malla.ny;
  const primero = new Int32Array(nIds).fill(-1);
  const segundo = new Int32Array(nIds).fill(-1);
  const ns = [...porNivel.keys()].sort((p, q) => p - q);
  const niveles: NivelEquipotencial[] = [];
  for (const n of ns) {
    let cadenas = encadenar(porNivel.get(n) as SegsNivel, primero, segundo);
    if (longitudMinCadena > 0) {
      cadenas = cadenas.filter((c) => {
        const p = c.puntos;
        if (longitudPolilinea(p, c.cerrada) >= longitudMinCadena) return true;
        if (c.cerrada) return false;
        const k = p.length - 2;
        return enBordeMalla(p[0], p[1], malla) || enBordeMalla(p[k], p[k + 1], malla);
      });
    }
    if (cadenas.length > 0) niveles.push({ n, valorV: n * DELTA_V_SI, cadenas });
  }
  return { pasoV: DELTA_V_SI, niveles };
}

// ---- Rótulos ----

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}
export interface Rotulo {
  texto: string;
  /** Centro del rótulo (px). */
  x: number;
  y: number;
  n: number;
}

/** Longitud mínima (px) de una cadena para llevar rótulo. */
export const LONGITUD_MIN_ROTULO = 90;
/** Un rótulo no se coloca a menos de esto (px) de una carga. */
export const DISTANCIA_MIN_CARGA_ROTULO = 30;
/** Relleno de la píldora alrededor del texto (px). */
export const PAD_ROTULO_X = 4;
export const PAD_ROTULO_Y = 2;
const MARGEN_BORDE = 4;
const MARGEN_ENTRE_ROTULOS = 4;
const ROTULOS_POR_NIVEL = 2;

function longitudCadena(c: CadenaNivel): number {
  const p = c.puntos;
  const n = p.length / 2;
  let total = 0;
  for (let i = 1; i < n; i++) total += Math.hypot(p[2 * i] - p[2 * i - 2], p[2 * i + 1] - p[2 * i - 1]);
  if (c.cerrada && n > 1) total += Math.hypot(p[0] - p[2 * n - 2], p[1] - p[2 * n - 1]);
  return total;
}

/** Punto a la fracción `f` (0..1) de la longitud de arco de la cadena. */
function puntoEnFraccion(c: CadenaNivel, f: number): [number, number] {
  const p = c.puntos;
  const n = p.length / 2;
  const total = longitudCadena(c);
  const objetivo = f * total;
  let acumulado = 0;
  const tramos = c.cerrada ? n : n - 1;
  for (let i = 0; i < tramos; i++) {
    const j = (i + 1) % n;
    const dx = p[2 * j] - p[2 * i];
    const dy = p[2 * j + 1] - p[2 * i + 1];
    const l = Math.hypot(dx, dy);
    if (acumulado + l >= objetivo && l > 0) {
      const t = (objetivo - acumulado) / l;
      return [p[2 * i] + t * dx, p[2 * i + 1] + t * dy];
    }
    acumulado += l;
  }
  return [p[2 * (n - 1)], p[2 * (n - 1) + 1]];
}

function solapan(a: Rect, b: Rect, margen: number): boolean {
  return (
    a.x < b.x + b.w + margen && a.x + a.w + margen > b.x && a.y < b.y + b.h + margen && a.y + a.h + margen > b.y
  );
}

/**
 * Coloca los rótulos de nivel (texto `formatSI(n·ΔV, "V")`). Por nivel, las 2
 * cadenas más largas con ≥ 90 px; ancla al 50 % de la longitud de arco y, si se
 * rechaza, al 25 % y al 75 %. Se rechaza una caja que se sale del canvas
 * (margen 4 px), queda a < 30 px de una carga, solapa una caja de `evitar`
 * (p. ej. las etiquetas de carga) o solapa (4 px de margen) otro rótulo. Orden:
 * |n| creciente (los niveles cercanos al 0 tienen prioridad).
 *
 * `anchoTexto` mide el texto (px) y `alturaTexto` es su altura; la caja añade
 * PAD_ROTULO_X/Y a cada lado (es la "píldora" que dibuja el render).
 */
export function colocarRotulos(
  curvas: CurvasNivel,
  cargas: PuntoCarga[],
  ancho: number,
  alto: number,
  anchoTexto: (s: string) => number,
  alturaTexto: number,
  evitar: Rect[] = [],
): Rotulo[] {
  const colocados: Rotulo[] = [];
  const cajas: Rect[] = [];
  const h = alturaTexto + 2 * PAD_ROTULO_Y;
  const orden = [...curvas.niveles].sort((a, b) => Math.abs(a.n) - Math.abs(b.n) || b.n - a.n);

  for (const nivel of orden) {
    const texto = formatSI(nivel.valorV, "V");
    const w = anchoTexto(texto) + 2 * PAD_ROTULO_X;
    const candidatas = nivel.cadenas
      .map((c) => ({ c, l: longitudCadena(c) }))
      .filter((e) => e.l >= LONGITUD_MIN_ROTULO)
      .sort((a, b) => b.l - a.l)
      .slice(0, ROTULOS_POR_NIVEL);

    for (const { c } of candidatas) {
      for (const f of [0.5, 0.25, 0.75]) {
        const [ax, ay] = puntoEnFraccion(c, f);
        const caja: Rect = { x: ax - w / 2, y: ay - h / 2, w, h };
        if (
          caja.x < MARGEN_BORDE ||
          caja.y < MARGEN_BORDE ||
          caja.x + w > ancho - MARGEN_BORDE ||
          caja.y + h > alto - MARGEN_BORDE
        ) {
          continue;
        }
        let cercaDeCarga = false;
        for (const q of cargas) {
          const dx = Math.max(caja.x - q.x, 0, q.x - (caja.x + w));
          const dy = Math.max(caja.y - q.y, 0, q.y - (caja.y + h));
          if (Math.hypot(dx, dy) < DISTANCIA_MIN_CARGA_ROTULO) {
            cercaDeCarga = true;
            break;
          }
        }
        if (cercaDeCarga) continue;
        if (evitar.some((r) => solapan(caja, r, 0))) continue;
        if (cajas.some((r) => solapan(caja, r, MARGEN_ENTRE_ROTULOS))) continue;
        colocados.push({ texto, x: ax, y: ay, n: nivel.n });
        cajas.push(caja);
        break;
      }
    }
  }
  return colocados;
}
