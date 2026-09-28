import { describe, expect, test } from "vitest";
import { campoEn, K_VISUAL, type PuntoCarga } from "./coulomb";
import { campoPlacas, campoUniformeASim, potencialUniformeSim, sumarCampoExterno } from "./campoExterno";
import { factoresSim } from "./escala";

describe("campoExterno", () => {
  test("campoPlacas: E0 = U/d, orientación y polaridad", () => {
    expect(campoPlacas("horizontal", 1, 100_000, 0.1)).toEqual({ ex: 1_000_000, ey: 0 });
    expect(campoPlacas("horizontal", -1, 100_000, 0.1)).toEqual({ ex: -1_000_000, ey: 0 });
    expect(campoPlacas("vertical", 1, 100_000, 0.1)).toEqual({ ex: 0, ey: 1_000_000 });
    expect(campoPlacas("vertical", -1, 100_000, 0.1)).toEqual({ ex: 0, ey: -1_000_000 });
  });

  test("campoPlacas: separación 0 no produce Infinity/NaN", () => {
    expect(campoPlacas("horizontal", 1, 100_000, 0)).toEqual({ ex: 0, ey: 0 });
  });

  // Invariante 1 (E5.0 §5): superposición exacta con cargas puntuales.
  test("superposición exacta: sumarCampoExterno(campoEn(...), E0) = suma componente a componente", () => {
    const cargas: PuntoCarga[] = [
      { x: 100, y: 100, q: 2 },
      { x: 400, y: 300, q: -1.5 },
    ];
    const e0: [number, number] = [0.01, -0.02];
    for (const [x, y] of [
      [150, 200],
      [500, 50],
      [0, 0],
      [699, 499],
    ] as const) {
      const base = campoEn(x, y, cargas);
      const total = sumarCampoExterno(base, e0);
      expect(total[0]).toBeCloseTo(base[0] + e0[0], 12);
      expect(total[1]).toBeCloseTo(base[1] + e0[1], 12);
    }
  });

  // Invariante 2: con cargas = [], el campo total es exactamente E0 en cualquier punto.
  test("reducción al caso sin cargas: E_total = E0 en todo el plano", () => {
    const e0: [number, number] = [0.03, 0.04];
    for (const [x, y] of [
      [0, 0],
      [350, 250],
      [699, 499],
      [-50, 600],
    ] as const) {
      const base = campoEn(x, y, []);
      const total = sumarCampoExterno(base, e0);
      expect(total).toEqual([e0[0], e0[1]]);
    }
  });

  // Invariante 3: E = -∇V por diferencias finitas centradas (exacto salvo redondeo: V0 es lineal).
  test("consistencia E = -∇V (diferencias finitas centradas)", () => {
    const e0: [number, number] = [0.02, -0.015];
    const h = 1;
    for (const [x, y] of [
      [300, 250],
      [0, 0],
      [600, 10],
    ] as const) {
      const exNum = -(potencialUniformeSim(x + h, y, e0) - potencialUniformeSim(x - h, y, e0)) / (2 * h);
      const eyNum = -(potencialUniformeSim(x, y + h, e0) - potencialUniformeSim(x, y - h, e0)) / (2 * h);
      expect(exNum).toBeCloseTo(e0[0], 10);
      expect(eyNum).toBeCloseTo(e0[1], 10);
    }
  });

  // Invariante 4: ΔV entre dos puntos no depende del origen de referencia.
  test("independiente del origen: V(A) - V(B) es el mismo con dos orígenes distintos", () => {
    const e0: [number, number] = [0.02, 0.01];
    const a = { x: 100, y: 100 };
    const b = { x: 400, y: 300 };
    const d1 = potencialUniformeSim(a.x, a.y, e0, { x: 0, y: 0 }) - potencialUniformeSim(b.x, b.y, e0, { x: 0, y: 0 });
    const d2 =
      potencialUniformeSim(a.x, a.y, e0, { x: 250, y: -80 }) - potencialUniformeSim(b.x, b.y, e0, { x: 250, y: -80 });
    expect(d2).toBeCloseTo(d1, 9);
  });

  // Invariante 5: ida y vuelta SI <-> sim (identidad dentro de 1e-12 relativo).
  test("ida y vuelta SI <-> sim con factoresSim(K_VISUAL).campo", () => {
    const e0SI = campoPlacas("vertical", 1, 50_000, 0.1);
    const e0Sim = campoUniformeASim(e0SI);
    const f = factoresSim(K_VISUAL).campo;
    expect(e0Sim[0] * f).toBeCloseTo(e0SI.ex, 6);
    expect(e0Sim[1] * f).toBeCloseTo(e0SI.ey, 6);
  });
});
