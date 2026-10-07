/**
 * Proyección por cuadro y clasificación en las 4 pasadas del diseño (decisión «gauss-3d-diseno-canvas2d» §2):
 *   1 caras traseras · 2 contenido detrás de la cara delantera · 3 caras delanteras translúcidas · 4 contenido delante.
 * Aquí solo se calcula (Float32Array preasignados, sin asignaciones por cuadro); `dibujarGauss3D.ts` pinta.
 *
 * Clasificación: cada trozo de línea / carga / flecha / sombra se asigna a la pasada 2 («oculto»: el rayo ojo→trozo
 * atraviesa la superficie antes de llegar a él, `ocultoPorSuperficie`) o a la 4 («delante»). Las líneas se parten en
 * los cruces con la superficie (los de `Cruces`, ya calculados) y, si los extremos de un tramo caen en lados distintos
 * de la silueta, se subdivide por bisección (≤ 3 niveles), así que el error visual es < 1/8 de paso.
 * Dentro de cada pasada el orden es por BANDAS de alfa según la profundidad (un trazo por banda en el dibujo).
 */
import { MAX_CARGAS } from "../../fisica/gauss3d/constantes";
import { ocultoPorSuperficie, segmentoCruzaSuperficie } from "../../fisica/gauss3d/rayos";
import type { Superficie, Vec3M } from "../../fisica/gauss3d/tipos";
import { proyectarPunto, proyectarPuntos, type CamaraProy } from "./camara";
import { MAX_PUNTOS_TOTAL, type GeometriaGauss3D } from "./geometria";

export const PASADA_DETRAS = 2;
export const PASADA_DELANTE = 4;
/** Bandas de alfa por profundidad (0 = más lejos … N−1 = más cerca). */
export const N_BANDAS_PROF = 4;
/** Niveles de alfa de las flechas de campo E según |E|. */
export const N_BANDAS_CAMPO = 3;
/** Claves de orden: pasada 2 → 0…N−1, pasada 4 → N…2N−1 (N = bandas de profundidad). */
export const N_CLAVES = 2 * N_BANDAS_PROF;
const PROF_MAX_BISECCION = 3;
/** Separación aproximada entre puntas de flecha de las líneas (px de arco de pantalla). */
export const SEPARACION_PUNTAS_PX = 110;
const CAP_SEG_LINEAS = MAX_PUNTOS_TOTAL + 8192;
const CAP_PUNTAS = 4096;
const CAP_CAMPO = 512;
const CAP_MARCAS = 2048;
/** Paso (u) a lo largo de la línea para orientar la punta de un marcador de cruce cuando el segmento proyecta casi a un punto. */
const PASO_DIR_MARCA = 0.4;

export interface BufferSegmentos {
  n: number;
  cap: number;
  x0: Float32Array;
  y0: Float32Array;
  x1: Float32Array;
  y1: Float32Array;
  pasada: Uint8Array;
  banda: Uint8Array;
  /** Índices ordenados por clave (pasada, banda): ver `ordenarPorClave`. */
  orden: Uint32Array;
  /** Inicio de cada clave en `orden` (N_CLAVES + 1 entradas). */
  inicio: Uint32Array;
  /** Solo pruebas: si existe, recibe el punto medio 3D (3 floats) de cada trozo. */
  mid3?: Float32Array;
  /** Segmentos que no cupieron (diagnóstico; 0 en uso normal). */
  descartados: number;
}

/** Puntas de flecha (triángulos): posición y dirección unitaria en pantalla. */
export interface BufferPuntas {
  n: number;
  cap: number;
  x: Float32Array;
  y: Float32Array;
  dx: Float32Array;
  dy: Float32Array;
  pasada: Uint8Array;
  banda: Uint8Array;
  orden: Uint32Array;
  inicio: Uint32Array;
}

/**
 * Marcadores de cruce línea–superficie: posición en pantalla, dirección (unitaria, en pantalla) de la línea orientada
 * con E y sentido (+1 sale: relleno, −1 entra: anillo). `dx = dy = 0` si la línea apunta al ojo (sin punta).
 */
