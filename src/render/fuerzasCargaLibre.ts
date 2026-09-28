/**
 * Vector de fuerza sobre la carga puntual libre, listo para `dibujarFuerzas.ts`
 * (Estación 03, objeto "carga"). Mismo papel que `fuerzasDipolo.ts`: solo un
 * ADAPTADOR de visualización de `fuerzaSobreCargaLibre` (la MISMA fuerza que
 * integra `pasoCargaLibre`), convertida a N y girada a la convención de
 * LECTURA (y hacia arriba) que espera `dibujarFuerzas`. Ninguna fórmula nueva.
 */
import { K_VISUAL, type PuntoCarga } from "../fisica/coulomb";
import { fuerzaSobreCargaLibre, type EstadoCargaLibre, type ParametrosCargaLibre } from "../fisica/cargaLibre";
import { factoresSim } from "../fisica/escala";
import type { VectorFuerzaSI } from "../fisica/fuerzas";

/** N por unidad de fuerza de simulación (constante de escala, calculada una vez). */
const FACTOR_FUERZA_N = factoresSim(K_VISUAL).fuerza;

export interface FuerzaCargaLibreParaDibujar {
  /** La carga libre como punto (px lógicos), el mismo que se pasa a `dibujarCargas`. */
  punto: PuntoCarga;
  /** Fuerza sobre ella, en N, convención de lectura (y arriba). */
  fuerza: VectorFuerzaSI;
}

export function fuerzaCargaLibreParaDibujar(
  estado: EstadoCargaLibre,
  params: ParametrosCargaLibre,
): FuerzaCargaLibreParaDibujar {
  const [fxSim, fySimCanvas] = fuerzaSobreCargaLibre(estado, params);
  const fx = fxSim * FACTOR_FUERZA_N;
  const fy = -fySimCanvas * FACTOR_FUERZA_N; // canvas (y abajo) -> lectura (y arriba)
  return {
    punto: { x: estado.x, y: estado.y, q: params.q },
    fuerza: { fx, fy, modulo: Math.hypot(fx, fy) },
  };
}
