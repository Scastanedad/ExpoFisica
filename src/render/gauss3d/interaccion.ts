/**
 * Geometría de la interacción con el lienzo 3D (sin DOM): del píxel al rayo de la cámara, rayo contra el plano
 * horizontal de una carga (arrastre en el plano), zona de agarre y dirección de las flechas del teclado según la
 * vista. Inversa exacta de `proyectarPunto` (`camara.ts`).
 */
import type { CamaraProy } from "./camara";

/** Zona de agarre mínima de una carga: radio de 22 px CSS = objetivo táctil de 44 px (WCAG 2.5.5). */
export const RADIO_AGARRE_MIN_PX = 22;

/**
 * Rayo del ojo que pasa por el píxel (sx, sy). Escribe origen (ojo) y dirección (no unitaria, componente de
 * profundidad = 1 en coordenadas de cámara) en `o` y `d`.
 */
export function rayoDePantalla(cam: CamaraProy, sx: number, sy: number, o: Float64Array, d: Float64Array): void {
  const R = cam.R;
  const a = (sx - cam.cx) / cam.fPx;
  const b = -(sy - cam.cy) / cam.fPx;
  // mundo = Rᵀ · (a, b, 1): filas de R = derecha, arriba, adelante
  d[0] = R[0] * a + R[3] * b + R[6];
  d[1] = R[1] * a + R[4] * b + R[7];
  d[2] = R[2] * a + R[5] * b + R[8];
  o[0] = cam.pos[0];
  o[1] = cam.pos[1];
  o[2] = cam.pos[2];
}

/**
 * Corte del rayo con el plano horizontal z = `z`. Devuelve true y escribe (x, y) en `out` si el corte está delante
 * del ojo (por encima del horizonte, o con el rayo paralelo al plano, no hay corte).
 */
export function cortePlanoHorizontal(o: Float64Array, d: Float64Array, z: number, out: Float64Array): boolean {
  if (Math.abs(d[2]) < 1e-9) return false;
  const t = (z - o[2]) / d[2];
  if (!(t > 0) || !Number.isFinite(t)) return false;
  out[0] = o[0] + t * d[0];
  out[1] = o[1] + t * d[1];
  return true;
}

const O = new Float64Array(3);
const D = new Float64Array(3);

/** (x, y) del punto del plano z = `z` que se ve en el píxel (sx, sy), o null. Escribe en `out` (2 floats). */
export function puntoEnPlano(cam: CamaraProy, sx: number, sy: number, z: number, out: Float64Array): boolean {
  rayoDePantalla(cam, sx, sy, O, D);
  return cortePlanoHorizontal(O, D, z, out);
}

/** Radio de agarre (px): el mayor entre el mínimo táctil y el disco dibujado con holgura. */
export function radioAgarre3D(radioDisco: number): number {
  return Math.max(RADIO_AGARRE_MIN_PX, radioDisco + 8);
}

/**
 * Índice de la carga más cercana a (sx, sy) dentro de su zona de agarre, o -1. Con dos cargas solapadas elige la más
 * cercana al ojo (menor profundidad) si están a menos de 4 px entre sí; si no, la más cercana al puntero.
 */
export function cargaBajoPuntero(
  sx: number,
  sy: number,
  qx: ArrayLike<number>,
  qy: ArrayLike<number>,
  qp: ArrayLike<number>,
  n: number,
  radios: ArrayLike<number>,
): number {
  let mejor = -1;
  let mejorD = Infinity;
  for (let i = 0; i < n; i++) {
    const dist = Math.hypot(sx - qx[i], sy - qy[i]);
    if (dist > radioAgarre3D(radios[i])) continue;
    if (mejor < 0 || dist < mejorD - 4 || (Math.abs(dist - mejorD) <= 4 && qp[i] < qp[mejor])) {
      mejor = i;
      mejorD = dist;
    }
  }
  return mejor;
}

/** Dirección horizontal (unitaria) de una flecha del teclado relativa a la vista: ↑ = alejarse, → = a la derecha. */
export function direccionTeclado(tecla: string, azimut: number): [number, number] | null {
  const ca = Math.cos(azimut);
  const sa = Math.sin(azimut);
  switch (tecla) {
    case "ArrowRight":
      return [ca, sa];
    case "ArrowLeft":
      return [-ca, -sa];
    case "ArrowUp":
      return [-sa, ca];
    case "ArrowDown":
      return [sa, -ca];
    default:
      return null;
  }
}