export interface BufferMarcas {
  n: number;
  cap: number;
  x: Float32Array;
  y: Float32Array;
  dx: Float32Array;
  dy: Float32Array;
  sentido: Int8Array;
  pasada: Uint8Array;
}

export interface Pasadas {
  // proyección de la malla
  capV: number;
  vx: Float32Array;
  vy: Float32Array;
  vp: Float32Array;
  capT: number;
  /** 1 = cara delantera (mira al ojo). El parche cuenta siempre como delantero. */
  frente: Uint8Array;
  // proyección de las líneas y sus cruces
  lx: Float32Array;
  ly: Float32Array;
  lp: Float32Array;
  capC: number;
  cx: Float32Array;
  cy: Float32Array;
  cp: Float32Array;
  // cargas: posición, proyección, pasada y sombra en el suelo
  nCargas: number;
  qx: Float32Array;
  qy: Float32Array;
  qp: Float32Array;
  pasadaCarga: Uint8Array;
  sx: Float32Array;
  sy: Float32Array;
  pasadaSombra: Uint8Array;
  // trozos
  lineas: BufferSegmentos;
  puntas: BufferPuntas;
  caida: BufferSegmentos;
  campo: BufferSegmentos;
  puntasCampo: BufferPuntas;
  /** Cruces línea–superficie (solo con las líneas visibles). */
  marcas: BufferMarcas;
  /** Radio de referencia (u) para el desvanecimiento de las líneas = radio de encuadre. */
  rRef: number;
  /** Las líneas se recortan más allá de `corteRel`·rRef del origen (Infinity = no recortar). */
  corteRel: number;
  /** Margen (px) fuera del canvas a partir del cual se descartan trozos (Infinity = no recortar). */
  margenPx: number;
  // sesión interna (evita closures y asignaciones)
  ancho: number;
  alto: number;
  profMin: number;
  profRango: number;
  ojo: Vec3M;
  pt: Vec3M;
  acum: number;
  sigPunta: number;
  tmp: Float32Array;
  cruce: Float64Array;
  a3: Vec3M;
  b3: Vec3M;
  cam: CamaraProy | null;
}

function crearBufferSegmentos(cap: number): BufferSegmentos {
  return {
    n: 0,
    cap,
    x0: new Float32Array(cap),
    y0: new Float32Array(cap),
    x1: new Float32Array(cap),
    y1: new Float32Array(cap),
    pasada: new Uint8Array(cap),
    banda: new Uint8Array(cap),
    orden: new Uint32Array(cap),
    inicio: new Uint32Array(N_CLAVES + 1),
    descartados: 0,
  };
}

function crearBufferPuntas(cap: number): BufferPuntas {
  return {
    n: 0,
    cap,
    x: new Float32Array(cap),
    y: new Float32Array(cap),
    dx: new Float32Array(cap),
    dy: new Float32Array(cap),
    pasada: new Uint8Array(cap),
    banda: new Uint8Array(cap),
    orden: new Uint32Array(cap),
    inicio: new Uint32Array(N_CLAVES + 1),
  };
}

function crearBufferMarcas(cap: number): BufferMarcas {
  return {
    n: 0,
    cap,
    x: new Float32Array(cap),
    y: new Float32Array(cap),
    dx: new Float32Array(cap),
    dy: new Float32Array(cap),
    sentido: new Int8Array(cap),
    pasada: new Uint8Array(cap),
  };
}

