/**
 * Dibujo del vector de fuerza neta sobre cada carga (E3.2 §4). Solo pinta: el
 * cálculo es `fisica/fuerzas.ts` (estática) o la lectura del Worker ya
 * convertida a N (dinámica) -- ver `render/CanvasRenderer.tsx` /
 * `CanvasRendererDinamico.tsx`.
 *
 * Color: violeta claro, NO cian (el anillo de selección ya es cian: se
 * confundirían "esta carga está elegida" con "esta es su fuerza") ni
 * rojo/azul (reservados a la polaridad) ni ámbar/blanco hielo (equipotenciales
 * y campo). Es una magnitud distinta (N) mostrada solo sobre la carga.
 *
 * `#c4b5fd` en vez del violeta pálido original (`#c084fc`, contraste ~7.6:1
 * sobre `--bg`): revisión UI (post T3.2) pidió más luminosidad para no
 * lavarse con la luz ambiental de la sala de exposición -- contraste ~10.9:1,
 * en línea con el cian de selección (~11:1) y el ámbar de equipotenciales
 * (~12:1). Trazo un poco más grueso (3 px CSS) por el mismo motivo.
 */
import type { PuntoCarga } from "../fisica/coulomb";
import type { VectorFuerzaSI } from "../fisica/fuerzas";
import { escalaFlechaFuerza } from "./escalaFlechaFuerza";
import { radioVisualCarga, unidadCss } from "./geometriaCargas";

export const COLOR_FUERZA = "#c4b5fd";

const LARGO_MIN_CSS = 16;
const LARGO_MAX_CSS = 46;
const GROSOR_CSS = 3;
const PUNTA_CSS = 8;

/**
 * `fuerzas[i]` debe estar alineado con `puntos[i]` (mismo orden). Fuerzas en
 * N, convención de LECTURA (y arriba, igual que `campoSI`/`fuerzaNetaSI`): se
 * invierte `fy` al convertir a coordenadas de canvas.
 */
export function dibujarFuerzas(
  ctx: CanvasRenderingContext2D,
  puntos: readonly PuntoCarga[],
  fuerzas: ReadonlyArray<VectorFuerzaSI | null>,
  escalaCss = 1,
): void {
  const u = unidadCss(escalaCss);
  const largoMin = LARGO_MIN_CSS * u;
  const largoMax = LARGO_MAX_CSS * u;
  const punta = PUNTA_CSS * u;

  ctx.save();
  ctx.strokeStyle = COLOR_FUERZA;
  ctx.fillStyle = COLOR_FUERZA;
  ctx.lineWidth = GROSOR_CSS * u;
  ctx.lineCap = "round";

  puntos.forEach((p, i) => {
    const f = fuerzas[i];
    if (!f || !(f.modulo > 1e-9)) return;
    const t = escalaFlechaFuerza(f.modulo);
    const largo = largoMin + (largoMax - largoMin) * t;
    const dxCanvas = f.fx / f.modulo;
    const dyCanvas = -f.fy / f.modulo; // convención de lectura (y arriba) -> canvas (y abajo)
    const radio = radioVisualCarga(p.q, escalaCss);
    const x0 = p.x + dxCanvas * radio;
    const y0 = p.y + dyCanvas * radio;
    const x1 = x0 + dxCanvas * largo;
    const y1 = y0 + dyCanvas * largo;

    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.lineTo(x1, y1);
    ctx.stroke();

    const ang = Math.atan2(dyCanvas, dxCanvas);
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x1 - punta * Math.cos(ang - 0.45), y1 - punta * Math.sin(ang - 0.45));
    ctx.lineTo(x1 - punta * Math.cos(ang + 0.45), y1 - punta * Math.sin(ang + 0.45));
    ctx.closePath();
    ctx.fill();
  });
  ctx.restore();
}
