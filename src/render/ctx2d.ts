/**
 * Subconjunto de `CanvasRenderingContext2D` que usan los módulos de dibujo del
 * campo. Se declara aparte para que esos módulos no dependan de los tipos DOM
 * y se puedan probar en Node con un contexto falso que cuenta llamadas
 * (tsconfig.test.json no incluye la librería DOM). El contexto real cumple esta
 * interfaz de forma estructural.
 */
export interface Contexto2D {
  strokeStyle: unknown;
  fillStyle: unknown;
  lineWidth: number;
  lineJoin: string;
  lineCap: string;
  globalAlpha: number;
  font: string;
  textAlign: string;
  textBaseline: string;
  save(): void;
  restore(): void;
  beginPath(): void;
  closePath(): void;
  moveTo(x: number, y: number): void;
  lineTo(x: number, y: number): void;
  stroke(): void;
  fill(): void;
  fillRect(x: number, y: number, w: number, h: number): void;
  fillText(texto: string, x: number, y: number): void;
  setLineDash(segmentos: number[]): void;
  measureText(texto: string): { width: number };
}
