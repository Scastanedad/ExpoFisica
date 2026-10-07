import { describe, expect, it } from "vitest";
import { puntosFibonacci } from "../../fisica/gauss3d/lineas3d";
import type { Camara } from "../../fisica/gauss3d/tipos";
import { crearCamaraProy, derivarCamara, escalaEnProfundidad, INCLINACION_MAX, INCLINACION_MIN, limitarInclinacion, proyectarPunto, proyectarPuntos } from "./camara";

const rad = (g: number) => (g * Math.PI) / 180;
const cam = (az: number, inc: number, zoom = 1, ancho = 970, alto = 547): Camara => ({
  azimut: rad(az),
  inclinacion: rad(inc),
  zoom,
  fov: 35,
  ancho,
  alto,
});

function proy(c: ReturnType<typeof crearCamaraProy>, x: number, y: number, z: number): [number, number, number] {
  const o = new Float64Array(3);
  proyectarPunto(c, x, y, z, o, 0);
  return [o[0], o[1], o[2]];
}

describe("camara Gauss 3D", () => {
  it("el origen cae en el centro del canvas y a distancia D", () => {
    const c = derivarCamara(cam(35, 30), 7, crearCamaraProy());
    const [x, y, d] = proy(c, 0, 0, 0);
    expect(x).toBeCloseTo(485, 3);
    expect(y).toBeCloseTo(273.5, 3);
    expect(d).toBeCloseTo(c.distancia, 6);
  });

  it("azimut 0: +x va a la derecha, +z arriba, +y se aleja (menos escala)", () => {
    const c = derivarCamara(cam(0, 30), 7, crearCamaraProy());
    expect(proy(c, 3, 0, 0)[0]).toBeGreaterThan(485);
    expect(proy(c, 0, 0, 3)[1]).toBeLessThan(273.5);
    expect(proy(c, 0, 5, 0)[2]).toBeGreaterThan(proy(c, 0, -5, 0)[2]);
    // el ojo está en −y: un punto cercano al ojo se ve MÁS grande que uno lejano
    const cerca = Math.abs(proy(c, 3, -4, 0)[0] - 485);
    const lejos = Math.abs(proy(c, 3, 4, 0)[0] - 485);
    expect(cerca).toBeGreaterThan(lejos);
  });

  it("la matriz R es ortonormal y la posición del ojo está a distancia D del origen", () => {
    for (const [az, inc] of [[0, 15], [35, 30], [120, 60], [-77, 85]]) {
      const c = derivarCamara(cam(az, inc), 9, crearCamaraProy());
      const R = c.R;
      for (let i = 0; i < 3; i++) {
        for (let j = 0; j < 3; j++) {
          const dot = R[3 * i] * R[3 * j] + R[3 * i + 1] * R[3 * j + 1] + R[3 * i + 2] * R[3 * j + 2];
          expect(dot).toBeCloseTo(i === j ? 1 : 0, 6);
        }
      }
      expect(Math.hypot(c.pos[0], c.pos[1], c.pos[2])).toBeCloseTo(c.distancia, 4);
      // z positiva del ojo = por encima del suelo
      expect(c.pos[2]).toBeGreaterThan(0);
    }
  });

  it("la inclinación se acota a [15°, 85°]", () => {
    expect(limitarInclinacion(rad(-10))).toBeCloseTo(INCLINACION_MIN, 12);
    expect(limitarInclinacion(rad(120))).toBeCloseTo(INCLINACION_MAX, 12);
    const a = derivarCamara(cam(0, 5), 7, crearCamaraProy());
    const b = derivarCamara(cam(0, 15), 7, crearCamaraProy());
    expect(Array.from(a.R)).toEqual(Array.from(b.R));
  });

  it("auto-encuadre: la esfera de radio rEncuadre cabe en el canvas en cualquier vista y tamaño", () => {
    const pts = puntosFibonacci(400, 0.3);
    const xs = new Float32Array(400);
    const ys = new Float32Array(400);
    const pr = new Float32Array(400);
    for (const [ancho, alto] of [[970, 547], [358, 438], [1400, 800]]) {
      for (const [az, inc] of [[0, 15], [90, 30], [200, 60], [-45, 85]]) {
        const rEnc = 8;
        const c = derivarCamara({ ...cam(az, inc, 1, ancho, alto) }, rEnc, crearCamaraProy());
        const p = new Float32Array(1200);
        for (let i = 0; i < 1200; i++) p[i] = pts[i] * rEnc;
        proyectarPuntos(c, p, 400, xs, ys, pr);
        for (let i = 0; i < 400; i++) {
          expect(xs[i]).toBeGreaterThanOrEqual(0);
          expect(xs[i]).toBeLessThanOrEqual(ancho);
          expect(ys[i]).toBeGreaterThanOrEqual(0);
          expect(ys[i]).toBeLessThanOrEqual(alto);
        }
      }
    }
  });

  it("zoom 2 duplica la escala en el centro", () => {
    const a = derivarCamara(cam(35, 30, 1), 7, crearCamaraProy());
    const b = derivarCamara(cam(35, 30, 2), 7, crearCamaraProy());
    expect(b.encuadre / a.encuadre).toBeCloseTo(2, 9);
    expect(escalaEnProfundidad(b, b.distancia) / escalaEnProfundidad(a, a.distancia)).toBeCloseTo(2, 9);
  });

  it("proyectarPuntos escribe en Float32Array y coincide con proyectarPunto", () => {
    const c = derivarCamara(cam(70, 40), 7, crearCamaraProy());
    const p = new Float32Array([1, 2, 3, -4, 0.5, 6, 0, 0, 0]);
    const xs = new Float32Array(3);
    const ys = new Float32Array(3);
    const pr = new Float32Array(3);
    proyectarPuntos(c, p, 3, xs, ys, pr);
    for (let i = 0; i < 3; i++) {
      const [x, y, d] = proy(c, p[3 * i], p[3 * i + 1], p[3 * i + 2]);
      expect(xs[i]).toBeCloseTo(x, 3);
      expect(ys[i]).toBeCloseTo(y, 3);
      expect(pr[i]).toBeCloseTo(d, 3);
    }
  });

  it("puntos muy cerca del ojo no producen NaN ni infinitos", () => {
    const c = derivarCamara(cam(0, 30), 7, crearCamaraProy());
    const [x, y, d] = proy(c, c.pos[0], c.pos[1], c.pos[2]);
    expect(Number.isFinite(x) && Number.isFinite(y)).toBe(true);
    expect(d).toBeLessThan(c.zCercano);
  });
});
