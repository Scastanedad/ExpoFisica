import { describe, expect, it } from "vitest";
import { e, paralelo, serie, type Bloque } from "../../fisica/circuitos";
import { HISTERESIS_FORMATO, elegirFormato, tamanoEnPantalla } from "./formatos";

const R = (n: number) => e(`R${n}`, 1000);
const hojas = (n: number) => Array.from({ length: n }, (_, k) => R(k + 1));
const s3 = serie(...hojas(3));
const p6 = paralelo(...hojas(6));

describe("elegirFormato", () => {
  it("en sala (zona ancha, mucho alto) lo que se extiende en horizontal va apaisado", () => {
    for (const arbol of [R(1), s3, serie(...hojas(6))] as Bloque[]) {
      expect(elegirFormato(arbol, "R", false, 1100, 984)).toBe("ancho");
    }
  });

  it("un circuito en serie en una columna angosta se queda apaisado", () => {
    expect(elegirFormato(s3, "R", false, 360, 600)).toBe("ancho");
  });

  it("seis ramas apiladas en una tableta estrecha pasan a vertical", () => {
    expect(elegirFormato(p6, "R", false, 528, 432)).toBe("alto");
  });

  it("la histéresis evita saltos: el otro formato debe ganar un 20 %", () => {
    const a = tamanoEnPantalla(p6, "R", false, "ancho", 528, 432);
    const v = tamanoEnPantalla(p6, "R", false, "alto", 528, 432);
    expect(v / a).toBeGreaterThan(HISTERESIS_FORMATO);
    // Ya en vertical y casi empatado, se queda en vertical.
    expect(elegirFormato(s3, "R", false, 700, 700, "alto")).toBe(
      tamanoEnPantalla(s3, "R", false, "ancho", 700, 700) > tamanoEnPantalla(s3, "R", false, "alto", 700, 700) * HISTERESIS_FORMATO
        ? "ancho"
        : "alto",
    );
  });

  it("es determinista y el tamaño nunca supera el máximo del lienzo", () => {
    expect(elegirFormato(p6, "R", true, 528, 432)).toBe(elegirFormato(p6, "R", true, 528, 432));
    expect(tamanoEnPantalla(R(1), "R", false, "ancho", 5000, 5000)).toBeLessThanOrEqual((80 * 1100) / 960 + 1e-9);
  });
});
