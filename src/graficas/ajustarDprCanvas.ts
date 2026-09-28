/**
 * Ajusta el backing store de un canvas de tamaño lógico FIJO (`anchoLogico` x
 * `altoLogico`, p. ej. 300x180) a la densidad de píxeles real de la pantalla,
 * para que el texto de los ejes no se vea borroso en pantallas de alta
 * densidad (corrección post revisión UI: los 3 canvas de gráfica no
 * ajustaban por `devicePixelRatio`, a diferencia del canvas principal ya
 * corregido en `hooks/useEscalaCss.ts`).
 *
 * Versión simplificada de `useEscalaCss.ts`: sin `ResizeObserver` ni medición
 * de ancho CSS, porque estos canvas de gráfica solo se ENCOGEN por CSS
 * (`.lienzo-grafica { width:100%; max-width:300px }`), nunca se agrandan más
 * allá de su tamaño lógico -- a diferencia del canvas PRINCIPAL, que sí se
 * estira hasta ~980px (de ahí que ese sí necesite medir). Se llama en cada
 * `redibujar()` de cada panel (barato e idempotente, sin coste de layout) en
 * vez de depender de un observer de montaje, porque uno de estos canvas (el
 * de `PanelGraficaDistancia`) no existe en el DOM hasta el primer "Graficar".
 *
 * Vive en un módulo aparte de `dibujoGrafica.ts` (que sí importan los tests
 * con Vitest en Node, sin la librería DOM): usa `HTMLCanvasElement`/`window`
 * directamente porque nunca se prueba con un contexto falso.
 */
const DPR_MAXIMO_GRAFICA = 2;

export function ajustarDprCanvas(
  canvas: HTMLCanvasElement,
  anchoLogico: number,
  altoLogico: number,
): CanvasRenderingContext2D | null {
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  const dpr = Math.min(window.devicePixelRatio || 1, DPR_MAXIMO_GRAFICA);
  const anchoBitmap = Math.round(anchoLogico * dpr);
  const altoBitmap = Math.round(altoLogico * dpr);
  if (canvas.width !== anchoBitmap || canvas.height !== altoBitmap) {
    canvas.width = anchoBitmap;
    canvas.height = altoBitmap;
  }
  // `canvas.width =` resetea la transformación a la identidad; se reaplica siempre
  // (idempotente, igual que `useEscalaCss.ts`) para no depender de si cambió el tamaño.
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return ctx;
}
