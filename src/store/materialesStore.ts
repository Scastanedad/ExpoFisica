/**
 * Estado de UI de la Estación 04 (Conductores y aislantes): lo que cambia por
 * acción del visitante (voltaje, orientación y polaridad de las placas,
 * pausa) y la LECTURA en vivo que `render/CanvasMateriales.tsx` publica a
 * ~10 Hz (mismo patrón que `campoContinuoStore.ts` / `cargaPruebaStore.ts`).
 *
 * Las posiciones de los átomos y electrones NO están aquí: viven en refs
 * dentro de `CanvasMateriales.tsx` (ver `fisica/materiales.ts`).
 */
import { create } from "zustand";
import type { OrientacionPlacas } from "../fisica/campoExterno";
import { VOLTAJE_MAX_KV, VOLTAJE_MIN_KV } from "../fisica/materiales";

/** Lectura de un material: campo dentro, razón respecto a E0 y desplazamiento medio de los electrones. */
export interface LecturaMaterial {
  /** |E_interior| en N/C. */
  eInteriorSI: number;
  /** |E_interior| / |E0|, adimensional. */
  razon: number;
  /** Desplazamiento medio de los electrones respecto a su átomo, px del parche (no del lienzo). */
  desplazamientoPx: number;
}

export interface LecturaMateriales {
  /** |E0| en N/C. */
  e0SI: number;
  conductor: LecturaMaterial;
  aislante: LecturaMaterial;
}

interface EstadoMaterialesStore {
  orientacionPlacas: OrientacionPlacas;
  polaridadPlacas: 1 | -1;
  voltajeKV: number;
  enPausa: boolean;
  /**
   * El visitante tiene agarrado el deslizador de voltaje. Solo lo usa el modo de movimiento
   * reducido: el material se asienta al SOLTAR, no en cada paso del deslizador.
   */
  ajustandoVoltaje: boolean;
  lectura: LecturaMateriales | null;

  setOrientacionPlacas: (o: OrientacionPlacas) => void;
  alternarPolaridadPlacas: () => void;
  setVoltajeKV: (v: number) => void;
  togglePausa: () => void;
  setAjustandoVoltaje: (a: boolean) => void;
  publicarLectura: (l: LecturaMateriales | null) => void;
}

function acotar(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}

export const useMaterialesStore = create<EstadoMaterialesStore>((set) => ({
  orientacionPlacas: "vertical",
  polaridadPlacas: 1,
  voltajeKV: 100,
  enPausa: false,
  ajustandoVoltaje: false,
  lectura: null,

  setOrientacionPlacas: (o) => set({ orientacionPlacas: o }),
  alternarPolaridadPlacas: () => set((s) => ({ polaridadPlacas: s.polaridadPlacas === 1 ? -1 : 1 })),
  setVoltajeKV: (v) => set({ voltajeKV: acotar(v, VOLTAJE_MIN_KV, VOLTAJE_MAX_KV) }),
  togglePausa: () => set((s) => ({ enPausa: !s.enPausa })),
  setAjustandoVoltaje: (a) => set({ ajustandoVoltaje: a }),
  publicarLectura: (l) => set({ lectura: l }),
}));
