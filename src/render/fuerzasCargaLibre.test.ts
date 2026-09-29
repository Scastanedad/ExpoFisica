import { describe, expect, test } from "vitest";
import { estadoInicialCargaLibre, MASA_CARGA_LIBRE, type ParametrosCargaLibre } from "../fisica/cargaLibre";
import { factoresSim } from "../fisica/escala";
import { K_VISUAL } from "../fisica/coulomb";
import { fuerzaCargaLibreParaDibujar } from "./fuerzasCargaLibre";

const base: ParametrosCargaLibre = {
  q: 2,
  masa: MASA_CARGA_LIBRE,
  modoCampo: "uniforme",
  externoSim: [0, 0.02],
  cargaFuente: null,
};

describe("fuerzaCargaLibreParaDibujar", () => {
  test("módulo = |q|·|E| convertido a N", () => {
    const { fuerza, punto } = fuerzaCargaLibreParaDibujar(estadoInicialCargaLibre(100, 200), base);
    expect(fuerza.modulo).toBeCloseTo(2 * 0.02 * factoresSim(K_VISUAL).fuerza, 12);
    expect(punto).toEqual({ x: 100, y: 200, q: 2 });
  });

  test("convención de lectura: campo hacia abajo en pantalla empuja a +q hacia abajo (fy < 0) y a −q hacia arriba", () => {
    expect(fuerzaCargaLibreParaDibujar(estadoInicialCargaLibre(100, 200), base).fuerza.fy).toBeLessThan(0);
    expect(fuerzaCargaLibreParaDibujar(estadoInicialCargaLibre(100, 200), { ...base, q: -2 }).fuerza.fy).toBeGreaterThan(0);
  });
});
