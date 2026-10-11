/**
 * Dibujo en Canvas 2D de un circuito de E6/E7. Puro respecto al DOM: recibe la geometría ya
 * calculada (`distribucion.ts`), las lecturas ya formateadas (10 Hz) y las partículas (arrays tipados
 * del ref de `CanvasCircuito`); no guarda estado.
 *
 * Tema «instrumento de laboratorio» legible en sala: fondo oscuro, cables claros y gruesos, texto
 * monoespaciado grande, cian SOLO para lo interactivo (seleccionado y sonda). Rojo/azul se reservan para la
 * polaridad de la carga: partículas de la corriente convencional (+, rojo) o de los electrones (−, azul),
 * y los signos de la batería y de las placas.
 *
 * Qué se dibuja y en qué orden: cables → cuerpos (zigzag / placas) → cargas en placas → batería →
 * partículas (si no hay movimiento reducido) → flechas de sentido → rótulos → sonda.
 */
import { I_CERO } from "../../fisica/circuitos";
import type { Contexto2D } from "../ctx2d";
import type { GeometriaCircuito, Tramo } from "./distribucion";
import { posicionParticula, type Particulas } from "./particulas";
import type { TextosElemento } from "./textos";

export const FONDO = "#0b1020";
const CABLE = "#94a3b8";
const CUERPO = "#e2e8f0";
const TEXTO = "#f1f5f9";
const TEXTO_SUAVE = "#cbd5e1";
const CIAN = "#22d3ee";
const POSITIVA = "#f87171";
const NEGATIVA = "#60a5fa";
const FUENTE = 'ui-monospace, "Cascadia Code", "SFMono-Regular", Consolas, monospace';

/** Grosor de los cables y símbolos en px CSS (se divide entre la escala del lienzo). */
const GROSOR_CSS = 2.8;
const RADIO_PARTICULA_CSS = 3.4;
const LARGO_MIN_FLECHA_CSS = 26;

export interface DatosDibujo {
  /** Rótulos V / I de cada elemento (10 Hz); null = aún sin lectura. */
  textos: Record<string, TextosElemento> | null;
  /** Valor de cada elemento formateado («2 kΩ», «100 µF»). */
  valores: Record<string, string>;
  /** Corriente con signo de cada tramo [A] (a favor del polilínea). */
  corrientes: ArrayLike<number>;
  iRef: number;
  particulas: Particulas | null;
  seleccion: string | null;
  /** Cargas visibles en la placa a de cada capacitor, con signo (E7). */
  placas?: Record<string, number>;
  textoBateria: string;
  /** Sonda: posición y rótulo (V / I). */
  sonda: { x: number; y: number; v: string; i: string } | null;
  /** Rótulo completo del seleccionado en modo compacto. */
  textoSeleccion: string | null;
}

export interface VistaDibujo {
  verElectrones: boolean;
  /** `prefers-reduced-motion`: sin puntos en movimiento; quedan las flechas estáticas. */
  movimientoReducido: boolean;
  /** (ancho CSS)/(ancho lógico) del lienzo. */
  escalaCss: number;
}

const fuente = (px: number, negrita = false) => `${negrita ? "700 " : ""}${px.toFixed(1)}px ${FUENTE}`;

/** Polilínea del zigzag de un resistor dentro de su cuerpo. */
export function puntosZigzag(x: number, y: number, w: number, h: number, picos = 6): number[] {
  const pts = [x, y];
  const inicio = w * 0.12;
  const zona = w - 2 * inicio;
  pts.push(x + inicio, y);
  for (let k = 0; k < picos; k++) {
    const xm = x + inicio + (zona * (k + 0.5)) / picos;
    pts.push(xm, y + (k % 2 === 0 ? -h * 0.4 : h * 0.4));
  }
  pts.push(x + w - inicio, y, x + w, y);
  return pts;
}

function trazar(ctx: Contexto2D, pts: ArrayLike<number>): void {
  ctx.beginPath();
  ctx.moveTo(pts[0], pts[1]);
  for (let k = 2; k + 1 < pts.length; k += 2) ctx.lineTo(pts[k], pts[k + 1]);
  ctx.stroke();
}

