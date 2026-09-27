/**
 * Un frame de la escena, común a la estación estática y a la dinámica.
 * Orden: capa en caché (cuadrícula -> campo del modo de vista; en
 * `equipotenciales`: curvas -> líneas de campo -> rótulos) -> leyenda de escala
 * -> cargas. La capa la mantiene `capaCampo.ts` (recalcula solo si algo cambió);
 * la leyenda y las cargas se pintan en cada frame con la posición viva.
 *
 * Los parámetros van en un objeto para poder añadir capas (sondas, fuerzas...)
 * sin cambiar todas las llamadas.
 */
import type { PuntoCarga } from "../fisica/coulomb";
import type { ModoVista, UnidadCarga } from "../types/simulacion";
import type { CapaCampo } from "./capaCampo";
import { dibujarCargas } from "./dibujarCargas";
import type { DibujanteLeyenda } from "./dibujarLeyendaEscala";

export interface EscenaParaDibujar {
  puntos: PuntoCarga[];
  modoVista: ModoVista;
  ancho: number;
  alto: number;
  /** (ancho CSS)/(ancho lógico) del canvas. */
  escalaCss: number;
  /** Capa en caché propia de este canvas (`crearCapaCampo`). */
  capa: CapaCampo;
  leyenda: DibujanteLeyenda | null;
  /** Índice (en `puntos`) de la carga con foco/selección, o -1. */
  indiceSeleccionada?: number;
  /** Índice (en `puntos`) de la carga que edita el control de magnitud, o -1 (fase 2 §B3). */
  indiceEditada?: number;
  /** Cómo se escribe la etiqueta de magnitud de cada carga. Por defecto "microC". */
  unidadCarga?: UnidadCarga;
}

export function dibujarEscena(ctx: CanvasRenderingContext2D, escena: EscenaParaDibujar) {
  const {
    puntos,
    modoVista,
    ancho,
    alto,
    escalaCss,
    capa,
    leyenda,
    indiceSeleccionada = -1,
    indiceEditada = -1,
    unidadCarga = "microC",
  } = escena;
  ctx.clearRect(0, 0, ancho, alto);
  capa.pintar(ctx, { puntos, modoVista, ancho, alto, escalaCss, unidadCarga });
  leyenda?.(ctx, ancho, alto, escalaCss, puntos);
  dibujarCargas(ctx, puntos, { escalaCss, indiceSeleccionada, indiceEditada, unidadCarga, ancho });
}
