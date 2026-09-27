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
import type { VectorFuerzaSI } from "../fisica/fuerzas";
import type { ModoVista, UnidadCarga } from "../types/simulacion";
import type { CapaCampo } from "./capaCampo";
import { dibujarCargas } from "./dibujarCargas";
import { dibujarFuerzas } from "./dibujarFuerzas";
import { dibujarSondaQ0, type PuntoLogico } from "./dibujarSondaQ0";
import type { DibujanteLeyenda } from "./dibujarLeyendaEscala";

/** Carga de prueba q₀ (E3.1), solo en "Cargas en reposo"; `undefined`/`null` = sin sonda. */
export interface SondaParaDibujar {
  x: number;
  y: number;
  signo: 1 | -1;
  /** Traza en curso (mientras se registra un camino, E3.1 §6, modo 2), en px lógicos. */
  traza?: readonly PuntoLogico[];
}

export interface EscenaParaDibujar {
  puntos: PuntoCarga[];
  modoVista: ModoVista;
  ancho: number;
  alto: number;
  /** (ancho CSS)/(ancho lógico) del canvas. */
  escalaCss: number;
  /**
   * Factor total (escalaCss * devicePixelRatio acotado) al que está el bitmap real del
   * `<canvas>` (hooks/useEscalaCss.ts). Se lo pasa a la capa en caché para que su propio
   * bitmap offscreen tenga la misma resolución. Por defecto 1.
   */
  resolucion?: number;
  /**
   * En modo "equipotenciales", si además se muestran las líneas de campo blancas
   * (toggle "Mostrar líneas de campo"). Por defecto `true`. Sin efecto en modo
   * "lineas" (ahí siempre se muestran).
   */
  mostrarLineasEnEquipotenciales?: boolean;
  /** Capa en caché propia de este canvas (`crearCapaCampo`). */
  capa: CapaCampo;
  leyenda: DibujanteLeyenda | null;
  /** Índice (en `puntos`) de la carga con foco/selección, o -1. */
  indiceSeleccionada?: number;
  /** Índice (en `puntos`) de la carga que edita el control de magnitud, o -1 (fase 2 §B3). */
  indiceEditada?: number;
  /** Cómo se escribe la etiqueta de magnitud de cada carga. Por defecto "microC". */
  unidadCarga?: UnidadCarga;
  /** Fuerza neta sobre cada carga (E3.2), alineada con `puntos`, en N; null si `mostrarFuerzas` es false. */
  fuerzas?: ReadonlyArray<VectorFuerzaSI | null> | null;
  mostrarFuerzas?: boolean;
  /** Carga de prueba q₀ (E3.1), solo en "Cargas en reposo". */
  sonda?: SondaParaDibujar | null;
}

export function dibujarEscena(ctx: CanvasRenderingContext2D, escena: EscenaParaDibujar) {
  const {
    puntos,
    modoVista,
    ancho,
    alto,
    escalaCss,
    resolucion,
    mostrarLineasEnEquipotenciales = true,
    capa,
    leyenda,
    indiceSeleccionada = -1,
    indiceEditada = -1,
    unidadCarga = "microC",
    fuerzas,
    mostrarFuerzas = false,
    sonda,
  } = escena;
  ctx.clearRect(0, 0, ancho, alto);
  capa.pintar(ctx, {
    puntos,
    modoVista,
    ancho,
    alto,
    escalaCss,
    unidadCarga,
    resolucion,
    mostrarLineasEnEquipotenciales,
  });
  leyenda?.(ctx, ancho, alto, escalaCss, puntos);
  dibujarCargas(ctx, puntos, { escalaCss, indiceSeleccionada, indiceEditada, unidadCarga, ancho });
  if (mostrarFuerzas && fuerzas) dibujarFuerzas(ctx, puntos, fuerzas, escalaCss);
  if (sonda) dibujarSondaQ0(ctx, sonda.x, sonda.y, sonda.signo, escalaCss, sonda.traza);
}
