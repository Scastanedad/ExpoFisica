/**
 * Flujo del campo eléctrico a través de una malla por ángulo sólido exacto (Van Oosterom–Strackee), con la
 * convención ε₀ = 1 del contrato: Φ = Σ q·Ω/(4π), así que Φ = q_enc en superficies cerradas (sin 4π ni softening).
 */
import { campoEn } from "./campo3d";
import { verticesParche64 } from "./mallas";
import { cargasEncerradas } from "./superficies";
import type { Carga3D, MallaSuperficie, ResultadoFlujo, Superficie, Vec3 } from "./tipos";

const CUATRO_PI = 4 * Math.PI;

/** Ángulo sólido (sr) del triángulo ABC visto desde p, con signo según la orientación de ABC (> 0 si su normal se aleja de p). */
export function anguloSolidoTriangulo(p: Vec3, A: Vec3, B: Vec3, C: Vec3): number {
  return omega(A[0] - p[0], A[1] - p[1], A[2] - p[2], B[0] - p[0], B[1] - p[1], B[2] - p[2], C[0] - p[0], C[1] - p[1], C[2] - p[2]);
}

function omega(ax: number, ay: number, az: number, bx: number, by: number, bz: number, cx: number, cy: number, cz: number): number {
  const la = Math.sqrt(ax * ax + ay * ay + az * az);
  const lb = Math.sqrt(bx * bx + by * by + bz * bz);
  const lc = Math.sqrt(cx * cx + cy * cy + cz * cz);
  const triple = ax * (by * cz - bz * cy) + ay * (bz * cx - bx * cz) + az * (bx * cy - by * cx);
  const ab = ax * bx + ay * by + az * bz;
  const ac = ax * cx + ay * cy + az * cz;
  const bc = bx * cx + by * cy + bz * cz;
  const den = la * lb * lc + ab * lc + ac * lb + bc * la;
  return 2 * Math.atan2(triple, den);
}

/** Aporte de una carga al flujo por triángulo k de la malla: q·Ω/(4π). */
function flujoTriangulo(V: ArrayLike<number>, T: Uint32Array, k: number, c: Carga3D): number {
  const a = 3 * T[3 * k];
  const b = 3 * T[3 * k + 1];
  const d = 3 * T[3 * k + 2];
  return (c.q * omega(V[a] - c.x, V[a + 1] - c.y, V[a + 2] - c.z, V[b] - c.x, V[b + 1] - c.y, V[b + 2] - c.z, V[d] - c.x, V[d + 1] - c.y, V[d + 2] - c.z)) / CUATRO_PI;
}

/** Flujo de una carga a través de toda la malla (= q·ΣΩ/(4π)). */
export function flujoPorCarga(malla: MallaSuperficie, c: Carga3D): number {
  const nT = malla.triangulos.length / 3;
  let s = 0;
  for (let k = 0; k < nT; k++) s += flujoTriangulo(malla.vertices, malla.triangulos, k, c);
  return s;
}

/** Flujo total, por carga y por parche de flujo (µC/ε₀), con la densidad E_n medio por parche para el color divergente. */
export function calcularFlujo(malla: MallaSuperficie, cargas: readonly Carga3D[], sup: Superficie): ResultadoFlujo {
  const nT = malla.triangulos.length / 3;
  const nP = malla.nParches;
  // el parche usa vértices Float64 (la malla Float32 es solo para dibujar); las cerradas son estancas y no lo necesitan
  const V: ArrayLike<number> = sup.tipo === "parche" ? verticesParche64(sup.lado, sup.theta, sup.phi, malla.nCeldasU) : malla.vertices;
  const T = malla.triangulos;
  const acc = new Float64Array(nP);
  const porCarga = new Float64Array(cargas.length);
  let total = 0;
  for (let i = 0; i < cargas.length; i++) {
    const c = cargas[i];
    let suma = 0;
    for (let k = 0; k < nT; k++) {
      const f = flujoTriangulo(V, T, k, c);
      suma += f;
      acc[malla.parcheDeTriangulo[k]] += f;
    }
    porCarga[i] = suma;
    total += suma;
  }
  const porParche = new Float32Array(nP);
  const densidadParche = new Float32Array(nP);
  for (let p = 0; p < nP; p++) {
    porParche[p] = acc[p];
    densidadParche[p] = acc[p] / malla.areaParche[p];
  }
  let qEnc = 0;
  for (const i of cargasEncerradas(sup, cargas)) qEnc += cargas[i].q;
  return { total, qEnc, porCarga, porParche, densidadParche, maxAbsDensidad: topeDensidad(densidadParche) };
}

