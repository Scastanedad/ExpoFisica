/**
 * Vectores de fuerza sobre +q y −q del dipolo, listos para `dibujarFuerzas.ts`
 * (Estación 03). Es solo un ADAPTADOR de visualización: la fuerza sobre cada
 * extremo es `fuerzaYTorqueDipolo` de `fisica/dipolo.ts` (la misma que mueve al
 * cuerpo), convertida a N con el factor de `escala.ts` y girada a la
 * convención de LECTURA (y hacia arriba) que espera `dibujarFuerzas`. No hay
 * ninguna fórmula nueva aquí.
 *
 * Los dos vectores salen de la MISMA llamada que `pasoDipolo` usa para
 * integrar, así que lo que se ve es exactamente lo que actúa: en campo
 * uniforme son iguales y opuestas (par de fuerzas: gira, no traslada); con una
 * carga puntual dejan de serlo (el extremo más cercano a la fuente pesa más).
 */
import { K_VISUAL, type PuntoCarga } from "../fisica/coulomb";
import { camposActivos, extremosDipolo, fuerzaYTorqueDipolo, type EstadoDipolo, type ParametrosDipolo } from "../fisica/dipolo";
import { factoresSim } from "../fisica/escala";
import type { VectorFuerzaSI } from "../fisica/fuerzas";

/** N por unidad de fuerza de simulación (constante de escala, calculada una vez). */
const FACTOR_FUERZA_N = factoresSim(K_VISUAL).fuerza;

export interface FuerzasDipoloParaDibujar {
  /** [+q, −q] en px lógicos (los mismos puntos que se pasan a `dibujarCargas`). */
  puntos: PuntoCarga[];
  /** Fuerza sobre cada punto, en N, convención de lectura (y arriba). */
  fuerzas: VectorFuerzaSI[];
}

function aVector(fxSim: number, fySimCanvas: number): VectorFuerzaSI {
  const fx = fxSim * FACTOR_FUERZA_N;
  const fy = -fySimCanvas * FACTOR_FUERZA_N; // canvas (y abajo) -> lectura (y arriba)
  return { fx, fy, modulo: Math.hypot(fx, fy) };
}

export function fuerzasDipoloParaDibujar(estado: EstadoDipolo, params: ParametrosDipolo): FuerzasDipoloParaDibujar {
  const ext = extremosDipolo(estado, params.d);
  // Las MISMAS fuentes activas que usa `pasoDipolo` (uniforme = solo el campo externo; puntual = solo la
  // carga fuente): se reutiliza `camposActivos` en vez de duplicar su lógica.
  const { cargasFuente, externoSim } = camposActivos(params);
  const ft = fuerzaYTorqueDipolo(estado, params.q, params.d, cargasFuente, externoSim, params.soft2);
  return {
    puntos: [
      { x: ext.masX, y: ext.masY, q: params.q },
      { x: ext.menosX, y: ext.menosY, q: -params.q },
    ],
    fuerzas: [aVector(ft.fMasX, ft.fMasY), aVector(ft.fMenosX, ft.fMenosY)],
  };
}
