/**
 * Líneas de campo 3D (contrato §3): siembra por espiral áurea, reparto proporcional a |q|, integración RK2 de paso
 * adaptativo y contabilidad de Gauss. Convención: todas las polilíneas van a favor de E; las sembradas «hacia atrás»
 * desde una carga negativa se invierten al guardarlas.
 *
 * Contabilidad (`lineasPorCarga`): + → las n_i sembradas; − → llegadas desde las + más las sembradas hacia atrás
 * (n_j − llegadas_j «donde falta»), es decir max(n_j, llegadas_j). Así salen − entran = Σ signo·lineasPorCarga de las
 * cargas encerradas, exacto (enteros) para cualquier superficie cerrada.
 */
import { E_MIN_3D, LINEAS_POR_UC, MAX_PUNTOS_LINEA, MIN_LINEAS_CARGA, R_ABS_3D, R_SEED_3D, SOFT2_3D } from "./constantes";
import { crearBufferesLineas } from "./unionesBuffers";
import type { Carga3D, LineasCampo3D, NivelGauss3D } from "./tipos";

const INV_4PI = 1 / (4 * Math.PI);
const ANGULO_AUREO = Math.PI * (3 - Math.sqrt(5));

/** n direcciones unitarias (3·n) por espiral áurea, giradas `rotacion` rad alrededor de z. Determinista. */
export function puntosFibonacci(n: number, rotacion: number): Float64Array {
  const out = new Float64Array(3 * n);
  for (let i = 0; i < n; i++) {
    const z = 1 - (2 * i + 1) / n;
    const r = Math.sqrt(Math.max(0, 1 - z * z));
    const f = i * ANGULO_AUREO + rotacion;
    out[3 * i] = r * Math.cos(f);
    out[3 * i + 1] = r * Math.sin(f);
    out[3 * i + 2] = z;
  }
  return out;
}

/**
 * Nº de líneas por carga: n_i ∝ |q_i| (mínimo MIN_LINEAS_CARGA). Si Σ > presupuesto se reescala proporcionalmente
 * y se redondea con el método del mayor resto.
 */
export function repartirLineas(cargas: readonly Carga3D[], presupuesto: number, lineasPorUC: number = LINEAS_POR_UC): number[] {
  const m = cargas.length;
  const ideal: number[] = [];
  let total = 0;
  for (let i = 0; i < m; i++) {
    const v = Math.max(MIN_LINEAS_CARGA, Math.round(Math.abs(cargas[i].q) * lineasPorUC));
    ideal.push(v);
    total += v;
  }
  if (total <= presupuesto) return ideal;
  const escala = presupuesto / total;
  const res: number[] = [];
  const resto: number[] = [];
  let suma = 0;
  for (let i = 0; i < m; i++) {
    const e = ideal[i] * escala;
    const f = Math.floor(e + 1e-9);
    res.push(f);
    resto.push(e - f);
    suma += f;
  }
  while (suma < presupuesto) {
    let k = 0;
    for (let i = 1; i < m; i++) if (resto[i] > resto[k]) k = i;
    res[k]++;
    resto[k] = -1;
    suma++;
  }
  // ninguna carga por debajo del mínimo (a costa de la mayor)
  for (let i = 0; i < m; i++) {
    while (res[i] < MIN_LINEAS_CARGA) {
      let k = 0;
      for (let j = 1; j < m; j++) if (res[j] > res[k]) k = j;
      if (res[k] <= MIN_LINEAS_CARGA) break;
      res[k]--;
      res[i]++;
    }
  }
  return res;
}

// ---- Trazador (variables de módulo: sin asignaciones por paso) ----
/** Tope del factor del paso adaptativo (el contrato partía de 4; con 10 ninguna línea agota MAX_PUNTOS_LINEA). */
const FACTOR_PASO_MAX = 10;
const scratch = new Float64Array(3 * MAX_PUNTOS_LINEA);
let nPts = 0;
let finT = 0;
let finCargaT = -1;
let ux = 0;
let uy = 0;
let uz = 0;

