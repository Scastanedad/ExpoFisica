import { describe, expect, it } from "vitest";
import { superficieDeUI } from "../../store/gauss3dStore";
import { DIST_MIN_CARGAS, DIST_MIN_SUP, NIVELES_GAUSS3D, RANGOS } from "./constantes";
import { calcularFlujo } from "./flujo";
import { generarMalla } from "./mallas";
import { posicionInicial, type Fuente } from "./presets";
import { distSignoRef } from "./referencia";
import type { TipoSuperficie } from "./tipos";

const FORMAS: TipoSuperficie[] = ["esfera", "cubo", "cilindro", "parche"];
const FUENTES: Fuente[] = ["carga", "dipolo"];

describe("posicionInicial", () => {
  for (const forma of FORMAS) {
    for (const fuente of FUENTES) {
      describe(`${forma} + ${fuente}`, () => {
        const p = posicionInicial(forma, fuente);
        const sup = superficieDeUI(forma, p.tamano, 0);

        it("número de cargas y signos (dipolo: +q y −q iguales)", () => {
          if (fuente === "carga") expect(p.cargas.map((c) => c.q)).toEqual([3]);
          else expect(p.cargas.map((c) => c.q)).toEqual([3, -3]);
        });

        it("dentro de los límites de RANGOS.carga y con tamaño válido", () => {
          const r = RANGOS.carga;
          for (const c of p.cargas) {
            expect(c.x).toBeGreaterThanOrEqual(r.x.min);
            expect(c.x).toBeLessThanOrEqual(r.x.max);
            expect(c.y).toBeGreaterThanOrEqual(r.y.min);
            expect(c.y).toBeLessThanOrEqual(r.y.max);
            expect(c.z).toBeGreaterThanOrEqual(r.z.min);
            expect(c.z).toBeLessThanOrEqual(r.z.max);
            expect(Math.abs(c.q)).toBeGreaterThanOrEqual(r.q.min);
            expect(Math.abs(c.q)).toBeLessThanOrEqual(r.q.max);
          }
          expect(p.tamano).toBeGreaterThan(0);
        });

        it("ninguna carga en la franja de exclusión ni a menos de la distancia mínima entre cargas", () => {
          if (forma !== "parche") {
            for (const c of p.cargas) expect(Math.abs(distSignoRef(sup, [c.x, c.y, c.z]))).toBeGreaterThanOrEqual(DIST_MIN_SUP);
          }
          if (p.cargas.length === 2) {
            const [a, b] = p.cargas;
            expect(Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z)).toBeGreaterThanOrEqual(DIST_MIN_CARGAS);
          }
        });

        it("devuelve objetos nuevos (no comparte referencias entre llamadas)", () => {
          const otra = posicionInicial(forma, fuente);
          expect(otra).not.toBe(p);
          expect(otra.cargas[0]).not.toBe(p.cargas[0]);
          expect(otra).toEqual(p);
        });

        it("Φ y q_enc de calcularFlujo (nivel alto)", () => {
          const malla = generarMalla(sup, NIVELES_GAUSS3D[0]);
          const r = calcularFlujo(malla, p.cargas, sup);
          if (forma === "parche") {
            expect(r.qEnc).toBe(0);
            if (fuente === "carga") expect(r.total).toBeCloseTo(0.5, 4); // L = 8, carga a 4 u: una cara de un cubo, q/6
            else expect(Math.abs(r.total)).toBeLessThan(1e-6); // simetría x → −x, no Gauss
          } else if (fuente === "carga") {
            expect(r.total).toBeCloseTo(3, 9);
            expect(r.qEnc).toBeCloseTo(3, 12);
          } else {
            expect(r.total).toBeCloseTo(0, 9);
            expect(r.qEnc).toBeCloseTo(0, 12);
          }
        });
      });
    }
  }

  it("tamaños: def de rangoTamano en las cerradas y 8 en el Plano", () => {
    expect(posicionInicial("esfera", "carga").tamano).toBe(5);
    expect(posicionInicial("cubo", "carga").tamano).toBe(8);
    expect(posicionInicial("cilindro", "carga").tamano).toBe(4);
    expect(posicionInicial("parche", "carga").tamano).toBe(8);
  });

  it("posiciones concretas: centro (carga) y x = ±2 (dipolo); Plano en z = −4", () => {
    expect(posicionInicial("esfera", "carga").cargas).toEqual([{ x: 0, y: 0, z: 0, q: 3 }]);
    expect(posicionInicial("cubo", "dipolo").cargas).toEqual([
      { x: -2, y: 0, z: 0, q: 3 },
      { x: 2, y: 0, z: 0, q: -3 },
    ]);
    expect(posicionInicial("parche", "dipolo").cargas.map((c) => c.z)).toEqual([-4, -4]);
  });
});
