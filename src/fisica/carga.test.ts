import { describe, expect, it } from "vitest";
import {
  LINEAS_MIN_POR_CARGA,
  MAGNITUDES_PERMITIDAS,
  PRESUPUESTO_LINEAS,
  aplicarMagnitud,
  esMagnitudValida,
  normalizarCarga,
  pasoMagnitud,
  repartirLineas,
} from "./carga";
import { K_VISUAL, SOFTENING2, campoEn, potencialEn } from "./coulomb";
import { RADIO_CARGA_PX, SOFTENING2_ESTATICO, campoSI, fuerzaParSI, potencialSI } from "./escala";
import { formatCarga } from "./unidades";

describe("C1 rango de magnitudes", () => {
  it("son los diez valores 0.5, 1, …, 5", () => {
    expect(MAGNITUDES_PERMITIDAS).toEqual([0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5]);
  });

  it("esMagnitudValida solo acepta esos valores y sus opuestos", () => {
    for (const q of MAGNITUDES_PERMITIDAS) {
      expect(esMagnitudValida(q)).toBe(true);
      expect(esMagnitudValida(-q)).toBe(true);
    }
    for (const q of [0, 0.25, 0.75, 5.5, 7, NaN, Infinity]) expect(esMagnitudValida(q)).toBe(false);
  });
});

describe("C2 normalizarCarga", () => {
  it("valores de la spec", () => {
    const casos: Array<[number, number | null]> = [
      [1, 1],
      [-1, -1],
      [0.74, 0.5],
      [0.75, 1],
      [-0.75, -1],
      [0.1, 0.5],
      [7, 5],
      [-7, -5],
      [2.26, 2.5],
      [0, null],
      [NaN, null],
      [Infinity, null],
      [-Infinity, null],
    ];
    for (const [entrada, esperado] of casos) expect(normalizarCarga(entrada)).toBe(esperado);
  });

  it("es idempotente, conserva el signo y nunca devuelve 0", () => {
    for (let q = -8; q <= 8; q += 0.13) {
      const n = normalizarCarga(q);
      if (n === null) continue;
      expect(n).not.toBe(0);
      expect(Math.sign(n)).toBe(Math.sign(q));
      expect(normalizarCarga(n)).toBe(n);
      expect(esMagnitudValida(n)).toBe(true);
    }
  });
});

describe("C3 pasoMagnitud", () => {
  it("satura en los límites y conserva el signo", () => {
    expect(pasoMagnitud(0.5, -1)).toBe(0.5);
    expect(pasoMagnitud(5, 1)).toBe(5);
    expect(pasoMagnitud(1, 1)).toBe(1.5);
    expect(pasoMagnitud(-1.5, -1)).toBe(-1);
    expect(pasoMagnitud(-5, 1)).toBe(-5);
    expect(pasoMagnitud(-0.5, -1)).toBe(-0.5);
  });

  it("recorrer del mínimo al máximo son 9 pasos", () => {
    let q = 0.5;
    let pasos = 0;
    while (q < 5) {
      q = pasoMagnitud(q, 1);
      pasos++;
    }
    expect(pasos).toBe(9);
  });
});

describe("aplicarMagnitud (editar magnitud, no el signo)", () => {
  it("conserva el signo de la carga actual e ignora el del valor recibido", () => {
    expect(aplicarMagnitud(1, 2.5)).toBe(2.5);
    expect(aplicarMagnitud(-1, 2.5)).toBe(-2.5);
    expect(aplicarMagnitud(-1, -2.5)).toBe(-2.5);
    expect(aplicarMagnitud(1, -2.5)).toBe(2.5);
  });

  it("corrige fuera de rango y rechaza 0 / NaN", () => {
    expect(aplicarMagnitud(1, 7)).toBe(5);
    expect(aplicarMagnitud(1, 1.3)).toBe(1.5);
    expect(aplicarMagnitud(1, 0)).toBeNull();
    expect(aplicarMagnitud(1, NaN)).toBeNull();
    expect(aplicarMagnitud(0, 1)).toBeNull();
  });
});

