/**
 * Estado de UI del modo dinámico (N cargas interactuando). Igual que
 * simulacionStore.ts: solo lo que cambia por acción del usuario. Las
 * posiciones/velocidades viven en el Worker (ver worker/motorFisico.worker.ts)
 * y llegan al componente de renderizado vía hooks/useSimulacionWorker.ts,
 * nunca por aquí.
 */
import { create } from "zustand";
import { aplicarMagnitud, normalizarCarga } from "../fisica/carga";
import type { EnergiaDinamica } from "../types/simulacion";

export interface CargaConfig {
  id: string;
  q: number;
  /** Masa de simulación: fija = 1 para todas las cargas (E2.1 §4). */
  masa: number;
}

interface EstadoSimulacionDinamica {
  cargas: CargaConfig[];
  enPausa: boolean;
  velocidadSimulacion: number;

  /**
   * Lectura de energía (K, U, total, trabajo externo). La escribe el Worker
   * a ~4 Hz como UN solo objeto, no cada frame -- ver motor_fisico_worker.md.
   */
  energia: EnergiaDinamica | null;

  agregarCarga: (q: number) => void;
  quitarCarga: (id: string) => void;
  /** Cambia la magnitud de una carga; el signo no se edita. Ver fisica/carga.ts. */
  cambiarMagnitud: (id: string, q: number) => void;
  togglePausa: () => void;
  setVelocidadSimulacion: (v: number) => void;
  actualizarEnergia: (e: EnergiaDinamica) => void;
}

const CARGAS_INICIALES: CargaConfig[] = [
  { id: "d-0", q: 1, masa: 1 },
  { id: "d-1", q: 1, masa: 1 },
  { id: "d-2", q: -1, masa: 1 },
  { id: "d-3", q: -1, masa: 1 },
];

let contadorId = CARGAS_INICIALES.length;

/** `prefers-reduced-motion` (fase 2 §C): la simulación arranca en pausa; el visitante la reanuda. */
const prefiereMenosMovimiento =
  typeof window !== "undefined" &&
  typeof window.matchMedia === "function" &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

export const useSimulacionDinamicaStore = create<EstadoSimulacionDinamica>((set) => ({
  cargas: CARGAS_INICIALES,
  enPausa: prefiereMenosMovimiento,
  velocidadSimulacion: 1,
  energia: null,

  agregarCarga: (q) =>
    set((estado) => {
      const qn = normalizarCarga(q);
      if (qn === null) return estado;
      return { cargas: [...estado.cargas, { id: `d-${contadorId++}`, q: qn, masa: 1 }] };
    }),

  quitarCarga: (id) =>
    set((estado) => ({ cargas: estado.cargas.filter((c) => c.id !== id) })),

  cambiarMagnitud: (id, q) =>
    set((estado) => {
      const actual = estado.cargas.find((c) => c.id === id);
      if (!actual) return estado;
      const nueva = aplicarMagnitud(actual.q, q);
      if (nueva === null || nueva === actual.q) return estado;
      return { cargas: estado.cargas.map((c) => (c.id === id ? { ...c, q: nueva } : c)) };
    }),

  togglePausa: () => set((estado) => ({ enPausa: !estado.enPausa })),

  setVelocidadSimulacion: (v) => set({ velocidadSimulacion: v }),

  actualizarEnergia: (e) => set({ energia: e }),
}));
