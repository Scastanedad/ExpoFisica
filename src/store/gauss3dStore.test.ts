import { beforeEach, describe, expect, it } from "vitest";
import { rangoTamano, superficieDeUI, useGauss3dStore } from "./gauss3dStore";

const s = () => useGauss3dStore.getState();

describe("gauss3dStore", () => {
  beforeEach(() => {
    s().setForma("esfera");
    s().setFuente("carga");
    s().recolocar();
    s().setTamano(5);
  });

  it("estado inicial: Esfera R=5 + Una carga +3 en el origen, líneas y flujo activos", () => {
    expect(s().forma).toBe("esfera");
    expect(s().fuente).toBe("carga");
    expect(s().tamano).toBe(5);
    expect(s().cargas.map((c) => [c.q, c.x0, c.y0, c.z])).toEqual([[3, 0, 0, 0]]);
    expect(s().mostrar).toEqual({ lineas: true, flujo: true, campo: false });
  });
  it("setFuente(dipolo) pone +q y −q en x = ∓2 con ids nuevos y selecciona la +q", () => {
    const antes = s().cargas.map((c) => c.id);
    s().setFuente("dipolo");
    expect(s().cargas.map((c) => [c.q, c.x0])).toEqual([[3, -2], [-3, 2]]);
    expect(s().seleccionada).toBe(0);
    expect(s().cargas.some((c) => antes.includes(c.id))).toBe(false);
  });
  it("setForma recoloca y restablece el tamaño; el Plano arranca en L=8 y conserva θ", () => {
    s().setTamano(7);
    s().setForma("cubo");
    expect(s().tamano).toBe(8);
    s().setForma("parche");
    expect(s().tamano).toBe(8);
    expect(s().cargas.map((c) => [c.x0, c.y0, c.z])).toEqual([[0, 0, -4]]);
    s().setThetaDeg(40);
    s().setFuente("dipolo");
    expect(s().thetaDeg).toBe(40);
    expect(s().cargas.map((c) => c.z)).toEqual([-4, -4]);
    s().setForma("esfera");
    expect(s().thetaDeg).toBe(0);
    s().setForma("cilindro");
    expect(s().tamano).toBe(4);
  });
  it("setFuente y recolocar conservan el tamaño; recolocar da ids nuevos", () => {
    s().setTamano(7);
    s().setFuente("dipolo");
    expect(s().tamano).toBe(7);
    const ids = s().cargas.map((c) => c.id);
    s().seleccionar(1);
    s().recolocar();
    expect(s().tamano).toBe(7);
    expect(s().seleccionada).toBe(0);
    expect(s().cargas.map((c) => c.id)).not.toEqual(ids);
  });
  it("misma forma o misma fuente no cambia nada", () => {
    const c = s().cargas;
    s().setForma("esfera");
    s().setFuente("carga");
    expect(s().cargas).toBe(c);
  });
  it("dipolo: setQ cambia las dos magnitudes y alternarSigno invierte ambas", () => {
    s().setFuente("dipolo");
    s().setQ(4.5);
    expect(s().cargas.map((c) => c.q)).toEqual([4.5, -4.5]);
    s().seleccionar(1);
    s().setQ(1);
    expect(s().cargas.map((c) => c.q)).toEqual([1, -1]);
    s().alternarSigno();
    expect(s().cargas.map((c) => c.q)).toEqual([-1, 1]);
  });
  it("q conserva el signo, se cuantiza y se acota", () => {
    s().setQ(9);
    expect(s().cargas[0].q).toBe(5);
    s().alternarSigno();
    s().setQ(1.2);
    expect(s().cargas[0].q).toBe(-1);
    s().setQ(0);
    expect(s().cargas[0].q).toBe(-0.5);
  });
  it("z y tamaño se acotan; cambiar de forma usa el tamaño por defecto", () => {
    s().setZ(99);
    expect(s().cargas[0].z).toBe(10);
    s().setTamano(99);
    expect(s().tamano).toBe(rangoTamano("esfera").max);
    s().setForma("cubo");
    expect(s().tamano).toBe(8);
  });
  it("inclinación 15°–85°, azimut normalizado y vista inicial", () => {
    s().setInclinacionDeg(1);
    expect(s().inclinacionDeg).toBe(15);
    s().setInclinacionDeg(120);
    expect(s().inclinacionDeg).toBe(85);
    s().setAzimutDeg(190);
    expect(s().azimutDeg).toBe(-170);
    s().vistaInicial();
    expect([s().azimutDeg, s().inclinacionDeg, s().zoom]).toEqual([35, 30, 1]);
  });
  it("el cilindro mide 2R de alto y el parche usa θ", () => {
    expect(superficieDeUI("cilindro", 4, 0)).toMatchObject({ radio: 4, altura: 8 });
    const p = superficieDeUI("parche", 4, 90);
    expect(p.tipo === "parche" && p.theta).toBeCloseTo(Math.PI / 2);
  });
});
