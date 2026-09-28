import { describe, expect, it } from "vitest";
import type { PuntoCarga } from "./coulomb";
import { C_POR_UNIDAD, K_COULOMB } from "./escala";
import {
  curvaTeorica,
  muestrearDistancia,
  puntoTeoricoEnR,
  tramosCampo,
  tramosPotencial,
  type CargaConId,
} from "./muestreoDistancia";

/** Regresión lineal simple de log(y) vs. log(x): devuelve la pendiente. */
function pendienteLogLog(puntos: { x: number; y: number }[]): number {
  const n = puntos.length;
  const xs = puntos.map((p) => Math.log(p.x));
  const ys = puntos.map((p) => Math.log(p.y));
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = ys.reduce((a, b) => a + b, 0) / n;
  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i++) {
    num += (xs[i] - mx) * (ys[i] - my);
    den += (xs[i] - mx) ** 2;
  }
  return num / den;
}

describe("muestreoDistancia (E4.1)", () => {
  describe("G1: pendiente teórica exacta", () => {
    it("eTeorico vs r da pendiente -2.000 (±1e-6); vTeorico vs r da -1.000 (±1e-6)", () => {
      const curva = curvaTeorica(2, 0.01, 1);
      const pE = pendienteLogLog(curva.map((p) => ({ x: p.r, y: p.eTeorico })));
      const pV = pendienteLogLog(curva.map((p) => ({ x: p.r, y: Math.abs(p.vTeorico) })));
      expect(pE).toBeCloseTo(-2, 6);
      expect(pV).toBeCloseTo(-1, 6);
    });

    it("vTeorico conserva el signo de qRef", () => {
      const positiva = curvaTeorica(3, 0.01, 1, 5);
      const negativa = curvaTeorica(-3, 0.01, 1, 5);
      for (const p of positiva) expect(p.vTeorico).toBeGreaterThan(0);
      for (const p of negativa) expect(p.vTeorico).toBeLessThan(0);
    });
  });

  describe("G2: coherencia medida ≡ teórica con una sola carga (línea radial)", () => {
    it("eModulo medido coincide con curvaTeorica evaluada en el mismo r (1e-9 relativo)", () => {
      const ref: CargaConId = { id: "c0", x: 100, y: 100, q: 2 };
      const cargas: PuntoCarga[] = [ref];
      const a = { x: 200, y: 100 };
      const b = { x: 500, y: 100 };
      const curva = muestrearDistancia(a, b, ref, cargas, 50);
      expect(curva.esLineaRadial).toBe(true);
      for (const m of curva.muestras) {
        expect(m.eModulo).not.toBeNull();
        const esperado = (K_COULOMB * Math.abs(ref.q) * C_POR_UNIDAD) / (m.r * m.r);
        expect(Math.abs(m.eModulo! - esperado) / esperado).toBeLessThanOrEqual(1e-9);
      }
    });
  });

  describe("G3: superposición se aparta de la teórica", () => {
    it("medido/teórico ≈ 1 cerca de la carga de referencia, fuera de [0.9, 1.1] cerca de la otra carga", () => {
      const ref: CargaConId = { id: "c0", x: 0, y: 0, q: 1 };
      const otra: PuntoCarga = { x: 1000, y: 0, q: 1 };
      const cargas: PuntoCarga[] = [ref, otra];
      const curva = muestrearDistancia({ x: 50, y: 0 }, { x: 900, y: 0 }, ref, cargas, 60);
      const eTeoricoEn = (r: number) => (K_COULOMB * Math.abs(ref.q) * C_POR_UNIDAD) / (r * r);
      const primero = curva.muestras[0];
      const ultimo = curva.muestras[curva.muestras.length - 1];
      const razonCerca = primero.eModulo! / eTeoricoEn(primero.r);
      const razonLejos = ultimo.eModulo! / eTeoricoEn(ultimo.r);
      expect(razonCerca).toBeGreaterThan(0.9);
      expect(razonCerca).toBeLessThan(1.1);
      expect(razonLejos < 0.9 || razonLejos > 1.1).toBe(true);
    });
  });

  describe("G4: exclusión, nunca NaN/Infinity", () => {
    it("muestras a < RADIO_MIN_LECTURA_PX de cualquier carga son null; el resto es finito", () => {
      const ref: CargaConId = { id: "c0", x: 100, y: 100, q: 1 };
      const otra: PuntoCarga = { x: 300, y: 100, q: -1 };
      const curva = muestrearDistancia({ x: 100, y: 100 }, { x: 300, y: 100 }, ref, [ref, otra], 100);
      // El primer punto coincide con la carga de referencia; el último, con `otra`.
      expect(curva.muestras[0].eModulo).toBeNull();
      expect(curva.muestras[0].v).toBeNull();
      expect(curva.muestras[curva.muestras.length - 1].eModulo).toBeNull();
      for (const m of curva.muestras) {
        if (m.eModulo === null) {
          expect(m.v).toBeNull();
        } else {
          expect(Number.isFinite(m.eModulo)).toBe(true);
          expect(Number.isFinite(m.v!)).toBe(true);
        }
      }
    });
  });

  describe("G5: detección de línea radial", () => {
    const a = { x: 0, y: 100 };
    const b = { x: 300, y: 100 };

    it("carga más allá de A: radial (true)", () => {
      const ref: CargaConId = { id: "r1", x: -50, y: 100, q: 1 };
      expect(muestrearDistancia(a, b, ref, [ref], 5).esLineaRadial).toBe(true);
    });

    it("carga más allá de B: radial (true)", () => {
      const ref: CargaConId = { id: "r2", x: 400, y: 100, q: 1 };
      expect(muestrearDistancia(a, b, ref, [ref], 5).esLineaRadial).toBe(true);
    });

    it("pie de la perpendicular estrictamente entre A y B: no radial (false)", () => {
      const ref: CargaConId = { id: "r3", x: 150, y: 50, q: 1 };
      expect(muestrearDistancia(a, b, ref, [ref], 5).esLineaRadial).toBe(false);
    });
  });

  describe("tramosCampo/tramosPotencial (G7: corte por hueco y por signo de V)", () => {
    it("tramosCampo corta en cada hueco (eModulo null)", () => {
      const ref: CargaConId = { id: "c0", x: 100, y: 100, q: 1 };
      const otra: PuntoCarga = { x: 300, y: 100, q: -1 };
      const curva = muestrearDistancia({ x: 100, y: 100 }, { x: 300, y: 100 }, ref, [ref, otra], 40);
      const tramos = tramosCampo(curva.muestras);
      expect(tramos.length).toBeGreaterThanOrEqual(1);
      for (const tramo of tramos) {
        for (const p of tramo) expect(Number.isFinite(p.valor)).toBe(true);
      }
    });

    it("tramosPotencial corta donde V cambia de signo (dos cargas opuestas)", () => {
      const pos: CargaConId = { id: "pos", x: 0, y: 0, q: 1 };
      const neg: PuntoCarga = { x: 400, y: 0, q: -1 };
      const curva = muestrearDistancia({ x: 50, y: 0 }, { x: 350, y: 0 }, pos, [pos, neg], 40);
      const tramos = tramosPotencial(curva.muestras);
      expect(tramos.length).toBeGreaterThan(1);
      for (const tramo of tramos) {
        for (let i = 1; i < tramo.length; i++) {
          expect(tramo[i - 1].valor * tramo[i].valor).toBeGreaterThanOrEqual(0);
        }
      }
    });

    it("con una sola carga, V nunca cambia de signo: un único tramo", () => {
      const ref: CargaConId = { id: "c0", x: 100, y: 100, q: 1 };
      const curva = muestrearDistancia({ x: 200, y: 100 }, { x: 500, y: 100 }, ref, [ref], 30);
      const tramos = tramosPotencial(curva.muestras);
      expect(tramos.length).toBe(1);
    });
  });

  describe("puntoTeoricoEnR", () => {
    it("coincide con curvaTeorica en los mismos extremos r (misma fórmula)", () => {
      const [p0] = curvaTeorica(2, 0.01, 0.01, 2);
      const evaluado = puntoTeoricoEnR(2, 0.01);
      expect(evaluado.eTeorico).toBeCloseTo(p0.eTeorico, 12);
      expect(evaluado.vTeorico).toBeCloseTo(p0.vTeorico, 12);
    });
  });
});
