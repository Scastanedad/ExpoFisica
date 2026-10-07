/**
 * Geometría cacheada de la escena Gauss 3D (contrato §4): todo lo que depende de la superficie y las cargas pero NO
 * de la cámara (malla, flujo por parche, líneas de campo, cruces, flechas de campo, aristas de los parches). Se
 * recalcula solo cuando la firma dice "geometria"; los buffers grandes se reutilizan entre recálculos.
 */
import { MAX_CARGAS, MAX_PUNTOS_LINEA, LINEAS_POR_UC, NIVELES_GAUSS3D, R_LIMITE_FACTOR } from "../../fisica/gauss3d/constantes";
import { muestrearFlechas } from "../../fisica/gauss3d/campo3d";
import { calcularCruces } from "../../fisica/gauss3d/cruces";
import { calcularFlujo } from "../../fisica/gauss3d/flujo";
import { trazarLineas3D } from "../../fisica/gauss3d/lineas3d";
import { generarMalla } from "../../fisica/gauss3d/mallas";
import { radioEnvolvente } from "../../fisica/gauss3d/superficies";
import { crearBufferesCruces, crearBufferesLineas } from "../../fisica/gauss3d/unionesBuffers";
import type {
  Carga3D,
  Cruces,
  Escenario,
  LineasCampo3D,
  MallaSuperficie,
  ResultadoFlujo,
  Superficie,
} from "../../fisica/gauss3d/tipos";

/** Bandas de color del flujo por signo: la saturación se acota en la última. */
export const N_BANDAS_FLUJO = 6;
/** Por debajo de esta fracción del tope, un parche se pinta neutro (flujo despreciable). */
export const UMBRAL_NEUTRO = 0.04;
/** Dos triángulos adyacentes con normales a más de ~35° forman una arista «dura» (cubo, tapas del cilindro). */
const COS_ARISTA_DURA = 0.82;

/** Aristas de contorno de los parches de flujo (no las diagonales interiores). */
export interface AristasParches {
  n: number;
  /** 2 índices de vértice por arista. */
  v: Uint32Array;
  /** 2 triángulos adyacentes por arista (el segundo es −1 si es arista de borde). */
  tri: Int32Array;
  /** 1 si es arista de borde o de pliegue marcado (siempre se dibuja reforzada). */
  dura: Uint8Array;
}

export interface GeometriaGauss3D {
  superficie: Superficie;
  cargas: Carga3D[];
  calidad: number;
  malla: MallaSuperficie;
  flujo: ResultadoFlujo;
  /** Por parche: 0 = neutro; ±1…±N_BANDAS_FLUJO = signo y banda de saturación (+ = sale, − = entra). */
  bandaParche: Int8Array;
  aristas: AristasParches;
  lineas: LineasCampo3D;
  cruces: Cruces;
  /** 6 floats por flecha (x, y, z, Ex, Ey, Ez); `nFlechas` válidas. */
  flechas: Float32Array;
  nFlechas: number;
  /** |E| máximo entre las flechas (µC/ε₀ por u²), para escalar sus longitudes. */
  maxModuloFlecha: number;
  conLineas: boolean;
  conCampo: boolean;
  /** Radio (u) de la esfera que debe caber en el canvas con zoom 1. */
  rEncuadre: number;
  /** Semilado (u) del suelo con cuadrícula. */
  mitadSuelo: number;
  /** Radio de la esfera límite de las líneas. */
  rLimite: number;
  /** ms que tardó el último recálculo (para el gestor de calidad). */
  msCalculo: number;
}

/** Estado reutilizable entre recálculos (buffers grandes + clave de la malla). */
export interface EstadoGeometria {
  geom: GeometriaGauss3D | null;
  lineasBuf: LineasCampo3D;
  crucesBuf: Cruces;
  flechasBuf: Float32Array;
  claveMalla: string;
  malla: MallaSuperficie | null;
  aristas: AristasParches | null;
}

