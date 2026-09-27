import type { PuntoCarga } from "../fisica/coulomb";
import { formatCarga } from "../fisica/unidades";
import type { UnidadCarga } from "../types/simulacion";
import {
  ALFA_HALO_MAX,
  ANCHO_HALO_CSS,
  alfaHalo,
  fuenteSignoCarga,
  radioVisualCarga,
  unidadCss,
  unidadTexto,
} from "./geometriaCargas";

const CIAN = "#22d3ee"; // --accent: único acento interactivo
const HALO_TEXTO = "rgba(5, 7, 13, 0.9)";
const COLOR_TEXTO = "#e5e7eb"; // --text
// Discos un punto más oscuros que el texto rojo/azul del DOM: el signo blanco llega a >= 4.5:1 (WCAG 1.4.3).
const ROJO = "#dc2626";
const AZUL = "#2563eb";
const RGB_ROJO = "220, 38, 38";
const RGB_AZUL = "37, 99, 235";
/** Anillo discontinuo (más tenue) de la carga que edita el control de magnitud. */
const CIAN_TENUE = "rgba(34, 211, 238, 0.7)";
const FUENTE_ETIQUETA = 'ui-monospace, "Cascadia Code", "SFMono-Regular", Consolas, monospace';
/**
 * Etiqueta de magnitud: 12 px CSS (≥ 12; crece con el canvas ampliado, ver `unidadTexto`), con halo
 * oscuro de 3 px CSS para leerse sobre las curvas y líneas de campo.
 */
const ETIQUETA_CSS = 12;
const HALO_ETIQUETA_CSS = 3;
const SEPARACION_ETIQUETA_CSS = 4;
/** Con más cargas que esto, la etiqueta solo se muestra en la seleccionada (evita el amontonamiento). */
export const MAX_CARGAS_CON_ETIQUETA = 8;

/** Anchos de texto ya medidos ("fuente|texto"): evita `measureText` en cada frame. */
const anchosTexto = new Map<string, number>();

function anchoTexto(ctx: CanvasRenderingContext2D, fuente: string, texto: string): number {
  const clave = `${fuente}|${texto}`;
  let ancho = anchosTexto.get(clave);
  if (ancho === undefined) {
    ctx.font = fuente;
    ancho = ctx.measureText(texto).width;
    anchosTexto.set(clave, ancho);
  }
  return ancho;
}

/** Cajas (px lógicos) de las etiquetas de magnitud de TODAS las cargas: los rótulos de las equipotenciales las evitan. */
export function rectsEtiquetasCarga(
  ctx: CanvasRenderingContext2D,
  puntos: PuntoCarga[],
  escalaCss: number,
  unidadCarga: UnidadCarga,
  ancho: number,
): Array<{ x: number; y: number; w: number; h: number }> {
  const u = unidadTexto(escalaCss);
  const fuente = `600 ${ETIQUETA_CSS * u}px ${FUENTE_ETIQUETA}`;
  const halo = HALO_ETIQUETA_CSS * u;
  return puntos.map((p) => {
    const w = anchoTexto(ctx, fuente, formatCarga(p.q, unidadCarga));
    const sep = radioVisualCarga(p.q, escalaCss) + SEPARACION_ETIQUETA_CSS * u;
    const aLaDerecha = p.x + sep + w <= ancho;
    const x = aLaDerecha ? p.x + sep : p.x - sep - w;
    const medioAlto = ETIQUETA_CSS * u * 0.5 + halo;
    return { x: x - halo, y: p.y - medioAlto, w: w + 2 * halo, h: 2 * medioAlto };
  });
}

export interface OpcionesCargas {
  escalaCss?: number;
  /** Índice (en `puntos`) de la carga con foco/selección, o -1. */
  indiceSeleccionada?: number;
  /** Índice de la carga que edita el control de magnitud (anillo discontinuo tenue), o -1. */
  indiceEditada?: number;
  /** Cómo se escribe la etiqueta de magnitud ("+2.5 µC" o "+2.5"). */
  unidadCarga?: UnidadCarga;
  /** Ancho lógico del canvas, para que la etiqueta pase a la izquierda si se saldría. */
  ancho?: number;
}

/**
 * Dibuja las cargas. El radio visual crece con |q| (`radioVisualCarga`, el radio
 * FÍSICO de 14 px no se toca), un halo del mismo color con alfa ∝ |q| refuerza
 * la intensidad (canal secundario: el matiz rojo/azul es solo polaridad) y la
 * etiqueta con `formatCarga` es el canal de texto: la magnitud nunca se
 * comunica solo por tamaño o color. La etiqueta se muestra en todas las cargas
 * con n ≤ 8 y, si no, solo en la seleccionada. `indiceSeleccionada` pinta el
 * anillo de foco: cian con halo oscuro para que se vea sobre las curvas y líneas de campo.
 */
