/**
 * Campo eléctrico 3D con la convención ε₀ = 1 (contrato §1): E = q (r − r_q) / (4π (|r − r_q|² + soft2)^{3/2}),
 * en (µC/ε₀)/u². Con ella Φ = q_enc exactamente. El softening solo sirve para dibujar flechas y trazar líneas.
 */
import { SOFT2_3D } from "./constantes";
import type { Carga3D, Superficie, Vec3 } from "./tipos";

const INV_4PI = 1 / (4 * Math.PI);
const ANGULO_AUREO = Math.PI * (3 - Math.sqrt(5));

/** E de una sola carga en `p`, escrito en `out` (se sobrescribe). */
export function campoCarga(
  p: Vec3,
  c: Carga3D,
  soft2: number = SOFT2_3D,
  out: Float64Array = new Float64Array(3),
): Float64Array {
  const dx = p[0] - c.x;
  const dy = p[1] - c.y;
  const dz = p[2] - c.z;
  const r2 = dx * dx + dy * dy + dz * dz + soft2;
  const f = (c.q * INV_4PI) / (r2 * Math.sqrt(r2));
  out[0] = f * dx;
  out[1] = f * dy;
  out[2] = f * dz;
  return out;
}

/** E total (superposición) en `p`, escrito en `out` (se sobrescribe, no acumula). */
export function campoEn(
  p: Vec3,
  cargas: readonly Carga3D[],
  soft2: number = SOFT2_3D,
  out: Float64Array = new Float64Array(3),
): Float64Array {
  let ex = 0;
  let ey = 0;
  let ez = 0;
  for (let i = 0; i < cargas.length; i++) {
    const c = cargas[i];
    const dx = p[0] - c.x;
    const dy = p[1] - c.y;
    const dz = p[2] - c.z;
    const r2 = dx * dx + dy * dy + dz * dz + soft2;
    const f = (c.q * INV_4PI) / (r2 * Math.sqrt(r2));
    ex += f * dx;
    ey += f * dy;
    ez += f * dz;
  }
  out[0] = ex;
  out[1] = ey;
  out[2] = ez;
  return out;
}

export function modulo(E: Float64Array): number {
  return Math.sqrt(E[0] * E[0] + E[1] * E[1] + E[2] * E[2]);
}

const pTmp: [number, number, number] = [0, 0, 0];
const eTmp = new Float64Array(3);

function escribirFlecha(out: Float32Array, k: number, cargas: readonly Carga3D[], x: number, y: number, z: number): void {
  pTmp[0] = x;
  pTmp[1] = y;
  pTmp[2] = z;
  campoEn(pTmp, cargas, SOFT2_3D, eTmp);
  const o = 6 * k;
  out[o] = x;
  out[o + 1] = y;
  out[o + 2] = z;
  out[o + 3] = eTmp[0];
  out[o + 4] = eTmp[1];
  out[o + 5] = eTmp[2];
}

/**
 * Puntos de muestreo repartidos sobre la superficie con el vector E en cada uno.
 * Layout: 6 floats por flecha (x, y, z, Ex, Ey, Ez). Devuelve el nº de flechas (≤ tope).
 */
export function muestrearFlechas(sup: Superficie, cargas: readonly Carga3D[], tope: number, out: Float32Array): number {
  tope = Math.min(Math.floor(tope), Math.floor(out.length / 6));
  if (tope <= 0) return 0;
  let n = 0;
  switch (sup.tipo) {
    case "esfera": {
      const R = sup.radio;
      for (let i = 0; i < tope; i++) {
        const z = 1 - (2 * i + 1) / tope;
        const r = Math.sqrt(Math.max(0, 1 - z * z));
        const f = i * ANGULO_AUREO;
        escribirFlecha(out, n++, cargas, R * r * Math.cos(f), R * r * Math.sin(f), R * z);
      }
      break;
    }
    case "cubo": {
      const k = Math.max(1, Math.floor(Math.sqrt(tope / 6)));
      if (6 * k * k > tope) break;
      const h = sup.lado / 2;
      for (let eje = 0; eje < 3; eje++) {
        for (let sg = -1; sg <= 1; sg += 2) {
          for (let i = 0; i < k; i++) {
            for (let j = 0; j < k; j++) {
              const a = -h + ((i + 0.5) * sup.lado) / k;
              const b = -h + ((j + 0.5) * sup.lado) / k;
              const x = eje === 0 ? sg * h : eje === 1 ? b : a;
              const y = eje === 1 ? sg * h : eje === 0 ? a : b;
              const z = eje === 2 ? sg * h : eje === 0 ? b : a;
              escribirFlecha(out, n++, cargas, x, y, z);
            }
          }
        }
      }
      break;
    }
    case "cilindro": {
      const R = sup.radio;
      const H = sup.altura;
      const areaCuerpo = 2 * Math.PI * R * H;
      const areaTotal = areaCuerpo + 2 * Math.PI * R * R;
      const mCuerpo = Math.max(1, Math.round((tope * areaCuerpo) / areaTotal));
      const nphi = Math.max(3, Math.round(Math.sqrt((mCuerpo * 2 * Math.PI * R) / H)));
      const nz = Math.max(1, Math.floor(mCuerpo / nphi));
      for (let i = 0; i < nz && n < tope; i++) {
        const z = -H / 2 + ((i + 0.5) * H) / nz;
        for (let j = 0; j < nphi && n < tope; j++) {
          const f = ((j + 0.5) * 2 * Math.PI) / nphi;
          escribirFlecha(out, n++, cargas, R * Math.cos(f), R * Math.sin(f), z);
        }
      }
      const mTapa = Math.floor((tope - n) / 2);
      for (let sg = -1; sg <= 1; sg += 2) {
        for (let i = 0; i < mTapa; i++) {
          const r = R * Math.sqrt((i + 0.5) / mTapa);
          const f = i * ANGULO_AUREO;
          escribirFlecha(out, n++, cargas, r * Math.cos(f), r * Math.sin(f), (sg * H) / 2);
        }
      }
      break;
    }
    case "parche": {
      const k = Math.max(1, Math.floor(Math.sqrt(tope)));
      const st = Math.sin(sup.theta);
      const ct = Math.cos(sup.theta);
      const sp = Math.sin(sup.phi);
      const cp = Math.cos(sup.phi);
      // û = (cosθ cosφ, cosθ sinφ, −sinθ), v̂ = (−sinφ, cosφ, 0)
      for (let i = 0; i < k; i++) {
        for (let j = 0; j < k; j++) {
          const a = -sup.lado / 2 + ((i + 0.5) * sup.lado) / k;
          const b = -sup.lado / 2 + ((j + 0.5) * sup.lado) / k;
          escribirFlecha(out, n++, cargas, a * ct * cp - b * sp, a * ct * sp + b * cp, -a * st);
        }
      }
      break;
    }
  }
  return n;
}
