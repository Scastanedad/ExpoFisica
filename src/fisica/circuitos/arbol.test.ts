import { describe, expect, it } from "vitest";
import {
  agregarParalelo,
  agregarSerie,
  arbolANetlist,
  conValor,
  contarHojas,
  e,
  equivalente,
  estadoCargado,
  hojas,
  normalizar,
  paralelo,
  quitar,
  repartoAnalitico,
  serie,
} from "./arbol";
import { reducirPasoAPaso, siguientePaso } from "./reduccion";
import { formatearSI } from "./formato";
import { PRESETS_E6, PRESETS_E7 } from "./presets";
import { ErrorCircuito, type Bloque } from "./tipos";

const ids = (b: Bloque) => hojas(b).map((h) => h.id);

describe("normalizar", () => {
  it("fusiona s en s y p en p, colapsa 1 hijo y renumera en DFS", () => {
    const b = serie(e("x", 1), serie(e("y", 2), paralelo(paralelo(e("z", 3), e("w", 4)))), serie(e("q", 5)));
    const n = normalizar(b, "R");
    expect(n).toEqual(serie(e("R1", 1), e("R2", 2), paralelo(e("R3", 3), e("R4", 4)), e("R5", 5)));
  });
  it("los presets ya vienen normalizados con ids de lectura", () => {
    for (const p of PRESETS_E6) if (p.arbol) expect(normalizar(p.arbol, "R")).toEqual(p.arbol);
    for (const p of PRESETS_E7) expect(normalizar(p.arbol, "C")).toEqual(p.arbol);
  });
});

describe("edición y tope de 6 (criterio 15)", () => {
  it("añadir en serie sobre una hoja de una serie añade hermano; en paralelo crea bloque", () => {
    const a = agregarSerie(e("R1", 100), "R1", "R")!;
    expect(a).toEqual(serie(e("R1", 100), e("R2", 100)));
    const b = agregarSerie(a, "R2", "R", 50)!;
    expect(b).toEqual(serie(e("R1", 100), e("R2", 100), e("R3", 50)));
    const c = agregarParalelo(b, "R2", "R")!;
    expect(c).toEqual(serie(e("R1", 100), paralelo(e("R2", 100), e("R3", 100)), e("R4", 50)));
  });
  it("rechaza el séptimo elemento (null) y los ids son únicos", () => {
    let a: Bloque = e("R1", 1000);
    for (let k = 0; k < 5; k++) a = agregarParalelo(a, "R1", "R")!;
    expect(contarHojas(a)).toBe(6);
    expect(agregarSerie(a, "R1", "R")).toBeNull();
    expect(agregarParalelo(a, "R3", "R")).toBeNull();
    expect(new Set(ids(a)).size).toBe(6);
  });
  it("quitar colapsa el padre; no se puede quitar el último", () => {
    const a = serie(e("R1", 1), paralelo(e("R2", 2), e("R3", 3)));
    expect(quitar(a, "R3", "R")).toEqual(serie(e("R1", 1), e("R2", 2)));
    expect(quitar(e("R1", 1), "R1", "R")).toBeNull();
    expect(quitar(a, "R9", "R")).toBeNull();
  });
  it("conValor conserva estructura e ids", () => {
    const a = serie(e("R1", 1), e("R2", 2));
    expect(conValor(a, "R2", 7)).toEqual(serie(e("R1", 1), e("R2", 7)));
  });
});

describe("arbolANetlist", () => {
  it("E6: fuente V(1→0), raíz entre 1 y 0; serie crea nodos internos deterministas", () => {
    const net = arbolANetlist(serie(e("R1", 1), e("R2", 2), e("R3", 3)), { modo: "dc", E: 12 });
    expect(net.nNodos).toBe(4);
    expect(net.elementos.map((x) => [x.id, x.tipo, x.a, x.b])).toEqual([
      ["V", "V", 1, 0],
      ["R1", "R", 1, 2],
      ["R2", "R", 2, 3],
      ["R3", "R", 3, 0],
    ]);
  });
  it("paralelo: todos los hijos entre los mismos nodos", () => {
    const net = arbolANetlist(paralelo(e("R1", 1), e("R2", 2)), { modo: "dc", E: 1 });
    expect(net.elementos.slice(1).map((x) => [x.a, x.b])).toEqual([
      [1, 0],
      [1, 0],
    ]);
  });
  it("r_int se coloca entre el borne interno de la fuente y el nodo 1", () => {
    const net = arbolANetlist(e("R1", 10), { modo: "dc", E: 12, rInt: 2 });
    const v = net.elementos.find((x) => x.id === "V")!;
    const ri = net.elementos.find((x) => x.id === "r_int")!;
    expect(v.b).toBe(0);
    expect(ri.a).toBe(v.a);
    expect(ri.b).toBe(1);
  });
  it("E7: Rc entre 1 y 2, raíz entre 2 y 0; descargar fija la fuente en 0 V; Rc no cuenta en el tope", () => {
    const arbol = paralelo(...[1, 2, 3, 4, 5, 6].map((k) => e(`C${k}`, 1e-6)));
    const net = arbolANetlist(arbol, { modo: "cargar", E: 12, rCarga: 1000 });
    const rc = net.elementos.find((x) => x.id === "Rc")!;
    expect([rc.a, rc.b]).toEqual([1, 2]);
    expect(net.elementos.filter((x) => x.tipo === "C").every((x) => x.a === 2 && x.b === 0)).toBe(true);
    expect(net.elementos.find((x) => x.id === "V")!.valor).toBe(12);
    const des = arbolANetlist(arbol, { modo: "descargar", E: 12, rCarga: 1000 });
    expect(des.elementos.find((x) => x.id === "V")!.valor).toBe(0);
  });
  it("valores inválidos o falta de rCarga lanzan error", () => {
    expect(() => arbolANetlist(e("R1", 0), { modo: "dc", E: 1 })).toThrow(ErrorCircuito);
    expect(() => arbolANetlist(e("C1", 1e-6), { modo: "cargar", E: 1 })).toThrow(ErrorCircuito);
  });
});

