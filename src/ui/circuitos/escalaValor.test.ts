import { describe, expect, it } from "vitest";
import { pasoSerie125, posicionLog, valorDesdePosicionLog } from "./escalaValor";

describe("escalas de valor de los circuitos", () => {
  it("el deslizador logarítmico llega a los extremos y devuelve 2 cifras significativas", () => {
    expect(valorDesdePosicionLog(0, 10, 10_000)).toBe(10);
    expect(valorDesdePosicionLog(1, 10, 10_000)).toBe(10_000);
    expect(valorDesdePosicionLog(0.5, 10, 10_000)).toBe(320);
    expect(valorDesdePosicionLog(0.4, 1e-6, 1e-3)).toBeCloseTo(1.6e-5, 12);
  });

  it("posición y valor son inversos (a la precisión del redondeo)", () => {
    for (const v of [10, 47, 220, 1000, 4700, 10_000]) {
      const p = posicionLog(v, 10, 10_000);
      expect(valorDesdePosicionLog(p, 10, 10_000)).toBeCloseTo(v, 6);
    }
  });

  it("los botones recorren la serie 1-2-5 sin salirse del rango", () => {
    expect(pasoSerie125(1000, 1, 10, 10_000)).toBe(2000);
    expect(pasoSerie125(2000, 1, 10, 10_000)).toBe(5000);
    expect(pasoSerie125(5000, 1, 10, 10_000)).toBe(10_000);
    expect(pasoSerie125(10_000, 1, 10, 10_000)).toBe(10_000);
    expect(pasoSerie125(1000, -1, 10, 10_000)).toBe(500);
    expect(pasoSerie125(10, -1, 10, 10_000)).toBe(10);
    expect(pasoSerie125(3300, 1, 10, 10_000)).toBe(5000);
    expect(pasoSerie125(3300, -1, 10, 10_000)).toBe(2000);
  });

  it("funciona en capacitores (µF)", () => {
    expect(pasoSerie125(100e-6, 1, 1e-6, 1e-3)).toBeCloseTo(200e-6, 12);
    expect(pasoSerie125(1e-6, -1, 1e-6, 1e-3)).toBe(1e-6);
    expect(pasoSerie125(1e-3, 1, 1e-6, 1e-3)).toBe(1e-3);
  });
});
