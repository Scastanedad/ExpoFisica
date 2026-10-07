/**
 * Cámara de la estación Ley de Gauss (contrato §2 `Camara`/`CamaraDerivada`): órbita alrededor del origen
 * (la superficie está fija en él), z arriba, perspectiva suave y auto-encuadre. Sin DOM, sin asignaciones
 * en la proyección: todo se escribe en buffers recibidos (Float32Array preasignados).
 *
 * Convención: con azimut 0 el ojo está en −y mirando hacia +y (x a la derecha); el azimut gira el ojo alrededor de z;
 * la inclinación es el ángulo del ojo sobre el suelo (clamp [15°, 85°]).
 *   derecha  r = ( cos a,  sin a, 0)
 *   adelante f = (−cos e sin a, cos e cos a, −sin e)
 *   arriba   u = r × f = (−sin e sin a, sin e cos a, cos e)
 * Coordenadas de cámara de un punto p: (r·p, u·p, f·p + D) con D = distancia del ojo al origen.
 */
import type { Camara, CamaraDerivada, Vec3M } from "../../fisica/gauss3d/tipos";

export const INCLINACION_MIN = (15 * Math.PI) / 180;
export const INCLINACION_MAX = (85 * Math.PI) / 180;
/** Fracción del semialto/semiancho útil que ocupa la esfera de encuadre (deja margen a la perspectiva y a las etiquetas). */
export const FACTOR_ENCUADRE = 0.92;
/** Los puntos más cerca del ojo que esta fracción de D no se dibujan (plano de recorte cercano). */
export const FRACCION_PLANO_CERCANO = 0.15;

export const FOV_DEF = 35;
export const ZOOM_MIN = 0.5;
export const ZOOM_MAX = 2.5;

/** Cámara derivada + centro de pantalla (lo que necesita la proyección). */
export interface CamaraProy extends CamaraDerivada {
  /** Centro del canvas en px lógicos. */
  cx: number;
  cy: number;
  /** Profundidad mínima (px de cámara: unidades de mundo) por debajo de la cual un punto se descarta. */
  zCercano: number;
}

export function limitarInclinacion(rad: number): number {
  return Math.min(INCLINACION_MAX, Math.max(INCLINACION_MIN, rad));
}

export function crearCamaraProy(): CamaraProy {
  return {
    pos: [0, 0, 0],
    R: new Float32Array(9),
    distancia: 1,
    fPx: 1,
    encuadre: 1,
    cx: 0,
    cy: 0,
    zCercano: 0,
  };
}

/**
 * Calcula la cámara derivada. `rEncuadre` = radio (u) de la esfera que debe caber en el canvas con zoom 1
 * (superficie y cargas). Escribe en `out` y lo devuelve.
 */
export function derivarCamara(cam: Camara, rEncuadre: number, out: CamaraProy): CamaraProy {
  const a = cam.azimut;
  const e = limitarInclinacion(cam.inclinacion);
  const ca = Math.cos(a);
  const sa = Math.sin(a);
  const ce = Math.cos(e);
  const se = Math.sin(e);
  const R = out.R;
  // derecha
  R[0] = ca;
  R[1] = sa;
  R[2] = 0;
  // arriba
  R[3] = -se * sa;
  R[4] = se * ca;
  R[5] = ce;
  // adelante
  R[6] = -ce * sa;
  R[7] = ce * ca;
  R[8] = -se;
  const rEnc = Math.max(rEncuadre, 1e-6);
  const tanMedio = Math.tan((Math.max(5, Math.min(90, cam.fov)) * Math.PI) / 360);
  const D = rEnc / tanMedio;
  const encuadre = (FACTOR_ENCUADRE * 0.5 * Math.min(cam.ancho, cam.alto) * Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, cam.zoom))) / rEnc;
  out.distancia = D;
  out.encuadre = encuadre;
  out.fPx = encuadre * D;
  // el ojo está en −f·D
  const pos = out.pos as unknown as Vec3M;
  pos[0] = -R[6] * D;
  pos[1] = -R[7] * D;
  pos[2] = -R[8] * D;
  out.cx = cam.ancho / 2;
  out.cy = cam.alto / 2;
  out.zCercano = FRACCION_PLANO_CERCANO * D;
  return out;
}

/**
 * Proyecta un punto de mundo: escribe (sx, sy, profundidad) en `out[k], out[k+1], out[k+2]`. La profundidad es la
 * distancia a lo largo del eje de la cámara (unidades de mundo); si es < `zCercano` el punto no es dibujable
 * (sx, sy se calculan con la profundidad recortada para que sigan siendo finitos).
 */
export function proyectarPunto(c: CamaraProy, x: number, y: number, z: number, out: Float32Array | Float64Array, k: number): void {
  const R = c.R;
  const xc = R[0] * x + R[1] * y + R[2] * z;
  const yc = R[3] * x + R[4] * y + R[5] * z;
  const zc = R[6] * x + R[7] * y + R[8] * z + c.distancia;
  const zr = zc < c.zCercano ? c.zCercano : zc;
  const s = c.fPx / zr;
  out[k] = c.cx + xc * s;
  out[k + 1] = c.cy - yc * s;
  out[k + 2] = zc;
}

/**
 * Proyecta `n` puntos (3 floats cada uno) a los buffers `xs`, `ys`, `prof` (índice = índice del punto).
 */
export function proyectarPuntos(
  c: CamaraProy,
  p: ArrayLike<number>,
  n: number,
  xs: Float32Array,
  ys: Float32Array,
  prof: Float32Array,
): void {
  const R = c.R;
  const r0 = R[0];
  const r1 = R[1];
  const r2 = R[2];
  const u0 = R[3];
  const u1 = R[4];
  const u2 = R[5];
  const f0 = R[6];
  const f1 = R[7];
  const f2 = R[8];
  const D = c.distancia;
  const fPx = c.fPx;
  const cx = c.cx;
  const cy = c.cy;
  const zn = c.zCercano;
  for (let i = 0; i < n; i++) {
    const x = p[3 * i];
    const y = p[3 * i + 1];
    const z = p[3 * i + 2];
    const zc = f0 * x + f1 * y + f2 * z + D;
    const zr = zc < zn ? zn : zc;
    const s = fPx / zr;
    xs[i] = cx + (r0 * x + r1 * y + r2 * z) * s;
    ys[i] = cy - (u0 * x + u1 * y + u2 * z) * s;
    prof[i] = zc;
  }
}

/** Escala local (px por u) en el punto de profundidad `zc` (perspectiva). */
export function escalaEnProfundidad(c: CamaraProy, zc: number): number {
  return c.fPx / Math.max(zc, c.zCercano);
}