describe("reducción paso a paso", () => {
  it("nº de pasos = bloques internos y el final coincide con el equivalente (R y C) a 1e-12", () => {
    for (const p of PRESETS_E6) {
      if (!p.arbol) continue;
      const { pasos, equivalente: eq } = reducirPasoAPaso(p.arbol, "R");
      expect(Math.abs(eq - p.esperado.rEq) / p.esperado.rEq).toBeLessThan(1e-12);
      const internos = JSON.stringify(p.arbol).match(/"t":"[sp]"/g)?.length ?? 0;
      expect(pasos.length).toBe(internos);
      expect(pasos.length).toBeLessThanOrEqual(5);
      expect(hojas(pasos[pasos.length - 1].arbol)).toHaveLength(1);
    }
    for (const p of PRESETS_E7) {
      const { equivalente: eq } = reducirPasoAPaso(p.arbol, "C");
      expect(Math.abs(eq - p.cEq) / p.cEq).toBeLessThan(1e-12);
    }
  });
  it("fórmulas con números: serie de resistores y paralelo de 2 (preset 'mixto6')", () => {
    const p = PRESETS_E6.find((x) => x.id === "mixto6")!;
    const { pasos } = reducirPasoAPaso(p.arbol!, "R");
    expect(pasos[0].formula).toBe("Rp1 = R1·R2/(R1 + R2) = 3 kΩ·6 kΩ/(3 kΩ + 6 kΩ) = 2 kΩ");
    expect(pasos[1].formula).toBe("Rs1 = R3 + R4 = 2 kΩ + 4 kΩ = 6 kΩ");
  });
  it("en capacitores las fórmulas se invierten", () => {
    const p = siguientePaso(serie(e("C1", 2e-6), e("C2", 2e-6)), "C")!;
    expect(p.resultado.valor).toBeCloseTo(1e-6, 18);
    expect(p.formula).toContain("C1·C2/(C1 + C2)");
    const q = siguientePaso(paralelo(e("C1", 2e-6), e("C2", 3e-6)), "C")!;
    expect(q.formula).toBe("Cp1 = C1 + C2 = 2 µF + 3 µF = 5 µF");
  });
  it("paralelo de 3 resistores usa la forma de recíprocos", () => {
    const p = siguientePaso(paralelo(e("R1", 2000), e("R2", 2000), e("R3", 4000)), "R")!;
    expect(p.formula).toBe("1/Rp1 = 1/R1 + 1/R2 + 1/R3 = 1/2 kΩ + 1/2 kΩ + 1/4 kΩ ⇒ Rp1 = 800 Ω");
  });
  it("una sola hoja: 0 pasos", () => {
    expect(siguientePaso(e("R1", 5), "R")).toBeNull();
  });
});

describe("repartoAnalitico y formato", () => {
  it("divisor de tensión/corriente reproduce la tabla del preset 5", () => {
    const p = PRESETS_E6.find((x) => x.id === "mixto6")!;
    const r = repartoAnalitico(p.arbol!, "R", 12);
    expect(r.R3.v).toBeCloseTo(2, 12);
    expect(r.R4.v).toBeCloseTo(4, 12);
    expect(r.R6.v).toBeCloseTo(2, 12);
    expect(r.R1.i).toBeCloseTo((4 / 3) * 1e-3, 12);
  });
  it("estadoCargado coincide con el reparto final de los presets E7", () => {
    for (const p of PRESETS_E7) {
      const s = estadoCargado(p.arbol, p.E);
      for (const [id, f] of Object.entries(p.final)) expect(s[id]).toBeCloseTo(f.v, 12);
      expect(equivalente(p.arbol, "C")).toBeCloseTo(p.cEq, 18);
    }
  });
  it("formatearSI: prefijos y 3 cifras", () => {
    expect(formatearSI(1995.73, "Ω")).toBe("2 kΩ");
    expect(formatearSI(0.00154, "A")).toBe("1,54 mA");
    expect(formatearSI(4.7e-6, "F")).toBe("4,7 µF");
    expect(formatearSI(0, "V")).toBe("0 V");
    expect(formatearSI(-0.154e-3, "A")).toBe("-154 µA");
  });
});