export function crearPasadas(): Pasadas {
  return {
    capV: 0,
    vx: new Float32Array(0),
    vy: new Float32Array(0),
    vp: new Float32Array(0),
    capT: 0,
    frente: new Uint8Array(0),
    lx: new Float32Array(MAX_PUNTOS_TOTAL),
    ly: new Float32Array(MAX_PUNTOS_TOTAL),
    lp: new Float32Array(MAX_PUNTOS_TOTAL),
    capC: 0,
    cx: new Float32Array(0),
    cy: new Float32Array(0),
    cp: new Float32Array(0),
    nCargas: 0,
    qx: new Float32Array(MAX_CARGAS),
    qy: new Float32Array(MAX_CARGAS),
    qp: new Float32Array(MAX_CARGAS),
    pasadaCarga: new Uint8Array(MAX_CARGAS),
    sx: new Float32Array(MAX_CARGAS),
    sy: new Float32Array(MAX_CARGAS),
    pasadaSombra: new Uint8Array(MAX_CARGAS),
    lineas: crearBufferSegmentos(CAP_SEG_LINEAS),
    puntas: crearBufferPuntas(CAP_PUNTAS),
    caida: crearBufferSegmentos(16),
    campo: crearBufferSegmentos(CAP_CAMPO),
    puntasCampo: crearBufferPuntas(CAP_CAMPO),
    marcas: crearBufferMarcas(CAP_MARCAS),
    margenPx: 80,
    rRef: 1,
    corteRel: 2.7,
    ancho: 0,
    alto: 0,
    profMin: 0,
    profRango: 1,
    ojo: [0, 0, 0],
    pt: [0, 0, 0],
    acum: 0,
    sigPunta: 0,
    tmp: new Float32Array(8),
    cruce: new Float64Array(4),
    a3: [0, 0, 0],
    b3: [0, 0, 0],
    cam: null,
  };
}

function asegurar(p: Pasadas, geom: GeometriaGauss3D): void {
  const nV = geom.malla.vertices.length / 3;
  if (p.capV < nV) {
    p.capV = nV;
    p.vx = new Float32Array(nV);
    p.vy = new Float32Array(nV);
    p.vp = new Float32Array(nV);
  }
  const nT = geom.malla.triangulos.length / 3;
  if (p.capT < nT) {
    p.capT = nT;
    p.frente = new Uint8Array(nT);
  }
  if (p.capC < geom.cruces.n) {
    p.capC = geom.cruces.n;
    p.cx = new Float32Array(p.capC);
    p.cy = new Float32Array(p.capC);
    p.cp = new Float32Array(p.capC);
  }
}

function oculto(p: Pasadas, sup: Superficie, x: number, y: number, z: number): number {
  p.pt[0] = x;
  p.pt[1] = y;
  p.pt[2] = z;
  return ocultoPorSuperficie(sup, p.ojo, p.pt) ? 1 : 0;
}

/** Clave (0…N_CLAVES−1) de un trozo: primero las bandas de la pasada 2, luego las de la 4. */
export function claveTrozo(pasada: number, banda: number): number {
  return (pasada === PASADA_DELANTE ? N_BANDAS_PROF : 0) + banda;
}

/**
 * Orden por conteo (sin asignar): deja en `orden` los índices agrupados por clave y en `inicio[k]…inicio[k+1]` el
 * rango de cada clave, de modo que el dibujo hace un solo trazo por (pasada, banda).
 */
export function ordenarPorClave(pasada: Uint8Array, banda: Uint8Array, n: number, orden: Uint32Array, inicio: Uint32Array): void {
  inicio.fill(0);
  for (let i = 0; i < n; i++) inicio[claveTrozo(pasada[i], banda[i]) + 1]++;
  for (let k = 0; k < N_CLAVES; k++) inicio[k + 1] += inicio[k];
  // `inicio[k]` se usa como cursor y se restaura al final
  for (let i = 0; i < n; i++) orden[inicio[claveTrozo(pasada[i], banda[i])]++] = i;
  for (let k = N_CLAVES; k > 0; k--) inicio[k] = inicio[k - 1];
  inicio[0] = 0;
}

/** Banda de alfa por profundidad: la más cercana al ojo = la más alta. */
function bandaProf(p: Pasadas, prof: number): number {
  let t = (prof - p.profMin) / p.profRango;
  t = t < 0 ? 0 : t > 0.999999 ? 0.999999 : t;
  return N_BANDAS_PROF - 1 - Math.floor(t * N_BANDAS_PROF);
}

