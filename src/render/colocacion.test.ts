import { describe, expect, it } from "vitest";
import { LIMITE_ARRASTRE, type Posicion } from "./controladorEscena";
import { radioAgarre } from "./geometriaCargas";
import { SEPARACION_OBJETIVO_EN_RADIOS, elegirPosicionNueva, posicionesEnAnillo } from "./colocacion";

const ANCHO = 700;
const ALTO = 500;

function distanciaMinima(ps: Posicion[]): number {
  let m = Infinity;
  for (let i = 0; i < ps.length; i++) {
    for (let j = i + 1; j < ps.length; j++) m = Math.min(m, Math.hypot(ps[i].x - ps[j].x, ps[i].y - ps[j].y));
  }
  return m;
}

function agregarN(inicial: Posicion[], n: number, objetivo: number): Posicion[] {
  const ps = [...inicial];
  for (let i = 0; i < n; i++) ps.push(elegirPosicionNueva(ps, ANCHO, ALTO, objetivo));
  return ps;
}

describe("colocacion", () => {
  it("el anillo reparte n puntos en un círculo centrado, el primero arriba", () => {
    const ps = posicionesEnAnillo(4, ANCHO, ALTO);
    expect(ps).toHaveLength(4);
    expect(ps[0].x).toBeCloseTo(ANCHO / 2);
    expect(ps[0].y).toBeLessThan(ALTO / 2);
  });

  it("sin cargas previas, la nueva va al centro", () => {
    expect(elegirPosicionNueva([], ANCHO, ALTO, 88)).toEqual({ x: ANCHO / 2, y: ALTO / 2 });
  });

  it("hasta 8 cargas nuevas nunca comparten zona de agarre (escala 1:1 y escala móvil)", () => {
    for (const escalaCss of [1, 0.5]) {
      const objetivo = SEPARACION_OBJETIVO_EN_RADIOS * radioAgarre(escalaCss);
      const inicial = posicionesEnAnillo(2, ANCHO, ALTO);
      const ps = agregarN(inicial, 6, objetivo);
      expect(ps).toHaveLength(8);
      expect(distanciaMinima(ps)).toBeGreaterThanOrEqual(objetivo);
      expect(distanciaMinima(ps)).toBeGreaterThanOrEqual(2 * radioAgarre(escalaCss));
    }
  });

  it("respeta el margen de borde", () => {
    const ps = agregarN([{ x: 350, y: 250 }], 10, 88);
    for (const p of ps) {
      expect(p.x).toBeGreaterThanOrEqual(LIMITE_ARRASTRE);
      expect(p.x).toBeLessThanOrEqual(ANCHO - LIMITE_ARRASTRE);
      expect(p.y).toBeGreaterThanOrEqual(LIMITE_ARRASTRE);
      expect(p.y).toBeLessThanOrEqual(ALTO - LIMITE_ARRASTRE);
    }
  });

  it("no cae sobre una carga que el visitante arrastró al centro", () => {
    const arrastradas: Posicion[] = [
      { x: 350, y: 250 },
      { x: 350, y: 125 },
    ];
    const nueva = elegirPosicionNueva(arrastradas, ANCHO, ALTO, 88);
    for (const p of arrastradas) expect(Math.hypot(nueva.x - p.x, nueva.y - p.y)).toBeGreaterThanOrEqual(88);
  });

  it("con el recuadro saturado elige la posición más despejada", () => {
    // Objetivo imposible de cumplir: debe maximizar la distancia mínima igualmente.
    const ps = [{ x: 350, y: 250 }];
    const nueva = elegirPosicionNueva(ps, ANCHO, ALTO, 10_000);
    const d = Math.hypot(nueva.x - 350, nueva.y - 250);
    // Esquina más lejana de la malla, ~ hipotenusa de (330, 230).
    expect(d).toBeGreaterThan(390);
  });
});
