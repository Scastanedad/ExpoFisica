import { describe, expect, it } from "vitest";
import type { PuntoCarga } from "../fisica/coulomb";
import { colocarRotulos, curvasEquipotenciales } from "../fisica/equipotenciales";
import { crearCtxFalso } from "./ctxFalso";
import { COLOR_EQUIPOTENCIAL, dibujarEquipotenciales, dibujarRotulos } from "./dibujarEquipotenciales";

const DIPOLO: PuntoCarga[] = [
  { x: 250, y: 250, q: 1 },
  { x: 450, y: 250, q: -1 },
];

describe("dibujarEquipotenciales", () => {
  const curvas = curvasEquipotenciales(DIPOLO, 700, 500);

  it("un stroke por nivel", () => {
    const ctx = crearCtxFalso();
    dibujarEquipotenciales(ctx, curvas, 1);
    expect(ctx.llamadas.stroke).toBe(curvas.niveles.length);
  });

  it("los niveles negativos van discontinuos y los positivos continuos", () => {
    const ctx = crearCtxFalso();
    dibujarEquipotenciales(ctx, curvas, 1);
    // Un setLineDash por nivel, en el mismo orden que los niveles (n creciente).
    expect(ctx.rayas).toHaveLength(curvas.niveles.length);
    curvas.niveles.forEach((nivel, i) => {
      if (nivel.n < 0) expect(ctx.rayas[i]).toEqual([6, 4]);
      else expect(ctx.rayas[i]).toEqual([]);
    });
  });

  it("el color es ámbar (nunca rojo, azul ni cian) y el nivel 0 es opaco", () => {
    const ctx = crearCtxFalso();
    dibujarEquipotenciales(ctx, curvas, 1);
    expect(COLOR_EQUIPOTENCIAL).toBe("#fbbf24");
    for (const estilo of ctx.estilosTrazo) {
      expect(String(estilo)).toMatch(/^(#fbbf24|rgba\(251, 191, 36, 0\.9\))$/);
    }
    expect(ctx.estilosTrazo[curvas.niveles.findIndex((n) => n.n === 0)]).toBe("#fbbf24");
  });
});

describe("dibujarRotulos", () => {
  it("dibuja una píldora y un texto por rótulo", () => {
    const curvas = curvasEquipotenciales(DIPOLO, 700, 500);
    const medir = (s: string) => 7 * s.length;
    const rotulos = colocarRotulos(curvas, DIPOLO, 700, 500, medir, 12);
    const ctx = crearCtxFalso();
    dibujarRotulos(ctx, rotulos, medir, 1);
    expect(ctx.llamadas.fillRect).toBe(rotulos.length);
    expect(ctx.llamadas.fillText).toBe(rotulos.length);
  });

  it("sin rótulos no toca el contexto", () => {
    const ctx = crearCtxFalso();
    dibujarRotulos(ctx, [], () => 0, 1);
    expect(ctx.llamadas.save).toBeUndefined();
  });
});
