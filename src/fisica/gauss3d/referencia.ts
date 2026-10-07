/**
 * Referencias INDEPENDIENTES para los tests de gauss3d (no es parte de la app).
 *
 * Nada de aquí importa código de producción salvo tipos: cuadratura de punto
 * medio de E·n dA, predicados dentro/fuera, intersección rayo–triángulo,
 * generador pseudoaleatorio con semilla y constructores de buffers de prueba.
 * Convención del contrato: ε₀ = 1, E = q (r − r_q) / (4π |r − r_q|³), Φ = q_enc.
 */
import type { Carga3D, Cruces, LineasCampo3D, Superficie } from "./tipos";

export const CUATRO_PI = 4 * Math.PI;

export type V3 = [number, number, number];

/** Mulberry32: PRNG determinista. */
export function prng(semilla: number): () => number {
  let a = semilla >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function normaParche(s: Extract<Superficie, { tipo: "parche" }>): V3 {
  return [
    Math.sin(s.theta) * Math.cos(s.phi),
    Math.sin(s.theta) * Math.sin(s.phi),
    Math.cos(s.theta),
  ];
}
export function ejesParche(s: Extract<Superficie, { tipo: "parche" }>): { u: V3; v: V3; n: V3 } {
  return {
    u: [Math.cos(s.theta) * Math.cos(s.phi), Math.cos(s.theta) * Math.sin(s.phi), -Math.sin(s.theta)],
    v: [-Math.sin(s.phi), Math.cos(s.phi), 0],
    n: normaParche(s),
  };
}

/** Campo (ε₀=1, sin softening) de una lista de cargas en p. */
export function campoRef(p: ArrayLike<number>, cargas: readonly Carga3D[]): V3 {
  let ex = 0;
  let ey = 0;
  let ez = 0;
  for (const c of cargas) {
    const dx = p[0] - c.x;
    const dy = p[1] - c.y;
    const dz = p[2] - c.z;
    const r = Math.hypot(dx, dy, dz);
    const f = c.q / (CUATRO_PI * r * r * r);
    ex += f * dx;
    ey += f * dy;
    ez += f * dz;
  }
  return [ex, ey, ez];
}

/** Radio de la esfera envolvente centrada en el origen (esfera, semidiagonal, hipotenusa, semidiagonal del parche). */
export function radioEnvolventeRef(s: Superficie): number {
  switch (s.tipo) {
    case "esfera":
      return s.radio;
    case "cubo":
      return (s.lado * Math.sqrt(3)) / 2;
    case "cilindro":
      return Math.hypot(s.radio, s.altura / 2);
    case "parche":
      return (s.lado * Math.SQRT2) / 2;
  }
}

/** Radio de la esfera límite de las líneas: R_LIMITE_FACTOR(=3)·R_env + max|r_i| (contrato §3). */
export function rLimiteDe(s: Superficie, cargas: readonly Carga3D[]): number {
  return 3 * radioEnvolventeRef(s) + Math.max(...cargas.map((c) => Math.hypot(c.x, c.y, c.z)));
}

/** Distancia con signo (>0 fuera) EXACTA salvo en cubo/cilindro por fuera de aristas, donde es cota inferior (Chebyshev). Solo cerradas. */
export function distSignoRef(s: Superficie, p: ArrayLike<number>): number {
  switch (s.tipo) {
    case "esfera":
      return Math.hypot(p[0], p[1], p[2]) - s.radio;
    case "cubo":
      return Math.max(Math.abs(p[0]), Math.abs(p[1]), Math.abs(p[2])) - s.lado / 2;
    case "cilindro":
      return Math.max(Math.hypot(p[0], p[1]) - s.radio, Math.abs(p[2]) - s.altura / 2);
    case "parche":
      return NaN;
  }
}

/** ¿p estrictamente dentro de la superficie cerrada? (parche: siempre false) */
export function dentroRef(s: Superficie, p: ArrayLike<number>): boolean {
  return s.tipo !== "parche" && distSignoRef(s, p) < 0;
}

/** Área analítica. */
export function areaRef(s: Superficie): number {
  switch (s.tipo) {
    case "esfera":
      return CUATRO_PI * s.radio * s.radio;
    case "cubo":
      return 6 * s.lado * s.lado;
    case "cilindro":
      return 2 * Math.PI * s.radio * (s.altura + s.radio);
    case "parche":
      return s.lado * s.lado;
  }
}

/** q encerrada (cargas estrictamente dentro). */
export function qEncRef(s: Superficie, cargas: readonly Carga3D[]): number {
  let q = 0;
  for (const c of cargas) if (dentroRef(s, [c.x, c.y, c.z])) q += c.q;
  return q;
}

/** Flujo ∬E·n dA por cuadratura de punto medio. `n` = nº de celdas por dimensión. */
export function cuadraturaRef(s: Superficie, cargas: readonly Carga3D[], n = 160): number {
  let phi = 0;
  const p: V3 = [0, 0, 0];
  const aporta = (nx: number, ny: number, nz: number, dA: number) => {
    const e = campoRef(p, cargas);
    phi += (e[0] * nx + e[1] * ny + e[2] * nz) * dA;
  };
  if (s.tipo === "esfera") {
    const R = s.radio;
    const nph = 2 * n;
    for (let i = 0; i < n; i++) {
      const th = ((i + 0.5) * Math.PI) / n;
      const dA = R * R * Math.sin(th) * (Math.PI / n) * ((2 * Math.PI) / nph);
      for (let j = 0; j < nph; j++) {
        const ph = ((j + 0.5) * 2 * Math.PI) / nph;
        const nx = Math.sin(th) * Math.cos(ph);
        const ny = Math.sin(th) * Math.sin(ph);
        const nz = Math.cos(th);
        p[0] = R * nx;
        p[1] = R * ny;
        p[2] = R * nz;
        aporta(nx, ny, nz, dA);
      }
    }
  } else if (s.tipo === "cubo") {
    const h = s.lado / 2;
    const dA = (s.lado / n) ** 2;
    for (let eje = 0; eje < 3; eje++) {
      for (const sg of [-1, 1]) {
        for (let i = 0; i < n; i++) {
          for (let j = 0; j < n; j++) {
            const a = -h + ((i + 0.5) * s.lado) / n;
            const b = -h + ((j + 0.5) * s.lado) / n;
            const nn: V3 = [0, 0, 0];
            nn[eje] = sg;
            p[eje] = sg * h;
            p[(eje + 1) % 3] = a;
            p[(eje + 2) % 3] = b;
            aporta(nn[0], nn[1], nn[2], dA);
          }
        }
      }
    }
  } else if (s.tipo === "cilindro") {
    const { radio: R, altura: H } = s;
    const nph = 2 * n;
    const dph = (2 * Math.PI) / nph;
    for (let i = 0; i < n; i++) {
      const z = -H / 2 + ((i + 0.5) * H) / n;
      for (let j = 0; j < nph; j++) {
        const ph = (j + 0.5) * dph;
        p[0] = R * Math.cos(ph);
        p[1] = R * Math.sin(ph);
        p[2] = z;
        aporta(Math.cos(ph), Math.sin(ph), 0, R * dph * (H / n));
      }
    }
    for (const sg of [-1, 1]) {
      for (let i = 0; i < n; i++) {
        const r = ((i + 0.5) * R) / n;
        const dA = r * dph * (R / n);
        for (let j = 0; j < nph; j++) {
          const ph = (j + 0.5) * dph;
          p[0] = r * Math.cos(ph);
          p[1] = r * Math.sin(ph);
          p[2] = (sg * H) / 2;
          aporta(0, 0, sg, dA);
        }
      }
    }
  } else {
    const { u, v, n: nrm } = ejesParche(s);
    const dA = (s.lado / n) ** 2;
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        const a = -s.lado / 2 + ((i + 0.5) * s.lado) / n;
        const b = -s.lado / 2 + ((j + 0.5) * s.lado) / n;
        for (let k = 0; k < 3; k++) p[k] = a * u[k] + b * v[k];
        aporta(nrm[0], nrm[1], nrm[2], dA);
      }
    }
  }
  return phi;
}