function dibujarCables(ctx: Contexto2D, g: GeometriaCircuito, d: DatosDibujo, lw: number): void {
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  ctx.lineWidth = lw;
  for (const t of g.tramos) {
    if (t.cuerpo === "R") continue;
    if (t.cuerpo === "C") continue; // el cuerpo del capacitor lo dibuja `dibujarCapacitor`
    ctx.strokeStyle = t.elemento !== undefined && t.elemento === d.seleccion ? CIAN : CABLE;
    trazar(ctx, t.puntos);
  }
}

function dibujarResistor(ctx: Contexto2D, g: GeometriaCircuito, id: string, sel: boolean, lw: number): void {
  const el = g.elementos.find((e) => e.id === id);
  if (!el) return;
  ctx.strokeStyle = sel ? CIAN : CUERPO;
  ctx.lineWidth = lw;
  trazar(ctx, puntosZigzag(el.cuerpo.x, el.yEje, el.cuerpo.w, el.cuerpo.h));
}

function dibujarSignoCarga(ctx: Contexto2D, x: number, y: number, r: number, positiva: boolean): void {
  ctx.strokeStyle = positiva ? POSITIVA : NEGATIVA;
  ctx.beginPath();
  ctx.moveTo(x - r, y);
  ctx.lineTo(x + r, y);
  ctx.stroke();
  if (positiva) {
    ctx.beginPath();
    ctx.moveTo(x, y - r);
    ctx.lineTo(x, y + r);
    ctx.stroke();
  }
}

function dibujarCapacitor(
  ctx: Contexto2D,
  g: GeometriaCircuito,
  id: string,
  sel: boolean,
  nCargas: number,
  lw: number,
): void {
  const el = g.elementos.find((e) => e.id === id);
  if (!el) return;
  const c = el.cuerpo;
  const xa = c.x + c.w * 0.38;
  const xb = c.x + c.w * 0.62;
  const media = c.h * 0.62;
  ctx.strokeStyle = sel ? CIAN : CUERPO;
  ctx.lineWidth = lw;
  // Cables hasta las placas (el dieléctrico no conduce) y las dos placas.
  trazar(ctx, [c.x, el.yEje, xa, el.yEje]);
  trazar(ctx, [xb, el.yEje, c.x + c.w, el.yEje]);
  ctx.lineWidth = lw * 1.6;
  trazar(ctx, [xa, el.yEje - media, xa, el.yEje + media]);
  trazar(ctx, [xb, el.yEje - media, xb, el.yEje + media]);
  // Cargas acumuladas: placa a (+Q si n > 0), placa b (−Q): una marca por unidad de carga dibujada.
  const n = Math.min(8, Math.abs(Math.round(nCargas)));
  if (n === 0) return;
  ctx.lineWidth = lw * 0.7;
  const r = Math.max(2.2, g.s * 0.12);
  const dy = (2 * media) / (n + 1);
  const dx = Math.max(r * 1.8, g.s * 0.3);
  for (let k = 1; k <= n; k++) {
    const y = el.yEje - media + dy * k;
    dibujarSignoCarga(ctx, xa - dx, y, r, nCargas > 0);
    dibujarSignoCarga(ctx, xb + dx, y, r, nCargas < 0);
  }
}

function dibujarBateria(ctx: Contexto2D, g: GeometriaCircuito, d: DatosDibujo, lw: number): void {
  const { cx, yMas, yMenos } = g.bateria;
  const h = yMenos - yMas;
  const y1 = yMas + h * 0.38;
  const y2 = yMas + h * 0.62;
  ctx.strokeStyle = CUERPO;
  ctx.lineWidth = lw;
  trazar(ctx, [cx, yMas, cx, y1]);
  trazar(ctx, [cx, y2, cx, yMenos]);
  ctx.lineWidth = lw * 1.6;
  trazar(ctx, [cx - g.s * 0.62, y1, cx + g.s * 0.62, y1]);
  trazar(ctx, [cx - g.s * 0.34, y2, cx + g.s * 0.34, y2]);
  ctx.lineWidth = lw * 0.9;
  const r = Math.max(3, g.s * 0.14);
  dibujarSignoCarga(ctx, cx + g.s * 0.95, y1 - g.s * 0.12, r, true);
  dibujarSignoCarga(ctx, cx + g.s * 0.95, y2 + g.s * 0.12, r, false);

  const f = Math.max(g.fuente, g.fuenteMin);
  ctx.font = fuente(f, true);
  ctx.fillStyle = TEXTO;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(d.textoBateria, g.bateria.rotulo.x, g.bateria.rotulo.y);
}

