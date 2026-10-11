import { describe, expect, it } from "vitest";
import { LIENZO_MAX_CSS, LIENZO_MAX_CSS_SALA, PROPORCION_ALTO_MAX, tamanoLienzo } from "./formatos";

describe("tamanoLienzo", () => {
  const casos: [string, number, number, number][] = [
    ["sala 1920x1080", 1100, 930, 1920],
    ["1366x768", 700, 480, 1366],
    ["tablet 1024x768", 560, 430, 1024],
    ["tablet vertical 768x1024", 736, 450, 768],
    ["móvil 390x844", 358, 371, 390],
  ];
  for (const [n, w, h, v] of casos) {
    it(`${n}: nunca supera el ancho de la zona ni el alto disponible`, () => {
      const t = tamanoLienzo(w, h, v);
      expect(t.ancho).toBeLessThanOrEqual(w);
      expect(t.alto).toBeLessThanOrEqual(h);
      expect(t.alto).toBeLessThanOrEqual(t.ancho * PROPORCION_ALTO_MAX + 4);
      expect(t.ancho % 4).toBe(0);
    });
  }

  it("es estable: el tamaño no depende del circuito (mismo resultado siempre)", () => {
    expect(tamanoLienzo(1100, 930, 1920)).toEqual(tamanoLienzo(1100, 930, 1920));
  });

  it("respeta el máximo normal y el de sala (≥ 1600 px)", () => {
    expect(tamanoLienzo(3000, 3000, 1500).ancho).toBeLessThanOrEqual(LIENZO_MAX_CSS);
    expect(tamanoLienzo(3000, 3000, 1920).ancho).toBeLessThanOrEqual(LIENZO_MAX_CSS_SALA);
    expect(tamanoLienzo(3000, 3000, 1920).ancho).toBeGreaterThan(LIENZO_MAX_CSS);
  });

  it("los cambios de 1-3 px no cambian el tamaño (paso de 4 px)", () => {
    expect(tamanoLienzo(701, 480, 1366)).toEqual(tamanoLienzo(703, 480, 1366));
  });
});
