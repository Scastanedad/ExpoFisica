/**
 * Mapeo de la magnitud de la fuerza (N, ya en SI — a diferencia de
 * `escalaFlecha.ts`, que trabaja en unidades de simulación) a la longitud de
 * su vector dibujado (especificación E3.2 §4). Logarítmico con REFERENCIA
 * FIJA `F_TOPE_FLECHA_N`, mismo espíritu que `escalaFlecha`/`E_TOPE_FLECHA`
 * de E2.1 §3.1: `t` depende solo de |F|, no de q ni del número de cargas.
 *
 * Separado de `dibujarFuerzas.ts` para poder probarlo en Node.
 */

/**
 * |F| (N) que satura la flecha: calibrado contra dos cargas de 5 µC con los
 * discos apenas en contacto (28 px, F ≈ 7164.8 N — E3.2 §4). Si `RADIO_CARGA_PX`
 * o el rango de magnitud de carga cambian, recalibrar (igual que `E_TOPE_FLECHA`).
 */
export const F_TOPE_FLECHA_N = 7200;

const LOG_TOPE = Math.log10(1 + F_TOPE_FLECHA_N);

/** t ∈ [0, 1]: 0 sin fuerza, 1 con |F| ≥ F_TOPE_FLECHA_N. */
export function escalaFlechaFuerza(fuerzaN: number): number {
  if (!(fuerzaN > 0)) return 0;
  return Math.min(1, Math.log10(1 + fuerzaN) / LOG_TOPE);
}
