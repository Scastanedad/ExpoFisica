import { describe, expect, it } from "vitest";
import { ESCENARIOS } from "../../fisica/gauss3d/escenarios";
import { estaDentro } from "../../fisica/gauss3d/superficies";
import type { Carga3D, Escenario, MallaSuperficie, Superficie, Vec3 } from "../../fisica/gauss3d/tipos";
import { crearCamaraProy, derivarCamara, type CamaraProy } from "./camara";
import { construirGeometria, crearEstadoGeometria, type GeometriaGauss3D } from "./geometria";
import { N_CLAVES, PASADA_DELANTE, PASADA_DETRAS, claveTrozo, construirPasadas, crearPasadas, ordenarPorClave, type Pasadas } from "./pasadas";

const rad = (g: number) => (g * Math.PI) / 180;
const ANCHO = 970;
const ALTO = 547;

function geom(sup: Superficie, cargas: Carga3D[], mostrar = { lineas: true, campo: false }, calidad: 0 | 1 | 2 = 1): GeometriaGauss3D {
  const esc: Escenario = { superficie: sup, cargas, calidad };
  return construirGeometria(crearEstadoGeometria(), esc, mostrar);
}

function preparar(g: GeometriaGauss3D, az: number, inc: number, sinRecortes = true): { p: Pasadas; cam: CamaraProy } {
  const cam = derivarCamara({ azimut: rad(az), inclinacion: rad(inc), zoom: 1, fov: 35, ancho: ANCHO, alto: ALTO }, g.rEncuadre, crearCamaraProy());
  const p = crearPasadas();
  if (sinRecortes) {
    p.margenPx = Infinity;
    p.corteRel = Infinity;
  }
  p.lineas.mid3 = new Float32Array(3 * p.lineas.cap);
  construirPasadas(p, g, cam, ANCHO, ALTO);
  return { p, cam };
}

/** ¿El segmento ojo→q cruza algún triángulo de la malla (en el interior del segmento)? Möller–Trumbore. */
function ocultoPorMalla(m: MallaSuperficie, ojo: Vec3, q: Vec3): boolean {
  const V = m.vertices;
  const T = m.triangulos;
  const dx = q[0] - ojo[0];
  const dy = q[1] - ojo[1];
  const dz = q[2] - ojo[2];
  for (let k = 0; k < T.length / 3; k++) {
    const a = 3 * T[3 * k];
    const b = 3 * T[3 * k + 1];
    const c = 3 * T[3 * k + 2];
    const e1x = V[b] - V[a];
    const e1y = V[b + 1] - V[a + 1];
    const e1z = V[b + 2] - V[a + 2];
    const e2x = V[c] - V[a];
    const e2y = V[c + 1] - V[a + 1];
    const e2z = V[c + 2] - V[a + 2];
    const px = dy * e2z - dz * e2y;
    const py = dz * e2x - dx * e2z;
    const pz = dx * e2y - dy * e2x;
    const det = e1x * px + e1y * py + e1z * pz;
    if (Math.abs(det) < 1e-12) continue;
    const inv = 1 / det;
    const tx = ojo[0] - V[a];
    const ty = ojo[1] - V[a + 1];
    const tz = ojo[2] - V[a + 2];
    const u = (tx * px + ty * py + tz * pz) * inv;
    if (u < 0 || u > 1) continue;
    const qx = ty * e1z - tz * e1y;
    const qy = tz * e1x - tx * e1z;
    const qz = tx * e1y - ty * e1x;
    const v = (dx * qx + dy * qy + dz * qz) * inv;
    if (v < 0 || u + v > 1) continue;
    const t = (e2x * qx + e2y * qy + e2z * qz) * inv;
    if (t > 1e-6 && t < 1 - 1e-6) return true;
  }
  return false;
}

const VISTAS: Array<[number, number]> = [
  [35, 30],
  [-120, 50],
  [200, 20],
  [75, 80],
];

