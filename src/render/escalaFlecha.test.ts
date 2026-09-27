import { describe, expect, it } from "vitest";
import { campoEn } from "../fisica/coulomb";
import { SOFTENING2_ESTATICO } from "../fisica/escala";
import { E_TOPE_FLECHA, escalaFlecha } from "./escalaFlecha";

describe("C9 escalaFlecha (E2.1 §3.1)", () => {
  it("0 sin campo, 1 en el tope y saturada por encima", () => {
    expect(escalaFlecha(0)).toBe(0);
    expect(escalaFlecha(-3)).toBe(0);
    expect(escalaFlecha(NaN)).toBe(0);
    expect(escalaFlecha(E_TOPE_FLECHA)).toBeCloseTo(1, 12);
    expect(escalaFlecha(E_TOPE_FLECHA * 10)).toBe(1);
    expect(E_TOPE_FLECHA).toBe(100);
  });

  it("es estrictamente creciente entre 0 y el tope", () => {
    let previo = 0;
    for (let e = 0.1; e < E_TOPE_FLECHA; e *= 1.3) {
      const t = escalaFlecha(e);
      expect(t).toBeGreaterThan(previo);
      previo = t;
    }
  });

  it("cada duplicación añade log10((1+2E)/(1+E))/log10(101) mientras no sature", () => {
    const paso = (e: number) => Math.log10((1 + 2 * e) / (1 + e)) / Math.log10(101);
    for (const e of [1, 4, 10, 30]) {
      expect(escalaFlecha(2 * e) - escalaFlecha(e)).toBeCloseTo(paso(e), 12);
    }
    expect(escalaFlecha(2) - escalaFlecha(1)).toBeCloseTo(0.0879, 3);
    expect(escalaFlecha(8) - escalaFlecha(4)).toBeCloseTo(0.1274, 3);
    expect(paso(1e9)).toBeCloseTo(0.1502, 3);
  });

  it("reproduce la tabla de la spec a 50 px de una carga aislada", () => {
    const tabla: Record<number, number> = { 0.5: 0.15, 1: 0.238, 2: 0.349, 3: 0.422, 5: 0.519 };
    for (const [q, t] of Object.entries(tabla)) {
      const [ex, ey] = campoEn(50, 0, [{ x: 0, y: 0, q: Number(q) }], SOFTENING2_ESTATICO);
      expect(escalaFlecha(Math.hypot(ex, ey))).toBeCloseTo(t, 2);
    }
  });

  it("C7: mismo |E|, mismo t (no depende de q ni de la geometría)", () => {
    const e1 = Math.hypot(...campoEn(50, 0, [{ x: 0, y: 0, q: 1 }], 0));
    const e2 = Math.hypot(...campoEn(50 * Math.SQRT2, 0, [{ x: 0, y: 0, q: 2 }], 0));
    expect(e2).toBeCloseTo(e1, 12);
    expect(escalaFlecha(e2)).toBeCloseTo(escalaFlecha(e1), 12);
  });
});
