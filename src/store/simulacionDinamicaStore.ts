/**
 * Estado de UI del modo dinámico (N cargas interactuando). Igual que
 * simulacionStore.ts: solo lo que cambia por acción del usuario. Las
 * posiciones/velocidades viven en el Worker (ver worker/motorFisico.worker.ts)
 * y llegan al componente de renderizado vía hooks/useSimulacionWorker.ts,
 * nunca por aquí.
 */
import { create } from "zustand";

export interface CargaConfig {
  id: string;
  q: number;
  masa: number;
}

interface EstadoSimulacionDinamica {
  cargas: CargaConfig[];
  enPausa: boolean;
  velocidadSimulacion: number;

  /** Actualizada por el Worker a ~4Hz (throttled), no cada frame -- ver motor_fisico_worker.md. */
  energiaTotal: number | null;

  agregarCarga: (q: number) => void;
  quitarCarga: (id: string) => void;
  togglePausa: () => void;
  setVelocidadSimulacion: (v: number) => void;
  actualizarEnergiaTotal: (valor: number) => void;
}

const CARGAS_INICIALES: CargaConfig[] = [
  { id: "d-0", q: 1, masa: 1 },
  { id: "d-1", q: 1, masa: 1 },
  { id: "d-2", q: -1, masa: 1 },
  { id: "d-3", q: -1, masa: 1 },
];

let contadorId = CARGAS_INICIALES.length;

export const useSimulacionDinamicaStore = create<EstadoSimulacionDinamica>((set) => ({
  cargas: CARGAS_INICIALES,
  enPausa: false,
  velocidadSimulacion: 1,
  energiaTotal: null,

  agregarCarga: (q) =>
    set((estado) => ({
      cargas: [...estado.cargas, { id: `d-${contadorId++}`, q, masa: 1 }],
    })),

  quitarCarga: (id) =>
    set((estado) => ({ cargas: estado.cargas.filter((c) => c.id !== id) })),

  togglePausa: () => set((estado) => ({ enPausa: !estado.enPausa })),

  setVelocidadSimulacion: (v) => set({ velocidadSimulacion: v }),

  actualizarEnergiaTotal: (valor) => set({ energiaTotal: valor }),
}));
