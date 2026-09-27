import { describe, expect, it } from "vitest";
import { MAGNITUDES_PERMITIDAS } from "../fisica/carga";
import { RADIO_CARGA_PX } from "../fisica/escala";
import {
  RADIO_VISUAL_MAX,
  alfaHalo,
  fuenteSignoCarga,
  indiceCargaBajo,
  radioAgarre,
  radioVisualCarga,
  unidadTexto,
  RADIO_ARRASTRE,
} from "./geometriaCargas";

describe("geometriaCargas (compensación por escalaCss)", () => {
  it("el texto se compensa al reducir el canvas y crece con él al ampliarlo (proyector)", () => {
    expect(unidadTexto(0.5)).toBe(2);
    expect(unidadTexto(1)).toBe(1);
    // 12 px lógicos a escala 1.79 = ~21 px CSS (no se encoge a 12 px CSS).
    expect(12 * unidadTexto(1.79) * 1.79).toBeCloseTo(12 * 1.79, 9);
    expect(unidadTexto(0)).toBe(1);
  });


  it("a escala 1:1 la carga de 1 µC no cambia de tamaño de signo ni de agarre", () => {
    expect(fuenteSignoCarga(1, 1)).toBe(16);
    expect(radioAgarre(1)).toBe(22); // max(20, 22/1)
    expect(radioAgarre(2)).toBe(RADIO_ARRASTRE); // canvas ampliado: manda el mínimo base
  });

  it("la zona de agarre mide >= 44 px CSS de diámetro a cualquier escala y no depende de q", () => {
    for (const e of [1.4, 1, 0.75, 0.51, 0.3]) {
      expect(radioAgarre(e) * 2 * e).toBeGreaterThanOrEqual(44 - 1e-9);
    }
  });

  it("el radio visual crece al reducir el canvas pero tiene tope", () => {
    expect(radioVisualCarga(1, 0.51)).toBeGreaterThan(radioVisualCarga(1, 1));
    expect(radioVisualCarga(1, 0.51)).toBeLessThanOrEqual(20);
    expect(radioVisualCarga(1, 0.1)).toBe(20);
  });

  it("el signo nunca es más grande que el disco", () => {
    for (const q of [0.5, 1, 5]) {
      for (const e of [1, 0.6, 0.3]) {
        expect(fuenteSignoCarga(q, e)).toBeLessThanOrEqual(radioVisualCarga(q, e) * 1.4 + 1e-9);
      }
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

describe("C13 radio visual de la carga (E2.1 §3.4)", () => {
  it("es estrictamente creciente con |q| a escala 1:1 y R(5) = 20", () => {
    const radios = MAGNITUDES_PERMITIDAS.map((q) => radioVisualCarga(q, 1));
    for (let i = 1; i < radios.length; i++) expect(radios[i]).toBeGreaterThan(radios[i - 1]);
    expect(radios[radios.length - 1]).toBe(20);
  });

  it("coincide con la tabla de la spec: R = 20·(|q|/5)^{1/3}", () => {
    const tabla: Record<number, number> = { 0.5: 9.28, 1: 11.7, 2: 14.74, 3: 16.87, 5: 20 };
    for (const [q, r] of Object.entries(tabla)) {
      expect(radioVisualCarga(Number(q), 1)).toBeCloseTo(r, 2);
    }
  });

  it("no depende del signo", () => {
    for (const q of MAGNITUDES_PERMITIDAS) {
      expect(radioVisualCarga(-q, 1)).toBe(radioVisualCarga(q, 1));
    }
  });

  it("nunca pasa de 20 y es monótono en |q| para cualquier escalaCss en (0, 2]", () => {
    for (const e of [2, 1.5, 1, 0.75, 0.5, 0.3, 0.1, 0.02]) {
      let previo = 0;
      for (const q of MAGNITUDES_PERMITIDAS) {
        const r = radioVisualCarga(q, e);
        expect(r).toBeLessThanOrEqual(RADIO_VISUAL_MAX);
        expect(r).toBeGreaterThanOrEqual(previo);
        previo = r;
      }
    }
  });

  it("con canvas reducido (>= 0.5) el diámetro visible es >= 10 px CSS", () => {
    for (const e of [1, 0.75, 0.5]) {
      for (const q of MAGNITUDES_PERMITIDAS) {
        expect(radioVisualCarga(q, e) * 2 * e).toBeGreaterThanOrEqual(10 - 1e-9);
      }
    }
  });

  it("el radio FÍSICO no cambia (regresión)", () => {
    expect(RADIO_CARGA_PX).toBe(14);
  });
});

describe("C15 halo de intensidad", () => {
  it("alfaHalo(q) = 0.6·|q|/5, creciente y <= 0.6", () => {
    expect(alfaHalo(0.5)).toBeCloseTo(0.06, 12);
    expect(alfaHalo(1)).toBeCloseTo(0.12, 12);
    expect(alfaHalo(5)).toBeCloseTo(0.6, 12);
    expect(alfaHalo(-2.5)).toBeCloseTo(0.3, 12);
    let previo = 0;
    for (const q of MAGNITUDES_PERMITIDAS) {
      expect(alfaHalo(q)).toBeGreaterThan(previo);
      expect(alfaHalo(q)).toBeLessThanOrEqual(0.6 + 1e-12);
      previo = alfaHalo(q);
    }
  });
});
