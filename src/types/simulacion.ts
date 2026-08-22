export type ModoVista = "vectores" | "lineas" | "potencial";
export type ModoFisica = "estatico" | "dinamico";
export type UnidadCarga = "normalizada" | "microC";

export interface CargaMeta {
  id: string;
  /** Magnitud en unidades normalizadas; por convención 1 unidad = 1 microCoulomb (ver fisica/unidades.ts). */
  q: number;
  anclada: boolean;
}
