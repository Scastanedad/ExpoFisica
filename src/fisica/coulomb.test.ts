import { describe, expect, it } from "vitest";
import { K_VISUAL, SOFTENING2, campoEn, potencialEn, type PuntoCarga } from "./coulomb";

const magnitud = ([ex, ey]: [number, number]) => Math.hypot(ex, ey);

describe("campoEn — carga puntual", () => {
  it("decae ~1/r² lejos del softening", () => {
    const carga: PuntoCarga[] = [{ x: 0, y: 0, q: 1 }];
    // Con softening, E(r)/E(2r) = (4r² + S)^1.5 / (2 (r² + S)^1.5).
    // El error relativo respecto de 4 (ley 1/r² exacta) es ~ 1.125·S/r².
    // A r = 1000 y S = 100 eso es ~1.1e-4; tolerancia 1e-3 (holgada, pero
    // falla si el exponente deja de ser 1/r²).
    const r = 1000;
    const razon = magnitud(campoEn(r, 0, carga)) / magnitud(campoEn(2 * r, 0, carga));
    const errorEsperado = (1.125 * SOFTENING2) / (r * r);
    expect(Math.abs(razon - 4) / 4).toBeLessThan(1e-3);
    expect(Math.abs(razon - 4) / 4).toBeLessThan(2 * errorEsperado);
  });

  it("coincide con la fórmula con softening K·q·r/(r²+S)^1.5", () => {
    const r = 37;
    const q = 2.5;
    const esperado = (K_VISUAL * q * r) / Math.pow(r * r + SOFTENING2, 1.5);
    const [ex, ey] = campoEn(r, 0, [{ x: 0, y: 0, q }]);
    expect(ex).toBeCloseTo(esperado, 10);
    expect(ey).toBeCloseTo(0, 10);
  });

  it("es finito sobre la propia carga (softening evita la singularidad)", () => {
    const [ex, ey] = campoEn(5, 5, [{ x: 5, y: 5, q: 1 }]);
    expect(ex).toBe(0);
    expect(ey).toBe(0);
    expect(Number.isFinite(potencialEn(5, 5, [{ x: 5, y: 5, q: 1 }]))).toBe(true);
  });

  it("apunta hacia fuera de una carga positiva y hacia dentro de una negativa", () => {
    const pos = campoEn(50, 0, [{ x: 0, y: 0, q: 1 }]);
    const neg = campoEn(50, 0, [{ x: 0, y: 0, q: -1 }]);
    expect(pos[0]).toBeGreaterThan(0); // +x: alejándose del origen
    expect(neg[0]).toBeLessThan(0); // −x: hacia el origen
    const posArriba = campoEn(0, -50, [{ x: 0, y: 0, q: 1 }]);
    expect(posArriba[1]).toBeLessThan(0); // −y: alejándose del origen
  });
});

describe("superposición", () => {
  const a: PuntoCarga = { x: -30, y: 10, q: 1 };
  const b: PuntoCarga = { x: 45, y: -20, q: -2 };
  const punto: [number, number] = [12, 33];

  it("E de dos cargas = suma de E individuales", () => {
    const [ex, ey] = campoEn(punto[0], punto[1], [a, b]);
    const [ax, ay] = campoEn(punto[0], punto[1], [a]);
    const [bx, by] = campoEn(punto[0], punto[1], [b]);
    expect(ex).toBeCloseTo(ax + bx, 10);
    expect(ey).toBeCloseTo(ay + by, 10);
  });

  it("V de dos cargas = suma de V individuales", () => {
    const v = potencialEn(punto[0], punto[1], [a, b]);
    expect(v).toBeCloseTo(potencialEn(punto[0], punto[1], [a]) + potencialEn(punto[0], punto[1], [b]), 10);
  });

  it("sin cargas el campo y el potencial son cero", () => {
    expect(campoEn(1, 2, [])).toEqual([0, 0]);
    expect(potencialEn(1, 2, [])).toBe(0);
  });
});
