/**
 * Mapa de potencial V = (1/4πε₀) Σ qᵢ/rᵢ (ecuaciones_maxwell.md), evaluado
 * sobre una malla gruesa (no por pixel) y pintado con fillRect por celda.
 * Con ~30 cargas y celdas de 8px en un canvas de 700x500 son ~88x63 ≈ 5500
 * celdas por frame -- trivial en JS puro, muy por debajo del escenario
 * "prohibitivamente lento" que en references/renderizado.md motiva pasar a
 * un fragment shader WebGL (ese escenario es evaluar por pixel real de
 * pantalla, no por celda de una malla gruesa). Ver PROPUESTA.md / plan de
 * arquitectura para la justificación completa de por qué Canvas 2D basta
 * aquí.
 */
import { potencialEn, type PuntoCarga } from "../fisica/coulomb";

const TAMANO_CELDA = 8;
/** Escala de saturación del color -- ajustada a mano contra K_VISUAL. */
const V_REF = 400;

const NEUTRO: [number, number, number] = [11, 16, 32]; // fondo del canvas
const NEGATIVO: [number, number, number] = [59, 130, 246]; // mismo azul que la carga negativa
const POSITIVO: [number, number, number] = [239, 68, 68]; // mismo rojo que la carga positiva

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function colorPotencial(v: number): string {
  const t = Math.tanh(v / V_REF); // comprime el rango enorme cerca de una carga a [-1, 1]
  const destino = t >= 0 ? POSITIVO : NEGATIVO;
  const k = Math.abs(t);
  const r = lerp(NEUTRO[0], destino[0], k);
  const g = lerp(NEUTRO[1], destino[1], k);
  const b = lerp(NEUTRO[2], destino[2], k);
  return `rgb(${r | 0}, ${g | 0}, ${b | 0})`;
}

export function dibujarMapaPotencial(
  ctx: CanvasRenderingContext2D,
  puntos: PuntoCarga[],
  ancho: number,
  alto: number,
) {
  for (let x = 0; x < ancho; x += TAMANO_CELDA) {
    for (let y = 0; y < alto; y += TAMANO_CELDA) {
      const v = potencialEn(x + TAMANO_CELDA / 2, y + TAMANO_CELDA / 2, puntos);
      ctx.fillStyle = colorPotencial(v);
      ctx.fillRect(x, y, TAMANO_CELDA, TAMANO_CELDA);
    }
  }
}
