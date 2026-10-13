import { describe, expect, it } from "vitest";
import { E_MAX_AIRE, KAPPA_AIRE } from "./constantes";
import { AIRE, CATALOGO, dielectricoPorId, existeDielectrico } from "./dielectricos";
import { eLim } from "./rigidez";

describe("catálogo de dieléctricos", () => {
  it("ids únicos, κ ≥ 1 y E_máx finita y positiva en todos", () => {
    const ids = CATALOGO.map((m) => m.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const m of CATALOGO) {
      expect(m.kappa).toBeGreaterThanOrEqual(1);
      expect(Number.isFinite(m.eMax)).toBe(true);
      expect(m.eMax).toBeGreaterThan(0);
      expect(m.uso.length).toBeGreaterThan(0);
    }
  });

  it("valores dentro de rango razonable para materiales reales", () => {
    for (const m of CATALOGO) {
      expect(m.kappa).toBeLessThanOrEqual(300);
      expect(m.eMax).toBeGreaterThanOrEqual(1e6);
      expect(m.eMax).toBeLessThanOrEqual(100e6);
    }
  });

  it("el aire es el primero y vale κ = 1,00059 y 3 MV/m; el agua no está", () => {
    expect(CATALOGO[0]).toBe(AIRE);
    expect(AIRE.kappa).toBe(KAPPA_AIRE);
    expect(AIRE.eMax).toBe(3e6);
    expect(existeDielectrico("agua")).toBe(false);
    expect(CATALOGO.some((m) => m.nombre.toLowerCase().includes("agua"))).toBe(false);
  });

  it("ordenado por κ creciente", () => {
    for (let i = 1; i < CATALOGO.length; i++) expect(CATALOGO[i].kappa).toBeGreaterThanOrEqual(CATALOGO[i - 1].kappa);
  });

  it("valores del contrato (§5)", () => {
    const esperado: Record<string, [number, number]> = {
      teflon: [2.1, 60e6],
      poliestireno: [2.56, 24e6],
      papel: [3.7, 16e6],
      mylar: [3.2, 7e6],
      pyrex: [5.6, 14e6],
      porcelana: [6, 12e6],
      neopreno: [6.7, 12e6],
      titanato: [233, 8e6],
    };
    for (const [id, [k, e]] of Object.entries(esperado)) {
      expect(dielectricoPorId(id).kappa).toBe(k);
      expect(dielectricoPorId(id).eMax).toBe(e);
    }
  });

  it("un id desconocido cae al aire", () => {
    expect(dielectricoPorId("nada")).toBe(AIRE);
  });
});

describe("rigidez efectiva", () => {
  it("f = 0 → aire; 0 < f < 1 → el menor de aire y material; f = 1 → material", () => {
    expect(eLim("teflon", 0)).toBe(E_MAX_AIRE);
    expect(eLim("teflon", 0.5)).toBe(E_MAX_AIRE);
    expect(eLim("teflon", 1)).toBe(60e6);
    expect(eLim("aire", 1)).toBe(E_MAX_AIRE);
  });
});
