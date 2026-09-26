/**
 * Textos accesibles de la escena (lectores de pantalla), en español y
 * generados desde los mismos datos que el dibujo: la escala sale de
 * `geometriaLeyenda` (sin duplicar números) y las cargas de `formatCarga`.
 */
import { formatDistancia, geometriaLeyenda, pxAMetros } from "../fisica/escala";
import { formatCarga } from "../fisica/unidades";
import type { ModoVista, UnidadCarga } from "../types/simulacion";

const VISTA: Record<ModoVista, string> = {
  vectores: "vectores del campo",
  lineas: "líneas de campo",
  potencial: "mapa de potencial",
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

/** Anuncio tras mover una carga: posición respecto a los bordes izquierdo y superior. */
export function anunciarMovimiento(nombre: string, xPx: number, yPx: number): string {
  const x = formatDistancia(pxAMetros(xPx));
  const y = formatDistancia(pxAMetros(yPx));
  return `${nombre[0].toUpperCase()}${nombre.slice(1)} movida a ${x} del borde izquierdo y ${y} del borde superior.`;
}
