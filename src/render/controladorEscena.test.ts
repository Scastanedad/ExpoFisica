import { describe, expect, it } from "vitest";
import { PX_POR_CUADRO } from "../fisica/escala";
import {
  LIMITE_ARRASTRE,
  limitarPosicion,
  moverPorTeclado,
  type ControladorEscena,
  type Posicion,
} from "./controladorEscena";

function crear(inicial: Posicion): ControladorEscena & { p: Posicion } {
  const c = {
    ancho: 700,
    alto: 500,
    p: inicial,
    posicion: () => c.p,
    mover: (_id: string, x: number, y: number) => {
      c.p = { x, y };
    },
  };
  return c;
}

describe("controladorEscena", () => {
  it("limita a 20 px de los bordes", () => {
    expect(limitarPosicion(-5, 999, 700, 500)).toEqual({ x: LIMITE_ARRASTRE, y: 500 - LIMITE_ARRASTRE });
  });

  it("una flecha mueve 1 cuadro; con Shift, 5 cuadros", () => {
    const c = crear({ x: 300, y: 400 });
    moverPorTeclado(c, "a", "ArrowRight", false);
    expect(c.p).toEqual({ x: 300 + PX_POR_CUADRO, y: 400 });
    moverPorTeclado(c, "a", "ArrowUp", true);
    expect(c.p).toEqual({ x: 300 + PX_POR_CUADRO, y: 400 - 5 * PX_POR_CUADRO });
  });

  it("respeta los límites de arrastre", () => {
    const c = crear({ x: 30, y: 30 });
    expect(moverPorTeclado(c, "a", "ArrowLeft", true)).toEqual({ x: LIMITE_ARRASTRE, y: 30 });
    moverPorTeclado(c, "a", "ArrowUp", true);
    expect(c.p.y).toBe(LIMITE_ARRASTRE);
  });

  it("ignora teclas que no son de movimiento o cargas inexistentes", () => {
    const c = crear({ x: 100, y: 100 });
    expect(moverPorTeclado(c, "a", "Enter", false)).toBeNull();
    const vacio: ControladorEscena = { ...c, posicion: () => undefined };
    expect(moverPorTeclado(vacio, "a", "ArrowLeft", false)).toBeNull();
  });
});
