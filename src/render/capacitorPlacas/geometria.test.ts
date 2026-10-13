import { describe, expect, it } from "vitest";
import { A_MAX, A_MIN, D_MAX, D_MIN } from "../../fisica/capacitorPlacas/constantes";
import {
  ANCHO_PLACAS,
  APARCADA,
  G_MAX,
  G_MIN,
  L_MAX,
  L_MIN,
  X0,
  anguloAleatorio,
  bordeLamina,
  calcularGeometria,
  dDesdeHuecoPx,
  fDesdeBordeLamina,
  huecoPx,
  largoPlacaPx,
  numeroCargas,
  numeroLineas,
  posicionesCargas,
  zonaEn,
} from "./geometria";

describe("escalas visuales", () => {
  it("el largo de placa va de L_MIN a L_MAX con A y crece con √A", () => {
    expect(largoPlacaPx(A_MIN)).toBeCloseTo(L_MIN, 9);
    expect(largoPlacaPx(A_MAX)).toBeCloseTo(L_MAX, 9);
    expect(largoPlacaPx(100e-4)).toBeGreaterThan(largoPlacaPx(50e-4));
  });

  it("el hueco es logarítmico en d y su inverso lo recupera", () => {
    expect(huecoPx(D_MIN)).toBeCloseTo(G_MIN, 9);
    expect(huecoPx(D_MAX)).toBeCloseTo(G_MAX, 9);
    expect(huecoPx(1e-3)).toBeCloseTo((G_MIN + G_MAX) / 2, 9);
    for (const d of [1e-4, 3e-4, 1e-3, 4e-3, 1e-2]) expect(dDesdeHuecoPx(huecoPx(d)) / d).toBeCloseTo(1, 9);
  });

  it("dDesdeHuecoPx acota al rango", () => {
    expect(dDesdeHuecoPx(-50)).toBeCloseTo(D_MIN, 12);
    expect(dDesdeHuecoPx(9999)).toBeCloseTo(D_MAX, 12);
  });

  it("marcas de carga y líneas crecen con Q y E y saturan", () => {
    expect(numeroCargas(0)).toBe(0);
    expect(numeroCargas(1e-9)).toBeLessThan(numeroCargas(1e-6));
    expect(numeroCargas(1)).toBe(numeroCargas(1e-3));
    expect(numeroLineas(1e4)).toBeLessThan(numeroLineas(1e7));
    expect(numeroLineas(1e12)).toBe(numeroLineas(6e7));
    expect(numeroLineas(0)).toBe(0);
  });
});

