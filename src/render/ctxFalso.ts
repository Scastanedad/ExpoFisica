/**
 * Contexto 2D falso para pruebas en Node: cuenta las llamadas y guarda el
 * estilo de cada trazo. Solo lo usan los tests de dibujo (no se importa desde
 * la aplicación).
 */
import type { Contexto2D } from "./ctx2d";

export interface CtxFalso extends Contexto2D {
  llamadas: Record<string, number>;
  /** Argumentos de cada `setLineDash`. */
  rayas: number[][];
  /** Estilo de trazo vigente en cada `stroke()`. */
  estilosTrazo: unknown[];
}

export function crearCtxFalso(): CtxFalso {
  const llamadas: Record<string, number> = {};
  const rayas: number[][] = [];
  const estilosTrazo: unknown[] = [];
  const contar = (nombre: string) => {
    llamadas[nombre] = (llamadas[nombre] ?? 0) + 1;
  };
  const ctx: CtxFalso = {
    llamadas,
    rayas,
    estilosTrazo,
    strokeStyle: "",
    fillStyle: "",
    lineWidth: 1,
    lineJoin: "miter",
    lineCap: "butt",
    globalAlpha: 1,
    font: "",
    textAlign: "start",
    textBaseline: "alphabetic",
    save: () => contar("save"),
    restore: () => contar("restore"),
    beginPath: () => contar("beginPath"),
    closePath: () => contar("closePath"),
    moveTo: () => contar("moveTo"),
    lineTo: () => contar("lineTo"),
    stroke: () => {
      contar("stroke");
      estilosTrazo.push(ctx.strokeStyle);
    },
    fill: () => contar("fill"),
    fillRect: () => contar("fillRect"),
    fillText: () => contar("fillText"),
    setLineDash: (s) => {
      contar("setLineDash");
      rayas.push([...s]);
    },
    measureText: (t) => ({ width: 7 * t.length }),
  };
  return ctx;
}