export function dibujarCargas(
  ctx: CanvasRenderingContext2D,
  puntos: PuntoCarga[],
  opciones: OpcionesCargas = {},
) {
  const {
    escalaCss = 1,
    indiceSeleccionada = -1,
    indiceEditada = -1,
    unidadCarga = "microC",
    ancho = Infinity,
  } = opciones;
  const u = unidadCss(escalaCss);
  const ut = unidadTexto(escalaCss);
  const anchoHalo = ANCHO_HALO_CSS * u;

  puntos.forEach((p, i) => {
    const radio = radioVisualCarga(p.q, escalaCss);
    const positiva = p.q > 0;

    // Halo de intensidad: gradiente radial del mismo color, de R a R + 10u.
    const alfa = alfaHalo(p.q);
    if (alfa > 0) {
      const rgb = positiva ? RGB_ROJO : RGB_AZUL;
      const gradiente = ctx.createRadialGradient(p.x, p.y, radio, p.x, p.y, radio + anchoHalo);
      gradiente.addColorStop(0, `rgba(${rgb}, ${Math.min(alfa, ALFA_HALO_MAX)})`);
      gradiente.addColorStop(1, `rgba(${rgb}, 0)`);
      ctx.beginPath();
      ctx.arc(p.x, p.y, radio + anchoHalo, 0, Math.PI * 2);
      ctx.fillStyle = gradiente;
      ctx.fill();
    }

    if (i === indiceEditada && i !== indiceSeleccionada) {
      // Carga en edición (sin foco ni selección): anillo discontinuo, más fino y tenue que el de la seleccionada.
      const rAnillo = radio + 4 * u;
      ctx.beginPath();
      ctx.arc(p.x, p.y, rAnillo, 0, Math.PI * 2);
      ctx.setLineDash([5 * u, 4 * u]);
      ctx.lineWidth = 4 * u;
      ctx.strokeStyle = HALO_TEXTO;
      ctx.stroke();
      ctx.lineWidth = 2 * u;
      ctx.strokeStyle = CIAN_TENUE;
      ctx.stroke();
      ctx.setLineDash([]);
    }
    if (i === indiceSeleccionada) {
      const rAnillo = radio + 4 * u;
      ctx.beginPath();
      ctx.arc(p.x, p.y, rAnillo, 0, Math.PI * 2);
      ctx.lineWidth = 5 * u;
      ctx.strokeStyle = HALO_TEXTO;
      ctx.stroke();
      ctx.lineWidth = 2.5 * u;
      ctx.strokeStyle = CIAN;
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.arc(p.x, p.y, radio, 0, Math.PI * 2);
    ctx.fillStyle = positiva ? ROJO : AZUL;
    ctx.fill();
    ctx.fillStyle = "#fff";
    ctx.font = `bold ${fuenteSignoCarga(p.q, escalaCss)}px system-ui`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(positiva ? "+" : "−", p.x, p.y + 1);
  });

  // Etiquetas en una segunda pasada: quedan por encima de los discos vecinos.
  const todas = puntos.length <= MAX_CARGAS_CON_ETIQUETA;
  const fuente = `600 ${ETIQUETA_CSS * ut}px ${FUENTE_ETIQUETA}`;
  ctx.textBaseline = "middle";
  ctx.lineJoin = "round";
  ctx.lineWidth = 2 * HALO_ETIQUETA_CSS * ut;
  puntos.forEach((p, i) => {
    if (!todas && i !== indiceSeleccionada) return;
    const texto = formatCarga(p.q, unidadCarga);
    const w = anchoTexto(ctx, fuente, texto);
    const radio = radioVisualCarga(p.q, escalaCss);
    const sep = radio + SEPARACION_ETIQUETA_CSS * ut;
    const aLaDerecha = p.x + sep + w <= ancho;
    ctx.font = fuente;
    ctx.textAlign = aLaDerecha ? "left" : "right";
    const x = aLaDerecha ? p.x + sep : p.x - sep;
    ctx.strokeStyle = HALO_TEXTO;
    ctx.strokeText(texto, x, p.y);
    ctx.fillStyle = COLOR_TEXTO;
    ctx.fillText(texto, x, p.y);
  });
}
