/** Constantes de la Estación 08 (capacitor de placas). SI reales; ver docs-capacitor-placas/contrato.md §1 y §4. */

/** Permitividad del vacío, F/m. */
export const EPSILON_0 = 8.854e-12;

/** κ del aire (medio de fondo del hueco). El vacío (κ = 1) no es opción del selector. */
export const KAPPA_AIRE = 1.00059;

/** Rigidez del aire, V/m (3 MV/m). */
export const E_MAX_AIRE = 3e6;

/** Rangos de los controles (m² y m). */
export const A_MIN = 25e-4;
export const A_MAX = 400e-4;
export const D_MIN = 1e-4;
export const D_MAX = 1e-2;

/** Tope de tensión por seguridad de la sala, V (también en modo aislado). */
export const V_TOPE = 5000;

/** Desde esta fracción de E/E_máx se avisa. */
export const UMBRAL_AVISO = 0.8;

/** Tolerancia relativa al comparar con un límite (evita falsos bloqueos por redondeo). */
export const TOL_LIMITE = 1e-9;

/** Valores de arranque: conectado, aire, 100 cm², 1 mm, 100 V. */
export const A_DEFECTO = 100e-4;
export const D_DEFECTO = 1e-3;
export const V_DEFECTO = 100;
