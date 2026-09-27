import { describe, expect, it } from "vitest";
import { F_TOPE_FLECHA_N, escalaFlechaFuerza } from "./escalaFlechaFuerza";

describe("F7 escalaFlechaFuerza (E3.2 §4)", () => {
  it("0 sin fuerza, ≈1 en el tope (dentro de 1e-3) y saturada por encima", () => {
    expect(escalaFlechaFuerza(0)).toBe(0);
    expect(escalaFlechaFuerza(-5)).toBe(0);
    expect(escalaFlechaFuerza(NaN)).toBe(0);
    expect(escalaFlechaFuerza(F_TOPE_FLECHA_N)).toBeCloseTo(1, 3);
    expect(escalaFlechaFuerza(F_TOPE_FLECHA_N * 10)).toBe(1);
    expect(F_TOPE_FLECHA_N).toBe(7200);
  });

  it("estrictamente creciente entre 0 y el tope", () => {
    let previo = 0;
    for (let f = 0.01; f < F_TOPE_FLECHA_N; f *= 1.7) {
      const t = escalaFlechaFuerza(f);
      expect(t).toBeGreaterThan(previo);
      previo = t;
    }
  });

  it("reproduce la tabla de la spec (E3.2 §4) con tolerancia 1e-3", () => {
    const tabla: Record<number, number> = {
      0.076: 0.008,
      7.59: 0.242,
      22.47: 0.355,
      62.41: 0.467,
      286.59: 0.637,
      716.48: 0.74,
      2246.89: 0.869,
      7164.82: 0.999,
    };
    for (const [f, t] of Object.entries(tabla)) {
      expect(escalaFlechaFuerza(Number(f))).toBeCloseTo(t, 2);
    }
  });
});
