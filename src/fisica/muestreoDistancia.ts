/**
 * Muestreo de |E|(r) y V(r) a lo largo de una recta, y curva teórica 1/r²·1/r
 * de UNA carga puntual aislada (especificación E4.1 §3). Funciones puras, sin
 * DOM: las usa el panel "Gráfica vs. distancia" de "Cargas en reposo" (T4.3).
 *
 * Ley usada: la EXACTA sin softening (`campoSI`/`potencialSI` de escala.ts),
 * a propósito DISTINTA de la lectura en vivo de q₀ (`fisica/cargaPrueba.ts`,
 * que usa `SOFTENING2_ESTATICO`): el propósito de esta gráfica es verificar
 * 1/r² sin distorsión artificial cerca del disco de una carga (E4.1 §3.3,
 * §7.3 explica por qué ambas decisiones son correctas para su propósito).
 */
import {
  campoSI,
  potencialSI,
  pxAMetros,
  K_COULOMB,
  RADIO_MIN_LECTURA_PX,
  ESCALA,
  type ConfigEscala,
} from "./escala";
import type { PuntoCarga } from "./coulomb";

/** Muestras de la curva medida (E4.1 §3.3): espaciadas por longitud de arco sobre A→B. */
export const N_MUESTRAS_DISTANCIA = 200;
/** Puntos de la curva teórica continua (E4.1 §3.4): espaciados logarítmicamente en r. */
export const N_PUNTOS_TEORICOS = 100;

export interface PuntoLinea {
  x: number;
  y: number;
}

/**
 * Carga de referencia con un id estable. Ajuste de `ingeniero-frontend` sobre
 * la firma de `muestrearDistancia` de E4.1 §8 (que dejaba `cargaRef` como
 * `PuntoCarga` simple, sin id): `CurvaDistancia.cargaRefId` -- ya parte del
 * contrato de esa misma spec, §5.3, para los metadatos del CSV -- necesita un
 * identificador que `PuntoCarga` (coulomb.ts) no tiene porque las lecturas
 * físicas normales no lo necesitan. `fisico-revisor` puede revisar este
 * ajuste; no cambia ninguna fórmula, solo el tipo del parámetro.
 */
export interface CargaConId extends PuntoCarga {
  id: string;
}

/** Una muestra de la curva medida. `eModulo`/`v` son `null` si el punto cae a
 * `< RADIO_MIN_LECTURA_PX` de CUALQUIER carga (no solo la de referencia). */
export interface MuestraDistancia {
  /** Metros, distancia de este punto a la carga de referencia (no a lo largo de la línea). */
  r: number;
  eModulo: number | null;
  v: number | null;
  /** px lógicos, para CSV/depuración. */
  x: number;
  y: number;
}

export interface CurvaDistancia {
  /** Longitud `N_MUESTRAS_DISTANCIA` (o el `n` pedido). */
  muestras: MuestraDistancia[];
  cargaRefId: string;
  /** Unidades (µC). */
  cargaRefQ: number;
  /** Metros; extremos reales de r cubiertos por el segmento A→B (§3.5). */
  rMin: number;
  rMax: number;
  /** `false` si el pie de la perpendicular desde la carga de referencia hacia la
   * recta A→B cae ESTRICTAMENTE dentro del segmento (línea "no radial", §3.5). */
  esLineaRadial: boolean;
}

function distanciaM(
  ax: number,
  ay: number,
  bx: number,
  by: number,
  esc: ConfigEscala,
): number {
  return pxAMetros(Math.hypot(ax - bx, ay - by), esc);
}

/**
 * Parámetro `t` (SIN acotar a [0, 1]) de la proyección de `p` sobre la recta
 * A→B: `t = 0` es A, `t = 1` es B. `NaN` si A y B coinciden (línea degenerada).
 */
function proyeccionParametro(p: PuntoLinea, a: PuntoLinea, b: PuntoLinea): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const largo2 = dx * dx + dy * dy;
  if (largo2 < 1e-9) return NaN;
  return ((p.x - a.x) * dx + (p.y - a.y) * dy) / largo2;
}

/**
 * Muestrea |E| y V (superposición exacta de `todasLasCargas`, sin softening)
 * en `n` puntos uniformes por longitud de arco entre `a` y `b`. `cargaRef`
 * debe ser una de las cargas de la escena (mismo objeto o misma posición/q);
 * no necesita estar dentro de `todasLasCargas` para el cálculo de `r`, pero
 * normalmente SÍ lo está (es la carga con la que se compara la curva teórica).
 */
