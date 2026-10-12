/**
 * Estado de UI de la Estación 08 (capacitor de placas): los parámetros que edita el visitante, la referencia
 * y el último bloqueo por rigidez. La física vive en `fisica/capacitorPlacas/` (pura) y el dibujo y la
 * animación en refs dentro de `render/CanvasCapacitorPlacas.tsx`.
 */
import { create } from "zustand";
import {
  A_DEFECTO,
  D_DEFECTO,
  V_DEFECTO,
  actualizarReferencia,
  ajustar,
  cambiarModo,
  fijarReferencia,
  referenciaDe,
  sincronizar,
  type Modo,
  type Motivo,
  type Parametros,
  type Referencia,
} from "../fisica/capacitorPlacas";

export function parametrosIniciales(): Parametros {
  return sincronizar({ modo: "conectado", A: A_DEFECTO, d: D_DEFECTO, materialId: "aire", f: 0, V: V_DEFECTO, Q: 0 });
}

interface EstadoCapacitorStore {
  p: Parametros;
  referencia: Referencia;
  /** Motivo del último recorte o bloqueo por rigidez (null si el último cambio pasó tal cual). */
  bloqueo: Motivo | null;
  /** Aplica un cambio respetando rigidez y rangos (`fisica/capacitorPlacas/limites.ts`). */
  cambiar: (cambio: Partial<Parametros>) => void;
  setModo: (modo: Modo) => void;
  fijarReferencia: () => void;
  soltarReferencia: () => void;
  reiniciar: () => void;
}

const inicial = parametrosIniciales();

export const useCapacitorPlacasStore = create<EstadoCapacitorStore>((set) => ({
  p: inicial,
  referencia: referenciaDe(inicial),
  bloqueo: null,
  cambiar: (cambio) =>
    set((s) => {
      const r = ajustar(s.p, cambio);
      return { p: r.p, referencia: actualizarReferencia(s.referencia, r.p), bloqueo: r.bloqueado ?? null };
    }),
  setModo: (modo) =>
    set((s) => {
      if (s.p.modo === modo) return s;
      const p = cambiarModo(s.p, modo);
      return { p, referencia: actualizarReferencia(s.referencia, p), bloqueo: null };
    }),
  fijarReferencia: () => set((s) => ({ referencia: fijarReferencia(s.p) })),
  soltarReferencia: () => set((s) => ({ referencia: referenciaDe(s.p) })),
  reiniciar: () => {
    const p = parametrosIniciales();
    set({ p, referencia: referenciaDe(p), bloqueo: null });
  },
}));
