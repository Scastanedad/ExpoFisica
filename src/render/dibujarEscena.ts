/**
 * Un frame de la escena, común a la estación estática y a la dinámica.
 * Orden (E0 §7.5): fondo/mapa -> cuadrícula -> campo -> leyenda -> cargas.
 * En modo "potencial" el mapa cubre todo el canvas con fillRect, así que la
 * cuadrícula se dibuja después de él.
 *
 * Los parámetros van en un objeto para poder añadir capas (sondas, fuerzas...)
 * sin cambiar todas las llamadas.
 */
import type { PuntoCarga } from "../fisica/coulomb";
import type { ModoVista } from "../types/simulacion";
import { dibujarCargas } from "./dibujarCargas";
import { dibujarCuadricula } from "./dibujarCuadricula";
import { dibujarLineasCampo } from "./dibujarLineasCampo";
import { dibujarMapaPotencial } from "./dibujarMapaPotencial";
import { dibujarVectores } from "./dibujarVectores";
import type { DibujanteLeyenda } from "./dibujarLeyendaEscala";

export interface EscenaParaDibujar {
  puntos: PuntoCarga[];
  modoVista: ModoVista;
  ancho: number;
  alto: number;
  /** (ancho CSS)/(ancho lógico) del canvas. */
  escalaCss: number;
  leyenda: DibujanteLeyenda | null;
  /** Índice (en `puntos`) de la carga con foco/selección, o -1. */
  indiceSeleccionada?: number;
}

export function dibujarEscena(ctx: CanvasRenderingContext2D, escena: EscenaParaDibujar) {
  const { puntos, modoVista, ancho, alto, escalaCss, leyenda, indiceSeleccionada = -1 } = escena;
  if (modoVista === "potencial") {
    dibujarMapaPotencial(ctx, puntos, ancho, alto);
    dibujarCuadricula(ctx, ancho, alto, escalaCss);
  } else {
    ctx.clearRect(0, 0, ancho, alto);
    dibujarCuadricula(ctx, ancho, alto, escalaCss);
    if (modoVista === "vectores") dibujarVectores(ctx, puntos, ancho, alto, escalaCss);
    else dibujarLineasCampo(ctx, puntos, ancho, alto);
  }
  leyenda?.(ctx, ancho, alto, escalaCss, puntos);
  dibujarCargas(ctx, puntos, escalaCss, indiceSeleccionada);
}