describe("C4-C8 leyes de origen con magnitudes distintas", () => {
  const PUNTOS: Array<[number, number]> = [
    [50, 0],
    [37, -81],
    [-120, 45],
  ];

  it("C4: E, V y las lecturas SI son lineales en q (exactamente)", () => {
    for (const soft2 of [SOFTENING2, SOFTENING2_ESTATICO, 0]) {
      for (const q of MAGNITUDES_PERMITIDAS) {
        for (const [x, y] of PUNTOS) {
          const [ex1, ey1] = campoEn(x, y, [{ x: 0, y: 0, q: 1 }], soft2);
          const [exq, eyq] = campoEn(x, y, [{ x: 0, y: 0, q }], soft2);
          expect(exq).toBeCloseTo(q * ex1, 12);
          expect(eyq).toBeCloseTo(q * ey1, 12);
          const v1 = potencialEn(x, y, [{ x: 0, y: 0, q: 1 }], soft2);
          expect(potencialEn(x, y, [{ x: 0, y: 0, q }], soft2)).toBeCloseTo(q * v1, 12);
        }
      }
    }
    const e1 = campoSI(50, 0, [{ x: 0, y: 0, q: 1 }]);
    const e3 = campoSI(50, 0, [{ x: 0, y: 0, q: 3 }]);
    expect(e3?.modulo).toBeCloseTo(3 * (e1?.modulo ?? NaN), 3);
    expect(potencialSI(50, 0, [{ x: 0, y: 0, q: 4.5 }])).toBeCloseTo(
      4.5 * (potencialSI(50, 0, [{ x: 0, y: 0, q: 1 }]) ?? NaN),
      6,
    );
  });

  it("C5: superposición con magnitudes distintas", () => {
    const a = { x: -30, y: 10, q: 2 };
    const b = { x: 45, y: -20, q: -0.5 };
    const [ex, ey] = campoEn(12, 33, [a, b]);
    const [ax, ay] = campoEn(12, 33, [a]);
    const [bx, by] = campoEn(12, 33, [b]);
    expect(ex).toBeCloseTo(ax + bx, 10);
    expect(ey).toBeCloseTo(ay + by, 10);
  });

  it("C6: E(2r)/E(r) = 1/4 y V(2r)/V(r) = 1/2 con q = 0.5 y q = 5 (sin softening)", () => {
    for (const q of [0.5, 5]) {
      const c = [{ x: 0, y: 0, q }];
      const r = 60;
      const e1 = Math.hypot(...campoEn(r, 0, c, 0));
      const e2 = Math.hypot(...campoEn(2 * r, 0, c, 0));
      expect(e2 / e1).toBeCloseTo(0.25, 12);
      expect(potencialEn(2 * r, 0, c, 0) / potencialEn(r, 0, c, 0)).toBeCloseTo(0.5, 12);
    }
  });

  it("C8: fuerza bilineal y tercera ley", () => {
    expect(fuerzaParSI(2, 3, 80)).toBeCloseTo(6 * fuerzaParSI(1, 1, 80), 9);
    expect(fuerzaParSI(5, 0.5, 80)).toBe(fuerzaParSI(0.5, 5, 80));
  });

  it("el radio físico sigue siendo 14 px", () => {
    expect(RADIO_CARGA_PX).toBe(14);
    expect(K_VISUAL).toBe(5000);
  });
});

