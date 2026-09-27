import { describe, expect, it } from "vitest";
import type { PuntoCarga } from "../fisica/coulomb";
import { crearFirma, type DatosFirma } from "./firmaCapa";

const base = (puntos: PuntoCarga[], extra: Partial<DatosFirma> = {}): DatosFirma => ({
  puntos,
  ancho: 700,
  alto: 500,
  escalaCss: 1,
  modo: "equipotenciales",
  calidad: 0,
  unidad: "microC",
  ...extra,
});
const dos = (): PuntoCarga[] => [
  { x: 100, y: 100, q: 1 },
  { x: 300, y: 200, q: -1 },
];

describe("firma de la capa en caché", () => {
  it("sin firma guardada todo cuenta como cambio de estructura", () => {
    expect(crearFirma().comparar(base(dos()))).toBe("estructura");
  });

  it("los mismos datos: igual (no se recalcula nada)", () => {
    const f = crearFirma();
    f.guardar(base(dos()));
    expect(f.comparar(base(dos()))).toBe("igual");
  });

  it("mover una carga: solo posiciones (se puede limitar la frecuencia)", () => {
    const f = crearFirma();
    f.guardar(base(dos()));
    const p = dos();
    p[1].x += 0.001;
    expect(f.comparar(base(p))).toBe("posiciones");
  });

  it("cambiar magnitud, modo, tamaño, calidad, escala, resolución, unidad o el número de cargas: estructura", () => {
    const f = crearFirma();
    f.guardar(base(dos()));
    const q = dos();
    q[0].q = 1.5;
    expect(f.comparar(base(q))).toBe("estructura");
    expect(f.comparar(base(dos(), { modo: "lineas" }))).toBe("estructura");
    expect(f.comparar(base(dos(), { ancho: 520 }))).toBe("estructura");
    expect(f.comparar(base(dos(), { calidad: 1 }))).toBe("estructura");
    expect(f.comparar(base(dos(), { escalaCss: 0.5 }))).toBe("estructura");
    expect(f.comparar(base(dos(), { unidad: "normalizada" }))).toBe("estructura");
    expect(f.comparar(base([...dos(), { x: 1, y: 1, q: 1 }]))).toBe("estructura");
  });

  it("cambiar la resolución del bitmap (DPR o cambio de monitor): estructura", () => {
    const f = crearFirma();
    f.guardar(base(dos(), { resolucion: 1 }));
    expect(f.comparar(base(dos(), { resolucion: 2 }))).toBe("estructura");
  });

  it("sin `resolucion` explícita, se asume 1 en ambos lados (compatibilidad)", () => {
    const f = crearFirma();
    f.guardar(base(dos()));
    expect(f.comparar(base(dos(), { resolucion: 1 }))).toBe("igual");
  });

  it("cambiar el toggle de líneas en equipotenciales: estructura", () => {
    const f = crearFirma();
    f.guardar(base(dos(), { mostrarLineas: true }));
    expect(f.comparar(base(dos(), { mostrarLineas: false }))).toBe("estructura");
  });

  it("sin `mostrarLineas` explícito, se asume `true` en ambos lados (compatibilidad)", () => {
    const f = crearFirma();
    f.guardar(base(dos()));
    expect(f.comparar(base(dos(), { mostrarLineas: true }))).toBe("igual");
  });

  it("un cambio de estructura y de posición a la vez cuenta como estructura", () => {
    const f = crearFirma();
    f.guardar(base(dos()));
    const p = dos();
    p[0].x = 5;
    p[0].q = 2;
    expect(f.comparar(base(p))).toBe("estructura");
  });

  it("una variación de escalaCss por debajo de 0.001 se ignora (ruido del ResizeObserver)", () => {
    const f = crearFirma();
    f.guardar(base(dos(), { escalaCss: 0.5 }));
    expect(f.comparar(base(dos(), { escalaCss: 0.5002 }))).toBe("igual");
  });
});
