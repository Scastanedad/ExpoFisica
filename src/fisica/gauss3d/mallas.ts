/**
 * Mallas triangulares cerradas (o plana, el parche) de las superficies, con vértices SOBRE la superficie verdadera
 * y normales exteriores (contrato §2–§3). Cada celda cuadrilátera (anillo/sector en curvas) es un «parche de flujo».
 * Las caras comparten las mismas coordenadas en los bordes, así que la malla es estanca y el ángulo sólido
 * total es exacto (4π dentro, 0 fuera) sea cual sea la resolución.
 */
import type { MallaSuperficie, NivelGauss3D, Superficie } from "./tipos";

const NAN = Number.NaN;

/** Constructor interno: acumula vértices, triángulos y parches con capacidad conocida de antemano. */
class Constructor {
  v: Float32Array;
  t: Uint32Array;
  par: Uint32Array;
  nv = 0;
  nt = 0;
  constructor(maxV: number, maxT: number) {
    this.v = new Float32Array(3 * maxV);
    this.t = new Uint32Array(3 * maxT);
    this.par = new Uint32Array(maxT);
  }
  vert(x: number, y: number, z: number): number {
    const o = 3 * this.nv;
    this.v[o] = x;
    this.v[o + 1] = y;
    this.v[o + 2] = z;
    return this.nv++;
  }
  /**
   * Añade el triángulo (a,b,c) al parche `p`. Si `nx` es finito se orienta hacia (nx,ny,nz); si no, hacia fuera
   * del origen (válido en sólidos convexos que lo contienen).
   */
  tri(a: number, b: number, c: number, p: number, nx: number, ny: number, nz: number): void {
    const V = this.v;
    const ux = V[3 * b] - V[3 * a];
    const uy = V[3 * b + 1] - V[3 * a + 1];
    const uz = V[3 * b + 2] - V[3 * a + 2];
    const wx = V[3 * c] - V[3 * a];
    const wy = V[3 * c + 1] - V[3 * a + 1];
    const wz = V[3 * c + 2] - V[3 * a + 2];
    const cx = uy * wz - uz * wy;
    const cy = uz * wx - ux * wz;
    const cz = ux * wy - uy * wx;
    let rx = nx;
    let ry = ny;
    let rz = nz;
    if (!Number.isFinite(nx)) {
      rx = V[3 * a] + V[3 * b] + V[3 * c];
      ry = V[3 * a + 1] + V[3 * b + 1] + V[3 * c + 1];
      rz = V[3 * a + 2] + V[3 * b + 2] + V[3 * c + 2];
    }
    const o = 3 * this.nt;
    this.t[o] = a;
    if (cx * rx + cy * ry + cz * rz >= 0) {
      this.t[o + 1] = b;
      this.t[o + 2] = c;
    } else {
      this.t[o + 1] = c;
      this.t[o + 2] = b;
    }
    this.par[this.nt] = p;
    this.nt++;
  }
  /** Cuadrilátero a-b-c-d (en orden de contorno) como dos triángulos. */
  quad(a: number, b: number, c: number, d: number, p: number, nx: number, ny: number, nz: number): void {
    this.tri(a, b, c, p, nx, ny, nz);
    this.tri(a, c, d, p, nx, ny, nz);
  }
}

/** Cierra la malla: normales, áreas y centros por parche a partir de la geometría final (Float32). */
function finalizar(
  b: Constructor,
  tipo: MallaSuperficie["tipo"],
  nParches: number,
  nCeldasU: number,
  nCeldasV: number,
  proyectar: ((c: Float64Array, p: number) => void) | null,
): MallaSuperficie {
  const nT = b.nt;
  const vertices = b.v.slice(0, 3 * b.nv);
  const triangulos = b.t.slice(0, 3 * nT);
  const parcheDeTriangulo = b.par.slice(0, nT);
  const normalTriangulo = new Float32Array(3 * nT);
  const area = new Float64Array(nParches);
  const centro = new Float64Array(3 * nParches);
  const cuenta = new Float64Array(nParches);
  const V = vertices;
  for (let k = 0; k < nT; k++) {
    const a = 3 * triangulos[3 * k];
    const bb = 3 * triangulos[3 * k + 1];
    const c = 3 * triangulos[3 * k + 2];
    const ux = V[bb] - V[a];
    const uy = V[bb + 1] - V[a + 1];
    const uz = V[bb + 2] - V[a + 2];
    const wx = V[c] - V[a];
    const wy = V[c + 1] - V[a + 1];
    const wz = V[c + 2] - V[a + 2];
    const cx = uy * wz - uz * wy;
    const cy = uz * wx - ux * wz;
    const cz = ux * wy - uy * wx;
    const m = Math.sqrt(cx * cx + cy * cy + cz * cz);
    normalTriangulo[3 * k] = cx / m;
    normalTriangulo[3 * k + 1] = cy / m;
    normalTriangulo[3 * k + 2] = cz / m;
    const p = parcheDeTriangulo[k];
    area[p] += m / 2;
    centro[3 * p] += V[a] + V[bb] + V[c];
    centro[3 * p + 1] += V[a + 1] + V[bb + 1] + V[c + 1];
    centro[3 * p + 2] += V[a + 2] + V[bb + 2] + V[c + 2];
    cuenta[p] += 3;
  }
  const areaParche = new Float32Array(nParches);
  const centroParche = new Float32Array(3 * nParches);
  const tmp = new Float64Array(3);
  for (let p = 0; p < nParches; p++) {
    areaParche[p] = area[p];
    tmp[0] = centro[3 * p] / cuenta[p];
    tmp[1] = centro[3 * p + 1] / cuenta[p];
    tmp[2] = centro[3 * p + 2] / cuenta[p];
    if (proyectar) proyectar(tmp, p);
    centroParche[3 * p] = tmp[0];
    centroParche[3 * p + 1] = tmp[1];
    centroParche[3 * p + 2] = tmp[2];
  }
  return { tipo, vertices, triangulos, parcheDeTriangulo, nParches, areaParche, normalTriangulo, centroParche, nCeldasU, nCeldasV };
}

