import { beforeEach, describe, expect, it } from "vitest";
import { MAX_ELEMENTOS, PRESETS_E7, contarHojas, equivalente, hojas } from "../../fisica/circuitos";
import { PERSONALIZADO, RANGO_C, RANGO_R_CARGA, useCircuitosStore } from "../../store/circuitosStore";
import { PRESETS_UI_E7 } from "./presetsUI";

const s = () => useCircuitosStore.getState();

describe("presets de la interfaz de E7", () => {
  it("son los 5 de la spec (sin puente de Wheatstone), en orden y con ids únicos", () => {
    expect(PRESETS_UI_E7.map((p) => p.id)).toEqual(PRESETS_E7.map((p) => p.id));
    expect(PRESETS_UI_E7).toHaveLength(5);
    expect(new Set(PRESETS_UI_E7.map((p) => p.id)).size).toBe(5);
    expect(PRESETS_UI_E7.some((p) => /wheatstone|puente/i.test(p.id + p.nombre))).toBe(false);
  });

  it("todos suman 100 µF, respetan el tope de 6, 12 V y R de carga de 1 kΩ dentro de rango", () => {
    for (const p of PRESETS_UI_E7) {
      expect(equivalente(p.arbol, "C")).toBeCloseTo(100e-6, 12);
      expect(contarHojas(p.arbol)).toBeLessThanOrEqual(MAX_ELEMENTOS);
      expect(p.E).toBe(12);
      expect(p.rCarga).toBe(1000);
      expect(p.rCarga).toBeGreaterThanOrEqual(RANGO_R_CARGA.min);
      expect(p.rCarga).toBeLessThanOrEqual(RANGO_R_CARGA.max);
    }
  });
});

describe("store en E7", () => {
  beforeEach(() => {
    const p = PRESETS_UI_E7[0];
    s().iniciar("C", p.arbol, p.id, p.E);
    s().setRCarga(p.rCarga);
    s().setModo("cargar");
  });

  it("entra cargando, con R de carga fuera del tope de 6 elementos", () => {
    expect(s().dominio).toBe("C");
    expect(s().modo).toBe("cargar");
    expect(s().rCarga).toBe(1000);
    for (let k = 0; k < 10; k++) s().agregarEnSerie();
    expect(contarHojas(s().arbol)).toBe(MAX_ELEMENTOS);
    expect(s().rCarga).toBe(1000);
  });

  it("el valor de un capacitor se acota a 1 µF–1000 µF", () => {
    s().setValorElemento("C1", 1e-9);
    expect(hojas(s().arbol).find((h) => h.id === "C1")?.valor).toBe(RANGO_C.min);
    s().setValorElemento("C1", 5);
    expect(hojas(s().arbol).find((h) => h.id === "C1")?.valor).toBe(RANGO_C.max);
  });

  it("editar la red pasa a «Personalizado»", () => {
    s().agregarEnParalelo();
    expect(s().presetId).toBe(PERSONALIZADO);
  });
});
