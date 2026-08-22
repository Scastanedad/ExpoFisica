/**
 * Trazado de líneas de campo por avance en la dirección del campo (tipo
 * Euler), un paso fijo a la vez, partiendo de puntos cercanos a cada carga
 * positiva. No hay una receta de streamlines en references/metodos_numericos.md
 * (esa skill cubre discretización temporal, no trazado geométrico), así que
 * el método sigue el mismo principio de integración paso a paso que el resto
 * de la skill electromagnetismo-computacional.
 *
 * Invariante físico a validar (SKILL.md §5 de electromagnetismo-computacional):
 * las líneas salen de cargas positivas, entran en negativas (o van al
 * infinito), y nunca se cruzan entre sí.
 */
import { campoEn, type PuntoCarga } from "../fisica/coulomb";

/**
 * Con muchas cargas, el costo de trazar líneas es O(seeds × pasos × n) --
 * mucho más caro por punto que vectores o el mapa de potencial, que evalúan
 * el campo en una malla de tamaño fijo sin importar cuántas cargas haya.
 * Con ~30 cargas (~15 positivas) a 14 seeds fijas y 500 pasos, eso son del
 * orden de 3 millones de evaluaciones de campo por frame -- suficiente para
 * notarse. En vez de una constante fija, se reparte un presupuesto total de
 * líneas entre las cargas positivas (menos líneas por carga cuando hay
 * muchas), y se recorta el techo de pasos -- la mayoría de las líneas se
 * absorben o salen del canvas mucho antes de llegar a ese techo, que solo
 * existe como salvaguarda para el caso de una carga aislada sin par.
 */
const PRESUPUESTO_LINEAS = 120;
const SEEDS_MIN_POR_CARGA = 4;
const SEEDS_MAX_POR_CARGA = 14;
const RADIO_SEED = 20;
const PASO = 4;
const MAX_PASOS = 350;
const RADIO_ABSORCION = 16;

export function dibujarLineasCampo(
  ctx: CanvasRenderingContext2D,
  puntos: PuntoCarga[],
  ancho: number,
  alto: number,
) {
  const positivas = puntos.filter((p) => p.q > 0);
  const seedsPorCarga = Math.min(
    SEEDS_MAX_POR_CARGA,
    Math.max(SEEDS_MIN_POR_CARGA, Math.floor(PRESUPUESTO_LINEAS / Math.max(1, positivas.length))),
  );

  ctx.strokeStyle = "rgba(148, 197, 255, 0.55)";
  ctx.lineWidth = 1.3;

  for (const origen of positivas) {
    for (let i = 0; i < seedsPorCarga; i++) {
      const angulo = (i / seedsPorCarga) * Math.PI * 2;
      let x = origen.x + Math.cos(angulo) * RADIO_SEED;
      let y = origen.y + Math.sin(angulo) * RADIO_SEED;

      ctx.beginPath();
      ctx.moveTo(x, y);

      for (let paso = 0; paso < MAX_PASOS; paso++) {
        const [Ex, Ey] = campoEn(x, y, puntos);
        const mag = Math.hypot(Ex, Ey);
        if (mag < 1e-6) break;

        x += (Ex / mag) * PASO;
        y += (Ey / mag) * PASO;
        ctx.lineTo(x, y);

        if (x < 0 || x > ancho || y < 0 || y > alto) break;

        const absorbida = puntos.some(
          (p) => p !== origen && Math.hypot(x - p.x, y - p.y) < RADIO_ABSORCION,
        );
        if (absorbida) break;
      }

      ctx.stroke();
    }
  }
}