function mallaEsfera(R: number, nu: number, nv: number): MallaSuperficie {
  const b = new Constructor(2 + (nu - 1) * nv, 2 * nu * nv);
  const cosF = new Float64Array(nv);
  const sinF = new Float64Array(nv);
  for (let j = 0; j < nv; j++) {
    cosF[j] = Math.cos((2 * Math.PI * j) / nv);
    sinF[j] = Math.sin((2 * Math.PI * j) / nv);
  }
  const norte = b.vert(0, 0, R);
  const anillo0 = b.nv;
  for (let i = 1; i < nu; i++) {
    const th = (Math.PI * i) / nu;
    const rho = R * Math.sin(th);
    const z = R * Math.cos(th);
    for (let j = 0; j < nv; j++) b.vert(rho * cosF[j], rho * sinF[j], z);
  }
  const sur = b.vert(0, 0, -R);
  const idx = (i: number, j: number) => anillo0 + (i - 1) * nv + (j % nv);
  for (let j = 0; j < nv; j++) b.tri(norte, idx(1, j), idx(1, j + 1), j, NAN, 0, 0);
  for (let i = 1; i < nu - 1; i++) {
    for (let j = 0; j < nv; j++) b.quad(idx(i, j), idx(i + 1, j), idx(i + 1, j + 1), idx(i, j + 1), i * nv + j, NAN, 0, 0);
  }
  for (let j = 0; j < nv; j++) b.tri(sur, idx(nu - 1, j + 1), idx(nu - 1, j), (nu - 1) * nv + j, NAN, 0, 0);
  return finalizar(b, "esfera", nu * nv, nv, nu, (c) => {
    const r = Math.hypot(c[0], c[1], c[2]);
    if (r > 0) {
      const f = R / r;
      c[0] *= f;
      c[1] *= f;
      c[2] *= f;
    }
  });
}

type MapaCara = (a: number, b: number, fijo: number) => [number, number, number];

/** Rejilla c×c de una cara plana de lado L (coordenadas a,b ∈ [−L/2, L/2]); no comparte índices con otras caras. */
function caraPlana(
  b: Constructor,
  c: number,
  L: number,
  fijo: number,
  mapa: MapaCara,
  parche0: number,
  nx: number,
  ny: number,
  nz: number,
): void {
  const base = b.nv;
  const h = L / 2;
  const coord = (i: number) => (i === 0 ? -h : i === c ? h : -h + (i * L) / c);
  for (let i = 0; i <= c; i++) {
    for (let j = 0; j <= c; j++) {
      const p = mapa(coord(i), coord(j), fijo);
      b.vert(p[0], p[1], p[2]);
    }
  }
  const id = (i: number, j: number) => base + i * (c + 1) + j;
  for (let i = 0; i < c; i++) {
    for (let j = 0; j < c; j++) b.quad(id(i, j), id(i + 1, j), id(i + 1, j + 1), id(i, j + 1), parche0 + i * c + j, nx, ny, nz);
  }
}

function mallaCubo(lado: number, c: number): MallaSuperficie {
  const b = new Constructor(6 * (c + 1) * (c + 1), 12 * c * c);
  const h = lado / 2;
  const mapas: MapaCara[] = [
    (a, bb, f) => [f, a, bb],
    (a, bb, f) => [bb, f, a],
    (a, bb, f) => [a, bb, f],
  ];
  let cara = 0;
  for (let eje = 0; eje < 3; eje++) {
    for (let sg = -1; sg <= 1; sg += 2) {
      caraPlana(b, c, lado, sg * h, mapas[eje], cara * c * c, eje === 0 ? sg : 0, eje === 1 ? sg : 0, eje === 2 ? sg : 0);
      cara++;
    }
  }
  return finalizar(b, "cubo", 6 * c * c, c, 6 * c, null);
}

/**
 * Vértices del parche en doble precisión (misma rejilla (c+1)² y mismo orden que la malla Float32). El flujo los usa
 * para que un parche inclinado con la carga casi en su plano no sufra el redondeo Float32 de la malla de dibujo.
 */