/** Escribe en (ux,uy,uz) el vector unitario sentido·E/|E| en (x,y,z) y devuelve |E| (con softening). */
function direccion(x: number, y: number, z: number, cargas: readonly Carga3D[], sentido: number): number {
  let ex = 0;
  let ey = 0;
  let ez = 0;
  for (let i = 0; i < cargas.length; i++) {
    const c = cargas[i];
    const dx = x - c.x;
    const dy = y - c.y;
    const dz = z - c.z;
    const r2 = dx * dx + dy * dy + dz * dz + SOFT2_3D;
    const f = (c.q * INV_4PI) / (r2 * Math.sqrt(r2));
    ex += f * dx;
    ey += f * dy;
    ez += f * dz;
  }
  const m = Math.sqrt(ex * ex + ey * ey + ez * ez);
  if (m > 0) {
    ux = (sentido * ex) / m;
    uy = (sentido * ey) / m;
    uz = (sentido * ez) / m;
  }
  return m;
}

/**
 * Traza una línea desde (x0,y0,z0) con RK2 (punto medio) de paso adaptativo h = paso·min(FACTOR_PASO_MAX, max(1, dMin/4)).
 * Resultado en `scratch` (nPts puntos), `finT` (0 carga, 1 esfera límite, 2 corte) y `finCargaT`.
 * `sentido` +1 sigue E (sumideros = cargas negativas), −1 va contra E (sumideros = cargas positivas).
 */
function trazarUna(
  cargas: readonly Carga3D[],
  x0: number,
  y0: number,
  z0: number,
  sentido: number,
  rLimite: number,
  paso: number,
): void {
  const S = scratch;
  S[0] = x0;
  S[1] = y0;
  S[2] = z0;
  nPts = 1;
  finT = 2;
  finCargaT = -1;
  const rL2 = rLimite * rLimite;
  const rAbs2 = R_ABS_3D * R_ABS_3D;
  let x = x0;
  let y = y0;
  let z = z0;
  while (nPts < MAX_PUNTOS_LINEA) {
    let dMin2 = Infinity;
    for (let i = 0; i < cargas.length; i++) {
      const dx = x - cargas[i].x;
      const dy = y - cargas[i].y;
      const dz = z - cargas[i].z;
      const d2 = dx * dx + dy * dy + dz * dz;
      if (d2 < dMin2) dMin2 = d2;
    }
    const h = paso * Math.min(FACTOR_PASO_MAX, Math.max(1, Math.sqrt(dMin2) / 4));
    if (direccion(x, y, z, cargas, sentido) < E_MIN_3D) return;
    const mx = x + 0.5 * h * ux;
    const my = y + 0.5 * h * uy;
    const mz = z + 0.5 * h * uz;
    if (direccion(mx, my, mz, cargas, sentido) < E_MIN_3D) return;
    let nx = x + h * ux;
    let ny = y + h * uy;
    let nz = z + h * uz;
    // ¿entra en el radio de absorción de un sumidero?
    for (let i = 0; i < cargas.length; i++) {
      const c = cargas[i];
      if (c.q * sentido >= 0) continue;
      const dx = nx - c.x;
      const dy = ny - c.y;
      const dz = nz - c.z;
      if (dx * dx + dy * dy + dz * dz < rAbs2) {
        const o = 3 * nPts++;
        S[o] = nx;
        S[o + 1] = ny;
        S[o + 2] = nz;
        finT = 0;
        finCargaT = i;
        return;
      }
    }
    // ¿sale de la esfera límite? (se recorta el último tramo sobre ella)
    if (nx * nx + ny * ny + nz * nz >= rL2) {
      const vx = nx - x;
      const vy = ny - y;
      const vz = nz - z;
      const a = vx * vx + vy * vy + vz * vz;
      const b = x * vx + y * vy + z * vz;
      const c2 = x * x + y * y + z * z - rL2;
      const disc = Math.max(0, b * b - a * c2);
      const t = Math.min(1, Math.max(0, (-b + Math.sqrt(disc)) / a));
      nx = x + t * vx;
      ny = y + t * vy;
      nz = z + t * vz;
      const o = 3 * nPts++;
      S[o] = nx;
      S[o + 1] = ny;
      S[o + 2] = nz;
      finT = 1;
      return;
    }
    const o = 3 * nPts++;
    S[o] = nx;
    S[o + 1] = ny;
    S[o + 2] = nz;
    x = nx;
    y = ny;
    z = nz;
  }
}

