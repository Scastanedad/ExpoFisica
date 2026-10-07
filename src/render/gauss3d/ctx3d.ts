/**
 * Subconjunto de `CanvasRenderingContext2D` que usa el dibujo Gauss 3D. Se declara aparte (como `ctx2d.ts`) para que
 * los módulos de dibujo se puedan probar en Node con un contexto falso (tsconfig.test.json no incluye la librería DOM).
 */
import type { Contexto2D } from "../ctx2d";

export interface Ctx3D extends Contexto2D {
  clearRect(x: number, y: number, w: number, h: number): void;
  arc(x: number, y: number, r: number, a0: number, a1: number): void;
  strokeText(texto: string, x: number, y: number): void;
}