describe("C10-C11 repartirLineas", () => {
  it("C10: sin recorte da exactamente 10·|q|", () => {
    for (const q of MAGNITUDES_PERMITIDAS) {
      expect(repartirLineas([q])).toEqual([10 * q]);
      expect(repartirLineas([q, -q])).toEqual([10 * q, 10 * q]);
    }
    expect(repartirLineas([1, 2])).toEqual([10, 20]);
  });

  it("C11: con recorte reparte proporcional (valores de la spec)", () => {
    const cinco = repartirLineas(new Array<number>(30).fill(5));
    expect(cinco.every((n) => n === 7)).toBe(true);
    expect(cinco.reduce((a, b) => a + b, 0)).toBe(210);
    const unos = repartirLineas(new Array<number>(30).fill(1));
    expect(unos.every((n) => n === 7)).toBe(true);
    expect(unos.reduce((a, b) => a + b, 0)).toBe(210);
    const mezcla = repartirLineas([5, 0.5, ...new Array<number>(28).fill(1)]);
    expect(mezcla.slice(0, 3)).toEqual([30, 4, 6]);
    expect(mezcla.reduce((a, b) => a + b, 0)).toBe(202);
  });

  it("C11: propiedades generales (mínimo, cota, monotonía, simetría de signo, proporción)", () => {
    let semilla = 12345;
    const rng = () => {
      semilla = (semilla * 1664525 + 1013904223) % 4294967296;
      return semilla / 4294967296;
    };
    for (let intento = 0; intento < 200; intento++) {
      const n = 1 + Math.floor(rng() * 30);
      const qs = Array.from({ length: n }, () => {
        const m = MAGNITUDES_PERMITIDAS[Math.floor(rng() * 10)];
        return rng() < 0.5 ? m : -m;
      });
      const ns = repartirLineas(qs);
      const suma = ns.reduce((a, b) => a + b, 0);
      const ideal = qs.reduce((a, q) => a + 10 * Math.abs(q), 0);
      const f = Math.min(1, PRESUPUESTO_LINEAS / ideal);
      // Cota general: cada N_i es round(f·ideal_i) (≤ f·ideal_i + 0.5) o el mínimo. La cota de la spec
      // (presupuesto + n/2) vale mientras el mínimo no actúe sobre ninguna carga.
      const cotaGeneral = ideal === 0 ? 0 : qs.reduce((a, q) => a + Math.max(LINEAS_MIN_POR_CARGA, f * 10 * Math.abs(q) + 0.5), 0);
      expect(suma).toBeLessThanOrEqual(cotaGeneral + 1e-9);
      const minimoActua = ns.some((_, i) => f * 10 * Math.abs(qs[i]) < LINEAS_MIN_POR_CARGA - 0.5);
      if (!minimoActua) expect(suma).toBeLessThanOrEqual(PRESUPUESTO_LINEAS + n / 2);
      for (let i = 0; i < n; i++) {
        expect(ns[i]).toBeGreaterThanOrEqual(LINEAS_MIN_POR_CARGA);
        const esperado = f * 10 * Math.abs(qs[i]);
        if (ns[i] > LINEAS_MIN_POR_CARGA) expect(Math.abs(ns[i] - esperado)).toBeLessThanOrEqual(0.5 + 1e-9);
        for (let j = 0; j < n; j++) {
          if (Math.abs(qs[i]) >= Math.abs(qs[j])) expect(ns[i]).toBeGreaterThanOrEqual(ns[j]);
          if (Math.abs(qs[i]) === Math.abs(qs[j])) expect(ns[i]).toBe(ns[j]);
        }
      }
    }
  });

  it("cota corregida: Σ N ≤ presupuesto + 4n siempre, y ≤ presupuesto + n/2 sin mínimo; la de la spec original era falsa", () => {
    // Contraejemplo de la cota antigua max(presupuesto + n/2, 4n): f = 0.5 y las 20 cargas de 0.5 µC suben de 3 a 4.
    const qs = [...new Array<number>(6).fill(5), ...new Array<number>(20).fill(-0.5)];
    const ns = repartirLineas(qs);
    const suma = ns.reduce((a, b) => a + b, 0);
    expect(suma).toBe(230);
    expect(suma).toBeGreaterThan(Math.max(PRESUPUESTO_LINEAS + qs.length / 2, 4 * qs.length));
    expect(suma).toBeLessThanOrEqual(PRESUPUESTO_LINEAS + 4 * qs.length);
    expect(ns.slice(0, 6).every((n) => n === 25)).toBe(true);
    expect(ns.slice(6).every((n) => n === 4)).toBe(true);
    // Con f = 1 la suma nunca supera el presupuesto.
    expect(repartirLineas([5, 5, 5, 5]).reduce((a, b) => a + b, 0)).toBe(200);
  });

  it("sin cargas devuelve una lista vacía", () => {
    expect(repartirLineas([])).toEqual([]);
  });
});

describe("C14 formatCarga sin ceros sobrantes", () => {
  it("valores de la spec", () => {
    expect(formatCarga(0.5, "microC")).toBe("+0.5 µC");
    expect(formatCarga(-2.5, "microC")).toBe("−2.5 µC");
    expect(formatCarga(1, "microC")).toBe("+1 µC");
    expect(formatCarga(-1, "microC")).toBe("−1 µC");
    expect(formatCarga(1.25, "microC")).toBe("+1.25 µC");
    expect(formatCarga(0.5, "normalizada")).toBe("+0.5");
    expect(formatCarga(5, "microC")).toBe("+5 µC");
  });
});
