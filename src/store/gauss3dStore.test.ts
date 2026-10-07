import { beforeEach, describe, expect, it } from "vitest";
import { rangoTamano, superficieDeUI, useGauss3dStore } from "./gauss3dStore";

const s = () => useGauss3dStore.getState();

describe("gauss3dStore", () => {
  beforeEach(() => s().aplicarEscenario(2));

  it("escenario 2: esfera R=5 con una carga +3", () => {
    expect(s().escenarioId).toBe(2);
    expect(s().forma).toBe("esfera");
    expect(s().tamano).toBe(5);
    expect(s().cargas.map((c) => c.q)).toEqual([3]);
  });
  it("cada escenario carga forma, cargas y toggles; el 7 trae dos cargas", () => {
    s().aplicarEscenario(7);
    expect(s().cargas.map((c) => c.q)).toEqual([3, -3]);
    expect(s().mostrar.campo).toBe(true);
    s().aplicarEscenario(5);
    expect(s().forma).toBe("cubo");
    s().aplicarEscenario(3, { fuera: true });
    expect(s().cargas[0].x0).toBe(8);
  });
  it("máximo 2 cargas; añadir selecciona la nueva y quitar vuelve a una", () => {
    s().anadirCarga();
    s().anadirCarga();
    expect(s().cargas).toHaveLength(2);
    expect(s().seleccionada).toBe(1);
    expect(s().cargas[1].q).toBe(-3);
    s().quitarCarga();
    s().quitarCarga();
    expect(s().cargas).toHaveLength(1);
    expect(s().seleccionada).toBe(0);
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