/** Ángulo sólido del parche cuadrado de lado l, centrado, frente a una carga a distancia d sobre su normal: 4·asin(a²/(a²+d²)), a = l/2. */
export function angSolidoCuadradoCentrado(l: number, d: number): number {
  const a2 = (l / 2) ** 2;
  return 4 * Math.asin(a2 / (a2 + d * d));
}

// ---- Rayos de referencia ----

/** Intervalo [tEntrada,tSalida] de la corrida "dentro" que contiene t=0 o es la primera con fin ≥ 0; muestreo denso + bisección. Solo cerradas. */
export function rayoMuestreoRef(
  s: Superficie,
  o: ArrayLike<number>,
  d: ArrayLike<number>,
  tMin: number,
  tMax: number,
  pasos = 20000,
): { tEntrada: number; tSalida: number } | null {
  const en = (t: number) => dentroRef(s, [o[0] + t * d[0], o[1] + t * d[1], o[2] + t * d[2]]);
  const bis = (a: number, b: number) => {
    // a y b con estados distintos
    const ea = en(a);
    for (let k = 0; k < 80; k++) {
      const m = 0.5 * (a + b);
      if (en(m) === ea) a = m;
      else b = m;
    }
    return 0.5 * (a + b);
  };
  const dt = (tMax - tMin) / pasos;
  let prev = en(tMin);
  let t0 = prev ? tMin : NaN;
  for (let i = 1; i <= pasos; i++) {
    const t = tMin + i * dt;
    const cur = en(t);
    if (cur !== prev) {
      const tc = bis(t - dt, t);
      if (cur) t0 = tc;
      else if (!Number.isNaN(t0) && tc >= 0) return { tEntrada: t0, tSalida: tc };
      else if (!Number.isNaN(t0)) t0 = NaN;
    }
    prev = cur;
  }
  return null;
}

