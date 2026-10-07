/**
 * Medición de asignaciones del bucle de dibujo (diseño §7: «sin asignaciones por frame»; en la práctica, sin reasignar buffers y ≤ 8 KB por cuadro de cadenas de estilo y objetos de entrada). Se fuerza el recolector
 * (`--expose-gc` vía `v8.setFlagsFromString`) y se mide el heap tras N cuadros de giro de cámara (el caso del
 * arrastre de la vista): `actualizar` (proyección + clasificación) + `dibujar`. Con un contexto nulo, para medir solo
 * el código de la escena y no el del grabador de pruebas.
 *
 * Resultado medido (escenarios 2, 5 y 7, 1500 cuadros): ≈ 2,0 KB (esc. 2), 3,7 KB (esc. 5) y 3,8 KB (esc. 7) por cuadro, ver `TOPE_BYTES_POR_CUADRO`; los buffers (líneas, cruces,
 * proyección, marcas) se reutilizan; lo poco que queda son cadenas de color y los objetos de entrada de `actualizar`.
 */
import { setFlagsFromString } from "node:v8";
import { runInNewContext } from "node:vm";
import { describe, expect, it } from "vitest";
import { ESCENARIOS } from "../../fisica/gauss3d/escenarios";
import type { Ctx3D } from "./ctx3d";
import { crearMotorGauss3D, type EntradaMotor } from "./motor";

setFlagsFromString("--expose-gc");
const gc = runInNewContext("gc") as () => void;

/** Tope por cuadro (bytes): lejos de los cientos de KB que costaría reasignar buffers de líneas o mallas. */
export const TOPE_BYTES_POR_CUADRO = 8192;

function ctxNulo(): Ctx3D {
  const nada = () => undefined;
  return {
    strokeStyle: "",
    fillStyle: "",
    lineWidth: 1,
    lineJoin: "miter",
    lineCap: "butt",
    globalAlpha: 1,
    font: "",
    textAlign: "start",
    textBaseline: "alphabetic",
    save: nada,
    restore: nada,
    beginPath: nada,
    closePath: nada,
    moveTo: nada,
    lineTo: nada,
    arc: nada,
    stroke: nada,
    fill: nada,
    fillRect: nada,
    clearRect: nada,
    fillText: nada,
    strokeText: nada,
    setLineDash: nada,
    measureText: () => ({ width: 0 }),
  } as unknown as Ctx3D;
}

function entrada(id: number, azimut: number): EntradaMotor {
  const d = ESCENARIOS[id - 1];
  return {
    escenario: { superficie: d.superficie, cargas: d.cargas, calidad: 0 },
    camara: { azimut, inclinacion: d.vista.inclinacion, zoom: 1 },
    ancho: 970,
    alto: 547,
    dpr: 1,
    mostrar: { lineas: true, flujo: true, campo: true },
    opacidad: 1,
    unidad: 1,
  };
}

describe("bucle de dibujo sin asignaciones por cuadro", () => {
  for (const id of [2, 5, 7]) {
    it(`escenario ${id}: giro de cámara, asignación media por cuadro < ${TOPE_BYTES_POR_CUADRO} B`, () => {
      const motor = crearMotorGauss3D();
      const ctx = ctxNulo();
      const N = 1500;
      const e = entrada(id, 0);
      // calentamiento (JIT, buffers, cachés)
      for (let k = 0; k < 300; k++) {
        const ee = entrada(id, k * 0.01);
        motor.actualizar(ee);
        motor.dibujar(ctx, ee);
      }
      gc();
      const antes = process.memoryUsage().heapUsed;
      for (let k = 0; k < N; k++) {
        e.camara.azimut = k * 0.01;
        motor.actualizar(e);
        motor.dibujar(ctx, e);
      }
      const despues = process.memoryUsage().heapUsed;
      const porCuadro = (despues - antes) / N;
      expect(porCuadro).toBeLessThan(TOPE_BYTES_POR_CUADRO);
    });
  }

  it("sin cambios no hay recálculo ni asignación de geometría: actualizar devuelve «igual»", () => {
    const motor = crearMotorGauss3D();
    const e = entrada(2, 0.3);
    motor.actualizar(e);
    const g = motor.geometria();
    for (let k = 0; k < 50; k++) expect(motor.actualizar(e)).toBe("igual");
    expect(motor.geometria()).toBe(g);
  });
});