describe("pasadas: cargas", () => {
  it("una carga dentro de la esfera siempre va detrás de la cara delantera (pasada 2)", () => {
    const g = geom({ tipo: "esfera", radio: 5 }, [{ x: 1, y: -1, z: 0.5, q: 3 }], { lineas: false, campo: false });
    for (const [az, inc] of VISTAS) {
      const { p } = preparar(g, az, inc);
      expect(p.pasadaCarga[0]).toBe(PASADA_DETRAS);
    }
  });

  it("una carga fuera: delante si está del lado del ojo, detrás si está al otro lado de la esfera", () => {
    const g = geom({ tipo: "esfera", radio: 5 }, [{ x: 9, y: 0, z: 0, q: 3 }], { lineas: false, campo: false });
    // azimut 90°: el ojo está en +x (más cerca de la carga)
    expect(preparar(g, 90, 20).p.pasadaCarga[0]).toBe(PASADA_DELANTE);
    expect(preparar(g, -90, 20).p.pasadaCarga[0]).toBe(PASADA_DETRAS);
  });

  it("la línea de caída de una carga alta se parte en los cruces con la superficie y la sombra queda dentro", () => {
    const g = geom({ tipo: "esfera", radio: 5 }, [{ x: 0, y: 0, z: 8, q: 3 }], { lineas: false, campo: false });
    const { p } = preparar(g, 35, 30);
    const pas = new Set<number>();
    for (let i = 0; i < p.caida.n; i++) pas.add(p.caida.pasada[i]);
    expect(pas.has(PASADA_DETRAS)).toBe(true);
    expect(pas.has(PASADA_DELANTE)).toBe(true);
    // el suelo pasa por el centro de la esfera: la sombra queda detrás de la cara delantera
    expect(p.pasadaSombra[0]).toBe(PASADA_DETRAS);
  });
});

describe("pasadas: caras", () => {
  it("esfera: una cara es delantera si su normal mira al ojo; cubo: 3 caras visibles", () => {
    const gs = geom({ tipo: "esfera", radio: 5 }, [{ x: 0, y: 0, z: 0, q: 3 }], { lineas: false, campo: false });
    const { p, cam } = preparar(gs, 35, 30);
    const m = gs.malla;
    let delante = 0;
    for (let k = 0; k < m.triangulos.length / 3; k++) {
      const a = 3 * m.triangulos[3 * k];
      const dot =
        m.normalTriangulo[3 * k] * (cam.pos[0] - m.vertices[a]) +
        m.normalTriangulo[3 * k + 1] * (cam.pos[1] - m.vertices[a + 1]) +
        m.normalTriangulo[3 * k + 2] * (cam.pos[2] - m.vertices[a + 2]);
      expect(p.frente[k]).toBe(dot > 0 ? 1 : 0);
      delante += p.frente[k];
    }
    expect(delante / (m.triangulos.length / 3)).toBeGreaterThan(0.3);
    expect(delante / (m.triangulos.length / 3)).toBeLessThan(0.5);

    const gc = geom({ tipo: "cubo", lado: 8 }, [{ x: 0, y: 0, z: 0, q: 3 }], { lineas: false, campo: false });
    const r = preparar(gc, 35, 30);
    let frente = 0;
    for (let k = 0; k < gc.malla.triangulos.length / 3; k++) frente += r.p.frente[k];
    expect(frente).toBe(3 * 2 * 9 * 9); // 3 caras × 2 triángulos × celdasCara² (calidad media = 9)
  });

  it("el parche cuenta como una sola lámina delantera", () => {
    const g = geom({ tipo: "parche", lado: 4, theta: 0, phi: 0 }, [{ x: 0, y: 0, z: -6, q: 5 }], { lineas: false, campo: false });
    const { p } = preparar(g, 35, 30);
    for (let k = 0; k < g.malla.triangulos.length / 3; k++) expect(p.frente[k]).toBe(1);
  });
});

