import { beforeEach, describe, expect, it } from "vitest";
import { MAX_ELEMENTOS, contarHojas, e, hojas, paralelo, serie } from "../fisica/circuitos";
import {
  MENSAJE_MINIMO,
  MENSAJE_TOPE,
  PERSONALIZADO,
  RANGO_C,
  RANGO_R,
  useCircuitosStore,
} from "./circuitosStore";

const s = () => useCircuitosStore.getState();
const ids = () => hojas(s().arbol).map((h) => h.id);

beforeEach(() => {
  s().iniciar("R", serie(e("R1", 1000), e("R2", 2000)), "demo");
});

describe("circuitosStore: edición del árbol", () => {
  it("iniciar selecciona el primer elemento y limpia sonda y lecturas", () => {
    s().setSonda({ tramo: "riel-sup", t: 0.5 });
    s().iniciar("C", paralelo(e("C1", 1e-4), e("C2", 2e-4)), "x");
    expect(s().dominio).toBe("C");
    expect(s().seleccion).toBe("C1");
    expect(s().sonda).toBeNull();
    expect(s().modo).toBe("abierto");
  });

  it("añadir en serie sobre R1 crea un hermano, lo selecciona y pasa a «Personalizado»", () => {
    s().seleccionar("R1");
    s().agregarEnSerie();
    expect(ids()).toEqual(["R1", "R2", "R3"]);
    expect(s().seleccion).toBe("R2");
    expect(s().presetId).toBe(PERSONALIZADO);
    expect(s().arbol).toMatchObject({ t: "s" });
  });

  it("añadir en paralelo sobre R2 crea un bloque paralelo con el mismo valor", () => {
    s().seleccionar("R2");
    s().agregarEnParalelo();
    expect(s().arbol).toEqual(serie(e("R1", 1000), paralelo(e("R2", 2000), e("R3", 2000))));
    expect(s().seleccion).toBe("R3");
  });

  it("rechaza el séptimo elemento con un aviso y no cambia el árbol", () => {
    for (let k = 0; k < 10; k++) s().agregarEnSerie();
    expect(contarHojas(s().arbol)).toBe(MAX_ELEMENTOS);
    expect(s().mensaje).toBe(MENSAJE_TOPE);
    const antes = s().arbol;
    s().agregarEnParalelo();
    expect(s().arbol).toBe(antes);
  });

  it("quitar elimina el seleccionado, selecciona un vecino y respeta el mínimo de 1", () => {
    s().seleccionar("R2");
    s().quitarSeleccionado();
    expect(ids()).toEqual(["R1"]);
    expect(s().seleccion).toBe("R1");
    expect(s().mensaje).toBeNull();
    s().quitarSeleccionado();
    expect(ids()).toEqual(["R1"]);
    expect(s().mensaje).toBe(MENSAJE_MINIMO);
  });

  it("editar la estructura borra la sonda (los tramos cambian)", () => {
    s().setSonda({ tramo: "R1:a", t: 0.2 });
    s().agregarEnSerie();
    expect(s().sonda).toBeNull();
  });

  it("cambiar un valor conserva la estructura y los ids, y acota al rango", () => {
    s().setValorElemento("R2", 4700);
    expect(hojas(s().arbol).find((h) => h.id === "R2")?.valor).toBe(4700);
    expect(s().presetId).toBe("demo");
    s().setValorElemento("R2", 1);
    expect(hojas(s().arbol).find((h) => h.id === "R2")?.valor).toBe(RANGO_R.min);
    s().setValorElemento("R2", 1e9);
    expect(hojas(s().arbol).find((h) => h.id === "R2")?.valor).toBe(RANGO_R.max);
    s().iniciar("C", serie(e("C1", 1e-4), e("C2", 1e-4)), "c");
    s().setValorElemento("C1", 5);
    expect(hojas(s().arbol)[0].valor).toBe(RANGO_C.max);
  });

  it("E se redondea a voltios enteros dentro de 1–12 V", () => {
    s().setE(7.4);
    expect(s().E).toBe(7);
    s().setE(99);
    expect(s().E).toBe(12);
    s().setE(-3);
    expect(s().E).toBe(1);
  });

  it("elegir un preset restablece selección, sonda y nombre del preset", () => {
    s().setSonda({ tramo: "R1:a", t: 0.2 });
    s().elegirPreset("serie3", serie(e("R1", 1), e("R2", 1), e("R3", 1)));
    expect(s().presetId).toBe("serie3");
    expect(s().sonda).toBeNull();
    expect(s().seleccion).toBe("R1");
  });
});
