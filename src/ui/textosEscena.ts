/**
 * Textos accesibles de la escena (lectores de pantalla), en español y
 * generados desde los mismos datos que el dibujo: la escala sale de
 * `geometriaLeyenda` (sin duplicar números) y las cargas de `formatCarga`.
 */
import { Q_MAX, Q_MIN, Q_PASO } from "../fisica/carga";
import { DELTA_V_SI } from "../fisica/equipotenciales";
import { formatDistancia, formatSI, geometriaLeyenda, pxAMetros } from "../fisica/escala";
import { formatCarga } from "../fisica/unidades";
import type { ModoVista, UnidadCarga } from "../types/simulacion";

const VISTA: Record<ModoVista, string> = {
  vectores: "vectores del campo",
  lineas: "líneas de campo",
  equipotenciales: `equipotenciales, curvas de igual potencial cada ${formatSI(DELTA_V_SI, "V")}, con líneas de campo`,
};

/** "carga positiva de +1 µC (n.º 2)" -- `indice` empieza en 0. */
export function nombreCarga(q: number, unidad: UnidadCarga, indice: number): string {
  return `carga ${q > 0 ? "positiva" : "negativa"} de ${formatCarga(q, unidad)} (n.º ${indice + 1})`;
}

/** aria-label del canvas: "Campo eléctrico de 2 cargas: +1 µC, −1 µC. Vista: vectores del campo." */
export function describirEscena(
  cargas: ReadonlyArray<{ q: number }>,
  unidad: UnidadCarga,
  modoVista: ModoVista,
): string {
  const n = cargas.length;
  const vista = `Vista: ${VISTA[modoVista]}.`;
  if (n === 0) return `Campo eléctrico sin cargas. ${vista}`;
  const lista = cargas.map((c) => formatCarga(c.q, unidad)).join(", ");
  return `Campo eléctrico de ${n} ${n === 1 ? "carga" : "cargas"}: ${lista}. ${vista}`;
}

/** Escala del recuadro, generada desde la geometría de la leyenda. */
export function describirEscala(anchoCanvasPx: number): string {
  const geo = geometriaLeyenda(anchoCanvasPx, 1);
  return `Escala del recuadro: ${geo.etiquetaCuadro}. La barra de la esquina inferior izquierda mide ${geo.etiquetaLargo}.`;
}

/**
 * Anuncio tras mover una carga: posición respecto a los bordes izquierdo y superior.
 * `enReposo` (estación dinámica): con teclado o "tocar el destino" la carga queda
 * quieta y sin anclar, a diferencia de soltar un arrastre con velocidad.
 */
export function anunciarMovimiento(
  nombre: string,
  xPx: number,
  yPx: number,
  enReposo = false,
): string {
  const x = formatDistancia(pxAMetros(xPx));
  const y = formatDistancia(pxAMetros(yPx));
  const base = `${nombre[0].toUpperCase()}${nombre.slice(1)} movida a ${x} del borde izquierdo y ${y} del borde superior.`;
  return enReposo ? `${base} Queda en reposo.` : base;
}

/** Magnitud sin signo con su unidad: "2.5 µC" o "2.5" (unidad normalizada). */
function magnitudTexto(q: number, unidad: UnidadCarga): string {
  return formatCarga(Math.abs(q), unidad).slice(1);
}

/**
 * Anuncio (aria-live) tras cambiar la magnitud: "Carga positiva n.º 2: 2.5 µC." y,
 * en los límites, "Magnitud mínima: 0.5 µC." / "Magnitud máxima: 5 µC."
 */
export function anunciarMagnitud(q: number, unidad: UnidadCarga, indice: number): string {
  const base = `Carga ${q > 0 ? "positiva" : "negativa"} n.º ${indice + 1}: ${magnitudTexto(q, unidad)}.`;
  const m = Math.abs(q);
  if (m <= Q_MIN) return `${base} Magnitud mínima: ${magnitudTexto(Q_MIN, unidad)}.`;
  if (m >= Q_MAX) return `${base} Magnitud máxima: ${magnitudTexto(Q_MAX, unidad)}.`;
  return base;
}

/** aria-valuetext del deslizador de magnitud: "positiva, 2.5 microcoulombs". */
export function valorTextoMagnitud(q: number, unidad: UnidadCarga): string {
  const signo = q > 0 ? "positiva" : "negativa";
  const m = Math.abs(q);
  const numero = String(Number(m.toFixed(2)));
  if (unidad === "normalizada") return `${signo}, ${numero} ${m === 1 ? "unidad" : "unidades"}`;
  return `${signo}, ${numero} ${m === 1 ? "microcoulomb" : "microcoulombs"}`;
}

/** "De 0.5 a 5 µC, en pasos de 0.5 µC." */
export function describirRangoMagnitud(unidad: UnidadCarga): string {
  const u = unidad === "microC" ? " µC" : "";
  return `De ${Q_MIN}${u} a ${Q_MAX}${u}, en pasos de ${Q_PASO}${u}.`;
}