describe("pasadas: trozos de línea", () => {
  const casos: Array<[string, Superficie, Carga3D[]]> = [
    ["esfera dipolo", { tipo: "esfera", radio: 5 }, [{ x: -2, y: 0, z: 0, q: 3 }, { x: 2, y: 0, z: 0, q: -3 }]],
    ["cubo excéntrico", { tipo: "cubo", lado: 8 }, [{ x: 1, y: -1, z: 0.5, q: 3 }]],
    ["cilindro", { tipo: "cilindro", radio: 4, altura: 8 }, [{ x: 2, y: 1, z: 1, q: 3 }, { x: -3, y: 0, z: -2, q: -2 }]],
    ["parche abierto", { tipo: "parche", lado: 10, theta: 0, phi: 0 }, [{ x: 0, y: 0, z: -3, q: 3 }]],
    ["esfera, carga fuera", { tipo: "esfera", radio: 5 }, [{ x: 8, y: 0, z: 0, q: 3 }]],
  ];

  for (const [nombre, sup, cargas] of casos) {
    it(`${nombre}: pasada 2 equivale a que el rayo ojo→trozo atraviese la malla; lo de dentro es siempre pasada 2`, () => {
      const g = geom(sup, cargas, { lineas: true, campo: false }, 0);
      for (const [az, inc] of VISTAS) {
        const { p, cam } = preparar(g, az, inc);
        const L = p.lineas;
        expect(L.n).toBeGreaterThan(100);
        expect(L.descartados).toBe(0);
        const ojo: Vec3 = [cam.pos[0], cam.pos[1], cam.pos[2]];
        let comprobados = 0;
        let discrepan = 0;
        const paso = Math.max(1, Math.floor(L.n / 1500));
        for (let i = 0; i < L.n; i += paso) {
          const m: Vec3 = [L.mid3![3 * i], L.mid3![3 * i + 1], L.mid3![3 * i + 2]];
          const oculto = L.pasada[i] === PASADA_DETRAS;
          if (ocultoPorMalla(g.malla, ojo, m) !== oculto) discrepan++;
          comprobados++;
          if (sup.tipo !== "parche" && estaDentro(sup, m)) expect(L.pasada[i]).toBe(PASADA_DETRAS);
        }
        // la malla inscrita difiere de la superficie ideal solo en la franja de la flecha de sagita
        expect(discrepan / comprobados).toBeLessThan(0.01);
      }
    });

    it(`${nombre}: los trozos reparten cada segmento sin perder longitud (suma de longitudes en pantalla)`, () => {
      const g = geom(sup, cargas, { lineas: true, campo: false }, 1);
      const { p, cam } = preparar(g, 35, 30);
      let esperado = 0;
      const Ln = g.lineas;
      for (let l = 0; l < Ln.n; l++) {
        for (let k = Ln.inicio[l]; k < Ln.inicio[l + 1] - 1; k++) {
          if (p.lp[k] < cam.zCercano || p.lp[k + 1] < cam.zCercano) continue;
          esperado += Math.hypot(p.lx[k + 1] - p.lx[k], p.ly[k + 1] - p.ly[k]);
        }
      }
      let real = 0;
      for (let i = 0; i < p.lineas.n; i++) real += Math.hypot(p.lineas.x1[i] - p.lineas.x0[i], p.lineas.y1[i] - p.lineas.y0[i]);
      expect(real).toBeGreaterThan(0);
      expect(Math.abs(real - esperado) / esperado).toBeLessThan(2e-4);
    });
  }

  it("en cada pasada hay trozos y los cruces de la esfera parten las líneas (más trozos que segmentos)", () => {
    const g = geom({ tipo: "esfera", radio: 5 }, [{ x: -2, y: 0, z: 0, q: 3 }, { x: 2, y: 0, z: 0, q: -3 }], { lineas: true, campo: false }, 1);
    const { p } = preparar(g, 35, 30);
    let n2 = 0;
    let n4 = 0;
    for (let i = 0; i < p.lineas.n; i++) {
      if (p.lineas.pasada[i] === PASADA_DETRAS) n2++;
      else n4++;
    }
    expect(n2).toBeGreaterThan(0);
    expect(n4).toBeGreaterThan(0);
    const nSeg = g.lineas.inicio[g.lineas.n] - g.lineas.n;
    expect(p.lineas.n).toBeGreaterThanOrEqual(nSeg + g.cruces.n);
  });
});

