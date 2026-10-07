/** Superficies gaussianas fijas en el origen (contrato §1, §3): geometría analítica y reglas de colocación de cargas. */
import { DIST_MIN_CARGAS, DIST_MIN_SUP, RANGOS } from "./constantes";
import type { Carga3D, Superficie, TipoSuperficie, Vec3 } from "./tipos";

type Parche = Extract<Superficie, { tipo: "parche" }>;
type ParamsSuperficie = Partial<Record<"radio" | "lado" | "altura" | "theta" | "phi", number>>;

/** Superficie con los valores por defecto de §1; `params` sobrescribe solo lo indicado. */
export function crearSuperficie(tipo: TipoSuperficie, params: ParamsSuperficie = {}): Superficie {
  switch (tipo) {
    case "esfera":
      return { tipo, radio: params.radio ?? RANGOS.esfera.radio.def };
    case "cubo":
      return { tipo, lado: params.lado ?? RANGOS.cubo.lado.def };
    case "cilindro":
      return {
        tipo,
        radio: params.radio ?? RANGOS.cilindro.radio.def,
        altura: params.altura ?? RANGOS.cilindro.altura.def,
      };
    case "parche":
      return { tipo, lado: params.lado ?? RANGOS.parche.lado.def, theta: params.theta ?? 0, phi: params.phi ?? 0 };
  }
}

/** n = (sinθ cosφ, sinθ sinφ, cosθ). */
export function normalParche(s: Parche): Vec3 {
  const st = Math.sin(s.theta);
  return [st * Math.cos(s.phi), st * Math.sin(s.phi), Math.cos(s.theta)];
}

/** Radio de la esfera envolvente centrada en el origen. */
export function radioEnvolvente(s: Superficie): number {
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

export function area(s: Superficie): number {
  switch (s.tipo) {
    case "esfera":
      return 4 * Math.PI * s.radio * s.radio;
    case "cubo":
      return 6 * s.lado * s.lado;
    case "cilindro":
      return 2 * Math.PI * s.radio * (s.altura + s.radio);
    case "parche":
      return s.lado * s.lado;
  }
}

/** Distancia euclídea con signo a la superficie (>0 fuera). Parche: distancia al plano, con signo según n. */
export function distanciaConSigno(s: Superficie, p: Vec3): number {
  switch (s.tipo) {
    case "esfera":
      return Math.hypot(p[0], p[1], p[2]) - s.radio;
    case "cubo": {
      const h = s.lado / 2;
      const qx = Math.abs(p[0]) - h;
      const qy = Math.abs(p[1]) - h;
      const qz = Math.abs(p[2]) - h;
      const m = Math.max(qx, qy, qz);
      if (m <= 0) return m;
      return Math.hypot(Math.max(qx, 0), Math.max(qy, 0), Math.max(qz, 0));
    }
    case "cilindro": {
      const dr = Math.hypot(p[0], p[1]) - s.radio;
      const dz = Math.abs(p[2]) - s.altura / 2;
      const m = Math.max(dr, dz);
      if (m <= 0) return m;
      return Math.hypot(Math.max(dr, 0), Math.max(dz, 0));
    }
    case "parche": {
      const n = normalParche(s);
      return p[0] * n[0] + p[1] * n[1] + p[2] * n[2];
    }
  }
}

/** ¿p estrictamente dentro de la superficie cerrada? (parche: siempre false). */
export function estaDentro(s: Superficie, p: Vec3): boolean {
  return s.tipo !== "parche" && distanciaConSigno(s, p) < 0;
}

export function cargasEncerradas(s: Superficie, cargas: readonly Carga3D[]): number[] {
  const res: number[] = [];
  if (s.tipo === "parche") return res;
  for (let i = 0; i < cargas.length; i++) {
    if (distanciaConSigno(s, [cargas[i].x, cargas[i].y, cargas[i].z]) < 0) res.push(i);
  }
  return res;
}

export function qEncerrada(s: Superficie, cargas: readonly Carga3D[]): number {
  let q = 0;
  for (const i of cargasEncerradas(s, cargas)) q += cargas[i].q;
  return q;
}

/**
 * Coloca la carga pedida (`c`, cruda del puntero/slider) fuera de la franja |d| < DIST_MIN_SUP. Si cae en la franja
 * se deja en el lado de `previa` (el más cercano si no hay previa) a distancia ≥ DIST_MIN_SUP; si sale de la franja
 * por el otro lado, se respeta lo pedido (la carga salta). El parche no tiene franja. No muta `c`.
 */
export function ajustarCargaFueraDeSuperficie(s: Superficie, c: Carga3D, previa?: Carga3D): Carga3D {
  if (s.tipo === "parche") return { x: c.x, y: c.y, z: c.z, q: c.q };
  const d = distanciaConSigno(s, [c.x, c.y, c.z]);
  if (Math.abs(d) >= DIST_MIN_SUP) return { x: c.x, y: c.y, z: c.z, q: c.q };
  const lado = previa ? (distanciaConSigno(s, [previa.x, previa.y, previa.z]) >= 0 ? 1 : -1) : d >= 0 ? 1 : -1;
  const m = DIST_MIN_SUP;
  let x = c.x;
  let y = c.y;
  let z = c.z;
  switch (s.tipo) {
    case "esfera": {
      const r = Math.hypot(x, y, z);
      const f = r > 1e-12 ? (s.radio + lado * m) / r : 0;
      if (r > 1e-12) {
        x *= f;
        y *= f;
        z *= f;
      } else {
        z = s.radio + lado * m;
      }
      break;
    }
    case "cubo": {
      const h = s.lado / 2;
      if (lado < 0) {
        const t = h - m;
        x = Math.max(-t, Math.min(t, x));
        y = Math.max(-t, Math.min(t, y));
        z = Math.max(-t, Math.min(t, z));
      } else {
        const ax = Math.abs(x);
        const ay = Math.abs(y);
        const az = Math.abs(z);
        const t = h + m;
        if (ax >= ay && ax >= az) x = x >= 0 ? t : -t;
        else if (ay >= az) y = y >= 0 ? t : -t;
        else z = z >= 0 ? t : -t;
      }
      break;
    }
    case "cilindro": {
      const hz = s.altura / 2;
      if (lado < 0) {
        const rho = Math.hypot(x, y);
        const rMax = s.radio - m;
        if (rho > rMax) {
          const f = rMax / rho;
          x *= f;
          y *= f;
        }
        const zMax = hz - m;
        z = Math.max(-zMax, Math.min(zMax, z));
      } else {
        const rho = Math.hypot(x, y);
        if (rho - s.radio >= Math.abs(z) - hz && rho > 1e-12) {
          const f = (s.radio + m) / rho;
          x *= f;
          y *= f;
        } else {
          z = z >= 0 ? hz + m : -(hz + m);
        }
      }
      break;
    }
  }
  return { x, y, z, q: c.q };
}

/** Mueve `b` (no `a`) hasta DIST_MIN_CARGAS de `a` si está más cerca. Coincidentes: se separa en +x. */
export function ajustarDistanciaCargas(a: Carga3D, b: Carga3D): Carga3D {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const dz = b.z - a.z;
  const d = Math.hypot(dx, dy, dz);
  if (d >= DIST_MIN_CARGAS) return { x: b.x, y: b.y, z: b.z, q: b.q };
  if (d < 1e-9) return { x: a.x + DIST_MIN_CARGAS, y: a.y, z: a.z, q: b.q };
  const f = DIST_MIN_CARGAS / d;
  return { x: a.x + dx * f, y: a.y + dy * f, z: a.z + dz * f, q: b.q };
}
