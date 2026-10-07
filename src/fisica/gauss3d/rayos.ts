/**
 * Intersección de rayos y segmentos con las superficies (contrato §3). Sin asignaciones en los caminos calientes:
 * el núcleo escribe en variables de módulo (`T0`, `T1`) y las funciones públicas lo envuelven.
 */
import type { Superficie, Vec3 } from "./tipos";

let T0 = 0;
let T1 = 0;
const EPS_PARALELO = 1e-14;

/**
 * Intervalo [T0, T1] del rayo o + t·d dentro del sólido cerrado (convexo) o, para el parche, T0 = T1 = t del plano si
 * el punto cae en el cuadrado y t ≥ 0. Devuelve false si no hay intersección o el sólido queda detrás (T1 < 0).
 * Con `tMax` finito, también false si T0 > tMax. No normaliza `d`.
 */
function intervalo(s: Superficie, ox: number, oy: number, oz: number, dx: number, dy: number, dz: number, tMax: number): boolean {
  let t0 = -Infinity;
  let t1 = Infinity;
  switch (s.tipo) {
    case "esfera": {
      const a = dx * dx + dy * dy + dz * dz;
      if (a === 0) return false;
      const b = ox * dx + oy * dy + oz * dz;
      const c = ox * ox + oy * oy + oz * oz - s.radio * s.radio;
      const disc = b * b - a * c;
      if (disc < 0) return false;
      const sq = Math.sqrt(disc);
      t0 = (-b - sq) / a;
      t1 = (-b + sq) / a;
      break;
    }
    case "cubo": {
      const h = s.lado / 2;
      for (let k = 0; k < 3; k++) {
        const o = k === 0 ? ox : k === 1 ? oy : oz;
        const d = k === 0 ? dx : k === 1 ? dy : dz;
        if (Math.abs(d) < EPS_PARALELO) {
          if (Math.abs(o) > h) return false;
        } else {
          let ta = (-h - o) / d;
          let tb = (h - o) / d;
          if (ta > tb) {
            const tmp = ta;
            ta = tb;
            tb = tmp;
          }
          if (ta > t0) t0 = ta;
          if (tb < t1) t1 = tb;
        }
      }
      if (t0 > t1) return false;
      break;
    }
    case "cilindro": {
      const hz = s.altura / 2;
      // cuerpo infinito x²+y² ≤ R²
      const a = dx * dx + dy * dy;
      const c = ox * ox + oy * oy - s.radio * s.radio;
      if (a < EPS_PARALELO * EPS_PARALELO) {
        if (c > 0) return false;
      } else {
        const b = ox * dx + oy * dy;
        const disc = b * b - a * c;
        if (disc < 0) return false;
        const sq = Math.sqrt(disc);
        t0 = (-b - sq) / a;
        t1 = (-b + sq) / a;
      }
      // losa |z| ≤ hz
      if (Math.abs(dz) < EPS_PARALELO) {
        if (Math.abs(oz) > hz) return false;
      } else {
        let ta = (-hz - oz) / dz;
        let tb = (hz - oz) / dz;
        if (ta > tb) {
          const tmp = ta;
          ta = tb;
          tb = tmp;
        }
        if (ta > t0) t0 = ta;
        if (tb < t1) t1 = tb;
      }
      if (t0 > t1) return false;
      break;
    }
    case "parche": {
      const st = Math.sin(s.theta);
      const ct = Math.cos(s.theta);
      const sp = Math.sin(s.phi);
      const cp = Math.cos(s.phi);
      const nx = st * cp;
      const ny = st * sp;
      const nz = ct;
      const dn = dx * nx + dy * ny + dz * nz;
      if (Math.abs(dn) < EPS_PARALELO) return false;
      const t = -(ox * nx + oy * ny + oz * nz) / dn;
      if (t < 0 || t > tMax) return false;
      const px = ox + t * dx;
      const py = oy + t * dy;
      const pz = oz + t * dz;
      // û = (cosθ cosφ, cosθ sinφ, −sinθ), v̂ = (−sinφ, cosφ, 0)
      const a = px * ct * cp + py * ct * sp - pz * st;
      const b = -px * sp + py * cp;
      const m = s.lado / 2;
      if (!(Math.abs(a) < m && Math.abs(b) < m)) return false;
      T0 = t;
      T1 = t;
      return true;
    }
  }
  if (t1 < 0 || t0 > tMax) return false;
  T0 = t0;
  T1 = t1;
  return true;
}

/** Intervalo del rayo o + t·d dentro de la superficie, o null. `tEntrada` puede ser < 0 si el origen está dentro. */
export function rayoSuperficie(
  s: Superficie,
  o: Vec3,
  d: Vec3,
  tMax = Infinity,
): { tEntrada: number; tSalida: number } | null {
  if (!intervalo(s, o[0], o[1], o[2], d[0], d[1], d[2], tMax)) return null;
  return { tEntrada: T0, tSalida: T1 };
}

/**
 * Cruces del segmento a→b con la superficie: devuelve 0..2 y rellena `out` = [t0, sentido0, t1, sentido1], con
 * t ∈ [0,1) y sentido +1 = sale (a favor de la normal exterior; parche: de n), −1 = entra. Se decide por el cambio de
 * estado dentro/fuera, no por el signo numérico de E·n, así que es robusto en tangencia.
 */
export function segmentoCruzaSuperficie(s: Superficie, a: Vec3, b: Vec3, out: Float64Array): number {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const dz = b[2] - a[2];
  if (s.tipo === "parche") {
    const st = Math.sin(s.theta);
    const nx = st * Math.cos(s.phi);
    const ny = st * Math.sin(s.phi);
    const nz = Math.cos(s.theta);
    const da = a[0] * nx + a[1] * ny + a[2] * nz;
    const db = b[0] * nx + b[1] * ny + b[2] * nz;
    if (da >= 0 === db >= 0) return 0;
    let t = da / (da - db);
    if (t >= 1) t = 1 - Number.EPSILON;
    const px = a[0] + t * dx;
    const py = a[1] + t * dy;
    const pz = a[2] + t * dz;
    const ct = Math.cos(s.theta);
    const sp = Math.sin(s.phi);
    const cp = Math.cos(s.phi);
    const u = px * ct * cp + py * ct * sp - pz * st;
    const v = -px * sp + py * cp;
    const m = s.lado / 2;
    if (!(Math.abs(u) < m && Math.abs(v) < m)) return 0;
    out[0] = t;
    out[1] = da < 0 ? 1 : -1;
    return 1;
  }
  if (!intervalo(s, a[0], a[1], a[2], dx, dy, dz, Infinity)) return 0;
  let n = 0;
  if (T0 >= 0 && T0 < 1) {
    out[0] = T0;
    out[1] = -1;
    n = 1;
  }
  if (T1 >= 0 && T1 < 1) {
    out[2 * n] = T1;
    out[2 * n + 1] = 1;
    n++;
  }
  return n;
}

/**
 * ¿El rayo ojo→p atraviesa la superficie antes de llegar a p? (define «detrás de la cara delantera»).
 * Parche: cuenta si el rayo cruza el cuadrado antes de p. Si el ojo está dentro de la superficie, false.
 */
export function ocultoPorSuperficie(s: Superficie, ojo: Vec3, p: Vec3): boolean {
  if (!intervalo(s, ojo[0], ojo[1], ojo[2], p[0] - ojo[0], p[1] - ojo[1], p[2] - ojo[2], Infinity)) return false;
  return T0 > 0 && T0 < 1;
}
