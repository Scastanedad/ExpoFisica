/**
 * README de pruebas — escenarios.ts (contrato §5 y test obligatorio 13).
 * La tabla §5 del contrato está copiada aquí como datos (TABLA) y se contrasta con ESCENARIOS; además cada escenario se
 * evalúa con calcularFlujo y con la cuadratura independiente. Tolerancias: cerradas 1e-9·max(1,|q|); parche 1e-3 relativo
 * contra `esperado.phi` (valores redondeados a 4 cifras) y 1e-4 contra la cuadratura.
 * Supuestos: la vista inicial se admite en grados (35/30) o en radianes; el escenario 6 arranca con la carga FUERA (z=8, Φ=0);
 * el escenario 5 no fija la forma inicial (cubo/cilindro/esfera), solo que la carga (1,−1,0.5,+3) cabe en las tres.
 */
import { describe, expect, it } from "vitest";
import { DIST_MIN_CARGAS, DIST_MIN_SUP, MAX_CARGAS, NIVELES_GAUSS3D } from "./constantes";
import { ESCENARIOS } from "./escenarios";
import { calcularFlujo } from "./flujo";
import { generarMalla } from "./mallas";
import { cuadraturaRef, distSignoRef, qEncRef } from "./referencia";
import { flujoASI } from "./unidades";

const TABLA = {
  // CAMBIO JUSTIFICADO (fase 1B, medicion-lineas-por-uc.md §6): escenario 1 con q=5 (antes 3): cruzan 3 líneas el parche (antes 1–2). Φ = 5·0.031884.
  1: { tipo: "parche", cargas: 1, mostrar: [true, true, false], phi: 0.1594, qEnc: 0, si: 1.8e4 },
  2: { tipo: "esfera", cargas: 1, mostrar: [true, true, false], phi: 3, qEnc: 3, si: 3.39e5 },
  3: { tipo: "esfera", cargas: 1, mostrar: [true, true, false], phi: 3, qEnc: 3, si: 3.39e5 },
  4: { tipo: "esfera", cargas: 1, mostrar: [true, true, true], phi: 3, qEnc: 3, si: 3.39e5 },
  5: { tipo: null, cargas: 1, mostrar: [true, true, false], phi: 3, qEnc: 3, si: 3.39e5 },
  6: { tipo: "esfera", cargas: 1, mostrar: [true, true, false], phi: 0, qEnc: 0, si: 0 },
  7: { tipo: "esfera", cargas: 2, mostrar: [true, true, true], phi: 0, qEnc: 0, si: 0 },
  8: { tipo: "parche", cargas: 1, mostrar: [true, true, false], phi: 0.7889, qEnc: 0, si: 8.91e4 },
  9: { tipo: "esfera", cargas: 1, mostrar: [true, true, true], phi: 4, qEnc: 4, si: 4.52e5 },
} as const;

