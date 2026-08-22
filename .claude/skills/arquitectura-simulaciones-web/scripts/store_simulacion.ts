/**
 * Plantilla: store de Zustand para el estado de UI de una simulación interactiva.
 *
 * Importante (ver references/gestion_estado.md): este store maneja SOLO estado
 * que cambia por acciones del usuario (agregar/quitar cargas, cambiar modo de
 * vista, pausar). Las posiciones/velocidades de cada frame NO viven aquí --
 * viven en un Float32Array compartido con el Worker (ver motor_fisico.worker.ts)
 * y son leídas directamente por el componente de renderizado, sin pasar por
 * este store ni por React en absoluto.
 *
 * Requiere: zustand (npm install zustand)
 */

import { create } from "zustand";

export type ModoVista = "vectores" | "lineas" | "potencial";

export interface CargaConfig {
  id: string;
  q: number; // valor de la carga en Coulombs (o unidades arbitrarias)
  masa: number;
}

interface EstadoSimulacion {
  // --- Estado de UI: cambia por acción del usuario, está bien que React lo maneje ---
  cargas: CargaConfig[];
  modoVista: ModoVista;
  enPausa: boolean;
  velocidadSimulacion: number; // multiplicador de velocidad (1 = tiempo real)

  // Métrica de baja frecuencia que SÍ puede vivir aquí: el Worker la actualiza
  // a una tasa reducida (por ejemplo 2-4 veces por segundo, no cada frame),
  // así que no genera el problema de over-rendering.
  energiaTotal: number | null;

  // --- Acciones ---
  agregarCarga: (q: number, masa?: number) => void;
  quitarCarga: (id: string) => void;
  setModoVista: (modo: ModoVista) => void;
  togglePausa: () => void;
  setVelocidadSimulacion: (v: number) => void;
  actualizarEnergiaTotal: (valor: number) => void; // llamado por el listener del Worker
}

let contadorId = 0;

export const useSimulacionStore = create<EstadoSimulacion>((set) => ({
  cargas: [
    { id: "carga-0", q: 1e-6, masa: 1e-3 },
    { id: "carga-1", q: -1e-6, masa: 1e-3 },
  ],
  modoVista: "vectores",
  enPausa: false,
  velocidadSimulacion: 1,
  energiaTotal: null,

  agregarCarga: (q, masa = 1e-3) =>
    set((estado) => ({
      cargas: [...estado.cargas, { id: `carga-${contadorId++}`, q, masa }],
    })),

  quitarCarga: (id) =>
    set((estado) => ({
      cargas: estado.cargas.filter((c) => c.id !== id),
    })),

  setModoVista: (modo) => set({ modoVista: modo }),

  togglePausa: () => set((estado) => ({ enPausa: !estado.enPausa })),

  setVelocidadSimulacion: (v) => set({ velocidadSimulacion: v }),

  // El Worker llama a esto a una tasa reducida (throttled), no cada frame --
  // ver motor_fisico.worker.ts, donde se manda el mensaje de energía a ~4Hz.
  actualizarEnergiaTotal: (valor) => set({ energiaTotal: valor }),
}));

/**
 * Ejemplo de uso con selectores granulares -- cada componente se suscribe
 * solo a lo que necesita, así un cambio en `modoVista` no re-renderiza el
 * panel de energía, y viceversa:
 *
 *   const modoVista = useSimulacionStore((s) => s.modoVista);
 *   const setModoVista = useSimulacionStore((s) => s.setModoVista);
 *
 *   const energiaTotal = useSimulacionStore((s) => s.energiaTotal);
 */
