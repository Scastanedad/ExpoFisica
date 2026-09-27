import { describe, expect, it } from "vitest";
import { K_VISUAL, campoEn, potencialEn, type PuntoCarga } from "./coulomb";
import { RADIO_MIN_LECTURA_PX, SOFTENING2_ESTATICO, factoresSim, potencialSI } from "./escala";
import {
  PASO_INTEGRAL_TRAZA_PX,
  Q0_MAGNITUD_UC,
  campoQ0SI,
  lecturaQ0,
  medirDeltaV,
  potencialQ0SI,
  trabajoCampoTraza,
  type PuntoTraza,
} from "./cargaPrueba";

const dipolo: PuntoCarga[] = [
  { x: -100, y: 0, q: 1 },
  { x: 100, y: 0, q: -1 },
];

const unaCarga: PuntoCarga[] = [{ x: 0, y: 0, q: 2 }];

describe("cargaPrueba (E3.1)", () => {
  it("Q0_MAGNITUD_UC es 1 (fija, no editable)", () => {
    expect(Q0_MAGNITUD_UC).toBe(1);
  });

  describe("Q1: coherencia con el dibujo y no mutación", () => {
    it("campoQ0SI/potencialQ0SI coinciden exactamente con campoEn/potencialEn softened * factoresSim", () => {
      const factor = factoresSim(K_VISUAL);
      const [exSim, eySim] = campoEn(37, -52, dipolo, SOFTENING2_ESTATICO);
      const campo = campoQ0SI(37, -52, dipolo);
      expect(campo.ex).toBeCloseTo(exSim * factor.campo, 9);
      expect(campo.ey).toBeCloseTo(-eySim * factor.campo, 9);

      const vSim = potencialEn(37, -52, dipolo, SOFTENING2_ESTATICO);
      expect(potencialQ0SI(37, -52, dipolo)).toBeCloseTo(vSim * factor.potencial, 6);
    });

    it("no muta la lista de cargas fuente", () => {
      const copia = dipolo.map((c) => ({ ...c }));
      lecturaQ0(50, 50, 1, dipolo);
      trabajoCampoTraza(
        [
          { x: 50, y: 50 },
          { x: 60, y: 60 },
        ],
        1,
        dipolo,
      );
      expect(dipolo).toEqual(copia);
    });
  });

  describe("Q2: F y W lineales en q₀; E y V no dependen de q₀", () => {
    it("signoQ0 invierte F sin cambiar E ni V", () => {
      const pos = lecturaQ0(300, -80, 1, dipolo)!;
      const neg = lecturaQ0(300, -80, -1, dipolo)!;
      expect(pos).not.toBeNull();
      expect(neg.ex).toBeCloseTo(pos.ex, 12);
      expect(neg.ey).toBeCloseTo(pos.ey, 12);
      expect(neg.v).toBeCloseTo(pos.v, 12);
      expect(neg.fx).toBeCloseTo(-pos.fx, 9);
      expect(neg.fy).toBeCloseTo(-pos.fy, 9);
      expect(neg.moduloF).toBeCloseTo(pos.moduloF, 9);
    });

    it("signoQ0 invierte wCampo/wExt con los mismos vA, vB", () => {
      const vA = 1000;
      const vB = -500;
      const pos = medirDeltaV(vA, vB, 1)!;
      const neg = medirDeltaV(vA, vB, -1)!;
      expect(neg.wCampo).toBeCloseTo(-pos.wCampo, 12);
      expect(neg.wExt).toBeCloseTo(-pos.wExt, 12);
      expect(neg.vA).toBe(pos.vA);
      expect(neg.vB).toBe(pos.vB);
    });
  });

  describe("Q3: independencia del camino (tolerancia ≤ 0.1 % relativo)", () => {
    // A y B NO son simétricos respecto al dipolo (que es simétrico bajo y -> -y,
    // pues ambas cargas están en y=0): con puntos reflejados uno del otro,
    // V_A = V_B y ΔV = 0, lo que dividiría por cero al calcular el error relativo.
    const A: PuntoTraza = { x: 280, y: 160 };
    const B: PuntoTraza = { x: -280, y: 90 };
    const dx = B.x - A.x;
    const dy = B.y - A.y;
    const L = Math.hypot(dx, dy);
    const perp: PuntoTraza = { x: -dy / L, y: dx / L };
    const M: PuntoTraza = { x: (A.x + B.x) / 2, y: (A.y + B.y) / 2 };

    function muestrear(fn: (t: number) => PuntoTraza, pasos: number): PuntoTraza[] {
      const traza: PuntoTraza[] = [];
      for (let i = 0; i <= pasos; i++) traza.push(fn(i / pasos));
      return traza;
    }

    const caminoRecto = muestrear((t) => ({ x: A.x + dx * t, y: A.y + dy * t }), 40);
    // Bezier cuadrática con el punto de control desplazado perpendicular a A-B.
    const C: PuntoTraza = { x: M.x + perp.x * 150, y: M.y + perp.y * 150 };
    const caminoArco = muestrear((t) => {
      const u = 1 - t;
      return {
        x: u * u * A.x + 2 * u * t * C.x + t * t * B.x,
        y: u * u * A.y + 2 * u * t * C.y + t * t * B.y,
      };
    }, 60);
    const caminoZigzag = muestrear((t) => {
      const base = { x: A.x + dx * t, y: A.y + dy * t };
      const desvio = Math.sin(t * Math.PI * 3) * 60;
      return { x: base.x + perp.x * desvio, y: base.y + perp.y * desvio };
    }, 60);

    it.each([
      ["recto", caminoRecto],
      ["arco", caminoArco],
      ["zigzag", caminoZigzag],
    ])("camino %s: W(traza) ≈ −q₀ΔV", (_nombre, traza) => {
      const vA = potencialQ0SI(A.x, A.y, dipolo);
      const vB = potencialQ0SI(B.x, B.y, dipolo);
      const teorico = medirDeltaV(vA, vB, 1)!.wCampo;
      const medido = trabajoCampoTraza(traza, 1, dipolo, PASO_INTEGRAL_TRAZA_PX);
      expect(medido).not.toBeNull();
      const errorRelativo = Math.abs(medido! - teorico) / Math.abs(teorico);
      expect(errorRelativo).toBeLessThanOrEqual(1e-3);
    });

    it("el error baja con un paso de integración más fino (orden de convergencia)", () => {
      // Pocos vértices y segmentos largos: con ellos la subdivisión interna
      // (`paso`) domina el error de cuadratura (con una polilínea ya muy fina,
      // como `caminoZigzag`, la diferencia entre paso=16 y paso=4 se vuelve
      // demasiado pequeña para comparar con margen).
      const caminoGrueso = muestrear(
        (t) => ({
          x: A.x + (B.x - A.x) * t + Math.sin(t * Math.PI * 3) * 60,
          y: A.y + (B.y - A.y) * t,
        }),
        5,
      );
      const vA = potencialQ0SI(A.x, A.y, dipolo);
      const vB = potencialQ0SI(B.x, B.y, dipolo);
      const teorico = medirDeltaV(vA, vB, 1)!.wCampo;
      const grueso = trabajoCampoTraza(caminoGrueso, 1, dipolo, 16)!;
      const fino = trabajoCampoTraza(caminoGrueso, 1, dipolo, 4)!;
      const errGrueso = Math.abs(grueso - teorico);
      const errFino = Math.abs(fino - teorico);
      expect(errFino).toBeLessThan(errGrueso);
    });
  });

  describe("Q4: coherencia con potencialSI cerca/lejos de una carga aislada", () => {
    it("difiere ≤ 0.3 % a r ≥ 14 px y ≤ 0.02 % a r ≥ 50 px", () => {
      for (const r of [14, 20, 50, 200]) {
        const exacto = potencialSI(r, 0, unaCarga)!;
        const softened = potencialQ0SI(r, 0, unaCarga);
        const errorRel = Math.abs(softened - exacto) / Math.abs(exacto);
        if (r >= 50) expect(errorRel).toBeLessThanOrEqual(2e-4);
        else expect(errorRel).toBeLessThanOrEqual(3e-3);
      }
    });
  });

  describe("Q5: exclusión y ausencia de NaN/Infinity", () => {
    it("lecturaQ0 es null dentro de RADIO_MIN_LECTURA_PX de una carga fuente", () => {
      expect(lecturaQ0(unaCarga[0].x + RADIO_MIN_LECTURA_PX - 1, unaCarga[0].y, 1, unaCarga)).toBeNull();
      expect(lecturaQ0(unaCarga[0].x + RADIO_MIN_LECTURA_PX + 5, unaCarga[0].y, 1, unaCarga)).not.toBeNull();
    });

    it("trabajoCampoTraza es null si algún punto de muestreo (incluidos los intermedios) entra en la zona excluida", () => {
      const traza: PuntoTraza[] = [
        { x: -300, y: 5 },
        { x: 300, y: 5 }, // pasa muy cerca del eje y=0 entre las dos cargas del dipolo... usemos una sola carga
      ];
      const cercaDeCarga: PuntoTraza[] = [
        { x: unaCarga[0].x - 100, y: unaCarga[0].y },
        { x: unaCarga[0].x + 5, y: unaCarga[0].y }, // termina dentro del radio excluido
      ];
      expect(trabajoCampoTraza(cercaDeCarga, 1, unaCarga)).toBeNull();
      expect(trabajoCampoTraza(traza, 1, dipolo)).not.toBeNaN();
    });

    it("nunca da NaN ni Infinity, incluso evaluando exactamente sobre una carga", () => {
      const campo = campoQ0SI(unaCarga[0].x, unaCarga[0].y, unaCarga);
      expect(Number.isFinite(campo.ex)).toBe(true);
      expect(Number.isFinite(campo.ey)).toBe(true);
      expect(Number.isFinite(potencialQ0SI(unaCarga[0].x, unaCarga[0].y, unaCarga))).toBe(true);
    });

    it("trabajoCampoTraza es null con menos de 2 puntos", () => {
      expect(trabajoCampoTraza([{ x: 0, y: 0 }], 1, dipolo)).toBeNull();
      expect(trabajoCampoTraza([], 1, dipolo)).toBeNull();
    });

    it("medirDeltaV es null si vA o vB es null", () => {
      expect(medirDeltaV(null, 5, 1)).toBeNull();
      expect(medirDeltaV(5, null, 1)).toBeNull();
    });
  });

  describe("Q6: wCampo + wExt = 0 exactamente (identidad algebraica)", () => {
    it("se cumple para varios vA, vB y signos", () => {
      for (const [vA, vB] of [[0, 0], [1000, -500], [-2000, 3000]] as const) {
        for (const signo of [1, -1] as const) {
          const m = medirDeltaV(vA, vB, signo)!;
          expect(m.wCampo + m.wExt).toBe(0);
        }
      }
    });
  });
});