/** Escribe la línea de `scratch` en la salida (invertida si se trazó contra E). */
function guardarLinea(L: LineasCampo3D, carga: number, signo: number, sentido: number): void {
  const i = L.n;
  const base = L.inicio[i];
  const P = L.puntos;
  if (sentido > 0) {
    for (let k = 0; k < 3 * nPts; k++) P[3 * base + k] = scratch[k];
  } else {
    for (let k = 0; k < nPts; k++) {
      const s = 3 * (nPts - 1 - k);
      P[3 * (base + k)] = scratch[s];
      P[3 * (base + k) + 1] = scratch[s + 1];
      P[3 * (base + k) + 2] = scratch[s + 2];
    }
  }
  L.inicio[i + 1] = base + nPts;
  L.carga[i] = carga;
  L.signo[i] = signo;
  L.sentido[i] = sentido;
  L.fin[i] = finT;
  L.finCarga[i] = finT === 0 ? finCargaT : -1;
  L.n = i + 1;
}

/** Dirección de siembra k de la carga (tilt fijo en la 2.ª carga para no alinear los polos de ambas espirales). */
function rotarTilt(v: Float64Array, k: number, tilt: number): void {
  if (tilt === 0) return;
  const c = Math.cos(tilt);
  const s = Math.sin(tilt);
  const y = v[3 * k + 1];
  const z = v[3 * k + 2];
  v[3 * k + 1] = c * y - s * z;
  v[3 * k + 2] = s * y + c * z;
}

function direccionesCarga(n: number, idx: number, extra: number): Float64Array {
  const v = puntosFibonacci(n, 0.4 + 2.1 * idx + extra);
  if (idx > 0) for (let k = 0; k < n; k++) rotarTilt(v, k, 0.9);
  return v;
}

/**
 * Traza las líneas de campo de las cargas (contrato §3). `rLimite` = R_LIMITE_FACTOR·R_env + max|r_i|.
 * Reutiliza `salida` si sus buffers caben (si no, crea otros); devuelve el objeto con las líneas.
 */