describe("pasadas: flechas de campo E", () => {
  it("cada flecha va a la pasada 4 si su base está en una cara delantera y a la 2 si está en una trasera", () => {
    const g = geom({ tipo: "esfera", radio: 5 }, [{ x: 0, y: 0, z: 0, q: 4 }], { lineas: false, campo: true }, 1);
    const { p, cam } = preparar(g, 35, 30);
    expect(g.nFlechas).toBeGreaterThan(30);
    expect(p.campo.n).toBe(g.nFlechas);
    let d4 = 0;
    for (let i = 0; i < g.nFlechas; i++) {
      const x = g.flechas[6 * i];
      const y = g.flechas[6 * i + 1];
      const z = g.flechas[6 * i + 2];
      const delante = (x * (cam.pos[0] - x) + y * (cam.pos[1] - y) + z * (cam.pos[2] - z)) / 5 > 0;
      expect(p.campo.pasada[i]).toBe(delante ? PASADA_DELANTE : PASADA_DETRAS);
      if (delante) d4++;
    }
    expect(d4).toBeGreaterThan(10);
    expect(d4).toBeLessThan(g.nFlechas - 10);
  });
});

describe("pasadas: orden por (pasada, banda) para trazar por lotes", () => {
  it("ordenarPorClave agrupa por clave y conserva todos los índices", () => {
    const n = 500;
    const pasada = new Uint8Array(n);
    const banda = new Uint8Array(n);
    let s = 12345;
    const rnd = () => (s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
    for (let i = 0; i < n; i++) {
      pasada[i] = rnd() < 0.5 ? PASADA_DETRAS : PASADA_DELANTE;
      banda[i] = Math.floor(rnd() * 4);
    }
    const orden = new Uint32Array(n);
    const inicio = new Uint32Array(N_CLAVES + 1);
    ordenarPorClave(pasada, banda, n, orden, inicio);
    expect(inicio[0]).toBe(0);
    expect(inicio[N_CLAVES]).toBe(n);
    const visto = new Uint8Array(n);
    for (let k = 0; k < N_CLAVES; k++) {
      expect(inicio[k + 1]).toBeGreaterThanOrEqual(inicio[k]);
      for (let j = inicio[k]; j < inicio[k + 1]; j++) {
        const i = orden[j];
        expect(claveTrozo(pasada[i], banda[i])).toBe(k);
        visto[i]++;
      }
    }
    expect(visto.every((v) => v === 1)).toBe(true);
  });

  it("las líneas de una escena real quedan todas ordenadas", () => {
    const g = geom({ tipo: "cubo", lado: 8 }, [{ x: 1, y: -1, z: 0.5, q: 3 }], { lineas: true, campo: false }, 1);
    const { p } = preparar(g, 35, 30, false);
    expect(p.lineas.inicio[N_CLAVES]).toBe(p.lineas.n);
    expect(p.puntas.inicio[N_CLAVES]).toBe(p.puntas.n);
    expect(p.puntas.n).toBeGreaterThan(20);
  });
});

describe("pasadas: los 9 escenarios no producen valores no finitos", () => {
  for (const def of ESCENARIOS) {
    it(`escenario ${def.id}: proyección finita en 4 vistas`, () => {
      const g = geom(def.superficie, def.cargas, { lineas: true, campo: true }, 0);
      for (const [az, inc] of VISTAS) {
        const { p } = preparar(g, az, inc, false);
        const nV = g.malla.vertices.length / 3;
        for (let i = 0; i < nV; i++) expect(Number.isFinite(p.vx[i]) && Number.isFinite(p.vy[i])).toBe(true);
        for (let i = 0; i < p.lineas.n; i++) {
          expect(Number.isFinite(p.lineas.x0[i] + p.lineas.y0[i] + p.lineas.x1[i] + p.lineas.y1[i])).toBe(true);
        }
        for (let i = 0; i < p.nCargas; i++) expect(Number.isFinite(p.qx[i] + p.qy[i] + p.sx[i] + p.sy[i])).toBe(true);
      }
    });
  }
});
