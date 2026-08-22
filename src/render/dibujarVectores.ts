import { campoEn, type PuntoCarga } from "../fisica/coulomb";

const PASO_MALLA = 40;

export function dibujarVectores(
  ctx: CanvasRenderingContext2D,
  puntos: PuntoCarga[],
  ancho: number,
  alto: number,
) {
  for (let x = PASO_MALLA / 2; x < ancho; x += PASO_MALLA) {
    for (let y = PASO_MALLA / 2; y < alto; y += PASO_MALLA) {
      const [Ex, Ey] = campoEn(x, y, puntos);
      const mag = Math.hypot(Ex, Ey);
      if (mag < 1e-6) continue;
      const escala = Math.min(16, Math.log10(mag + 1) * 6);
      const ux = (Ex / mag) * escala;
      const uy = (Ey / mag) * escala;

      ctx.strokeStyle = `rgba(120, 170, 255, ${Math.min(0.9, 0.25 + escala / 20)})`;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(x - ux, y - uy);
      ctx.lineTo(x + ux, y + uy);
      ctx.stroke();

      const ang = Math.atan2(uy, ux);
      ctx.beginPath();
      ctx.moveTo(x + ux, y + uy);
      ctx.lineTo(x + ux - 4 * Math.cos(ang - 0.4), y + uy - 4 * Math.sin(ang - 0.4));
      ctx.lineTo(x + ux - 4 * Math.cos(ang + 0.4), y + uy - 4 * Math.sin(ang + 0.4));
      ctx.closePath();
      ctx.fillStyle = "rgba(120, 170, 255, 0.8)";
      ctx.fill();
    }
  }
}