export function verticesParche64(lado: number, theta: number, phi: number, c: number): Float64Array {
  const st = Math.sin(theta);
  const ct = Math.cos(theta);
  const sp = Math.sin(phi);
  const cp = Math.cos(phi);
  const ux = ct * cp;
  const uy = ct * sp;
  const uz = -st;
  const vx = -sp;
  const vy = cp;
  const h = lado / 2;
  const out = new Float64Array(3 * (c + 1) * (c + 1));
  for (let i = 0; i <= c; i++) {
    const a = i === 0 ? -h : i === c ? h : -h + (i * lado) / c;
    for (let j = 0; j <= c; j++) {
      const b = j === 0 ? -h : j === c ? h : -h + (j * lado) / c;
      const o = 3 * (i * (c + 1) + j);
      out[o] = a * ux + b * vx;
      out[o + 1] = a * uy + b * vy;
      out[o + 2] = a * uz;
    }
  }
  return out;
}

function mallaParche(lado: number, theta: number, phi: number, c: number): MallaSuperficie {
  const b = new Constructor((c + 1) * (c + 1), 2 * c * c);
  const st = Math.sin(theta);
  const ct = Math.cos(theta);
  const sp = Math.sin(phi);
  const cp = Math.cos(phi);
  // û = (cosθ cosφ, cosθ sinφ, −sinθ), v̂ = (−sinφ, cosφ, 0)
  const ux = ct * cp;
  const uy = ct * sp;
  const uz = -st;
  const vx = -sp;
  const vy = cp;
  caraPlana(b, c, lado, 0, (a, bb) => [a * ux + bb * vx, a * uy + bb * vy, a * uz], 0, st * cp, st * sp, ct);
  return finalizar(b, "parche", c * c, c, c, null);
}

function mallaCilindro(R: number, H: number, nz: number, nphi: number): MallaSuperficie {
  const nr = nz; // anillos por tapa
  const hz = H / 2;
  const maxV = (nz + 1) * nphi + 2 * (1 + nr * nphi);
  const maxT = 2 * nz * nphi + 2 * (nphi + 2 * (nr - 1) * nphi);
  const b = new Constructor(maxV, maxT);
  const cosF = new Float64Array(nphi);
  const sinF = new Float64Array(nphi);
  for (let j = 0; j < nphi; j++) {
    cosF[j] = Math.cos((2 * Math.PI * j) / nphi);
    sinF[j] = Math.sin((2 * Math.PI * j) / nphi);
  }
  const cuerpo0 = b.nv;
  for (let i = 0; i <= nz; i++) {
    const z = i === 0 ? -hz : i === nz ? hz : -hz + (i * H) / nz;
    for (let j = 0; j < nphi; j++) b.vert(R * cosF[j], R * sinF[j], z);
  }
  const ic = (i: number, j: number) => cuerpo0 + i * nphi + (j % nphi);
  for (let i = 0; i < nz; i++) {
    for (let j = 0; j < nphi; j++) b.quad(ic(i, j), ic(i, j + 1), ic(i + 1, j + 1), ic(i + 1, j), i * nphi + j, NAN, 0, 0);
  }
  let parche = nz * nphi;
  for (let sg = -1; sg <= 1; sg += 2) {
    const z = sg * hz;
    const centro = b.vert(0, 0, z);
    const anillo0 = b.nv;
    for (let k = 1; k <= nr; k++) {
      const r = k === nr ? R : (R * k) / nr;
      for (let j = 0; j < nphi; j++) b.vert(r * cosF[j], r * sinF[j], z);
    }
    const ir = (k: number, j: number) => anillo0 + (k - 1) * nphi + (j % nphi);
    for (let j = 0; j < nphi; j++) b.tri(centro, ir(1, j), ir(1, j + 1), parche + j, 0, 0, sg);
    for (let k = 1; k < nr; k++) {
      for (let j = 0; j < nphi; j++) b.quad(ir(k, j), ir(k + 1, j), ir(k + 1, j + 1), ir(k, j + 1), parche + k * nphi + j, 0, 0, sg);
    }
    parche += nr * nphi;
  }
  return finalizar(b, "cilindro", parche, nphi, nz + 2 * nr, (c, p) => {
    if (p < nz * nphi) {
      const rho = Math.hypot(c[0], c[1]);
      if (rho > 0) {
        const f = R / rho;
        c[0] *= f;
        c[1] *= f;
      }
    }
  });
}

/** Malla de la superficie con la resolución del nivel de calidad. Determinista. */
export function generarMalla(s: Superficie, nivel: NivelGauss3D): MallaSuperficie {
  switch (s.tipo) {
    case "esfera":
      return mallaEsfera(s.radio, nivel.mallaEsfera[0], nivel.mallaEsfera[1]);
    case "cubo":
      return mallaCubo(s.lado, nivel.celdasCara);
    case "parche":
      return mallaParche(s.lado, s.theta, s.phi, nivel.celdasCara);
    case "cilindro":
      return mallaCilindro(s.radio, s.altura, nivel.celdasCilindro[0], nivel.celdasCilindro[1]);
  }
}
