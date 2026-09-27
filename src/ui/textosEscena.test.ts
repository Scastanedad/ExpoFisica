import { describe, expect, it } from "vitest";
import {
  anunciarMagnitud,
  anunciarMovimiento,
  describirEscala,
  describirEscena,
  describirRangoMagnitud,
  nombreCarga,
  valorTextoMagnitud,
} from "./textosEscena";
import { textosEnergia } from "./textosEnergia";

describe("textosEscena", () => {
  it("describe la escena con las cargas formateadas", () => {
    expect(describirEscena([{ q: 1 }, { q: -1 }], "microC", "vectores")).toBe(
      "Campo eléctrico de 2 cargas: +1 µC, −1 µC. Vista: vectores del campo.",
    );
    expect(describirEscena([{ q: 1 }], "normalizada", "lineas")).toContain("de 1 carga: +1.");
    expect(describirEscena([], "microC", "equipotenciales")).toContain("sin cargas");
    expect(describirEscena([{ q: 1 }, { q: -1 }], "microC", "equipotenciales")).toBe(
      "Campo eléctrico de 2 cargas: +1 µC, −1 µC. Vista: equipotenciales, curvas de igual potencial cada 200 kV, con líneas de campo.",
    );
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

  it("anuncia 'en reposo' al recolocar con teclado en la estación dinámica", () => {
    expect(anunciarMovimiento("carga positiva de +1 µC (n.º 1)", 350, 250, true)).toContain("Queda en reposo.");
  });

  it("anuncia la magnitud y los límites", () => {
    expect(anunciarMagnitud(2.5, "microC", 1)).toBe("Carga positiva n.º 2: 2.5 µC.");
    expect(anunciarMagnitud(-0.5, "microC", 0)).toBe("Carga negativa n.º 1: 0.5 µC. Magnitud mínima: 0.5 µC.");
    expect(anunciarMagnitud(5, "microC", 0)).toContain("Magnitud máxima: 5 µC.");
  });

  it("aria-valuetext y rango de magnitud", () => {
    expect(valorTextoMagnitud(2.5, "microC")).toBe("positiva, 2.5 microcoulombs");
    expect(valorTextoMagnitud(-1, "microC")).toBe("negativa, 1 microcoulomb");
    expect(describirRangoMagnitud("microC")).toBe("De 0.5 µC a 5 µC, en pasos de 0.5 µC.");
  });

  it("panel de energía: K, U, total en J, '≈ 0 J' y fila del trabajo aportado", () => {
    const base = { cinetica: 2.55, potencial: -96.79, total: -94.2428, escala: 99.34, deriva: 0, trabajoExterno: 0, intervenciones: 0, ticksPorS: 0, subpasosPorS: 0 };
    const f = textosEnergia(base);
    expect(f.cinetica).toBe("22.9 mJ");
    expect(f.total).toBe("−847 mJ");
    expect(f.aportada).toBeNull();
    expect(textosEnergia({ ...base, total: 0.1, escala: 100 }).total).toBe("≈ 0 J");
    expect(textosEnergia({ ...base, intervenciones: 1, trabajoExterno: 12.5 }).aportada).toBe("112 mJ");
  });
});
