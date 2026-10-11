/**
 * Análisis nodal modificado (MNA) con eliminación de Gauss y pivoteo parcial
 * (spec E6-E7-circuitos §4). Incógnitas: potenciales de los nodos 1..N-1 y la
 * corriente i_ab de cada fuente de tensión. El nodo 0 (tierra) se elimina.
 */
import { ErrorCircuito, type Netlist, type Resultado } from "./tipos";

/** Pivote mínimo relativo a la mayor entrada de la matriz. */
export const TOL_PIVOTE = 1e-12;

export interface LU {
  n: number;
  lu: Float64Array;
  perm: Int32Array;
}

/** Factoriza PA = LU (Doolittle, pivoteo parcial). M es n×n por filas; no se modifica. */
export function factorizar(M: ArrayLike<number>, n: number): LU {
  const lu = Float64Array.from(M as ArrayLike<number>);
  const perm = new Int32Array(n);
  let escala = 0;
  for (let k = 0; k < n * n; k++) escala = Math.max(escala, Math.abs(lu[k]));
  for (let i = 0; i < n; i++) perm[i] = i;
  for (let c = 0; c < n; c++) {
    let p = c;
    let max = Math.abs(lu[c * n + c]);
    for (let r = c + 1; r < n; r++) {
      const a = Math.abs(lu[r * n + c]);
      if (a > max) {
        max = a;
        p = r;
      }
    }
    if (!(max > TOL_PIVOTE * escala) || max === 0) {
      throw new ErrorCircuito("circuito no válido: matriz singular");
    }
    if (p !== c) {
      for (let k = 0; k < n; k++) {
        const t = lu[c * n + k];
        lu[c * n + k] = lu[p * n + k];
        lu[p * n + k] = t;
      }
      const t = perm[c];
      perm[c] = perm[p];
      perm[p] = t;
    }
    const piv = lu[c * n + c];
    for (let r = c + 1; r < n; r++) {
      const f = lu[r * n + c] / piv;
      lu[r * n + c] = f;
      if (f !== 0) for (let k = c + 1; k < n; k++) lu[r * n + k] -= f * lu[c * n + k];
    }
  }
  return { n, lu, perm };
}

/** Resuelve A x = z usando la factorización. */
export function resolverLU(f: LU, z: ArrayLike<number>): Float64Array {
  const { n, lu, perm } = f;
  const x = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    let s = z[perm[i]];
    for (let k = 0; k < i; k++) s -= lu[i * n + k] * x[k];
    x[i] = s;
  }
  for (let i = n - 1; i >= 0; i--) {
    let s = x[i];
    for (let k = i + 1; k < n; k++) s -= lu[i * n + k] * x[k];
    x[i] = s / lu[i * n + i];
  }
  return x;
}

/** Resuelve M x = z (Gauss con pivoteo parcial). Lanza ErrorCircuito si es singular. */
export function resolverLineal(M: ArrayLike<number>, z: ArrayLike<number>, n: number): Float64Array {
  return resolverLU(factorizar(M, n), z);
}

export interface Ensamblado {
  n: number;
  M: Float64Array;
  /** Índice de la incógnita de corriente de cada fuente V. */
  idxV: Record<string, number>;
}

/**
 * Ensambla la matriz M. `h` null ⇒ DC (capacitores abiertos, omitidos);
 * `h` > 0 ⇒ Euler implícito: cada capacitor aporta g_C = C/h.
 */
export function ensamblar(net: Netlist, h: number | null): Ensamblado {
  const nv = net.elementos.filter((e) => e.tipo === "V").length;
  const nn = net.nNodos - 1;
  const n = nn + nv;
  const M = new Float64Array(n * n);
  const idxV: Record<string, number> = {};
  const add = (r: number, c: number, val: number) => {
    if (r > 0 && c > 0) M[(r - 1) * n + (c - 1)] += val;
  };
  let jv = 0;
  for (const e of net.elementos) {
    if (e.tipo === "V") {
      const j = nn + jv++;
      idxV[e.id] = j;
      if (e.a > 0) {
        M[(e.a - 1) * n + j] += 1;
        M[j * n + (e.a - 1)] += 1;
      }
      if (e.b > 0) {
        M[(e.b - 1) * n + j] -= 1;
        M[j * n + (e.b - 1)] -= 1;
      }
    } else {
      let g: number;
      if (e.tipo === "R") g = 1 / e.valor;
      else if (h !== null) g = e.valor / h;
      else continue;
      add(e.a, e.a, g);
      add(e.b, e.b, g);
      add(e.a, e.b, -g);
      add(e.b, e.a, -g);
    }
  }
  return { n, M, idxV };
}

/** Vector z: fuentes de tensión y fuentes equivalentes de los capacitores (v_ab previo). */
export function construirZ(
  net: Netlist,
  ens: Ensamblado,
  h: number | null,
  estadoC: Record<string, number>,
): Float64Array {
  const z = new Float64Array(ens.n);
  for (const e of net.elementos) {
    if (e.tipo === "V") z[ens.idxV[e.id]] = e.valor;
    else if (e.tipo === "C" && h !== null) {
      const ieq = (e.valor / h) * (estadoC[e.id] ?? 0);
      if (e.a > 0) z[e.a - 1] += ieq;
      if (e.b > 0) z[e.b - 1] -= ieq;
    }
  }
  return z;
}

/** Convierte la solución en Resultado (corrientes por elemento, iBat, nuevo estadoC). */
export function interpretar(
  net: Netlist,
  ens: Ensamblado,
  x: ArrayLike<number>,
  h: number | null,
  estadoPrevio: Record<string, number>,
): Resultado {
  const v = new Array<number>(net.nNodos).fill(0);
  for (let k = 1; k < net.nNodos; k++) v[k] = x[k - 1];
  const i: Record<string, number> = {};
  const estadoC: Record<string, number> = {};
  let iBat = 0;
  for (const e of net.elementos) {
    const vab = v[e.a] - v[e.b];
    if (e.tipo === "R") i[e.id] = vab / e.valor;
    else if (e.tipo === "V") {
      i[e.id] = x[ens.idxV[e.id]];
      iBat -= i[e.id];
    } else if (h !== null) {
      i[e.id] = (e.valor / h) * (vab - (estadoPrevio[e.id] ?? 0));
      estadoC[e.id] = vab;
    } else {
      i[e.id] = 0;
    }
  }
  return { v, i, iBat, estadoC };
}

/** Régimen estacionario (E6): capacitores abiertos. */
export function resolverDC(net: Netlist): Resultado {
  const ens = ensamblar(net, null);
  const z = construirZ(net, ens, null, {});
  const x = resolverLineal(ens.M, z, ens.n);
  return interpretar(net, ens, x, null, {});
}
