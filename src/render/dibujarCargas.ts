import type { PuntoCarga } from "../fisica/coulomb";

export const RADIO_CARGA = 14;

export function dibujarCargas(ctx: CanvasRenderingContext2D, puntos: PuntoCarga[]) {
  for (const p of puntos) {
    ctx.beginPath();
    ctx.arc(p.x, p.y, RADIO_CARGA, 0, Math.PI * 2);
    ctx.fillStyle = p.q > 0 ? "#ef4444" : "#3b82f6";
    ctx.fill();
    ctx.fillStyle = "#fff";
    ctx.font = "bold 16px system-ui";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(p.q > 0 ? "+" : "−", p.x, p.y + 1);
  }
}