function fuera(p: Pasadas, x0: number, y0: number, x1: number, y1: number): boolean {
  const m = p.margenPx;
  if (m === Infinity) return false;
  return (
    (x0 < -m && x1 < -m) ||
    (y0 < -m && y1 < -m) ||
    (x0 > p.ancho + m && x1 > p.ancho + m) ||
    (y0 > p.alto + m && y1 > p.alto + m)
  );
}

function empujar(b: BufferSegmentos, pasada: number, banda: number, x0: number, y0: number, x1: number, y1: number): void {
  const i = b.n;
  if (i >= b.cap) {
    b.descartados++;
    return;
  }
  b.x0[i] = x0;
  b.y0[i] = y0;
  b.x1[i] = x1;
  b.y1[i] = y1;
  b.pasada[i] = pasada;
  b.banda[i] = banda;
  b.n = i + 1;
}

function empujarPunta(b: BufferPuntas, pasada: number, banda: number, x: number, y: number, dx: number, dy: number): void {
  const i = b.n;
  if (i >= b.cap) return;
  b.x[i] = x;
  b.y[i] = y;
  b.dx[i] = dx;
  b.dy[i] = dy;
  b.pasada[i] = pasada;
  b.banda[i] = banda;
  b.n = i + 1;
}

/**
 * Un trozo de segmento (extremos 3D y 2D ya proyectados). `h0`/`h1`: estado «oculto» conocido de cada extremo (0/1) o
 * −1 si es desconocido (cruce con la superficie). Se clasifica por el punto medio; si algún extremo conocido discrepa
 * del medio, se parte por la mitad y se repite (bisección hasta PROF_MAX_BISECCION).
 */
function tramo(
  p: Pasadas,
  sup: Superficie,
  buf: BufferSegmentos,
  conPuntas: boolean,
  x0: number,
  y0: number,
  z0: number,
  sx0: number,
  sy0: number,
  pz0: number,
  x1: number,
  y1: number,
  z1: number,
  sx1: number,
  sy1: number,
  pz1: number,
  h0: number,
  h1: number,
  nivel: number,
): void {
  const zc = (p.cam as CamaraProy).zCercano;
  if (pz0 < zc || pz1 < zc) return;
  const mx = (x0 + x1) / 2;
  const my = (y0 + y1) / 2;
  const mz = (z0 + z1) / 2;
  const hm = oculto(p, sup, mx, my, mz);
  if (nivel < PROF_MAX_BISECCION && ((h0 >= 0 && h0 !== hm) || (h1 >= 0 && h1 !== hm))) {
    const t = p.tmp;
    proyectarPunto(p.cam as CamaraProy, mx, my, mz, t, 0);
    tramo(p, sup, buf, conPuntas, x0, y0, z0, sx0, sy0, pz0, mx, my, mz, t[0], t[1], t[2], h0, hm, nivel + 1);
    // `t` se pisa en la recursión: se recalcula
    proyectarPunto(p.cam as CamaraProy, mx, my, mz, t, 0);
    tramo(p, sup, buf, conPuntas, mx, my, mz, t[0], t[1], t[2], x1, y1, z1, sx1, sy1, pz1, hm, h1, nivel + 1);
    return;
  }
  emitir(p, buf, conPuntas, hm ? PASADA_DETRAS : PASADA_DELANTE, sx0, sy0, sx1, sy1, (pz0 + pz1) / 2, mx, my, mz);
}

