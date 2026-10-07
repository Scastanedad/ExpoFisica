/** Durante el arrastre solo bajan líneas, paso y flechas: la malla de parches se mantiene fina (sin borde escalonado). */
import { describe, expect, it } from "vitest";
import { NIVELES_GAUSS3D } from "../../fisica/gauss3d/constantes";
import { generarMalla } from "../../fisica/gauss3d/mallas";
import type { Superficie } from "../../fisica/gauss3d/tipos";
import { crearFirma3D, type DatosFirma3D } from "./firma3d";
import { construirGeometria, crearEstadoGeometria } from "./geometria";

const sup: Superficie = { tipo: "cubo", lado: 8 };
const cargas = [{ x: 3, y: 1, z: 1, q: 3 }];

describe("calidad de malla independiente de la de líneas", () => {
  it("calidad 2 con calidadMalla 0 genera la malla de la calidad alta y las líneas del presupuesto bajo", () => {
    const g = construirGeometria(crearEstadoGeometria(), { superficie: sup, cargas, calidad: 2, calidadMalla: 0 }, { lineas: true, campo: false });
    expect(g.malla.nParches).toBe(generarMalla(sup, NIVELES_GAUSS3D[0]).nParches);
    expect(g.malla.nParches).toBeGreaterThan(generarMalla(sup, NIVELES_GAUSS3D[2]).nParches);
    expect(g.lineas.n).toBeLessThanOrEqual(NIVELES_GAUSS3D[2].presupuestoLineas);
    expect(g.calidad).toBe(2);
  });
  it("sin calidadMalla se comporta como antes (la misma que calidad)", () => {
    const g = construirGeometria(crearEstadoGeometria(), { superficie: sup, cargas, calidad: 2 }, { lineas: false, campo: false });
    expect(g.malla.nParches).toBe(generarMalla(sup, NIVELES_GAUSS3D[2]).nParches);
  });
  it("la firma distingue calidadMalla", () => {
    const d = (cm: 0 | 1 | 2): DatosFirma3D => ({
      escenario: { superficie: sup, cargas, calidad: 2, calidadMalla: cm },
      camara: { azimut: 0, inclinacion: 0.5, zoom: 1, fov: 0.8, ancho: 900, alto: 500 },
      dpr: 1,
      mostrar: { lineas: true, flujo: true, campo: false },
      opacidad: 1,
      encuadre: 0,
    });
    const f = crearFirma3D();
    f.comparar(d(0));
    f.guardar(d(0));
    expect(f.comparar(d(0))).toBe("igual");
    expect(f.comparar(d(2))).toBe("geometria");
  });
});