/** Percentil 98 de |densidad|: satura la paleta sin que un parche junto a una carga la aplaste. */
function topeDensidad(d: Float32Array): number {
  const n = d.length;
  if (n === 0) return 0;
  const a = new Float32Array(n);
  for (let i = 0; i < n; i++) a[i] = Math.abs(d[i]);
  a.sort();
  return a[Math.min(n - 1, Math.floor(0.98 * n))];
}

const pTmp: [number, number, number] = [0, 0, 0];
const eTmp = new Float64Array(3);

/**
 * Φ = ∬ E·n dA por cuadratura de punto medio con `n` celdas por dimensión (E sin softening, ε = 1e-12).
 * Solo para tests y verificación: no se usa en la app.
 */
export function flujoCuadratura(sup: Superficie, cargas: readonly Carga3D[], n = 120): number {
  let phi = 0;
  const aporta = (nx: number, ny: number, nz: number, dA: number) => {
    campoEn(pTmp, cargas, 1e-12, eTmp);
    phi += (eTmp[0] * nx + eTmp[1] * ny + eTmp[2] * nz) * dA;
  };
  switch (sup.tipo) {
    case "esfera": {
      const R = sup.radio;
      const nph = 2 * n;
      for (let i = 0; i < n; i++) {
        const th = ((i + 0.5) * Math.PI) / n;
        const dA = R * R * Math.sin(th) * (Math.PI / n) * ((2 * Math.PI) / nph);
        for (let j = 0; j < nph; j++) {
          const ph = ((j + 0.5) * 2 * Math.PI) / nph;
          const nx = Math.sin(th) * Math.cos(ph);
          const ny = Math.sin(th) * Math.sin(ph);
          const nz = Math.cos(th);
          pTmp[0] = R * nx;
          pTmp[1] = R * ny;
          pTmp[2] = R * nz;
          aporta(nx, ny, nz, dA);
        }
      }
      break;
    }
    case "cubo": {
      const h = sup.lado / 2;
      const dA = (sup.lado / n) ** 2;
      for (let eje = 0; eje < 3; eje++) {
        for (let sg = -1; sg <= 1; sg += 2) {
          for (let i = 0; i < n; i++) {
            for (let j = 0; j < n; j++) {
              const a = -h + ((i + 0.5) * sup.lado) / n;
              const b = -h + ((j + 0.5) * sup.lado) / n;
              pTmp[eje] = sg * h;
              pTmp[(eje + 1) % 3] = a;
              pTmp[(eje + 2) % 3] = b;
              aporta(eje === 0 ? sg : 0, eje === 1 ? sg : 0, eje === 2 ? sg : 0, dA);
            }
          }
        }
      }
      break;
    }
    case "cilindro": {
      const { radio: R, altura: H } = sup;
      const nph = 2 * n;
      const dph = (2 * Math.PI) / nph;
      for (let i = 0; i < n; i++) {
        const z = -H / 2 + ((i + 0.5) * H) / n;
        for (let j = 0; j < nph; j++) {
          const ph = (j + 0.5) * dph;
          pTmp[0] = R * Math.cos(ph);
          pTmp[1] = R * Math.sin(ph);
          pTmp[2] = z;
          aporta(Math.cos(ph), Math.sin(ph), 0, R * dph * (H / n));
        }
      }
      for (let sg = -1; sg <= 1; sg += 2) {
        for (let i = 0; i < n; i++) {
          const r = ((i + 0.5) * R) / n;
          const dA = r * dph * (R / n);
          for (let j = 0; j < nph; j++) {
            const ph = (j + 0.5) * dph;
            pTmp[0] = r * Math.cos(ph);
            pTmp[1] = r * Math.sin(ph);
            pTmp[2] = (sg * H) / 2;
            aporta(0, 0, sg, dA);
          }
        }
      }
      break;
    }
    case "parche": {
      const st = Math.sin(sup.theta);
      const ct = Math.cos(sup.theta);
      const sp = Math.sin(sup.phi);
      const cp = Math.cos(sup.phi);
      const ux = ct * cp;
      const uy = ct * sp;
      const uz = -st;
      const dA = (sup.lado / n) ** 2;
      for (let i = 0; i < n; i++) {
        for (let j = 0; j < n; j++) {
          const a = -sup.lado / 2 + ((i + 0.5) * sup.lado) / n;
          const b = -sup.lado / 2 + ((j + 0.5) * sup.lado) / n;
          pTmp[0] = a * ux - b * sp;
          pTmp[1] = a * uy + b * cp;
          pTmp[2] = a * uz;
          aporta(st * cp, st * sp, ct, dA);
        }
      }
      break;
    }
  }
  return phi;
}