export function muestrearDistancia(
  a: PuntoLinea,
  b: PuntoLinea,
  cargaRef: CargaConId,
  todasLasCargas: PuntoCarga[],
  n: number = N_MUESTRAS_DISTANCIA,
  esc: ConfigEscala = ESCALA,
): CurvaDistancia {
  const nMuestras = Math.max(1, Math.floor(n));
  const muestras: MuestraDistancia[] = [];
  for (let i = 0; i < nMuestras; i++) {
    const t = nMuestras === 1 ? 0 : i / (nMuestras - 1);
    const x = a.x + t * (b.x - a.x);
    const y = a.y + t * (b.y - a.y);
    const r = distanciaM(x, y, cargaRef.x, cargaRef.y, esc);
    const campo = campoSI(x, y, todasLasCargas, esc);
    const v = potencialSI(x, y, todasLasCargas, esc);
    muestras.push({ r, eModulo: campo ? campo.modulo : null, v, x, y });
  }

  const dA = distanciaM(cargaRef.x, cargaRef.y, a.x, a.y, esc);
  const dB = distanciaM(cargaRef.x, cargaRef.y, b.x, b.y, esc);
  const tProy = proyeccionParametro(cargaRef, a, b);
  // Radial: el pie de la perpendicular NO cae estrictamente dentro de (0, 1).
  const esLineaRadial = !(tProy > 0 && tProy < 1);
  // Punto del SEGMENTO (t acotado a [0,1]) más cercano a la carga de referencia.
  const tCercano = Number.isFinite(tProy) ? Math.max(0, Math.min(1, tProy)) : 0;
  const xCercano = a.x + tCercano * (b.x - a.x);
  const yCercano = a.y + tCercano * (b.y - a.y);
  const rCercano = distanciaM(xCercano, yCercano, cargaRef.x, cargaRef.y, esc);
  const rMin = Math.max(pxAMetros(RADIO_MIN_LECTURA_PX, esc), rCercano);
  const rMax = Math.max(dA, dB);

  return {
    muestras,
    cargaRefId: cargaRef.id,
    cargaRefQ: cargaRef.q,
    rMin,
    rMax,
    esLineaRadial,
  };
}

export interface PuntoCurvaTeorica {
  r: number;
  eTeorico: number;
  vTeorico: number;
}

/**
 * `nPuntos` espaciados LOGARÍTMICAMENTE entre `rMinM` y `rMaxM` (metros),
 * fórmula cerrada de una carga puntual `qRef` (unidades, µC) aislada. Curva
 * continua, independiente de cualquier muestreo real (E4.1 §3.4).
 */
export function curvaTeorica(
  qRef: number,
  rMinM: number,
  rMaxM: number,
  nPuntos: number = N_PUNTOS_TEORICOS,
  esc: ConfigEscala = ESCALA,
): PuntoCurvaTeorica[] {
  const n = Math.max(2, Math.floor(nPuntos));
  const rMin = Math.max(1e-9, rMinM);
  const rMax = Math.max(rMin, rMaxM);
  const razon = rMax / rMin;
  const qC = qRef * esc.cPorUnidad;
  const puntos: PuntoCurvaTeorica[] = [];
  for (let i = 0; i < n; i++) {
    const r = rMin * Math.pow(razon, i / (n - 1));
    const eTeorico = (K_COULOMB * Math.abs(qC)) / (r * r);
    const vTeorico = (K_COULOMB * qC) / r;
    puntos.push({ r, eTeorico, vTeorico });
  }
  return puntos;
}

/**
 * Evalúa la fórmula cerrada de `curvaTeorica` en un `r` (metros) arbitrario,
 * no necesariamente uno de los `N_PUNTOS_TEORICOS` log-espaciados. La usa el
 * CSV de la gráfica de distancia (E4.1 §5.2) para comparar fila a fila contra
 * los `r` medidos exactos.
 */
export function puntoTeoricoEnR(qRef: number, r: number, esc: ConfigEscala = ESCALA): PuntoCurvaTeorica {
  const rr = Math.max(1e-9, r);
  const qC = qRef * esc.cPorUnidad;
  return { r: rr, eTeorico: (K_COULOMB * Math.abs(qC)) / (rr * rr), vTeorico: (K_COULOMB * qC) / rr };
}

/** Un punto de un tramo continuo, ya elegido `eModulo` o `v` como `valor` (E4.1 §3.5). */
export interface PuntoTramoDistancia {
  r: number;
  valor: number;
  x: number;
  y: number;
}

/**
 * Divide las muestras en tramos continuos de |E| para dibujar: un hueco
 * (`eModulo === null`, exclusión cerca de una carga) corta el tramo -- nunca
 * se interpola a través de él (E4.1 §3.3).
 */
export function tramosCampo(muestras: readonly MuestraDistancia[]): PuntoTramoDistancia[][] {
  const tramos: PuntoTramoDistancia[][] = [];
  let actual: PuntoTramoDistancia[] = [];
  for (const m of muestras) {
    if (m.eModulo === null) {
      if (actual.length) tramos.push(actual);
      actual = [];
      continue;
    }
    actual.push({ r: m.r, valor: m.eModulo, x: m.x, y: m.y });
  }
  if (actual.length) tramos.push(actual);
  return tramos;
}

/**
 * Divide las muestras en tramos continuos de V: un hueco corta igual que en
 * `tramosCampo`, y ADEMÁS un cambio de signo entre dos muestras consecutivas
 * (`v_i · v_{i-1} < 0`) corta el tramo -- contrato para la UI (E4.1 §3.5, G7):
 * en ejes log|V|, el cruce por cero es una singularidad (log 0 = −∞), no se
 * conecta con una línea recta a través de ella.
 */
export function tramosPotencial(muestras: readonly MuestraDistancia[]): PuntoTramoDistancia[][] {
  const tramos: PuntoTramoDistancia[][] = [];
  let actual: PuntoTramoDistancia[] = [];
  let anterior: number | null = null;
  for (const m of muestras) {
    if (m.v === null) {
      if (actual.length) tramos.push(actual);
      actual = [];
      anterior = null;
      continue;
    }
    if (anterior !== null && anterior * m.v < 0) {
      if (actual.length) tramos.push(actual);
      actual = [];
    }
    actual.push({ r: m.r, valor: m.v, x: m.x, y: m.y });
    anterior = m.v;
  }
  if (actual.length) tramos.push(actual);
  return tramos;
}
