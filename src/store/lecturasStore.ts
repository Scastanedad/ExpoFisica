/**
 * Lectura numérica de la fuerza sobre la carga SELECCIONADA (especificación
 * E3.2 §0: "módulo y componentes en N, al seleccionar/tocar una carga"), en
 * las dos estaciones. Se publica como UN solo objeto a ~10 Hz desde el bucle
 * de dibujo de cada canvas -- igual que la energía (~4 Hz) o la lectura de
 * q₀ (~10 Hz) -- nunca por cada frame de `requestAnimationFrame`.
 *
 * En "Cargas en reposo" el valor sale de `fisica/fuerzas.ts` (ley exacta); en
 * "Cargas en movimiento", de la lectura del Worker ya convertida a N (ver
 * `hooks/useSimulacionWorker.ts` / `worker/protocolo.ts`, mensaje "fuerzas").
 * Este store no sabe de cuál estación viene el número.
 */
import { create } from "zustand";

export interface LecturaFuerzaN {
  fx: number;
  fy: number;
  modulo: number;
}

interface EstadoLecturas {
  fuerzaSeleccionada: LecturaFuerzaN | null;
  publicarFuerzaSeleccionada: (f: LecturaFuerzaN | null) => void;
}

export const useLecturasStore = create<EstadoLecturas>((set) => ({
  fuerzaSeleccionada: null,
  publicarFuerzaSeleccionada: (f) => set({ fuerzaSeleccionada: f }),
}));
