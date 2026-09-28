import { describe, expect, it } from "vitest";
import { K_VISUAL } from "../fisica/coulomb";
import { energiaSimAJ } from "../fisica/escala";
import type { EnergiaDinamica } from "../types/simulacion";
import type { LecturaQ0 } from "../fisica/cargaPrueba";
import {
  crearColeccionEnergia,
  crearColeccionQ0,
  empujarEnergia,
  empujarLecturaQ0,
} from "./adaptadores";

const energiaCruda: EnergiaDinamica = {
  cinetica: 2,
  potencial: -3,
  total: -1,
  escala: 5,
  deriva: 0,
  trabajoExterno: 0,
  intervenciones: 0,
  ticksPorS: 0,
  subpasosPorS: 0,
};

describe("empujarEnergia (E4.1 G6): conversión obligatoria K/U/E", () => {
  it("empuja energiaSimAJ(x, K_VISUAL), NO el valor crudo del mensaje del Worker", () => {
    const coleccion = crearColeccionEnergia();
    empujarEnergia(coleccion, energiaCruda, 1.5);

    expect(coleccion.serie("K")!.ultimo()).toEqual({ t: 1.5, valor: energiaSimAJ(2, K_VISUAL) });
    expect(coleccion.serie("U")!.ultimo()).toEqual({ t: 1.5, valor: energiaSimAJ(-3, K_VISUAL) });
    expect(coleccion.serie("E")!.ultimo()).toEqual({ t: 1.5, valor: energiaSimAJ(-1, K_VISUAL) });

    // El valor crudo (2, -3, -1) NO debe ser el que quedó en el buffer.
    expect(coleccion.serie("K")!.ultimo()!.valor).not.toBe(2);
    expect(coleccion.serie("U")!.ultimo()!.valor).not.toBe(-3);
    expect(coleccion.serie("E")!.ultimo()!.valor).not.toBe(-1);
  });

  it("E = K + U exactamente (misma conversión lineal, E4.1 §1.1)", () => {
    const coleccion = crearColeccionEnergia();
    empujarEnergia(coleccion, energiaCruda, 0);
    const k = coleccion.serie("K")!.ultimo()!.valor;
    const u = coleccion.serie("U")!.ultimo()!.valor;
    const e = coleccion.serie("E")!.ultimo()!.valor;
    expect(e).toBeCloseTo(k + u, 12);
  });
});

describe("empujarLecturaQ0 (E4.1 §2.2)", () => {
  const lectura: LecturaQ0 = { ex: 1, ey: 2, moduloE: 5, v: 900, fx: 0.1, fy: 0.2, moduloF: 0.3 };

  it("empuja moduloE/v/moduloF sin conversión (ya en SI)", () => {
    const coleccion = crearColeccionQ0();
    empujarLecturaQ0(coleccion, lectura, 2);
    expect(coleccion.serie("moduloE")!.ultimo()).toEqual({ t: 2, valor: 5 });
    expect(coleccion.serie("v")!.ultimo()).toEqual({ t: 2, valor: 900 });
    expect(coleccion.serie("moduloF")!.ultimo()).toEqual({ t: 2, valor: 0.3 });
  });

  it("lectura null es un hueco: no empuja nada (no interpola, no pone 0)", () => {
    const coleccion = crearColeccionQ0();
    empujarLecturaQ0(coleccion, lectura, 1);
    empujarLecturaQ0(coleccion, null, 2);
    expect(coleccion.serie("moduloE")!.longitud()).toBe(1);
    expect(coleccion.serie("moduloE")!.ultimo()).toEqual({ t: 1, valor: 5 });
  });
});
