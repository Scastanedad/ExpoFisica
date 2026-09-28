import { describe, expect, it } from "vitest";
import { insertarCortesPorHueco } from "./dibujoGrafica";

describe("insertarCortesPorHueco (corrección Crítica de fisico-revisor, E4.1 §1.3/§2.2)", () => {
  it("no toca nada si el espaciado entre muestras es normal", () => {
    const muestras = [
      { t: 0, valor: 1 },
      { t: 0.25, valor: 2 },
      { t: 0.5, valor: 3 },
    ];
    expect(insertarCortesPorHueco(muestras, 0.25)).toEqual(muestras);
  });

  it("inserta un punto NaN cuando el salto excede 1.5x el intervalo esperado", () => {
    const muestras = [
      { t: 0, valor: 1 },
      { t: 0.25, valor: 2 },
      { t: 2, valor: 3 }, // hueco: pausa o lectura null entre 0.25 y 2
    ];
    const salida = insertarCortesPorHueco(muestras, 0.25);
    expect(salida).toHaveLength(4);
    expect(salida[2].t).toBeCloseTo((0.25 + 2) / 2, 12);
    expect(salida[2].valor).toBeNaN();
    expect(salida[3]).toEqual({ t: 2, valor: 3 });
  });

  it("no fabrica ningún valor: el corte es solo un marcador NaN, nunca 0 ni interpolado", () => {
    const muestras = [
      { t: 0, valor: 10 },
      { t: 5, valor: -30 },
    ];
    const salida = insertarCortesPorHueco(muestras, 0.1);
    expect(salida[1].valor).toBeNaN();
    expect(salida[1].valor).not.toBe(0);
  });

  it("varios huecos consecutivos insertan varios cortes", () => {
    const muestras = [
      { t: 0, valor: 1 },
      { t: 2, valor: 2 },
      { t: 4, valor: 3 },
    ];
    const salida = insertarCortesPorHueco(muestras, 0.25);
    expect(salida.filter((m) => Number.isNaN(m.valor))).toHaveLength(2);
    expect(salida).toHaveLength(5);
  });

  it("con menos de 2 muestras devuelve una copia sin cambios", () => {
    expect(insertarCortesPorHueco([], 0.25)).toEqual([]);
    expect(insertarCortesPorHueco([{ t: 0, valor: 1 }], 0.25)).toEqual([{ t: 0, valor: 1 }]);
  });

  it("un salto justo en el umbral (exactamente 1.5x) NO cuenta como hueco", () => {
    const muestras = [
      { t: 0, valor: 1 },
      { t: 0.375, valor: 2 }, // 1.5 * 0.25, no > umbral
    ];
    expect(insertarCortesPorHueco(muestras, 0.25)).toEqual(muestras);
  });
});