export function crearEstadoGeometria(): EstadoGeometria {
  const maxLineas = NIVELES_GAUSS3D[0].presupuestoLineas;
  return {
    geom: null,
    lineasBuf: crearBufferesLineas(maxLineas),
    crucesBuf: crearBufferesCruces(2 * maxLineas + 64),
    flechasBuf: new Float32Array(6 * NIVELES_GAUSS3D[0].tapaFlechas),
    claveMalla: "",
    malla: null,
    aristas: null,
  };
}

function claveSuperficie(s: Superficie, calidad: number): string {
  switch (s.tipo) {
    case "parche":
      return `parche|${s.lado}|${s.theta}|${s.phi}|${calidad}`;
    case "esfera":
      return `esfera|${s.radio}|${calidad}`;
    case "cubo":
      return `cubo|${s.lado}|${calidad}`;
    case "cilindro":
      return `cilindro|${s.radio}|${s.altura}|${calidad}`;
  }
}

/** Radio (u) de la esfera de encuadre: lo que debe verse con zoom 1 (superficie y cargas, con holgura). */
export function radioEncuadre(sup: Superficie, cargas: readonly Carga3D[]): number {
  let r = radioEnvolvente(sup);
  for (const c of cargas) r = Math.max(r, Math.hypot(c.x, c.y, c.z));
  return 1.1 * r + 0.5;
}

/** Aristas de contorno de parche: las que separan parches distintos o son borde de malla. */
export function construirAristas(malla: MallaSuperficie): AristasParches {
  const T = malla.triangulos;
  const nT = T.length / 3;
  const nV = malla.vertices.length / 3;
  const mapa = new Map<number, number>(); // clave → índice provisional
  const va: number[] = [];
  const vb: number[] = [];
  const t0: number[] = [];
  const t1: number[] = [];
  const registrar = (a: number, b: number, k: number) => {
    const lo = a < b ? a : b;
    const hi = a < b ? b : a;
    const clave = lo * nV + hi;
    const e = mapa.get(clave);
    if (e === undefined) {
      mapa.set(clave, va.length);
      va.push(lo);
      vb.push(hi);
      t0.push(k);
      t1.push(-1);
    } else if (t1[e] < 0) {
      t1[e] = k;
    }
  };
  for (let k = 0; k < nT; k++) {
    const a = T[3 * k];
    const b = T[3 * k + 1];
    const c = T[3 * k + 2];
    registrar(a, b, k);
    registrar(b, c, k);
    registrar(c, a, k);
  }
  const N = malla.normalTriangulo;
  const P = malla.parcheDeTriangulo;
  const keep: number[] = [];
  const dura: number[] = [];
  for (let e = 0; e < va.length; e++) {
    if (t1[e] < 0) {
      keep.push(e);
      dura.push(1);
    } else if (P[t0[e]] !== P[t1[e]]) {
      keep.push(e);
      const dot = N[3 * t0[e]] * N[3 * t1[e]] + N[3 * t0[e] + 1] * N[3 * t1[e] + 1] + N[3 * t0[e] + 2] * N[3 * t1[e] + 2];
      dura.push(dot < COS_ARISTA_DURA ? 1 : 0);
    }
  }
  const n = keep.length;
  const out: AristasParches = { n, v: new Uint32Array(2 * n), tri: new Int32Array(2 * n), dura: new Uint8Array(n) };
  for (let i = 0; i < n; i++) {
    const e = keep[i];
    out.v[2 * i] = va[e];
    out.v[2 * i + 1] = vb[e];
    out.tri[2 * i] = t0[e];
    out.tri[2 * i + 1] = t1[e];
    out.dura[i] = dura[i];
  }
  return out;
}

