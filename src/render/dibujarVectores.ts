import { campoEn, type PuntoCarga } from "../fisica/coulomb";
import { PX_POR_CUADRO, SOFTENING2_ESTATICO } from "../fisica/escala";
import { escalaFlecha } from "./escalaFlecha";
import { unidadCss } from "./geometriaCargas";

/** Una flecha por cuadro de la cuadrícula, centrada en él (14×10 = 140 flechas en 700×500). */
const PASO_MALLA = PX_POR_CUADRO;

/*
 * Tamaño en pantalla de cada flecha. La magnitud se codifica con `escalaFlecha`
 * (log10 con referencia fija E_TOPE_FLECHA, ver escalaFlecha.ts; además de la
 * opacidad); lo que se compensa con u = 1/escalaCss es el TAMAÑO, para que en
 * un móvil (canvas reducido) las flechas no se encojan hasta ser casi invisibles.
 * Longitudes TOTALES de la flecha, en px CSS.
 */
const LARGO_MIN_CSS = 13;
const LARGO_MAX_CSS = 32;
const GROSOR_CSS = 2;
const PUNTA_CSS = 6;
/** Tope en px lógicos: dos flechas vecinas (paso 50) no llegan a tocarse. */
const LARGO_MAX_LOGICO = 0.9 * PASO_MALLA;

export function dibujarVectores(
  ctx: CanvasRenderingContext2D,
  puntos: PuntoCarga[],
  ancho: number,
  alto: number,
  escalaCss = 1,
) {
  const u = unidadCss(escalaCss);
  const largoMax = Math.min(LARGO_MAX_CSS * u, LARGO_MAX_LOGICO);
  const largoMin = Math.min(LARGO_MIN_CSS * u, largoMax);
  const grosor = GROSOR_CSS * u;

  for (let x = PASO_MALLA / 2; x < ancho; x += PASO_MALLA) {
    for (let y = PASO_MALLA / 2; y < alto; y += PASO_MALLA) {
      const [Ex, Ey] = campoEn(x, y, puntos, SOFTENING2_ESTATICO);
      const mag = Math.hypot(Ex, Ey);
      if (mag < 1e-6) continue;
      // t = 0..1: log10 con tope fijo (E2.1 §3.1), independiente de q y del número de cargas.
      const t = escalaFlecha(mag);
      const semilargo = (largoMin + (largoMax - largoMin) * t) / 2;
      const ux = (Ex / mag) * semilargo;
      const uy = (Ey / mag) * semilargo;

      // Blanco hielo (fase 2 §C): el azul queda reservado a la polaridad negativa de las cargas.
      ctx.strokeStyle = `rgba(226, 232, 240, ${Math.min(0.9, 0.25 + t * 0.8)})`;
      ctx.lineWidth = grosor;
      ctx.beginPath();
      ctx.moveTo(x - ux, y - uy);
      ctx.lineTo(x + ux, y + uy);
      ctx.stroke();

      const punta = Math.min(PUNTA_CSS * u, semilargo);
      const ang = Math.atan2(uy, ux);
      ctx.beginPath();
      ctx.moveTo(x + ux, y + uy);
      ctx.lineTo(x + ux - punta * Math.cos(ang - 0.4), y + uy - punta * Math.sin(ang - 0.4));
      ctx.lineTo(x + ux - punta * Math.cos(ang + 0.4), y + uy - punta * Math.sin(ang + 0.4));
      ctx.closePath();
      ctx.fillStyle = "rgba(226, 232, 240, 0.8)";
      ctx.fill();
    }
  }
}
