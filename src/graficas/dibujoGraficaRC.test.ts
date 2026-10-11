import { describe, expect, it } from "vitest";
import {
  ALTO_GRAFICA_RC,
  ALTO_GRAFICA_RC_SALA,
  ANCHO_GRAFICA_RC,
  ANCHO_GRAFICA_RC_SALA,
  TAUS_MINIMOS,
  dibujarGraficaRC,
  disposicionGraficaRC,
  dominioTiempo,
  marcasTau,
  pieGraficaRC,
  rangoCorriente,
  type DatosGraficaRC,
} from "./dibujoGraficaRC";
import type { ContextoGrafica } from "./dibujoGrafica";

/** Contexto que solo anota qué se dibuja. */
function ctxGrabador() {
  const textos: string[] = [];
  const arcos: number[] = [];
  const ctx = {
    strokeStyle: "",
    fillStyle: "",
    lineWidth: 1,
    lineJoin: "",
    font: "",
    textAlign: "",
    textBaseline: "",
    save() {},
    restore() {},
    translate() {},
    rotate() {},
    beginPath() {},
    moveTo() {},
    lineTo() {},
    arc(x: number) {
      arcos.push(x);
    },
    stroke() {},
    fill() {},
    clearRect() {},
    strokeRect() {},
    fillText(t: string) {
      textos.push(t);
    },
    setLineDash() {},
  } satisfies ContextoGrafica;
  return { ctx, textos, arcos };
}

const datos = (extra: Partial<DatosGraficaRC> = {}): DatosGraficaRC => {
  const n = 50;
  const t = new Float64Array(n);
  const v = new Float32Array(n);
  const i = new Float32Array(n);
  for (let k = 0; k < n; k++) {
    t[k] = (k * 0.2) / n; // 2 τ con τ = 0,1 s
    v[k] = 12 * (1 - Math.exp(-t[k] / 0.1));
    i[k] = 0.012 * Math.exp(-t[k] / 0.1);
  }
  return { t, v, i, n, tau: 0.1, E: 12, iRef: 0.012, rotuloI: "Corriente I", ...extra };
};

describe("ejes de la gráfica de E7", () => {
  it("el eje de tiempo abarca al menos 6 τ y crece con el registro", () => {
    expect(dominioTiempo(0.1, 0)).toBeCloseTo(TAUS_MINIMOS * 0.1, 12);
    expect(dominioTiempo(0.1, 0.3)).toBeCloseTo(0.6, 12);
    expect(dominioTiempo(0.1, 3)).toBeCloseTo(3.12, 12);
  });

  it("las marcas son múltiplos enteros de τ (a lo sumo 6) y no pasan del extremo", () => {
    expect(marcasTau(0.6, 0.1)).toEqual([1, 2, 3, 4, 5, 6]);
    const m = marcasTau(3.12, 0.1);
    expect(m.length).toBeLessThanOrEqual(6);
    expect(m[m.length - 1] * 0.1).toBeLessThanOrEqual(3.12);
    expect(m.every((k) => Number.isInteger(k))).toBe(true);
  });

  it("el rango de corriente es simétrico y nunca menor que E/R", () => {
    const i = new Float32Array([0.001, -0.02, 0.005]);
    expect(rangoCorriente(i, 3, 0.012)).toBeCloseTo(0.02, 6);
    expect(rangoCorriente(i, 1, 0.012)).toBe(0.012);
    expect(rangoCorriente(i, 0, 0)).toBe(1);
  });

  it("las dos gráficas caben en el lienzo y no se pisan", () => {
    const g = disposicionGraficaRC(ANCHO_GRAFICA_RC, ALTO_GRAFICA_RC);
    expect(g.v.y0).toBeGreaterThan(g.tituloV);
    expect(g.v.y1).toBeLessThan(g.tituloI);
    expect(g.i.y0).toBeGreaterThan(g.tituloI);
    expect(g.i.y1).toBeLessThan(g.ejeX);
    expect(g.ejeX).toBeLessThanOrEqual(ALTO_GRAFICA_RC);
    expect(g.v.x1).toBeLessThanOrEqual(ANCHO_GRAFICA_RC);
  });
});

describe("tamaño de sala", () => {
  it("la disposición de 440 px también cabe y sin solaparse", () => {
    const g = disposicionGraficaRC(ANCHO_GRAFICA_RC_SALA, ALTO_GRAFICA_RC_SALA);
    expect(g.v.y1).toBeLessThan(g.tituloI);
    expect(g.i.y0).toBeGreaterThan(g.tituloI);
    expect(g.ejeX).toBeLessThanOrEqual(ALTO_GRAFICA_RC_SALA);
  });
  it("la fuente crece con el lienzo", () => {
    const { ctx } = ctxGrabador();
    dibujarGraficaRC(ctx, ANCHO_GRAFICA_RC_SALA, ALTO_GRAFICA_RC_SALA, datos());
    expect(ctx.font).toMatch(/^14\.6/);
  });
});

describe("dibujarGraficaRC", () => {
  it("rotula el eje en múltiplos de τ y los dos títulos, y marca el punto de «ahora»", () => {
    const { ctx, textos, arcos } = ctxGrabador();
    dibujarGraficaRC(ctx, ANCHO_GRAFICA_RC, ALTO_GRAFICA_RC, datos());
    for (const k of ["1τ", "2τ", "6τ", "0"]) expect(textos).toContain(k);
    expect(textos).toContain("Voltaje de los capacitores");
    expect(textos).toContain("Corriente I");
    expect(textos).toContain("12 V");
    expect(textos).toContain("12 mA");
    expect(textos).toContain("−12 mA");
    expect(arcos).toHaveLength(2);
  });

  it("en descarga el título de la corriente dice «sentido invertido»", () => {
    const { ctx, textos } = ctxGrabador();
    dibujarGraficaRC(ctx, ANCHO_GRAFICA_RC, ALTO_GRAFICA_RC, datos({ rotuloI: "Corriente I (sentido invertido)" }));
    expect(textos).toContain("Corriente I (sentido invertido)");
  });

  it("sin muestras solo dibuja los ejes (sin trazos ni punto)", () => {
    const { ctx, arcos } = ctxGrabador();
    expect(() => dibujarGraficaRC(ctx, ANCHO_GRAFICA_RC, ALTO_GRAFICA_RC, datos({ n: 0 }))).not.toThrow();
    expect(arcos).toHaveLength(0);
  });

  it("el pie explica que el eje es tiempo real", () => {
    expect(pieGraficaRC(0.1, 0.2)).toBe("Eje horizontal: tiempo real, de 0 a 600 ms. Cada marca es 1 τ = 100 ms.");
  });
});
