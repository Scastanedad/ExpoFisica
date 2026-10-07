/**
 * README de pruebas — campo3d.ts (contrato §1 convención ε₀=1, §3).
 * E = q (r − r_q)/(4π (|r−r_q|²+soft2)^{3/2}); referencia escrita aquí a mano (sin softening) y con softening explícito.
 * Se comprueban: ley de Coulomb 3D, 1/r², signos, superposición, buffer `out` reutilizado, softening solo como parámetro,
 * y `muestrearFlechas` (posiciones sobre la superficie + E coherente con campoEn).
 */
import { describe, expect, it } from "vitest";
import { NIVELES_GAUSS3D, SOFT2_3D } from "./constantes";
import { campoCarga, campoEn, modulo, muestrearFlechas } from "./campo3d";
import type { Carga3D, Superficie } from "./tipos";
import { CUATRO_PI, campoRef, distSignoRef } from "./referencia";

const cerca = (a: ArrayLike<number>, b: ArrayLike<number>, tol: number) => {
  for (let i = 0; i < 3; i++) expect(Math.abs(a[i] - b[i])).toBeLessThanOrEqual(tol * Math.max(1, Math.abs(b[i])));
};

describe("campoCarga / campoEn", () => {
  it("coincide con Coulomb 3D sin softening (soft2 = 0)", () => {
    const c: Carga3D = { x: 1, y: -2, z: 0.5, q: 3 };
    const p: [number, number, number] = [4, 2, -1];
    const r2 = (4 - 1) ** 2 + (2 + 2) ** 2 + (-1 - 0.5) ** 2;
    const f = 3 / (CUATRO_PI * r2 ** 1.5);
    cerca(campoCarga(p, c, 0), [f * 3, f * 4, f * -1.5], 1e-13);
  });

  it("softening: E = q·r/(4π (r²+soft2)^{3/2}); por defecto soft2 = SOFT2_3D", () => {
    const c: Carga3D = { x: 0, y: 0, z: 0, q: 2 };
    const p: [number, number, number] = [0.3, 0, 0.4]; // r = 0.5
    const f = (s2: number) => 2 / (CUATRO_PI * (0.25 + s2) ** 1.5);
    cerca(campoCarga(p, c, 0.05), [f(0.05) * 0.3, 0, f(0.05) * 0.4], 1e-13);
    cerca(campoCarga(p, c), [f(SOFT2_3D) * 0.3, 0, f(SOFT2_3D) * 0.4], 1e-13);
    cerca(campoEn(p, [c]), [f(SOFT2_3D) * 0.3, 0, f(SOFT2_3D) * 0.4], 1e-13);
  });

  it("decae como 1/r² y es radial", () => {
    const c: Carga3D = { x: 0, y: 0, z: 0, q: 1 };
    const d = [0.6, 0.0, 0.8];
    for (const r of [1, 2, 4, 8]) {
      const E = campoEn([r * d[0], r * d[1], r * d[2]], [c], 0);
      expect(modulo(E)).toBeCloseTo(1 / (CUATRO_PI * r * r), 13);
      cerca(E, [(modulo(E) * d[0]), 0, modulo(E) * d[2]], 1e-12);
    }
    const E1 = modulo(campoEn([3, 0, 0], [c], 0));
    const E2 = modulo(campoEn([6, 0, 0], [c], 0));
    expect(E1 / E2).toBeCloseTo(4, 12);
  });

  it("signo: q>0 aleja, q<0 acerca (E·r̂ tiene el signo de q)", () => {
    const p: [number, number, number] = [0, 3, 0];
    expect(campoEn(p, [{ x: 0, y: 0, z: 0, q: 2 }], 0)[1]).toBeGreaterThan(0);
    expect(campoEn(p, [{ x: 0, y: 0, z: 0, q: -2 }], 0)[1]).toBeLessThan(0);
  });

  it("superposición con 2 cargas = suma de campoCarga; coincide con referencia independiente", () => {
    const cs: Carga3D[] = [
      { x: -2, y: 0, z: 0, q: 3 },
      { x: 2, y: 1, z: -1, q: -1.5 },
    ];
    for (const p of [[0, 0, 0], [5, -3, 2], [-1, 1, 7]] as const) {
      const E = campoEn(p, cs, 0);
      const a = campoCarga(p, cs[0], 0);
      const b = campoCarga(p, cs[1], 0);
      cerca(E, [a[0] + b[0], a[1] + b[1], a[2] + b[2]], 1e-13);
      cerca(E, campoRef(p, cs), 1e-12);
    }
  });

  it("dipolo (−2,0,0,+3),(2,0,0,−3): en el origen E = 2·q/(4π·4) en +x", () => {
    const E = campoEn([0, 0, 0], [{ x: -2, y: 0, z: 0, q: 3 }, { x: 2, y: 0, z: 0, q: -3 }], 0);
    cerca(E, [(2 * 3) / (CUATRO_PI * 4), 0, 0], 1e-13);
  });

  it("reutiliza el buffer `out` (misma referencia) y lo sobrescribe, no acumula", () => {
    const out = new Float64Array([99, 99, 99]);
    const c: Carga3D = { x: 0, y: 0, z: 0, q: 1 };
    const r1 = campoEn([1, 0, 0], [c], 0, out);
    expect(r1).toBe(out);
    const v = out[0];
    campoEn([1, 0, 0], [c], 0, out);
    expect(out[0]).toBe(v);
    const r2 = campoCarga([1, 0, 0], c, 0, out);
    expect(r2).toBe(out);
    expect(out[0]).toBeCloseTo(1 / CUATRO_PI, 13);
  });

  it("modulo = norma euclídea; sin NaN a 0.35 u (semilla) con softening", () => {
    expect(modulo(new Float64Array([3, 4, 12]))).toBe(13);
    const E = campoEn([0.35, 0, 0], [{ x: 0, y: 0, z: 0, q: 5 }]);
    expect(Number.isFinite(modulo(E))).toBe(true);
    // a 0 u el softening evita la singularidad
    expect(Number.isFinite(modulo(campoEn([0, 0, 0], [{ x: 0, y: 0, z: 0, q: 5 }])))).toBe(true);
  });
});

