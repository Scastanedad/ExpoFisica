import type { PuntoCarga } from "../fisica/coulomb";
import { fuenteSignoCarga, radioVisualCarga, unidadCss } from "./geometriaCargas";

const CIAN = "#22d3ee"; // --accent: único acento interactivo
const HALO = "rgba(5, 7, 13, 0.9)";

/**
 * Dibuja las cargas. Radio visual y fuente del signo se compensan con
 * `escalaCss` (ver geometriaCargas.ts); el radio FÍSICO de 14 px que usan el
 * motor y la escala no se toca. `indiceSeleccionada` (o -1) pinta el anillo de
 * foco: cian con halo oscuro para que se vea sobre el rojo/azul del mapa.
 */
export function dibujarCargas(
  ctx: CanvasRenderingContext2D,
  puntos: PuntoCarga[],
  escalaCss = 1,
  indiceSeleccionada = -1,
) {
  const radio = radioVisualCarga(escalaCss);
  const u = unidadCss(escalaCss);

  puntos.forEach((p, i) => {
    if (i === indiceSeleccionada) {
      const rAnillo = radio + 4 * u;
      ctx.beginPath();
      ctx.arc(p.x, p.y, rAnillo, 0, Math.PI * 2);
      ctx.lineWidth = 5 * u;
      ctx.strokeStyle = HALO;
      ctx.stroke();
      ctx.lineWidth = 2.5 * u;
      ctx.strokeStyle = CIAN;
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.arc(p.x, p.y, radio, 0, Math.PI * 2);
    ctx.fillStyle = p.q > 0 ? "#ef4444" : "#3b82f6";
    ctx.fill();
    ctx.fillStyle = "#fff";
    ctx.font = `bold ${fuenteSignoCarga(escalaCss)}px system-ui`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(p.q > 0 ? "+" : "−", p.x, p.y + 1);
  });
}
