import { describe, expect, it } from "vitest";
import { A_DEFECTO, D_DEFECTO } from "./constantes";
import { calcularEstado, cambiarModo, sincronizar } from "./modelo";
import { actualizarReferencia, comparar, fijarReferencia, referenciaDe, sinDielectrico } from "./referencia";
import type { Parametros } from "./tipos";

const base = (extra: Partial<Parametros> = {}): Parametros =>
  sincronizar({ modo: "conectado", A: A_DEFECTO, d: D_DEFECTO, materialId: "aire", f: 0, V: 100, Q: 0, ...extra });

describe("referencia", () => {
  it("la referencia usa aire con los mismos modo, A, d y dato de entrada", () => {
    const p = base({ materialId: "pyrex", f: 1 });
    const r = referenciaDe(p);
    expect(r.p.materialId).toBe("aire");
    expect(r.p.f).toBe(0);
    expect(r.p.V).toBe(p.V);
    expect(r.p.A).toBe(p.A);
    expect(r.fijada).toBe(false);
  });

  it("sigue al estado sin dieléctrico y se congela al meterlo", () => {
    let ref = actualizarReferencia(null, base());
    ref = actualizarReferencia(ref, base({ V: 200 }));
    expect(ref.p.V).toBe(200);
    const conVidrio = base({ V: 200, materialId: "pyrex", f: 1 });
    const congelada = actualizarReferencia(ref, conVidrio);
    expect(congelada).toBe(ref);
    expect(sinDielectrico(conVidrio)).toBe(false);
    expect(sinDielectrico(base({ materialId: "pyrex", f: 0 }))).toBe(true);
    // Sacarlo reanuda el seguimiento
    expect(actualizarReferencia(ref, base({ V: 50 })).p.V).toBe(50);
  });

  it("«Fijar referencia» toma los valores actuales y no los sigue", () => {
    const actual = base({ materialId: "papel", f: 1, V: 100 });
    const ref = fijarReferencia(actual);
    expect(ref.fijada).toBe(true);
    expect(ref.p.materialId).toBe("papel");
    expect(actualizarReferencia(ref, base({ V: 7 }))).toBe(ref);
  });

  it("conectado + vidrio: C, Q y U ×κ (= κ); V y E igual", () => {
    const ref = referenciaDe(base());
    const act = calcularEstado(base({ materialId: "pyrex", f: 1 }));
    const kappa = 5.6;
    for (const k of ["C", "Q", "U"] as const) {
      const c = comparar(ref.estado[k], act[k], kappa);
      expect(c.tipo).toBe("sube");
      expect(c.etiqueta).toBe("↑ ×5,6 (= κ)");
    }
    expect(comparar(ref.estado.V, act.V, kappa).tipo).toBe("igual");
    expect(comparar(ref.estado.E, act.E, kappa).etiqueta).toBe("= igual");
  });

  it("aislado + vidrio: V, E y U ÷κ (= 1/κ); Q igual; C ×κ", () => {
    const p = cambiarModo(base(), "aislado");
    const ref = referenciaDe(p);
    const act = calcularEstado({ ...p, materialId: "pyrex", f: 1 });
    for (const k of ["V", "E", "U"] as const) {
      const c = comparar(ref.estado[k], act[k], 5.6);
      expect(c.tipo).toBe("baja");
      expect(c.etiqueta).toBe("↓ ÷5,6 (= 1/κ)");
    }
    expect(comparar(ref.estado.Q, act.Q, 5.6).tipo).toBe("igual");
    expect(comparar(ref.estado.C, act.C, 5.6).tipo).toBe("sube");
  });

  it("razones sin relación con κ no llevan la nota", () => {
    expect(comparar(1, 2, 5.6).etiqueta).toBe("↑ ×2");
    expect(comparar(1, 0.5, 5.6).etiqueta).toBe("↓ ÷2");
  });

  it("referencia nula", () => {
    expect(comparar(0, 0, 2).tipo).toBe("igual");
    expect(comparar(0, 1, 2).tipo).toBe("sube");
  });
});
