/**
 * Marcadores de los puntos A/B fijados en `graficas/PanelGraficaDistancia.tsx`
 * (E4.1 §3, corrección post revisión UI): sin esto, arrastrar q₀ y pulsar
 * "Fijar A"/"Fijar B" no dejaba ningún rastro en el lienzo principal de dónde
 * habían quedado esos dos puntos.
 *
 * Mismo blanco hielo que `dibujarSondaQ0.ts` (misma familia "instrumento",
 * nada de rojo/azul/cian/ámbar), pero forma distinta -- punto relleno con su
 * letra, sin anillo ni mira -- para no confundirse con la sonda misma.
 */
import { unidadCss } from "./geometriaCargas";

export const COLOR_MARCA_DISTANCIA = "#e2e8f0";
const RADIO_MARCA_CSS = 4;
const FUENTE = 'ui-monospace, "Cascadia Code", "SFMono-Regular", Consolas, monospace';

export interface PuntoMarca {
  x: number;
  y: number;
}

export function dibujarMarcasDistancia(
  ctx: CanvasRenderingContext2D,
  puntoA: PuntoMarca | null,
  puntoB: PuntoMarca | null,
  escalaCss = 1,
): void {
  if (!puntoA && !puntoB) return;
  const u = unidadCss(escalaCss);
  const radio = RADIO_MARCA_CSS * u;

  ctx.save();
  ctx.fillStyle = COLOR_MARCA_DISTANCIA;
  ctx.font = `600 ${11 * u}px ${FUENTE}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "bottom";

  function marcar(p: PuntoMarca | null, letra: string): void {
    if (!p) return;
    ctx.beginPath();
    ctx.arc(p.x, p.y, radio, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillText(letra, p.x, p.y - radio - 2 * u);
  }

  marcar(puntoA, "A");
  marcar(puntoB, "B");
  ctx.restore();
}
