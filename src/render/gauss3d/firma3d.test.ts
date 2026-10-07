import { describe, expect, it } from "vitest";
import type { Carga3D, Escenario } from "../../fisica/gauss3d/tipos";
import { crearFirma3D, type DatosFirma3D } from "./firma3d";

function datos(over: Partial<{ cargas: Carga3D[]; radio: number; calidad: 0 | 1 | 2; az: number; ancho: number; flujo: boolean; lineas: boolean; opacidad: number }> = {}): DatosFirma3D {
  const escenario: Escenario = {
    superficie: { tipo: "esfera", radio: over.radio ?? 5 },
    cargas: over.cargas ?? [{ x: 1, y: 2, z: 3, q: 3 }],
    calidad: over.calidad ?? 0,
  };
  return {
    escenario,
    camara: { azimut: over.az ?? 0.6, inclinacion: 0.5, zoom: 1, fov: 35, ancho: over.ancho ?? 900, alto: 500 },
    dpr: 1,
    mostrar: { lineas: over.lineas ?? true, flujo: over.flujo ?? true, campo: false },
    opacidad: over.opacidad ?? 1,
  };
}

describe("firma3d", () => {
  it("sin firma guardada pide geometría; con la misma entrada es igual", () => {
    const f = crearFirma3D();
    expect(f.comparar(datos())).toBe("geometria");
    f.guardar(datos());
    expect(f.comparar(datos())).toBe("igual");
  });

  it("cámara, tamaño, opacidad y toggle de flujo solo reproyectan", () => {
    const f = crearFirma3D();
    f.guardar(datos());
    expect(f.comparar(datos({ az: 1 }))).toBe("camara");
    expect(f.comparar(datos({ ancho: 600 }))).toBe("camara");
    expect(f.comparar(datos({ opacidad: 0.5 }))).toBe("camara");
    expect(f.comparar(datos({ flujo: false }))).toBe("camara");
  });

  it("carga, tamaño, calidad, nº de cargas y toggle de líneas recalculan la geometría", () => {
    const f = crearFirma3D();
    f.guardar(datos());
    expect(f.comparar(datos({ cargas: [{ x: 1, y: 2, z: 3.01, q: 3 }] }))).toBe("geometria");
    expect(f.comparar(datos({ cargas: [{ x: 1, y: 2, z: 3, q: 2 }] }))).toBe("geometria");
    expect(f.comparar(datos({ radio: 6 }))).toBe("geometria");
    expect(f.comparar(datos({ calidad: 2 }))).toBe("geometria");
    expect(f.comparar(datos({ lineas: false }))).toBe("geometria");
    expect(
      f.comparar(
        datos({
          cargas: [
            { x: 1, y: 2, z: 3, q: 3 },
            { x: -4, y: 0, z: 0, q: -1 },
          ],
        }),
      ),
    ).toBe("geometria");
  });

  it("geometría gana si cambian geometría y cámara a la vez; tras guardar vuelve a igual", () => {
    const f = crearFirma3D();
    f.guardar(datos());
    const d = datos({ az: 2, radio: 4 });
    expect(f.comparar(d)).toBe("geometria");
    f.guardar(d);
    expect(f.comparar(d)).toBe("igual");
  });
});