function emitir(
  p: Pasadas,
  buf: BufferSegmentos,
  conPuntas: boolean,
  pasada: number,
  sx0: number,
  sy0: number,
  sx1: number,
  sy1: number,
  prof: number,
  mx: number,
  my: number,
  mz: number,
): void {
  if (!(Number.isFinite(sx0) && Number.isFinite(sy0) && Number.isFinite(sx1) && Number.isFinite(sy1))) return;
  if (fuera(p, sx0, sy0, sx1, sy1)) return;
  let banda = bandaProf(p, prof);
  if (conPuntas) {
    const distRel = Math.sqrt(mx * mx + my * my + mz * mz) / p.rRef;
    // las líneas se desvanecen al alejarse de la superficie (y se cortan pasado `corteRel`): lo lejano es solo contexto
    if (distRel > p.corteRel) return;
    const bd = distRel < 1.15 ? 3 : distRel < 1.6 ? 2 : distRel < 2.1 ? 1 : 0;
    if (bd < banda) banda = bd;
  }
  if (buf.mid3 && buf.n < buf.cap) {
    buf.mid3[3 * buf.n] = mx;
    buf.mid3[3 * buf.n + 1] = my;
    buf.mid3[3 * buf.n + 2] = mz;
  }
  empujar(buf, pasada, banda, sx0, sy0, sx1, sy1);
  if (conPuntas) {
    const dx = sx1 - sx0;
    const dy = sy1 - sy0;
    const l = Math.hypot(dx, dy);
    if (l > 1e-3) {
      p.acum += l;
      if (p.acum >= p.sigPunta && l >= 2.5) {
        empujarPunta(p.puntas, pasada, banda, (sx0 + sx1) / 2, (sy0 + sy1) / 2, dx / l, dy / l);
        p.sigPunta = p.acum + SEPARACION_PUNTAS_PX;
      }
    }
  }
}

/**
 * Proyecta la escena con la cámara dada y reparte los trozos en pasadas. Escribe en `p` (sin asignar).
 */
export function construirPasadas(p: Pasadas, geom: GeometriaGauss3D, cam: CamaraProy, ancho: number, alto: number): void {
  asegurar(p, geom);
  p.cam = cam;
  const sup = geom.superficie;
  p.ancho = ancho;
  p.alto = alto;
  p.ojo[0] = cam.pos[0];
  p.ojo[1] = cam.pos[1];
  p.ojo[2] = cam.pos[2];
  p.rRef = geom.rEncuadre;
  p.profMin = cam.distancia - geom.rEncuadre;
  p.profRango = 2 * geom.rEncuadre;

  // --- malla: vértices y orientación de caras ---
  const malla = geom.malla;
  const nV = malla.vertices.length / 3;
  proyectarPuntos(cam, malla.vertices, nV, p.vx, p.vy, p.vp);
  const nT = malla.triangulos.length / 3;
  if (sup.tipo === "parche") {
    p.frente.fill(1, 0, nT);
  } else {
    const V = malla.vertices;
    const T = malla.triangulos;
    const N = malla.normalTriangulo;
    const ox = p.ojo[0];
    const oy = p.ojo[1];
    const oz = p.ojo[2];
    for (let k = 0; k < nT; k++) {
      const a = 3 * T[3 * k];
      p.frente[k] = N[3 * k] * (ox - V[a]) + N[3 * k + 1] * (oy - V[a + 1]) + N[3 * k + 2] * (oz - V[a + 2]) > 0 ? 1 : 0;
    }
  }

  // --- cargas, sombras y líneas de caída ---
  p.nCargas = geom.cargas.length;
  p.caida.n = 0;
  p.caida.descartados = 0;
  const t = p.tmp;
  const margenAnt = p.margenPx;
  for (let i = 0; i < p.nCargas; i++) {
    const c = geom.cargas[i];
    proyectarPunto(cam, c.x, c.y, c.z, t, 0);
    p.qx[i] = t[0];
    p.qy[i] = t[1];
    p.qp[i] = t[2];
    p.pasadaCarga[i] = oculto(p, sup, c.x, c.y, c.z) ? PASADA_DETRAS : PASADA_DELANTE;
    proyectarPunto(cam, c.x, c.y, 0, t, 0);
    p.sx[i] = t[0];
    p.sy[i] = t[1];
    p.pasadaSombra[i] = oculto(p, sup, c.x, c.y, 0) ? PASADA_DETRAS : PASADA_DELANTE;
    // línea de caída (carga → suelo): partida en los cruces con la superficie
    p.margenPx = Infinity;
    caida(p, sup, cam, c.x, c.y, c.z, p.qx[i], p.qy[i], p.qp[i], p.sx[i], p.sy[i], t[2]);
    p.margenPx = margenAnt;
  }

  // --- líneas de campo ---
  p.lineas.n = 0;
  p.lineas.descartados = 0;
  p.puntas.n = 0;
  p.marcas.n = 0;
  const L = geom.lineas;
  if (geom.conLineas && L.n > 0) {
    lineas(p, geom, cam);
    marcasCruce(p, geom, cam);
  }

  // --- flechas de campo E ---
  p.campo.n = 0;
  p.puntasCampo.n = 0;
  if (geom.conCampo && geom.nFlechas > 0) flechasCampo(p, geom, cam);

  // --- orden por (pasada, banda) para trazar por lotes ---
  const l = p.lineas;
  ordenarPorClave(l.pasada, l.banda, l.n, l.orden, l.inicio);
  const c = p.caida;
  ordenarPorClave(c.pasada, c.banda, c.n, c.orden, c.inicio);
  const k = p.campo;
  ordenarPorClave(k.pasada, k.banda, k.n, k.orden, k.inicio);
  ordenarPorClave(p.puntas.pasada, p.puntas.banda, p.puntas.n, p.puntas.orden, p.puntas.inicio);
  ordenarPorClave(p.puntasCampo.pasada, p.puntasCampo.banda, p.puntasCampo.n, p.puntasCampo.orden, p.puntasCampo.inicio);
}

