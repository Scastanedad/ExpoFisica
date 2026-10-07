import { describe, expect, it } from "vitest";
import { crearCamaraProy, derivarCamara, proyectarPunto } from "./camara";
import { cargaBajoPuntero, cortePlanoHorizontal, direccionTeclado, puntoEnPlano, radioAgarre3D, rayoDePantalla } from "./interaccion";

function camara(az = 0.6, inc = 0.5) {
  const c = crearCamaraProy();
  derivarCamara({ azimut: az, inclinacion: inc, zoom: 1, fov: 35, ancho: 800, alto: 600 }, 8, c);
  return c;
}

describe("rayo–plano", () => {
  it("invierte la proyección: píxel → punto del plano z", () => {
    const cam = camara();
    const out = new Float64Array(2);
    const t = new Float32Array(3);
    for (const [x, y, z] of [
      [0, 0, 0],
      [3, -2, 1.5],
      [-6, 4, -3],
      [10, 10, 2],
    ]) {
      proyectarPunto(cam, x, y, z, t, 0);
      expect(puntoEnPlano(cam, t[0], t[1], z, out)).toBe(true);
      expect(out[0]).toBeCloseTo(x, 3);
      expect(out[1]).toBeCloseTo(y, 3);
    }
  });
  it("el rayo central pasa por el origen", () => {
    const cam = camara(0.3, 0.9);
    const o = new Float64Array(3);
    const d = new Float64Array(3);
    rayoDePantalla(cam, cam.cx, cam.cy, o, d);
    const out = new Float64Array(2);
    expect(cortePlanoHorizontal(o, d, 0, out)).toBe(true);
    expect(Math.hypot(out[0], out[1])).toBeLessThan(1e-6);
  });
  it("sin corte por encima del horizonte o con rayo paralelo", () => {
    const out = new Float64Array(2);
    expect(cortePlanoHorizontal(new Float64Array([0, 0, 5]), new Float64Array([1, 0, 0]), 0, out)).toBe(false);
    expect(cortePlanoHorizontal(new Float64Array([0, 0, 5]), new Float64Array([0, 1, 1]), 0, out)).toBe(false);
  });
});

describe("agarre", () => {
  it("al menos 22 px de radio (44 px de diámetro)", () => {
    expect(radioAgarre3D(5)).toBeGreaterThanOrEqual(22);
    expect(radioAgarre3D(20)).toBeGreaterThan(22);
  });
  it("elige la carga más cercana dentro del agarre; fuera devuelve -1", () => {
    const qx = [100, 130];
    const qy = [100, 100];
    const qp = [10, 10];
    expect(cargaBajoPuntero(120, 100, qx, qy, qp, 2, [8, 8])).toBe(1);
    expect(cargaBajoPuntero(80, 100, qx, qy, qp, 2, [8, 8])).toBe(0);
    expect(cargaBajoPuntero(100, 150, qx, qy, qp, 2, [8, 8])).toBe(-1);
  });
  it("con cargas solapadas gana la más cercana al ojo", () => {
    expect(cargaBajoPuntero(100, 100, [100, 101], [100, 100], [20, 5], 2, [8, 8])).toBe(1);
  });
});

describe("teclado relativo a la vista", () => {
  it("con azimut 0: derecha = +x, arriba = +y", () => {
    const r = direccionTeclado("ArrowRight", 0)!;
    const u = direccionTeclado("ArrowUp", 0)!;
    expect(r[0]).toBeCloseTo(1);
    expect(u[1]).toBeCloseTo(1);
    expect(direccionTeclado("a", 0)).toBeNull();
  });
});
