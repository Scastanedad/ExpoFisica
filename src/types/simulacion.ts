export type ModoVista = "vectores" | "lineas" | "equipotenciales";
export type UnidadCarga = "normalizada" | "microC";

export interface CargaMeta {
  id: string;
  /**
   * Carga en unidades normalizadas; por convención 1 unidad = 1 microCoulomb (ver fisica/unidades.ts).
   * |q| está entre 0.5 y 5 en pasos de 0.5 y el signo no se edita (ver fisica/carga.ts).
   */
  q: number;
}

/**
 * Lectura de energía de la estación dinámica, en unidades de SIMULACIÓN (se
 * pasan a julios con `energiaSimAJ(x, K_VISUAL)` al mostrarlas). La publica el
 * Worker ~4 veces por segundo y el store la guarda como un solo objeto.
 */
export interface EnergiaDinamica {
  cinetica: number;
  potencial: number;
  total: number;
  /** K + Σ|U_ij|: normalizador de la deriva y del umbral de "≈ 0 J". */
  escala: number;
  /** |E − E_ref| / escala, en fracción (solo diagnóstico `?debug`). */
  deriva: number;
  /** Energía aportada por las intervenciones del visitante (mover, lanzar, cambiar q…). */
  trabajoExterno: number;
  /** Número de intervenciones desde el inicio (para mostrar la fila "Energía que tú aportaste"). */
  intervenciones: number;
  /** Solo diagnóstico `?debug`: ticks del reloj del Worker por segundo. */
  ticksPorS: number;
  /** Solo diagnóstico `?debug`: sub-pasos de integración por segundo (≈ 960 a 1×). */
  subpasosPorS: number;
}