function caida(
  p: Pasadas,
  sup: Superficie,
  cam: CamaraProy,
  x: number,
  y: number,
  z: number,
  sx0: number,
  sy0: number,
  pz0: number,
  sx1: number,
  sy1: number,
  pz1: number,
): void {
  const a = p.a3;
  const b = p.b3;
  a[0] = x;
  a[1] = y;
  a[2] = z;
  b[0] = x;
  b[1] = y;
  b[2] = 0;
  const nc = segmentoCruzaSuperficie(sup, a, b, p.cruce);
  const cr = p.cruce;
  // copia local de los t (el buffer de cruce se reutiliza)
  const t0 = nc > 0 ? cr[0] : 0;
  const t1 = nc > 1 ? cr[2] : 0;
  let xa = x;
  let ya = y;
  let za = z;
  let sxa = sx0;
  let sya = sy0;
  let pza = pz0;
  let ha = oculto(p, sup, xa, ya, za);
  const tmp = p.tmp;
  const dz = -z;
  const total = nc + 1;
  for (let k = 0; k < total; k++) {
    let xb: number;
    let yb: number;
    let zb: number;
    let sxb: number;
    let syb: number;
    let pzb: number;
    let hb: number;
    if (k < nc) {
      const tk = k === 0 ? t0 : t1;
      xb = x;
      yb = y;
      zb = z + tk * dz;
      proyectarPunto(cam, xb, yb, zb, tmp, 4);
      sxb = tmp[4];
      syb = tmp[5];
      pzb = tmp[6];
      hb = -1;
    } else {
      xb = x;
      yb = y;
      zb = 0;
      sxb = sx1;
      syb = sy1;
      pzb = pz1;
      hb = oculto(p, sup, xb, yb, zb);
    }
    tramo(p, sup, p.caida, false, xa, ya, za, sxa, sya, pza, xb, yb, zb, sxb, syb, pzb, k === 0 ? ha : -1, hb, 0);
    xa = xb;
    ya = yb;
    za = zb;
    sxa = sxb;
    sya = syb;
    pza = pzb;
    ha = hb;
  }
}