/** Möller–Trumbore: t del rayo o+t·d con el triángulo, o null (|det| pequeño → null). */
export function rayoTriangulo(
  o: ArrayLike<number>,
  d: ArrayLike<number>,
  a: ArrayLike<number>,
  b: ArrayLike<number>,
  c: ArrayLike<number>,
): number | null {
  const e1: V3 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  const e2: V3 = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
  const px = d[1] * e2[2] - d[2] * e2[1];
  const py = d[2] * e2[0] - d[0] * e2[2];
  const pz = d[0] * e2[1] - d[1] * e2[0];
  const det = e1[0] * px + e1[1] * py + e1[2] * pz;
  if (Math.abs(det) < 1e-14) return null;
  const inv = 1 / det;
  const tx = o[0] - a[0];
  const ty = o[1] - a[1];
  const tz = o[2] - a[2];
  const u = (tx * px + ty * py + tz * pz) * inv;
  if (u < 0 || u > 1) return null;
  const qx = ty * e1[2] - tz * e1[1];
  const qy = tz * e1[0] - tx * e1[2];
  const qz = tx * e1[1] - ty * e1[0];
  const v = (d[0] * qx + d[1] * qy + d[2] * qz) * inv;
  if (v < 0 || u + v > 1) return null;
  return (e2[0] * qx + e2[1] * qy + e2[2] * qz) * inv;
}

// ---- Constructores de buffers de prueba ----

/** Construye LineasCampo3D a mano (todas las polilíneas van a favor de E). */
export function construirLineas(
  polis: number[][][],
  extra: { carga?: number[]; signo?: number[]; lineasPorCarga?: [number, number] } = {},
): LineasCampo3D {
  const n = polis.length;
  const inicio = new Uint32Array(n + 1);
  for (let i = 0; i < n; i++) inicio[i + 1] = inicio[i] + polis[i].length;
  const puntos = new Float32Array(3 * inicio[n]);
  polis.forEach((pl, i) => pl.forEach((pt, k) => puntos.set(pt, 3 * (inicio[i] + k))));
  return {
    n,
    inicio,
    puntos,
    carga: Uint8Array.from(extra.carga ?? polis.map(() => 0)),
    signo: Int8Array.from(extra.signo ?? polis.map(() => 1)),
    sentido: Int8Array.from(polis.map(() => 1)),
    fin: Uint8Array.from(polis.map(() => 1)),
    finCarga: Int8Array.from(polis.map(() => -1)),
    lineasPorCarga: Uint16Array.from(extra.lineasPorCarga ?? [n, 0]),
  };
}

/** Cruces vacíos con capacidad dada (para pasar como `out`). */
export function crucesVacios(cap: number): Cruces {
  return {
    n: 0,
    posicion: new Float32Array(3 * cap),
    linea: new Uint32Array(cap),
    segmento: new Uint32Array(cap),
    t: new Float32Array(cap),
    sentido: new Int8Array(cap),
    salen: 0,
    entran: 0,
  };
}

/** Escenarios de referencia (tabla §5 del contrato), independientes de escenarios.ts. */
export function escenarioRef(id: number): { superficie: Superficie; cargas: Carga3D[] } {
  const c = (x: number, y: number, z: number, q: number): Carga3D => ({ x, y, z, q });
  switch (id) {
    case 2:
      return { superficie: { tipo: "esfera", radio: 5 }, cargas: [c(0, 0, 0, 3)] };
    case 3:
      return { superficie: { tipo: "esfera", radio: 5 }, cargas: [c(1.5, 1, 2, 3)] };
    case 5:
      return { superficie: { tipo: "cubo", lado: 8 }, cargas: [c(1, -1, 0.5, 3)] };
    case 6:
      return { superficie: { tipo: "esfera", radio: 5 }, cargas: [c(0, 0, 8, 3)] };
    case 7:
      return { superficie: { tipo: "esfera", radio: 5 }, cargas: [c(-2, 0, 0, 3), c(2, 0, 0, -3)] };
    case 9:
      return { superficie: { tipo: "esfera", radio: 5 }, cargas: [c(0, 0, 0, 4)] };
    default:
      throw new Error(`escenarioRef: ${id}`);
  }
}

/** Posiciones de cargas aleatorias VÁLIDAS (|dist| ≥ 0.4 a la superficie, ≥ 0.8 entre cargas, rangos de §1). */
export function cargasAleatoriasValidas(
  s: Superficie,
  rnd: () => number,
  nCargas: 1 | 2,
): Carga3D[] {
  const res: Carga3D[] = [];
  let guardia = 0;
  while (res.length < nCargas && guardia++ < 10000) {
    const x = (rnd() * 2 - 1) * 12;
    const y = (rnd() * 2 - 1) * 12;
    const z = (rnd() * 2 - 1) * 10;
    if (Math.abs(distSignoRef(s, [x, y, z])) < 0.4) continue;
    if (res.some((o) => Math.hypot(o.x - x, o.y - y, o.z - z) < 0.8)) continue;
    const q = (rnd() < 0.5 ? -1 : 1) * (0.5 + rnd() * 4.5);
    res.push({ x, y, z, q });
  }
  return res;
}
