import { describe, expect, it } from "vitest";
import type { PuntoCarga } from "../fisica/coulomb";
import { trazarLineasCampo } from "../fisica/lineasCampo";
import { crearCtxFalso } from "./ctxFalso";
import { dibujarLineasCampo, posicionesFlechas } from "./dibujarLineasCampo";

describe("T-d2 — dibujarLineasCampo con solo cargas negativas", () => {
  it("invoca stroke (≥ 10) y lineTo (> 100): antes de E2.3 no dibujaba nada", () => {
    const cargas: PuntoCarga[] = [{ x: 350, y: 250, q: -1 }];
    const lineas = trazarLineasCampo(cargas, 700, 500);
    const ctx = crearCtxFalso();
    dibujarLineasCampo(ctx, lineas, cargas, 1);
    expect(ctx.llamadas.stroke).toBeGreaterThanOrEqual(10);
    expect(ctx.llamadas.lineTo).toBeGreaterThan(100);
  });

  it("un stroke por línea y una sola pasada de relleno para todas las flechas", () => {
    const cargas: PuntoCarga[] = [
      { x: 250, y: 250, q: 1 },
      { x: 450, y: 250, q: -1 },
    ];
    const lineas = trazarLineasCampo(cargas, 700, 500);
    const ctx = crearCtxFalso();
    dibujarLineasCampo(ctx, lineas, cargas, 1);
    expect(ctx.llamadas.stroke).toBe(lineas.length);
    expect(ctx.llamadas.fill).toBe(1);
  });

  it("no usa rojo ni azul: el trazo es blanco hielo (la polaridad es solo de las cargas)", () => {
    const cargas: PuntoCarga[] = [{ x: 350, y: 250, q: 1 }];
    const ctx = crearCtxFalso();
    dibujarLineasCampo(ctx, trazarLineasCampo(cargas, 700, 500), cargas, 1);
    expect(new Set(ctx.estilosTrazo)).toEqual(new Set(["rgba(226, 232, 240, 0.6)"]));
  });

  it("sin líneas no falla y no traza", () => {
    const ctx = crearCtxFalso();
    dibujarLineasCampo(ctx, [], [], 1);
    expect(ctx.llamadas.stroke).toBeUndefined();
  });
});

describe("posicionesFlechas", () => {
  const recta = (largo: number) => Float32Array.from([0, 0, largo, 0]);

  it("una línea corta (< 40 px) no lleva flecha", () => {
    expect(posicionesFlechas(recta(30))).toEqual([]);
  });

  it("una flecha en el centro de una línea de 100 px, apuntando en el sentido del trazado", () => {
    const f = posicionesFlechas(recta(100));
    expect(f).toHaveLength(1);
    expect(f[0].x).toBeCloseTo(50, 5);
    expect(f[0].dx).toBeCloseTo(1, 12);
  });

  it("una cada ~120 px, repartidas de forma uniforme", () => {
    const f = posicionesFlechas(recta(360));
    expect(f).toHaveLength(3);
    [60, 180, 300].forEach((x, i) => expect(f[i].x).toBeCloseTo(x, 5));
  });
});
