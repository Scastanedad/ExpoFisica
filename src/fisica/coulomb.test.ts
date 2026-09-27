import { describe, expect, it } from "vitest";
import { K_VISUAL, SOFTENING2, campoEn, potencialEn, type PuntoCarga } from "./coulomb";
import { SOFTENING2_ESTATICO, factoresSim, potencialSI } from "./escala";

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

describe("T-a — E = −∇V con el mismo softening", () => {
  const cargas: PuntoCarga[] = [
    { x: 180, y: 120, q: 1 },
    { x: 420, y: 300, q: -2 },
    { x: 300, y: 400, q: 1.5 },
  ];
  // Generador determinista (mulberry32).
  function aleatorio(semilla: number): () => number {
    let a = semilla >>> 0;
    return () => {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  for (const soft2 of [0, 1, 100]) {
    it(`soft2 = ${soft2}: ‖E + ∇V‖/‖E‖ < 1e-5 en 200 puntos (diferencias centrales, paso 0.01 px)`, () => {
      const azar = aleatorio(11);
      const h = 0.01;
      let peor = 0;
      for (let i = 0; i < 200; i++) {
        const x = azar() * 700;
        const y = azar() * 500;
        // Con ε = 0 el error de truncación de la diferencia central crece como (h/r)²: se omiten los
        // puntos a < 5 px de una carga (a 2.7 px da 1.2e-5; a ≥ 5 px queda < 4e-6).
        if (cargas.some((c) => Math.hypot(x - c.x, y - c.y) < 5)) continue;
        const [ex, ey] = campoEn(x, y, cargas, soft2);
        const gx = (potencialEn(x + h, y, cargas, soft2) - potencialEn(x - h, y, cargas, soft2)) / (2 * h);
        const gy = (potencialEn(x, y + h, cargas, soft2) - potencialEn(x, y - h, cargas, soft2)) / (2 * h);
        peor = Math.max(peor, Math.hypot(ex + gx, ey + gy) / Math.hypot(ex, ey));
      }
      expect(peor).toBeLessThan(1e-5);
    });
  }
});

describe("T-coh — coherencia dibujo/lecturas", () => {
  const una: PuntoCarga[] = [{ x: 0, y: 0, q: 1 }];
  const factor = factoresSim(K_VISUAL).potencial;
  const dif = (r: number, soft2: number) => {
    const dibujo = potencialEn(r, 0, una, soft2) * factor;
    const lectura = potencialSI(r, 0, una) as number;
    return Math.abs(dibujo - lectura) / lectura;
  };
  it("con SOFTENING2_ESTATICO el potencial dibujado coincide con potencialSI: < 0.3 % a 14 px y < 0.03 % desde 50 px", () => {
    expect(dif(14, SOFTENING2_ESTATICO)).toBeLessThan(0.003);
    for (const r of [50, 100, 250, 500]) expect(dif(r, SOFTENING2_ESTATICO)).toBeLessThan(3e-4);
  });
  it("con SOFTENING2 (100) la diferencia a 14 px es ≈ 18.6 %: por eso el dibujo no lo usa", () => {
    expect(dif(14, SOFTENING2)).toBeGreaterThan(0.18);
    expect(dif(14, SOFTENING2)).toBeLessThan(0.19);
  });
});
