/**
 * Estado de UI de la carga de prueba q₀ (especificación E3.1), solo en
 * "Cargas en reposo". Su POSICIÓN nunca pasa por aquí (vive en un ref dentro
 * de `render/CanvasRenderer.tsx`, igual que las cargas reales); este store
 * guarda solo lo que cambia por una acción explícita del visitante:
 *
 *  - `activo`: si la sonda está visible/interactiva (evita saturar el panel
 *    por defecto -- decisión de diseño de T3.1, no dictada por la spec).
 *  - `signoQ0`: se invierte con un botón (por defecto +, E3.1 §0).
 *  - `registrarTrayecto`: activa grabar el arrastre como una traza para medir
 *    el trabajo del campo por un camino real (E3.1 §6, modo 2).
 *  - `vA`/`vB`: el "marcado rápido" (E3.1 §6, modo 1): dos potenciales, no
 *    posiciones (`ΔV` no necesita el punto, solo V_A y V_B).
 *  - `caminos`: hasta 3 resultados de trazas recientes, para comparar
 *    visualmente que el trabajo no depende del camino (E3.1 §6).
 *  - `lectura`: E/V/F en la posición viva de q₀, publicada a ~10 Hz desde el
 *    bucle de dibujo (nunca por cada frame de rAF) -- mismo patrón que la
 *    energía de la estación dinámica (~4 Hz) o `lecturasStore` (fuerza).
 */
import { create } from "zustand";
import type { LecturaQ0 } from "../fisica/cargaPrueba";

export interface CaminoMedido {
  id: number;
  /** `null`: la traza pasó demasiado cerca de una carga (E3.1 §5). */
  wTraza: number | null;
  /**
   * `−q₀ΔV`. Si A/B ya estaban marcados al soltar, es el MISMO valor fijo
   * para todos los caminos (comparación real de independencia del camino
   * contra el mismo par de puntos). Sin A/B marcados, es un *fallback* con
   * los potenciales en los extremos de ESTA traza (`teoricoFijo: false`):
   * no prueba independencia del camino, solo la coherencia interna de la
   * medición -- ver `teoricoFijo`.
   */
  wTeorico: number | null;
  /** `true`: `wTeorico` viene de A/B fijos (comparación real). `false`: fallback con los extremos de la traza. */
  teoricoFijo: boolean;
}

/** Cuántos caminos recientes se muestran a la vez (E3.1 §6/§9.4). */
const MAX_CAMINOS = 3;

interface EstadoCargaPrueba {
  activo: boolean;
  signoQ0: 1 | -1;
  registrarTrayecto: boolean;
  vA: number | null;
  vB: number | null;
  caminos: CaminoMedido[];
  lectura: LecturaQ0 | null;

  activar: () => void;
  desactivar: () => void;
  alternarSigno: () => void;
  setRegistrarTrayecto: (v: boolean) => void;
  marcarA: (v: number | null) => void;
  marcarB: (v: number | null) => void;
  limpiarAB: () => void;
  agregarCamino: (c: { wTraza: number | null; wTeorico: number | null; teoricoFijo: boolean }) => void;
  limpiarCaminos: () => void;
  publicarLectura: (l: LecturaQ0 | null) => void;
}

let contadorCamino = 0;

export const useCargaPruebaStore = create<EstadoCargaPrueba>((set) => ({
  activo: false,
  signoQ0: 1,
  registrarTrayecto: false,
  vA: null,
  vB: null,
  caminos: [],
  lectura: null,

  activar: () => set({ activo: true }),
  desactivar: () => set({ activo: false }),
  alternarSigno: () => set((e) => ({ signoQ0: e.signoQ0 === 1 ? -1 : 1 })),
  setRegistrarTrayecto: (v) => set({ registrarTrayecto: v }),
  marcarA: (v) => set({ vA: v }),
  marcarB: (v) => set({ vB: v }),
  limpiarAB: () => set({ vA: null, vB: null }),
  agregarCamino: (c) =>
    set((estado) => ({
      caminos: [...estado.caminos, { id: contadorCamino++, ...c }].slice(-MAX_CAMINOS),
    })),
  limpiarCaminos: () => set({ caminos: [] }),
  publicarLectura: (l) => set({ lectura: l }),
}));