function dibujarParticulas(
  ctx: Contexto2D,
  g: GeometriaCircuito,
  d: DatosDibujo,
  p: Particulas,
  verElectrones: boolean,
  radio: number,
): void {
  ctx.fillStyle = verElectrones ? NEGATIVA : POSITIVA;
  const pos = { x: 0, y: 0 };
  for (let k = 0; k < g.tramos.length; k++) {
    const c = p.cuenta[k];
    if (c === 0) continue;
    const quieto = Math.abs(d.corrientes[k]) < I_CERO;
    ctx.globalAlpha = quieto ? 0.3 : 1;
    ctx.beginPath();
    for (let j = 0; j < c; j++) {
      posicionParticula(p, g, k, j, pos);
      ctx.moveTo(pos.x + radio, pos.y);
      ctx.arc(pos.x, pos.y, radio, 0, Math.PI * 2);
    }
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

function dibujarFlecha(ctx: Contexto2D, t: Tramo, signo: 1 | -1, frac: number, escalaCss: number): void {
  const f = t.flecha;
  if (f.largo * escalaCss < LARGO_MIN_FLECHA_CSS) return;
  const dx = f.dx * signo;
  const dy = f.dy * signo;
  const largo = (7 + 6 * frac) / escalaCss;
  const ancho = largo * 0.62;
  const tx = f.x + dx * largo;
  const ty = f.y + dy * largo;
  const bx = f.x - dx * largo * 0.7;
  const by = f.y - dy * largo * 0.7;
  ctx.globalAlpha = 0.55 + 0.45 * frac;
  ctx.fillStyle = TEXTO;
  ctx.strokeStyle = FONDO;
  ctx.lineWidth = 1.2 / escalaCss;
  ctx.beginPath();
  ctx.moveTo(tx, ty);
  ctx.lineTo(bx - dy * ancho, by + dx * ancho);
  ctx.lineTo(bx + dy * ancho, by - dx * ancho);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.globalAlpha = 1;
}

function dibujarFlechas(ctx: Contexto2D, g: GeometriaCircuito, d: DatosDibujo, verElectrones: boolean, escalaCss: number): void {
  for (let k = 0; k < g.tramos.length; k++) {
    const t = g.tramos[k];
    if (t.cuerpo) continue; // las flechas van sobre los cables, no sobre el símbolo
    const i = d.corrientes[k];
    if (Math.abs(i) < I_CERO) continue;
    const frac = d.iRef > 0 ? Math.min(1, Math.abs(i) / d.iRef) : 1;
    const signo = (i > 0 ? 1 : -1) * (verElectrones ? -1 : 1);
    dibujarFlecha(ctx, t, signo as 1 | -1, frac, escalaCss);
  }
}

function dibujarRotulos(ctx: Contexto2D, g: GeometriaCircuito, d: DatosDibujo): void {
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  for (const el of g.elementos) {
    const sel = el.id === d.seleccion;
    const cx = el.celda.x + el.celda.w / 2;
    const valor = d.valores[el.id] ?? "";
    const textos = d.textos?.[el.id];
    if (sel) {
      ctx.globalAlpha = 0.1;
      ctx.fillStyle = CIAN;
      ctx.fillRect(el.celda.x, el.celda.y, el.celda.w, el.celda.h);
      ctx.globalAlpha = 1;
    }
    if (g.compacto) {
      // Sin sitio para todo: nombre pequeño y, del seleccionado, la lectura completa en la franja superior.
      ctx.font = fuente(Math.min(g.fuenteMin, g.s * 0.5), true);
      ctx.fillStyle = sel ? CIAN : TEXTO_SUAVE;
      ctx.fillText(el.id, cx, el.nombre.y + el.nombre.h - g.s * 0.06);
      continue;
    }
    ctx.font = fuente(g.fuente, true);
    ctx.fillStyle = sel ? CIAN : TEXTO;
    ctx.fillText(valor ? `${el.id} ${valor}` : el.id, cx, el.nombre.y + el.nombre.h - g.s * 0.06);
    if (!textos) continue;
    ctx.font = fuente(g.fuente);
    ctx.fillStyle = TEXTO;
    ctx.fillText(textos.v, cx, el.lectura.y + g.fuente * 0.95);
    ctx.fillStyle = TEXTO_SUAVE;
    ctx.fillText(textos.i, cx, el.lectura.y + g.fuente * 0.95 + g.fuente * 1.15);
  }

  if (g.compacto && g.banda) {
    ctx.font = fuente(g.fuenteMin, true);
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillStyle = d.textoSeleccion ? TEXTO : TEXTO_SUAVE;
    ctx.fillText(d.textoSeleccion ?? "Toca un elemento para ver sus datos", g.banda.x + g.fuenteMin * 0.6, g.banda.y + g.banda.h / 2);
  }
}

function dibujarSonda(ctx: Contexto2D, g: GeometriaCircuito, s: NonNullable<DatosDibujo["sonda"]>, escalaCss: number): void {
  const r = 8 / escalaCss;
  ctx.strokeStyle = CIAN;
  ctx.fillStyle = FONDO;
  ctx.lineWidth = 2.4 / escalaCss;
  ctx.beginPath();
  ctx.arc(s.x, s.y, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(s.x, s.y, r * 0.32, 0, Math.PI * 2);
  ctx.fillStyle = CIAN;
  ctx.fill();

  // Globo con V e I: arriba a la derecha si cabe, si no se voltea; siempre dentro del lienzo.
  const f = Math.max(g.fuenteMin, Math.min(g.fuente, g.fuenteMin * 1.5));
  ctx.font = fuente(f, true);
  const w = Math.max(ctx.measureText(s.v).width, ctx.measureText(s.i).width) + f * 1.2;
  const h = f * 2.9;
  const sep = r * 1.8;
  let x = s.x + sep;
  let y = s.y - sep - h;
  if (x + w > g.ancho - 2) x = s.x - sep - w;
  if (y < 2) y = s.y + sep;
  x = Math.max(2, Math.min(g.ancho - w - 2, x));
  y = Math.max(2, Math.min(g.alto - h - 2, y));
  ctx.fillStyle = "#0f172a";
  ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = CIAN;
  ctx.lineWidth = 1.5 / escalaCss;
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x + w, y);
  ctx.lineTo(x + w, y + h);
  ctx.lineTo(x, y + h);
  ctx.closePath();
  ctx.stroke();
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.fillStyle = TEXTO;
  ctx.fillText(s.v, x + f * 0.6, y + h * 0.3);
  ctx.fillText(s.i, x + f * 0.6, y + h * 0.72);
}

export function dibujarCircuito(ctx: Contexto2D, g: GeometriaCircuito, d: DatosDibujo, vista: VistaDibujo): void {
  const lw = GROSOR_CSS / vista.escalaCss;
  ctx.save();
  ctx.fillStyle = FONDO;
  ctx.fillRect(0, 0, g.ancho, g.alto);
  ctx.globalAlpha = 1;
  ctx.setLineDash([]);

  dibujarCables(ctx, g, d, lw);
  for (const el of g.elementos) {
    if (el.tipo === "R") dibujarResistor(ctx, g, el.id, el.id === d.seleccion, lw);
    else dibujarCapacitor(ctx, g, el.id, el.id === d.seleccion, d.placas?.[el.id] ?? 0, lw);
  }
  dibujarBateria(ctx, g, d, lw);

  if (d.particulas && !vista.movimientoReducido) {
    dibujarParticulas(ctx, g, d, d.particulas, vista.verElectrones, RADIO_PARTICULA_CSS / vista.escalaCss);
  }
  dibujarFlechas(ctx, g, d, vista.verElectrones, vista.escalaCss);
  dibujarRotulos(ctx, g, d);
  if (d.sonda) dibujarSonda(ctx, g, d.sonda, vista.escalaCss);
  ctx.restore();
}
