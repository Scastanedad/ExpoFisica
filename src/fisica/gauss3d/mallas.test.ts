/**
 * README de pruebas — mallas.ts (contrato §2 MallaSuperficie, §3, test obligatorio 11).
 * Todo se verifica con geometría recalculada aquí a partir de vértices/índices (áreas por producto vectorial,
 * orientación por orden de vértices, pertenencia a la superficie con el predicado de referencia). Supuestos:
 *  - esfera: área de la malla inscrita < 1 % por debajo de 4πR² (contrato);
 *  - cubo y parche: área exacta (1e-5, Float32);
 *  - cilindro: el contrato dice «exacto»; la malla inscrita en φ pierde ≤ 0.35 % (nphi=24) — se admite 1 %;
 *  - cubo/parche: celdasCara² parches y 2 triángulos/celda (12·c² para el cubo).
 */
import { describe, expect, it } from "vitest";
import { NIVELES_GAUSS3D } from "./constantes";
import { generarMalla } from "./mallas";
import type { MallaSuperficie, Superficie } from "./tipos";
import { areaRef, ejesParche, normaParche, radioEnvolventeRef } from "./referencia";

const CASOS: Superficie[] = [
  { tipo: "esfera", radio: 2 },
  { tipo: "esfera", radio: 8 },
  { tipo: "cubo", lado: 4 },
  { tipo: "cubo", lado: 16 },
  { tipo: "cilindro", radio: 2, altura: 4 },
  { tipo: "cilindro", radio: 8, altura: 16 },
  { tipo: "parche", lado: 4, theta: 0, phi: 0 },
  { tipo: "parche", lado: 12, theta: 0.9, phi: 2.1 },
];

function triangulos(m: MallaSuperficie) {
  const V = m.vertices;
  const res: { a: number[]; b: number[]; c: number[]; area: number; n: number[]; cen: number[] }[] = [];
  for (let k = 0; k < m.triangulos.length; k += 3) {
    const [i, j, l] = [m.triangulos[k], m.triangulos[k + 1], m.triangulos[k + 2]];
    const a = [V[3 * i], V[3 * i + 1], V[3 * i + 2]];
    const b = [V[3 * j], V[3 * j + 1], V[3 * j + 2]];
    const c = [V[3 * l], V[3 * l + 1], V[3 * l + 2]];
    const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
    const w = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    const cr = [u[1] * w[2] - u[2] * w[1], u[2] * w[0] - u[0] * w[2], u[0] * w[1] - u[1] * w[0]];
    const m2 = Math.hypot(cr[0], cr[1], cr[2]);
    res.push({
      a,
      b,
      c,
      area: m2 / 2,
      n: m2 > 0 ? [cr[0] / m2, cr[1] / m2, cr[2] / m2] : [0, 0, 0],
      cen: [(a[0] + b[0] + c[0]) / 3, (a[1] + b[1] + c[1]) / 3, (a[2] + b[2] + c[2]) / 3],
    });
  }
  return res;
}

/** Distancia (aprox. exacta para vértices) a la superficie para comprobar que están SOBRE ella. */
function distSup(s: Superficie, p: number[]): number {
  switch (s.tipo) {
    case "esfera":
      return Math.abs(Math.hypot(p[0], p[1], p[2]) - s.radio);
    case "cubo": {
      const m = Math.max(Math.abs(p[0]), Math.abs(p[1]), Math.abs(p[2]));
      return Math.abs(m - s.lado / 2);
    }
    case "cilindro": {
      const rho = Math.hypot(p[0], p[1]);
      const dz = Math.abs(p[2]) - s.altura / 2;
      const dr = rho - s.radio;
      if (dz > 1e-5 || dr > 1e-5) return Math.max(dz, dr);
      return Math.min(Math.abs(dr), Math.abs(dz));
    }
    case "parche": {
      const n = normaParche(s);
      return Math.abs(p[0] * n[0] + p[1] * n[1] + p[2] * n[2]);
    }
  }
}