/** Signo y banda de saturación de cada parche a partir de la densidad E_n (saturación acotada por el tope del flujo). */
export function bandasDeParches(flujo: ResultadoFlujo, nParches: number, out?: Int8Array): Int8Array {
  const res = out && out.length >= nParches ? out : new Int8Array(nParches);
  const tope = flujo.maxAbsDensidad;
  for (let p = 0; p < nParches; p++) {
    const d = flujo.densidadParche[p];
    if (!(tope > 1e-12) || !Number.isFinite(d)) {
      res[p] = 0;
      continue;
    }
    const nivel = Math.min(1, Math.abs(d) / tope);
    if (nivel < UMBRAL_NEUTRO) {
      res[p] = 0;
      continue;
    }
    const banda = Math.min(N_BANDAS_FLUJO, Math.max(1, Math.ceil(nivel * N_BANDAS_FLUJO - 1e-9)));
    res[p] = d > 0 ? banda : -banda;
  }
  return res;
}

/**
 * Recalcula la geometría del escenario. Reutiliza malla y aristas si la superficie y la calidad no cambiaron, y los
 * buffers de líneas, cruces y flechas siempre.
 */
export function construirGeometria(
  est: EstadoGeometria,
  esc: Escenario,
  mostrar: { lineas: boolean; campo: boolean },
): GeometriaGauss3D {
  const t0 = performance.now();
  const nivel = NIVELES_GAUSS3D[esc.calidad];
  const sup = esc.superficie;
  const cargas = esc.cargas.slice(0, MAX_CARGAS).map((c) => ({ ...c }));

  const calMalla = esc.calidadMalla ?? esc.calidad;
  const clave = claveSuperficie(sup, calMalla);
  if (clave !== est.claveMalla || !est.malla || !est.aristas) {
    est.malla = generarMalla(sup, NIVELES_GAUSS3D[calMalla]);
    est.aristas = construirAristas(est.malla);
    est.claveMalla = clave;
  }
  const malla = est.malla;
  const flujo = calcularFlujo(malla, cargas, sup);
  const bandaParche = bandasDeParches(flujo, malla.nParches);

  let maxR = 0;
  for (const c of cargas) maxR = Math.max(maxR, Math.hypot(c.x, c.y, c.z));
  const rLimite = R_LIMITE_FACTOR * radioEnvolvente(sup) + maxR;

  let lineas = est.lineasBuf;
  let cruces = est.crucesBuf;
  if (mostrar.lineas) {
    lineas = trazarLineas3D(cargas, rLimite, nivel, LINEAS_POR_UC, est.lineasBuf);
    cruces = calcularCruces(lineas, sup, est.crucesBuf);
    est.lineasBuf = lineas;
    est.crucesBuf = cruces;
  } else {
    lineas.n = 0;
    cruces.n = 0;
    cruces.salen = 0;
    cruces.entran = 0;
  }

  let nFlechas = 0;
  let maxModuloFlecha = 0;
  if (mostrar.campo) {
    nFlechas = muestrearFlechas(sup, cargas, nivel.tapaFlechas, est.flechasBuf);
    for (let i = 0; i < nFlechas; i++) {
      const m = Math.hypot(est.flechasBuf[6 * i + 3], est.flechasBuf[6 * i + 4], est.flechasBuf[6 * i + 5]);
      if (m > maxModuloFlecha) maxModuloFlecha = m;
    }
  }

  const rEncuadre = radioEncuadre(sup, cargas);
  const geom: GeometriaGauss3D = {
    superficie: sup,
    cargas,
    calidad: esc.calidad,
    malla,
    flujo,
    bandaParche,
    aristas: est.aristas,
    lineas,
    cruces,
    flechas: est.flechasBuf,
    nFlechas,
    maxModuloFlecha,
    conLineas: mostrar.lineas,
    conCampo: mostrar.campo,
    rEncuadre,
    mitadSuelo: Math.max(6, Math.ceil(rEncuadre)),
    rLimite,
    msCalculo: performance.now() - t0,
  };
  est.geom = geom;
  return geom;
}

/** Capacidad máxima de puntos de línea (para dimensionar los buffers de proyección). */
export const MAX_PUNTOS_TOTAL = NIVELES_GAUSS3D[0].presupuestoLineas * MAX_PUNTOS_LINEA;
