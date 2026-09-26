import { describe, expect, it } from "vitest";
import { RADIO_CARGA_PX } from "../fisica/escala";
import {
  fuenteSignoCarga,
  indiceCargaBajo,
  radioAgarre,
  radioVisualCarga,
  RADIO_ARRASTRE,
} from "./geometriaCargas";

describe("geometriaCargas (compensación por escalaCss)", () => {
  it("a escala 1:1 no cambia nada respecto al diseño base", () => {
    expect(radioVisualCarga(1)).toBe(RADIO_CARGA_PX);
    expect(fuenteSignoCarga(1)).toBe(16);
    expect(radioAgarre(1)).toBe(22); // max(20, 22/1)
    expect(radioAgarre(2)).toBe(RADIO_ARRASTRE); // canvas ampliado: manda el mínimo base
  });

  it("la zona de agarre mide >= 44 px CSS de diámetro a cualquier escala", () => {
    for (const e of [1.4, 1, 0.75, 0.51, 0.3]) {
      expect(radioAgarre(e) * 2 * e).toBeGreaterThanOrEqual(44 - 1e-9);
    }
  });

  it("el radio visual crece al reducir el canvas pero tiene tope", () => {
    expect(radioVisualCarga(0.51)).toBeGreaterThan(RADIO_CARGA_PX);
    expect(radioVisualCarga(0.51)).toBeLessThanOrEqual(20);
    expect(radioVisualCarga(0.1)).toBe(20);
  });

  it("el signo nunca es más grande que el disco", () => {
    for (const e of [1, 0.6, 0.3]) {
      expect(fuenteSignoCarga(e)).toBeLessThanOrEqual(radioVisualCarga(e) * 1.4 + 1e-9);
    }
  });

  it("elige la carga más cercana dentro de la zona de agarre", () => {
    const pos = [
      { x: 100, y: 100 },
      { x: 110, y: 100 },
    ];
    expect(indiceCargaBajo(108, 100, pos, 1)).toBe(1);
    expect(indiceCargaBajo(101, 100, pos, 1)).toBe(0);
    expect(indiceCargaBajo(400, 400, pos, 1)).toBe(-1);
    expect(indiceCargaBajo(100, 100, [undefined], 1)).toBe(-1);
  });
});
