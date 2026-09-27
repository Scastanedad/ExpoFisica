/**
 * Dibujo de la carga de prueba q₀ (E3.1 §8): un anillo con mira (crosshair),
 * SIN relleno rojo/azul -- q₀ no es una carga real y no debe leerse como tal
 * (rojo/azul quedan reservados a la polaridad de las cargas fuente, E3.1 §8).
 * El signo se comunica solo por el carácter "+"/"−", en blanco hielo (mismo
 * color que los vectores/líneas de campo, ninguna otra semántica de color).
 */
import { unidadCss } from "./geometriaCargas";

export const COLOR_SONDA = "#e2e8f0";
const RADIO_SONDA_CSS = 9;
const GROSOR_CSS = 2;
const FUENTE = 'ui-monospace, "Cascadia Code", "SFMono-Regular", Consolas, monospace';

export interface PuntoLogico {
  x: number;
  y: number;
}

export function dibujarSondaQ0(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  signoQ0: 1 | -1,
  escalaCss = 1,
  traza?: ReadonlyArray<PuntoLogico>,
): void {
  const u = unidadCss(escalaCss);
  const radio = RADIO_SONDA_CSS * u;

  ctx.save();
  if (traza && traza.length > 1) {
    ctx.strokeStyle = "rgba(226, 232, 240, 0.55)";
    ctx.lineWidth = 1.5 * u;
    ctx.setLineDash([4 * u, 3 * u]);
    ctx.beginPath();
    ctx.moveTo(traza[0].x, traza[0].y);
    for (let i = 1; i < traza.length; i++) ctx.lineTo(traza[i].x, traza[i].y);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  ctx.strokeStyle = COLOR_SONDA;
  ctx.lineWidth = GROSOR_CSS * u;
  ctx.beginPath();
  ctx.arc(x, y, radio, 0, Math.PI * 2);
  ctx.stroke();

  const brazo = radio * 0.9;
  ctx.beginPath();
  ctx.moveTo(x - radio - brazo * 0.5, y);
  ctx.lineTo(x - radio * 0.5, y);
  ctx.moveTo(x + radio * 0.5, y);
  ctx.lineTo(x + radio + brazo * 0.5, y);
  ctx.moveTo(x, y - radio - brazo * 0.5);
  ctx.lineTo(x, y - radio * 0.5);
  ctx.moveTo(x, y + radio * 0.5);
  ctx.lineTo(x, y + radio + brazo * 0.5);
  ctx.stroke();

  ctx.fillStyle = COLOR_SONDA;
  ctx.font = `600 ${11 * u}px ${FUENTE}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(signoQ0 > 0 ? "+" : "−", x, y + 0.5 * u);
  ctx.restore();
}