function lineas(p: Pasadas, geom: GeometriaGauss3D, cam: CamaraProy): void {
  const sup = geom.superficie;
  const L = geom.lineas;
  const C = geom.cruces;
  const P = L.puntos;
  const nPts = L.inicio[L.n];
  proyectarPuntos(cam, P, nPts, p.lx, p.ly, p.lp);
  if (C.n > 0) proyectarPuntos(cam, C.posicion, C.n, p.cx, p.cy, p.cp);
  const zc = cam.zCercano;
  let ci = 0;
  for (let l = 0; l < L.n; l++) {
    const i0 = L.inicio[l];
    const i1 = L.inicio[l + 1];
    if (i1 - i0 < 2) continue;
    p.acum = 0;
    p.sigPunta = SEPARACION_PUNTAS_PX * 0.5;
    let hA = oculto(p, sup, P[3 * i0], P[3 * i0 + 1], P[3 * i0 + 2]);
    for (let g = i0; g < i1 - 1; g++) {
      const b = g + 1;
      const hB = oculto(p, sup, P[3 * b], P[3 * b + 1], P[3 * b + 2]);
      // cruces de este segmento (ordenados por t)
      let nc = 0;
      const cA = ci;
      while (ci < C.n && C.segmento[ci] === g) {
        nc++;
        ci++;
      }
      if (p.lp[g] < zc || p.lp[b] < zc) {
        hA = hB; // el estado «oculto» del siguiente tramo parte de este punto, no de uno anterior
        continue;
      }
      let xa = P[3 * g];
      let ya = P[3 * g + 1];
      let za = P[3 * g + 2];
      let sxa = p.lx[g];
      let sya = p.ly[g];
      let pza = p.lp[g];
      for (let k = 0; k <= nc; k++) {
        let xb: number;
        let yb: number;
        let zb: number;
        let sxb: number;
        let syb: number;
        let pzb: number;
        let hb: number;
        if (k < nc) {
          const o = cA + k;
          xb = C.posicion[3 * o];
          yb = C.posicion[3 * o + 1];
          zb = C.posicion[3 * o + 2];
          sxb = p.cx[o];
          syb = p.cy[o];
          pzb = p.cp[o];
          hb = -1;
        } else {
          xb = P[3 * b];
          yb = P[3 * b + 1];
          zb = P[3 * b + 2];
          sxb = p.lx[b];
          syb = p.ly[b];
          pzb = p.lp[b];
          hb = hB;
        }
        tramo(p, sup, p.lineas, true, xa, ya, za, sxa, sya, pza, xb, yb, zb, sxb, syb, pzb, k === 0 ? hA : -1, hb, 0);
        xa = xb;
        ya = yb;
        za = zb;
        sxa = sxb;
        sya = syb;
        pza = pzb;
      }
      hA = hB;
    }
  }
}

/**
 * Marcadores de los cruces: relleno = la línea sale, anillo = entra (no dependen del color); la punta sigue el sentido
 * de E sobre la línea. Delante/detrás: como las flechas de campo, con el punto adelantado un pelo hacia el ojo.
 */