describe("lámina y placas", () => {
  it("f = 0 deja la lámina aparcada a la derecha y f = 1 la alinea con las placas", () => {
    const L = largoPlacaPx(100e-4);
    expect(bordeLamina(0, L)).toBeCloseTo(X0 + L + APARCADA, 9);
    expect(bordeLamina(1, L)).toBeCloseTo(X0, 9);
    expect(calcularGeometria({ A: 100e-4, d: 1e-3, f: 0 }).laminaDentro).toBeNull();
    const g1 = calcularGeometria({ A: 100e-4, d: 1e-3, f: 1 });
    expect(g1.laminaDentro?.w).toBeCloseTo(g1.L, 9);
  });

  it("la parte de la lámina dentro de las placas mide f·L", () => {
    for (const f of [0.02, 0.1, 0.25, 0.5, 0.9]) {
      const g = calcularGeometria({ A: 200e-4, d: 2e-3, f });
      expect(g.laminaDentro?.w).toBeCloseTo(f * g.L, 6);
    }
  });

  it("fDesdeBordeLamina invierte bordeLamina", () => {
    const L = largoPlacaPx(150e-4);
    for (const f of [0, 0.2, 0.7, 1]) expect(fDesdeBordeLamina(bordeLamina(f, L), L)).toBeCloseTo(f, 9);
    expect(fDesdeBordeLamina(-100, L)).toBe(1);
    expect(fDesdeBordeLamina(5000, L)).toBe(0);
  });

  it("todo cabe en el lienzo en los extremos de A y de f", () => {
    for (const A of [A_MIN, A_MAX]) {
      const g = calcularGeometria({ A, d: 1e-3, f: 0 });
      expect(g.lamina.x + g.lamina.w).toBeLessThanOrEqual(ANCHO_PLACAS);
    }
  });

  it("sin lámina (aire) no hay nada que agarrar en la zona de la lámina", () => {
    const g = calcularGeometria({ A: 100e-4, d: 1e-3, f: 0 });
    const x = g.xDer + 20;
    const y = g.yHuecoSup + g.g / 2;
    expect(zonaEn(g, x, y, 0, true)).toBe("lamina");
    expect(zonaEn(g, x, y, 0, false)).toBeNull();
  });

  it("la lámina aparcada se agarra con margen vertical aunque el hueco sea mínimo", () => {
    const g = calcularGeometria({ A: 100e-4, d: 1e-4, f: 0 });
    const x = g.xDer + 20;
    const arriba = g.yHuecoSup - 12;
    expect(zonaEn(g, x, arriba, 0, true)).toBeNull();
    expect(zonaEn(g, x, arriba, 20, true)).toBe("lamina");
  });

  it("entre las placas la lámina solo ocupa el hueco (no tapa las placas)", () => {
    const g = calcularGeometria({ A: 100e-4, d: 1e-4, f: 1 });
    const x = g.x0 + g.L / 2;
    expect(zonaEn(g, x, g.placaSup.y + 2, 20, true)).toBe("placa-sup");
  });

  it("zonaEn: interruptor, lámina, placas y nada", () => {
    const g = calcularGeometria({ A: 100e-4, d: 1e-3, f: 0.5 });
    expect(zonaEn(g, g.interruptor.x + 5, g.interruptor.y + 5, 0)).toBe("interruptor");
    expect(zonaEn(g, g.lamina.x + 5, g.yHuecoSup + g.g / 2, 0)).toBe("lamina");
    expect(zonaEn(g, g.x0 + 10, g.placaSup.y + 3, 0)).toBe("placa-sup");
    expect(zonaEn(g, g.x0 + 10, g.placaInf.y + 3, 0)).toBe("placa-inf");
    expect(zonaEn(g, 5, 5, 0)).toBeNull();
    expect(zonaEn(g, g.x0 + 10, g.placaSup.y - 10, 0)).toBeNull();
    expect(zonaEn(g, g.x0 + 10, g.placaSup.y - 10, 16)).toBe("placa-sup");
  });
});

describe("posiciones de las marcas", () => {
  it("n marcas dentro de la placa y más densas sobre el dieléctrico (σ mayor)", () => {
    const L = 200;
    const xs = posicionesCargas(20, 0.5, L, 5, 1);
    expect(xs).toHaveLength(20);
    for (const x of xs) {
      expect(x).toBeGreaterThanOrEqual(8);
      expect(x).toBeLessThanOrEqual(L - 8);
    }
    const enDiel = xs.filter((x) => x >= 0.5 * L).length;
    expect(enDiel).toBeGreaterThan(xs.length - enDiel);
  });

  it("sin dieléctrico se reparten parejas", () => {
    const xs = posicionesCargas(10, 0, 100, 1, 1);
    // los extremos se recortan al margen; el resto va a pasos iguales
    const pasos = xs.slice(2, -1).map((x, i) => x - xs[i + 1]);
    for (const p of pasos) expect(p).toBeCloseTo(pasos[0], 9);
  });

  it("n = 0 no da marcas", () => {
    expect(posicionesCargas(0, 0.3, 100, 2, 1)).toEqual([]);
  });

  it("anguloAleatorio es determinista y está en [−π, π]", () => {
    expect(anguloAleatorio(7)).toBe(anguloAleatorio(7));
    for (let i = 0; i < 100; i++) expect(Math.abs(anguloAleatorio(i))).toBeLessThanOrEqual(Math.PI);
  });
});
