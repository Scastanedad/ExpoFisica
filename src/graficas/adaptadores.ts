/**
 * Adaptadores entre los stores/lecturas que YA existen (E2.5, E3.1) y los
 * buffers de `datos/series.ts` (T4.1) para las gráficas dinámicas de la Fase
 * 4 (E4.1). Funciones puras, sin React ni DOM: la ingesta es un `useEffect`
 * que llama a estas funciones cuando el store correspondiente publica un
 * valor nuevo (4 Hz para energía, 10 Hz para q₀) -- nunca un `setInterval`
 * nuevo ni un hook en el `requestAnimationFrame` del canvas principal (E4.1 §6).
 *
 * Los valores de partida de la especificación (ventana de 20 s, 80 muestras
 * para K/U/E, 200 para q₀) se fijan aquí como constantes explícitas, NO
 * derivadas de `capacidadParaVentana` (que añade un 20 % de margen pensado
 * para el caso general de `series.ts`): la spec pide números exactos.
 */
import { crearColeccionSeries, type ColeccionSeries } from "../datos/series";
import { K_VISUAL } from "../fisica/coulomb";
import { energiaSimAJ } from "../fisica/escala";
import type { LecturaQ0 } from "../fisica/cargaPrueba";
import type { EnergiaDinamica } from "../types/simulacion";

/** Ventana visible de ambas gráficas vs. tiempo (E4.1 §1.3/§2.4). Segundos. */
export const VENTANA_TIEMPO_S = 20;
/** 20 s × 4 Hz (cadencia del mensaje "energia" del Worker, E2.5 §2.3). */
export const CAPACIDAD_ENERGIA = 80;
/** 20 s × 10 Hz (cadencia de `cargaPruebaStore.lectura`, E3.1 §6). */
export const CAPACIDAD_Q0 = 200;

/**
 * Intervalo esperado entre muestras consecutivas (segundos), para que
 * `graficas/dibujoGrafica.ts#insertarCortesPorHueco` sepa distinguir un hueco
 * real (pausa de la gráfica, o lectura `null` de q₀) de la cadencia normal.
 * Mismos valores que la cadencia de publicación de cada fuente (250 ms / 4 Hz
 * para K/U/E, 100 ms / 10 Hz para q₀ -- corrección post revisión Crítica de
 * `fisico-revisor`, E4.1 §1.3/§2.2).
 */
export const INTERVALO_ESPERADO_ENERGIA_S = 0.25;
export const INTERVALO_ESPERADO_Q0_S = 0.1;

export function crearColeccionEnergia(): ColeccionSeries {
  return crearColeccionSeries([
    { clave: "K", etiqueta: "Cinética", unidad: "J", capacidad: CAPACIDAD_ENERGIA },
    { clave: "U", etiqueta: "Potencial", unidad: "J", capacidad: CAPACIDAD_ENERGIA },
    { clave: "E", etiqueta: "Total", unidad: "J", capacidad: CAPACIDAD_ENERGIA },
  ]);
}

/**
 * Empuja K/U/E convertidas a julios (E4.1 §1.1, criterio G6): SIEMPRE con
 * `energiaSimAJ(x, K_VISUAL)`, la MISMA conversión que usa `IndicadorEnergia`
 * -- nunca el valor crudo del mensaje del Worker (unidades de simulación).
 * `tS`: segundos reales desde que se limpió la gráfica (E4.1 §1.3), no
 * segundos de simulación.
 */
export function empujarEnergia(coleccion: ColeccionSeries, e: EnergiaDinamica, tS: number): void {
  coleccion.pushLote(tS, {
    K: energiaSimAJ(e.cinetica, K_VISUAL),
    U: energiaSimAJ(e.potencial, K_VISUAL),
    E: energiaSimAJ(e.total, K_VISUAL),
  });
}

export function crearColeccionQ0(): ColeccionSeries {
  return crearColeccionSeries([
    { clave: "moduloE", etiqueta: "Campo |E|", unidad: "N/C", capacidad: CAPACIDAD_Q0 },
    { clave: "v", etiqueta: "Potencial V", unidad: "V", capacidad: CAPACIDAD_Q0 },
    { clave: "moduloF", etiqueta: "Fuerza |F|", unidad: "N", capacidad: CAPACIDAD_Q0 },
  ]);
}

/**
 * Empuja |E|/V/|F| de q₀ (E4.1 §2.2): YA están en SI (`cargaPruebaStore.lectura`),
 * sin conversión adicional. `lectura === null` (q₀ demasiado cerca de una
 * carga, E3.1 §2) es un HUECO: no se empuja nada, no se interpola ni se pone 0
 * -- el hueco queda visible como un corte de tiempo entre la muestra anterior
 * y la siguiente.
 */
export function empujarLecturaQ0(coleccion: ColeccionSeries, lectura: LecturaQ0 | null, tS: number): void {
  if (!lectura) return;
  coleccion.pushLote(tS, { moduloE: lectura.moduloE, v: lectura.v, moduloF: lectura.moduloF });
}