function marcasCruce(p: Pasadas, geom: GeometriaGauss3D, cam: CamaraProy): void {
  const sup = geom.superficie;
  const L = geom.lineas;
  const C = geom.cruces;
  const P = L.puntos;
  const ox = p.ojo[0];
  const oy = p.ojo[1];
  const oz = p.ojo[2];
  const t = p.tmp;
  const M = p.marcas;
  for (let o = 0; o < C.n; o++) {
    if (M.n >= M.cap) return;
    const x = C.posicion[3 * o];
    const y = C.posicion[3 * o + 1];
    const z = C.posicion[3 * o + 2];
    const g = C.segmento[o];
    // dirección 3D de la línea en el cruce (segmento a→b, a favor de E)
    let ux = P[3 * g + 3] - P[3 * g];
    let uy = P[3 * g + 4] - P[3 * g + 1];
    let uz = P[3 * g + 5] - P[3 * g + 2];
    const lu = Math.hypot(ux, uy, uz);
    if (!(lu > 1e-9)) continue;
    ux /= lu;
    uy /= lu;
    uz /= lu;
    proyectarPunto(cam, x, y, z, t, 0);
    proyectarPunto(cam, x + ux * PASO_DIR_MARCA, y + uy * PASO_DIR_MARCA, z + uz * PASO_DIR_MARCA, t, 4);
    if (t[2] < cam.zCercano || t[6] < cam.zCercano) continue;
    const sx = t[0];
    const sy = t[1];
    if (!(Number.isFinite(sx) && Number.isFinite(sy))) continue;
    if (fuera(p, sx, sy, sx, sy)) continue;
    const dx = t[4] - sx;
    const dy = t[5] - sy;
    const l = Math.hypot(dx, dy);
    const nx = x + (ox - x) * 0.002;
    const ny = y + (oy - y) * 0.002;
    const nz = z + (oz - z) * 0.002;
    const i = M.n++;
    M.x[i] = sx;
    M.y[i] = sy;
    M.dx[i] = l > 1e-3 ? dx / l : 0;
    M.dy[i] = l > 1e-3 ? dy / l : 0;
    M.sentido[i] = C.sentido[o];
    M.pasada[i] = oculto(p, sup, nx, ny, nz) ? PASADA_DETRAS : PASADA_DELANTE;
  }
}

/** Longitud (u) de la flecha de campo según |E|/|E|max: raíz para que las débiles sigan viéndose. */
export function longitudFlecha(modulo: number, maxModulo: number, rEncuadre: number): number {
  const m = maxModulo > 0 ? Math.min(1, modulo / maxModulo) : 0;
  return rEncuadre * (0.06 + 0.1 * Math.sqrt(m));
}

function flechasCampo(p: Pasadas, geom: GeometriaGauss3D, cam: CamaraProy): void {
  const sup = geom.superficie;
  const F = geom.flechas;
  const ox = p.ojo[0];
  const oy = p.ojo[1];
  const oz = p.ojo[2];
  const t = p.tmp;
  for (let i = 0; i < geom.nFlechas; i++) {
    const x = F[6 * i];
    const y = F[6 * i + 1];
    const z = F[6 * i + 2];
    const ex = F[6 * i + 3];
    const ey = F[6 * i + 4];
    const ez = F[6 * i + 5];
    const m = Math.hypot(ex, ey, ez);
    if (!(m > 0)) continue;
    const len = longitudFlecha(m, geom.maxModuloFlecha, geom.rEncuadre);
    const h = len / (2 * m);
    // base sobre la superficie: se adelanta un pelo hacia el ojo para decidir «delante/detrás» sin ambigüedad
    const nx = x + (ox - x) * 0.002;
    const ny = y + (oy - y) * 0.002;
    const nz = z + (oz - z) * 0.002;
    const pasada = oculto(p, sup, nx, ny, nz) ? PASADA_DETRAS : PASADA_DELANTE;
    proyectarPunto(cam, x - ex * h, y - ey * h, z - ez * h, t, 0);
    proyectarPunto(cam, x + ex * h, y + ey * h, z + ez * h, t, 4);
    if (t[2] < cam.zCercano || t[6] < cam.zCercano) continue;
    const dx = t[4] - t[0];
    const dy = t[5] - t[1];
    const l = Math.hypot(dx, dy);
    if (!(l > 1e-3) || !Number.isFinite(l)) continue;
    const frac = m / geom.maxModuloFlecha;
    const banda = frac < 0.25 ? 0 : frac < 0.6 ? 1 : 2;
    empujar(p.campo, pasada, banda, t[0], t[1], t[4], t[5]);
    empujarPunta(p.puntasCampo, pasada, banda, t[4], t[5], dx / l, dy / l);
  }
}

/** Cuántos triángulos van a cada pasada de caras: [traseras (pasada 1), delanteras (pasada 3)]. */
export function contarCaras(p: Pasadas, nT: number): [number, number] {
  let delante = 0;
  for (let k = 0; k < nT; k++) delante += p.frente[k];
  return [nT - delante, delante];
}
