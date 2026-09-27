/**
 * Dibujo de las líneas de campo (E2.3 §4.6). Solo pinta: el trazado (RK2,
 * criterios de parada, sembrado por sectores) es la función pura
 * `trazarLineasCampo` de fisica/lineasCampo.ts.
 *
 * Estilo: blanco hielo (`--text`), continuo, con una flecha cada ~120 px de
 * arco en el sentido de E. Sin rojo/azul (reservados a la polaridad de las
 * cargas). Los extremos se prolongan hasta el centro de la carga (queda bajo el
 * disco opaco) sin modificar `LineaCampo.puntos`. Un `stroke` por línea.
 */
import type { PuntoCarga } from "../fisica/coulomb";
import type { LineaCampo } from "../fisica/lineasCampo";
import type { Contexto2D } from "./ctx2d";
import { unidadTexto } from "./geometriaCargas";

// Alfa más baja y trazo más fino que las curvas equipotenciales (revisor-ui, fase 2 §B7): ambas
// comparten luminancia parecida sobre el fondo oscuro, así que se diferencian por grosor y opacidad,
// no solo por matiz. `unidadTexto` no adelgaza el trazo en un proyector (canvas ampliado).
export const COLOR_LINEA_CAMPO = "rgba(226, 232, 240, 0.6)";
const GROSOR_CSS = 1.2;
/** Tamaño de la punta de flecha (px CSS). */
const FLECHA_CSS = 7;
/** Separación aproximada entre flechas (px de arco). */
export const SEPARACION_FLECHAS_PX = 120;
/** Una línea más corta que esto no lleva flecha. */
export const LONGITUD_MIN_FLECHA_PX = 40;

export interface Flecha {
  x: number;
  y: number;
  /** Dirección unitaria (sentido de +E). */
  dx: number;
  dy: number;
}

/**
 * Posiciones de las flechas de una polilínea [x0, y0, x1, y1, …]: se reparten
 * de forma uniforme por longitud de arco, una cada ~`separacion` px (al menos
 * una si la línea mide ≥ LONGITUD_MIN_FLECHA_PX), centradas en cada tramo.
 */
export function posicionesFlechas(puntos: Float32Array, separacion = SEPARACION_FLECHAS_PX): Flecha[] {
  const n = puntos.length / 2;
  if (n < 2) return [];
  let total = 0;
  for (let i = 1; i < n; i++) total += Math.hypot(puntos[2 * i] - puntos[2 * i - 2], puntos[2 * i + 1] - puntos[2 * i - 1]);
  if (total < LONGITUD_MIN_FLECHA_PX) return [];
  const cuantas = Math.max(1, Math.round(total / separacion));
  const flechas: Flecha[] = [];
  let acumulado = 0;
  let tramo = 1;
  for (let k = 0; k < cuantas; k++) {
    const objetivo = ((k + 0.5) * total) / cuantas;
    for (; tramo < n; tramo++) {
      const dx = puntos[2 * tramo] - puntos[2 * tramo - 2];
      const dy = puntos[2 * tramo + 1] - puntos[2 * tramo - 1];
      const l = Math.hypot(dx, dy);
      if (acumulado + l >= objetivo && l > 0) {
        const t = (objetivo - acumulado) / l;
        flechas.push({
          x: puntos[2 * tramo - 2] + t * dx,
          y: puntos[2 * tramo - 1] + t * dy,
          dx: dx / l,
          dy: dy / l,
        });
        break;
      }
      acumulado += l;
    }
  }
  return flechas;
}

/** Centro de la carga en la que empieza/termina la línea (en el sentido de +E), o -1. */
function cargaAlInicio(l: LineaCampo): number {
  return l.sentido === 1 ? l.origen : l.fin === "carga" ? l.destino : -1;
}
function cargaAlFinal(l: LineaCampo): number {
  return l.sentido === 1 ? (l.fin === "carga" ? l.destino : -1) : l.origen;
}

/**
 * `cargas` debe ser el mismo arreglo (mismo orden) que se pasó a
 * `trazarLineasCampo`: `origen` y `destino` son índices en él.
 */
export function dibujarLineasCampo(
  ctx: Contexto2D,
  lineas: LineaCampo[],
  cargas: PuntoCarga[],
  escalaCss = 1,
): void {
  const u = unidadTexto(escalaCss);
  const tamFlecha = FLECHA_CSS * u;
  ctx.save();
  ctx.setLineDash([]);
  ctx.strokeStyle = COLOR_LINEA_CAMPO;
  ctx.fillStyle = COLOR_LINEA_CAMPO;
  ctx.lineWidth = GROSOR_CSS * u;
  ctx.lineJoin = "round";
  ctx.lineCap = "round";

  const flechas: Flecha[] = [];
  for (const l of lineas) {
    const p = l.puntos;
    const n = p.length / 2;
    if (n < 2) continue;
    ctx.beginPath();
    const ini = cargaAlInicio(l);
    if (ini >= 0 && cargas[ini]) {
      ctx.moveTo(cargas[ini].x, cargas[ini].y);
      ctx.lineTo(p[0], p[1]);
    } else {
      ctx.moveTo(p[0], p[1]);
    }
    for (let i = 1; i < n; i++) ctx.lineTo(p[2 * i], p[2 * i + 1]);
    const fin = cargaAlFinal(l);
    if (fin >= 0 && cargas[fin]) ctx.lineTo(cargas[fin].x, cargas[fin].y);
    ctx.stroke();
    for (const f of posicionesFlechas(p)) flechas.push(f);
  }

  // Todas las puntas de flecha en un solo relleno.
  ctx.beginPath();
  for (const f of flechas) {
    const px = -f.dy;
    const py = f.dx;
    const punta = tamFlecha * 0.6;
    const base = tamFlecha * 0.4;
    const ancho = tamFlecha * 0.35;
    ctx.moveTo(f.x + f.dx * punta, f.y + f.dy * punta);
    ctx.lineTo(f.x - f.dx * base + px * ancho, f.y - f.dy * base + py * ancho);
    ctx.lineTo(f.x - f.dx * base - px * ancho, f.y - f.dy * base - py * ancho);
    ctx.closePath();
  }
  ctx.fill();
  ctx.restore();
}
