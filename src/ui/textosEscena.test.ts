import { describe, expect, it } from "vitest";
import { anunciarMovimiento, describirEscala, describirEscena, nombreCarga } from "./textosEscena";

describe("textosEscena", () => {
  it("describe la escena con las cargas formateadas", () => {
    expect(describirEscena([{ q: 1 }, { q: -1 }], "microC", "vectores")).toBe(
      "Campo eléctrico de 2 cargas: +1 µC, −1 µC. Vista: vectores del campo.",
    );
    expect(describirEscena([{ q: 1 }], "normalizada", "lineas")).toContain("de 1 carga: +1.");
    expect(describirEscena([], "microC", "potencial")).toContain("sin cargas");
  });

  it("nombra cada carga con signo, valor y número", () => {
    expect(nombreCarga(1, "microC", 1)).toBe("carga positiva de +1 µC (n.º 2)");
    expect(nombreCarga(-1, "microC", 0)).toBe("carga negativa de −1 µC (n.º 1)");
  });

  it("la escala sale de la geometría de la leyenda", () => {
    expect(describirEscala(700)).toBe(
      "Escala del recuadro: 1 cuadro = 1 cm. La barra de la esquina inferior izquierda mide 5 cm.",
    );
  });

  it("anuncia la posición en cm desde los bordes", () => {
    expect(anunciarMovimiento("carga positiva de +1 µC (n.º 1)", 350, 250)).toBe(
      "Carga positiva de +1 µC (n.º 1) movida a 7 cm del borde izquierdo y 5 cm del borde superior.",
    );
  });
});