export function trazarLineas3D(
  cargas: readonly Carga3D[],
  rLimite: number,
  nivel: NivelGauss3D,
  lineasPorUC: number = LINEAS_POR_UC,
  salida?: LineasCampo3D,
): LineasCampo3D {
  const m = cargas.length;
  const rep = repartirLineas(cargas, nivel.presupuestoLineas, lineasPorUC);
  let maxLineas = 0;
  for (let i = 0; i < m; i++) maxLineas += rep[i];
  const L =
    salida &&
    salida.carga.length >= maxLineas &&
    salida.inicio.length >= maxLineas + 1 &&
    salida.puntos.length >= 3 * maxLineas * MAX_PUNTOS_LINEA
      ? salida
      : crearBufferesLineas(maxLineas);
  L.n = 0;
  L.inicio[0] = 0;
  L.lineasPorCarga.fill(0);
  const paso = nivel.pasoLinea;
  const llegadas = new Int32Array(m);
  // direcciones (desde la carga) por las que han llegado líneas a cada carga negativa
  const llegDir: Float64Array[] = [];
  for (let j = 0; j < m; j++) llegDir.push(new Float64Array(3 * maxLineas));

  // 1) líneas hacia delante desde las cargas positivas
  for (let i = 0; i < m; i++) {
    const c = cargas[i];
    if (c.q <= 0) continue;
    const dirs = direccionesCarga(rep[i], i, 0);
    for (let k = 0; k < rep[i]; k++) {
      trazarUna(cargas, c.x + R_SEED_3D * dirs[3 * k], c.y + R_SEED_3D * dirs[3 * k + 1], c.z + R_SEED_3D * dirs[3 * k + 2], 1, rLimite, paso);
      guardarLinea(L, i, 1, 1);
      if (finT === 0) {
        const j = finCargaT;
        const o = 3 * llegadas[j]++;
        const lx = scratch[3 * (nPts - 1)] - cargas[j].x;
        const ly = scratch[3 * (nPts - 1) + 1] - cargas[j].y;
        const lz = scratch[3 * (nPts - 1) + 2] - cargas[j].z;
        const l = Math.sqrt(lx * lx + ly * ly + lz * lz) || 1;
        llegDir[j][o] = lx / l;
        llegDir[j][o + 1] = ly / l;
        llegDir[j][o + 2] = lz / l;
      }
    }
    L.lineasPorCarga[i] = rep[i];
  }

  // 2) cargas negativas: líneas hacia atrás solo «donde falta» (direcciones menos cubiertas por las llegadas)
  for (let j = 0; j < m; j++) {
    const c = cargas[j];
    if (c.q >= 0) continue;
    const necesarias = Math.max(0, rep[j] - llegadas[j]);
    let aceptadas = 0;
    for (let ronda = 0; ronda < 3 && aceptadas < necesarias; ronda++) {
      const nCand = ronda === 0 ? rep[j] : ronda === 1 ? 3 * rep[j] + 7 : 9 * rep[j] + 13;
      const dirs = ronda === 0 ? direccionesCarga(nCand, j, 0) : direccionesCarga(nCand, j, 0.7 * ronda);
      // orden: primero las menos cubiertas por llegadas (menor coseno máximo con una llegada)
      const orden = new Int32Array(nCand);
      const cob = new Float64Array(nCand);
      for (let k = 0; k < nCand; k++) {
        let mx = -1;
        for (let a = 0; a < llegadas[j]; a++) {
          const d = dirs[3 * k] * llegDir[j][3 * a] + dirs[3 * k + 1] * llegDir[j][3 * a + 1] + dirs[3 * k + 2] * llegDir[j][3 * a + 2];
          if (d > mx) mx = d;
        }
        cob[k] = mx;
        orden[k] = k;
      }
      orden.sort((p, q) => cob[p] - cob[q] || p - q);
      for (let t = 0; t < nCand && aceptadas < necesarias; t++) {
        const k = orden[t];
        trazarUna(cargas, c.x + R_SEED_3D * dirs[3 * k], c.y + R_SEED_3D * dirs[3 * k + 1], c.z + R_SEED_3D * dirs[3 * k + 2], -1, rLimite, paso);
        if (finT !== 1) continue; // acabó en una carga + (sería una línea extra de ella) o se cortó: descartar
        guardarLinea(L, j, -1, -1);
        aceptadas++;
        // las nuevas líneas cuentan como cubiertas para las siguientes rondas
        if (llegadas[j] < llegDir[j].length / 3) {
          const o = 3 * llegadas[j]++;
          llegDir[j][o] = dirs[3 * k];
          llegDir[j][o + 1] = dirs[3 * k + 1];
          llegDir[j][o + 2] = dirs[3 * k + 2];
        }
      }
    }
    L.lineasPorCarga[j] = llegadasReales(L, j) + aceptadas;
  }
  return L;
}

/** Líneas de signo + que acaban en la carga j (llegadas reales, sin las direcciones añadidas por las hacia atrás). */
function llegadasReales(L: LineasCampo3D, j: number): number {
  let n = 0;
  for (let i = 0; i < L.n; i++) if (L.signo[i] === 1 && L.fin[i] === 0 && L.finCarga[i] === j) n++;
  return n;
}