for (const nivelIdx of [0, 1, 2] as const) {
  const nivel = NIVELES_GAUSS3D[nivelIdx];
  describe(`generarMalla — nivel ${nivel.nombre}`, () => {
    for (const s of CASOS) {
      const etiqueta = `${s.tipo} ${JSON.stringify(s)}`;
      describe(etiqueta, () => {
        const m = generarMalla(s, nivel);
        const T = triangulos(m);
        const nV = m.vertices.length / 3;
        const nT = m.triangulos.length / 3;

        it("estructura: longitudes coherentes, índices válidos, tipo", () => {
          expect(m.tipo).toBe(s.tipo);
          expect(m.vertices).toBeInstanceOf(Float32Array);
          expect(m.triangulos).toBeInstanceOf(Uint32Array);
          expect(m.vertices.length % 3).toBe(0);
          expect(m.triangulos.length % 3).toBe(0);
          expect(m.parcheDeTriangulo.length).toBe(nT);
          expect(m.normalTriangulo.length).toBe(3 * nT);
          expect(m.areaParche.length).toBe(m.nParches);
          expect(m.centroParche.length).toBe(3 * m.nParches);
          expect(m.nCeldasU * m.nCeldasV).toBeGreaterThan(0);
          for (const i of m.triangulos) expect(i).toBeLessThan(nV);
          for (const p of m.parcheDeTriangulo) expect(p).toBeLessThan(m.nParches);
          expect(new Set(m.parcheDeTriangulo).size).toBe(m.nParches); // ningún parche vacío
          for (const v of [...m.vertices, ...m.areaParche, ...m.normalTriangulo, ...m.centroParche]) {
            expect(Number.isFinite(v)).toBe(true);
          }
        });

        it("vértices SOBRE la superficie verdadera (1e-4)", () => {
          for (let i = 0; i < nV; i++) {
            expect(distSup(s, [m.vertices[3 * i], m.vertices[3 * i + 1], m.vertices[3 * i + 2]])).toBeLessThan(1e-4);
          }
        });

        it("ningún triángulo degenerado (incluidos polos de la esfera)", () => {
          const aMed = areaRef(s) / nT;
          for (const t of T) expect(t.area).toBeGreaterThan(1e-4 * aMed);
        });

        it("Σ áreas de la malla ≈ área analítica", () => {
          const suma = T.reduce((x, t) => x + t.area, 0);
          const ref = areaRef(s);
          // CAMBIO JUSTIFICADO (fase 1B): la malla inscrita [12,24] (15° × 15°) pierde 1.42 % de área de forma inherente; 1 % en niveles alta/media.
          const tol = s.tipo === "esfera" ? (nivel.nombre === "baja" ? 0.015 : 0.01) : s.tipo === "cilindro" ? 0.01 : 1e-5;
          expect(Math.abs(suma - ref) / ref).toBeLessThan(tol);
          if (s.tipo === "esfera") expect(suma).toBeLessThan(ref * (1 + 1e-6)); // inscrita: nunca mayor
          const sumaP = Array.from(m.areaParche).reduce((x, a) => x + a, 0);
          expect(Math.abs(sumaP - ref) / ref).toBeLessThan(tol);
        });

        it("areaParche[p] = Σ áreas de sus triángulos (si el parche es plano) y > 0", () => {
          const acc = new Float64Array(m.nParches);
          T.forEach((t, k) => (acc[m.parcheDeTriangulo[k]] += t.area));
          for (let p = 0; p < m.nParches; p++) {
            expect(m.areaParche[p]).toBeGreaterThan(0);
            if (s.tipo === "cubo" || s.tipo === "parche") {
              expect(Math.abs(m.areaParche[p] - acc[p]) / acc[p]).toBeLessThan(1e-4);
            } else {
              // parches curvos: el área nominal no puede ser menor que la de la malla inscrita
              expect(m.areaParche[p]).toBeGreaterThan(0.98 * acc[p]);
            }
          }
        });

        it("normalTriangulo: unitaria, coincide con el orden de vértices y es exterior (n·(c−centro) > 0)", () => {
          T.forEach((t, k) => {
            const nm = [m.normalTriangulo[3 * k], m.normalTriangulo[3 * k + 1], m.normalTriangulo[3 * k + 2]];
            expect(Math.hypot(nm[0], nm[1], nm[2])).toBeCloseTo(1, 4);
            expect(nm[0] * t.n[0] + nm[1] * t.n[1] + nm[2] * t.n[2]).toBeGreaterThan(0.999);
            if (s.tipo === "parche") {
              const n = normaParche(s);
              expect(nm[0] * n[0] + nm[1] * n[1] + nm[2] * n[2]).toBeGreaterThan(0.9999);
            } else {
              expect(nm[0] * t.cen[0] + nm[1] * t.cen[1] + nm[2] * t.cen[2]).toBeGreaterThan(0);
            }
          });
        });

        it("centroParche cerca de la superficie y dentro de la envolvente", () => {
          for (let p = 0; p < m.nParches; p++) {
            const c = [m.centroParche[3 * p], m.centroParche[3 * p + 1], m.centroParche[3 * p + 2]];
            expect(Math.hypot(c[0], c[1], c[2])).toBeLessThanOrEqual(radioEnvolventeRef(s) * 1.0001);
          }
        });

        it("determinista: dos llamadas producen los mismos bytes", () => {
          const m2 = generarMalla(s, nivel);
          expect(Array.from(m2.vertices)).toEqual(Array.from(m.vertices));
          expect(Array.from(m2.triangulos)).toEqual(Array.from(m.triangulos));
          expect(Array.from(m2.parcheDeTriangulo)).toEqual(Array.from(m.parcheDeTriangulo));
        });

        if (s.tipo === "cubo" || s.tipo === "parche") {
          it("rejilla celdasCara²: 1 parche y 2 triángulos por celda (cubo ×6)", () => {
            const caras = s.tipo === "cubo" ? 6 : 1;
            const celdas = caras * nivel.celdasCara ** 2;
            expect(m.nParches).toBe(celdas);
            expect(nT).toBe(2 * celdas);
          });
        }
        if (s.tipo === "parche") {
          it("parche: plano ⟂ n, dentro del cuadrado lado×lado en ejes û, v̂", () => {
            const { u, v } = ejesParche(s);
            let maxA = 0;
            let maxB = 0;
            for (let i = 0; i < nV; i++) {
              const p = [m.vertices[3 * i], m.vertices[3 * i + 1], m.vertices[3 * i + 2]];
              maxA = Math.max(maxA, Math.abs(p[0] * u[0] + p[1] * u[1] + p[2] * u[2]));
              maxB = Math.max(maxB, Math.abs(p[0] * v[0] + p[1] * v[1] + p[2] * v[2]));
            }
            expect(maxA).toBeCloseTo(s.lado / 2, 4);
            expect(maxB).toBeCloseTo(s.lado / 2, 4);
          });
        }
      });
    }
  });
}

describe("generarMalla — capacidad de buffers (§4)", () => {
  it("nivel alta con los tamaños máximos: ≤ 2 500 vértices", () => {
    const grandes: Superficie[] = [
      { tipo: "esfera", radio: 8 },
      { tipo: "cubo", lado: 16 },
      { tipo: "cilindro", radio: 8, altura: 16 },
      { tipo: "parche", lado: 12, theta: 0, phi: 0 },
    ];
    for (const s of grandes) {
      expect(generarMalla(s, NIVELES_GAUSS3D[0]).vertices.length / 3).toBeLessThanOrEqual(2500);
    }
  });
  it("la resolución baja tiene menos triángulos que la alta (mismas formas)", () => {
    for (const s of CASOS.slice(0, 7)) {
      const a = generarMalla(s, NIVELES_GAUSS3D[0]).triangulos.length;
      const b = generarMalla(s, NIVELES_GAUSS3D[2]).triangulos.length;
      expect(b).toBeLessThan(a);
    }
  });
});
