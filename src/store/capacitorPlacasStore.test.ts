import { beforeEach, describe, expect, it } from "vitest";
import { calcularEstado, excede } from "../fisica/capacitorPlacas";
import { useCapacitorPlacasStore } from "./capacitorPlacasStore";

const st = () => useCapacitorPlacasStore.getState();

describe("capacitorPlacasStore", () => {
  beforeEach(() => st().reiniciar());

  it("arranca conectado con aire, 100 cm², 1 mm y 100 V", () => {
    expect(st().p.modo).toBe("conectado");
    expect(st().p.materialId).toBe("aire");
    expect(st().p.V).toBe(100);
    expect(st().bloqueo).toBeNull();
  });

  it("la referencia sigue al estado sin dieléctrico y se congela al meterlo", () => {
    st().cambiar({ V: 200 });
    expect(st().referencia.p.V).toBe(200);
    st().cambiar({ materialId: "pyrex" });
    st().cambiar({ f: 1 });
    st().cambiar({ V: 300 });
    expect(st().referencia.p.V).toBe(200);
    expect(calcularEstado(st().p).C).toBeGreaterThan(st().referencia.estado.C * 5);
  });

  it("acercar las placas más allá de la rigidez se detiene en d_mín (conectado)", () => {
    st().cambiar({ V: 1500 });
    st().cambiar({ d: 1e-4 });
    expect(st().bloqueo?.tipo).toBe("limita-d");
    expect(st().p.d).toBeCloseTo(1500 / 3e6, 9);
    expect(excede(st().p)).toBe(false);
  });

  it("cambiar de modo conserva Q y V", () => {
    st().cambiar({ materialId: "papel" });
    st().cambiar({ f: 1 });
    const antes = calcularEstado(st().p);
    st().setModo("aislado");
    const despues = calcularEstado(st().p);
    expect(despues.Q).toBeCloseTo(antes.Q, 20);
    expect(despues.V).toBeCloseTo(antes.V, 9);
  });

  it("«Fijar referencia» la congela y «soltar» la vuelve al aire", () => {
    st().cambiar({ materialId: "teflon" });
    st().cambiar({ f: 1 });
    st().fijarReferencia();
    expect(st().referencia.fijada).toBe(true);
    st().cambiar({ V: 50 });
    expect(st().referencia.p.V).toBe(100);
    st().soltarReferencia();
    expect(st().referencia.fijada).toBe(false);
    expect(st().referencia.p.materialId).toBe("aire");
  });
});