describe("ESCENARIOS", () => {
  it("hay 9, con ids 1..9 en orden y nombre", () => {
    expect(ESCENARIOS).toHaveLength(9);
    ESCENARIOS.forEach((e, i) => {
      expect(e.id).toBe(i + 1);
      expect(e.nombre.length).toBeGreaterThan(0);
    });
  });

  for (let id = 1; id <= 9; id++) {
    const e = ESCENARIOS[id - 1];
    const t = TABLA[id as keyof typeof TABLA];
    describe(`escenario ${id}: ${e.nombre}`, () => {
      it("forma, nº de cargas y toggles de la tabla §5", () => {
        if (t.tipo) expect(e.superficie.tipo).toBe(t.tipo);
        expect(e.cargas).toHaveLength(t.cargas);
        expect(e.cargas.length).toBeLessThanOrEqual(MAX_CARGAS);
        expect([e.mostrar.lineas, e.mostrar.flujo, e.mostrar.campo]).toEqual(t.mostrar);
      });
      it("vista inicial 35/30 (grados o radianes)", () => {
        const az = e.vista.azimut;
        const inc = e.vista.inclinacion;
        const grados = Math.abs(az - 35) < 1e-9 && Math.abs(inc - 30) < 1e-9;
        const rad = Math.abs(az - (35 * Math.PI) / 180) < 1e-9 && Math.abs(inc - (30 * Math.PI) / 180) < 1e-9;
        expect(grados || rad).toBe(true);
      });
      it("cargas válidas: |q| en [0.5, 5], rangos de posición, distancia a la superficie y entre cargas", () => {
        for (const c of e.cargas) {
          expect(Math.abs(c.q)).toBeGreaterThanOrEqual(0.5);
          expect(Math.abs(c.q)).toBeLessThanOrEqual(5);
          expect(Math.abs(c.x)).toBeLessThanOrEqual(12);
          expect(Math.abs(c.y)).toBeLessThanOrEqual(12);
          expect(Math.abs(c.z)).toBeLessThanOrEqual(10);
          if (e.superficie.tipo !== "parche") {
            expect(Math.abs(distSignoRef(e.superficie, [c.x, c.y, c.z]))).toBeGreaterThanOrEqual(DIST_MIN_SUP - 1e-9);
          }
        }
        if (e.cargas.length === 2) {
          const [a, b] = e.cargas;
          expect(Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z)).toBeGreaterThanOrEqual(DIST_MIN_CARGAS - 1e-9);
        }
      });
      it("esperado.phi / qEnc coinciden con la tabla y SI = Φ·1.1294e5", () => {
        if (e.superficie.tipo === "parche") {
          expect(Math.abs(e.esperado.phi - t.phi)).toBeLessThanOrEqual(1e-3 * Math.max(t.phi, 1e-3));
        } else {
          expect(Math.abs(e.esperado.phi - t.phi)).toBeLessThanOrEqual(1e-9);
        }
        expect(e.esperado.qEnc).toBe(t.qEnc);
        if (t.si > 0) expect(Math.abs(flujoASI(t.phi) - t.si) / t.si).toBeLessThan(5e-3);
      });
      it("test 13: calcularFlujo ≈ esperado.phi en los 3 niveles de malla; q_enc coincide con la referencia", () => {
        for (const nivel of [0, 1, 2]) {
          const malla = generarMalla(e.superficie, NIVELES_GAUSS3D[nivel]);
          const r = calcularFlujo(malla, e.cargas, e.superficie);
          if (e.superficie.tipo === "parche") {
            expect(Math.abs(r.total - e.esperado.phi)).toBeLessThanOrEqual(1e-3 * Math.max(Math.abs(e.esperado.phi), 1e-3));
          } else {
            expect(Math.abs(r.total - e.esperado.phi)).toBeLessThanOrEqual(1e-9 * Math.max(1, Math.abs(e.esperado.qEnc)));
          }
          expect(r.qEnc).toBeCloseTo(e.esperado.qEnc, 12);
          expect(r.qEnc).toBeCloseTo(qEncRef(e.superficie, e.cargas), 12);
        }
      });
      if (id === 1 || id === 8) {
        it("parche: Φ coincide con la cuadratura independiente a 1e-4 y NO es q (no encierra carga)", () => {
          const malla = generarMalla(e.superficie, NIVELES_GAUSS3D[0]);
          const r = calcularFlujo(malla, e.cargas, e.superficie);
          expect(Math.abs(r.total - cuadraturaRef(e.superficie, e.cargas, 400))).toBeLessThanOrEqual(1e-4);
          expect(Math.abs(r.total - e.cargas[0].q)).toBeGreaterThan(1);
        });
      }
    });
  }

  it("escenario 8: parche l=10, θ=0, carga (0,0,−3,+3); escenario 1: l=4, θ=0, φ=0, carga (0,0,−6,+5)", () => {
    expect(ESCENARIOS[7].superficie).toMatchObject({ tipo: "parche", lado: 10, theta: 0 });
    expect(ESCENARIOS[7].cargas[0]).toMatchObject({ x: 0, y: 0, z: -3, q: 3 });
    expect(ESCENARIOS[0].superficie).toMatchObject({ tipo: "parche", lado: 4, theta: 0, phi: 0 });
    expect(ESCENARIOS[0].cargas[0]).toMatchObject({ x: 0, y: 0, z: -6, q: 5 });
  });
  it("escenarios 2, 4, 9: esfera R=5 con carga en el centro; 7: dipolo ±3 en (∓2,0,0)", () => {
    for (const id of [2, 4, 9]) {
      expect(ESCENARIOS[id - 1].superficie).toMatchObject({ tipo: "esfera", radio: 5 });
      expect(ESCENARIOS[id - 1].cargas[0]).toMatchObject({ x: 0, y: 0, z: 0 });
    }
    expect(ESCENARIOS[1].cargas[0].q).toBe(3);
    expect(ESCENARIOS[8].cargas[0].q).toBe(4);
    expect(ESCENARIOS[6].superficie).toMatchObject({ tipo: "esfera", radio: 5 });
    expect(ESCENARIOS[6].cargas[0]).toMatchObject({ x: -2, y: 0, z: 0, q: 3 });
    expect(ESCENARIOS[6].cargas[1]).toMatchObject({ x: 2, y: 0, z: 0, q: -3 });
  });
  it("escenario 3 empieza con la carga dentro (1.5, 1, 2, +3); escenario 6 con la carga fuera (0, 0, 8, +3)", () => {
    expect(ESCENARIOS[2].cargas[0]).toMatchObject({ x: 1.5, y: 1, z: 2, q: 3 });
    expect(ESCENARIOS[5].cargas[0]).toMatchObject({ x: 0, y: 0, z: 8, q: 3 });
  });
  it("escenario 5: carga (1, −1, 0.5, +3), dentro de cubo a=8, cilindro R4×8 y esfera R=5", () => {
    expect(ESCENARIOS[4].cargas[0]).toMatchObject({ x: 1, y: -1, z: 0.5, q: 3 });
  });
});