describe("muestrearFlechas", () => {
  const casos: { sup: Superficie; cargas: Carga3D[] }[] = [
    { sup: { tipo: "esfera", radio: 5 }, cargas: [{ x: 0, y: 0, z: 0, q: 3 }] },
    { sup: { tipo: "cubo", lado: 8 }, cargas: [{ x: 1, y: -1, z: 0.5, q: 3 }, { x: 7, y: 0, z: 0, q: -2 }] },
    { sup: { tipo: "cilindro", radio: 4, altura: 8 }, cargas: [{ x: 0, y: 0, z: 0, q: -3 }] },
  ];
  for (const { sup, cargas } of casos) {
    it(`${sup.tipo}: ≤ tope, 6 floats/flecha, posición sobre la superficie y E coherente con campoEn`, () => {
      const tope = NIVELES_GAUSS3D[0].tapaFlechas;
      const out = new Float32Array(6 * tope);
      const n = muestrearFlechas(sup, cargas, tope, out);
      expect(n).toBeGreaterThan(0);
      expect(n).toBeLessThanOrEqual(tope);
      for (let i = 0; i < n; i++) {
        const p = [out[6 * i], out[6 * i + 1], out[6 * i + 2]];
        // sobre la malla: la malla es inscrita, sagita máxima < DIST_MIN_SUP (0.4)
        expect(Math.abs(distSignoRef(sup, p))).toBeLessThan(0.4);
        const e = [out[6 * i + 3], out[6 * i + 4], out[6 * i + 5]];
        const con = campoEn(p as [number, number, number], cargas);
        const sin = campoEn(p as [number, number, number], cargas, 0);
        const ok = (ref: ArrayLike<number>) =>
          Math.hypot(e[0] - ref[0], e[1] - ref[1], e[2] - ref[2]) <= 2e-4 * Math.hypot(ref[0], ref[1], ref[2]) + 1e-9;
        expect(ok(con) || ok(sin), `flecha ${i}`).toBe(true);
      }
    });
  }

  it("respeta un tope menor y tope 0", () => {
    const sup: Superficie = { tipo: "esfera", radio: 5 };
    const cargas = [{ x: 0, y: 0, z: 0, q: 3 }];
    const out = new Float32Array(6 * 200);
    expect(muestrearFlechas(sup, cargas, 10, out)).toBeLessThanOrEqual(10);
    expect(muestrearFlechas(sup, cargas, 0, out)).toBe(0);
  });
});
