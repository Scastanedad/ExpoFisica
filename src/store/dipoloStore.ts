/**
 * Estado de UI de la Estación 03 (Dipolos): todo lo que cambia por acción del
 * visitante (controles) y la LECTURA en vivo publicada por `CanvasDipolo.tsx`
 * a ~10 Hz (mismo patrón que `cargaPruebaStore.ts`/`lecturasStore.ts`).
 *
 * Las posiciones/ángulo del dipolo (y de la carga fuente arrastrable) NO están
 * aquí: viven en refs dentro de `render/CanvasDipolo.tsx` (ver ese archivo y
 * `fisica/dipolo.ts` para la justificación de no usar un Worker).
 */
import { create } from "zustand";
import { D_MAX_PX, D_MIN_PX, VOLTAJE_MAX_KV, VOLTAJE_MIN_KV, type LecturaDipolo, type ModoCampoDipolo } from "../fisica/dipolo";
import type { OrientacionPlacas } from "../fisica/campoExterno";
import { Q_MAX, Q_MIN } from "../fisica/carga";

interface EstadoDipoloStore {
  modoCampo: ModoCampoDipolo;
  // Campo uniforme (placas paralelas, E5.0).
  orientacionPlacas: OrientacionPlacas;
  polaridadPlacas: 1 | -1;
  voltajeKV: number;
  // El dipolo.
  qUC: number;
  dPx: number;
  // Carga fuente (modo "puntual").
  qFuenteUC: number;
  signoFuente: 1 | -1;
  /** Flechas de fuerza sobre +q y −q (violeta, como en las otras estaciones). */
  mostrarFuerzas: boolean;
  enPausa: boolean;
  lectura: LecturaDipolo | null;

  setModoCampo: (m: ModoCampoDipolo) => void;
  setOrientacionPlacas: (o: OrientacionPlacas) => void;
  alternarPolaridadPlacas: () => void;
  setVoltajeKV: (v: number) => void;
  setQUC: (q: number) => void;
  setDPx: (d: number) => void;
  setQFuenteUC: (q: number) => void;
  alternarSignoFuente: () => void;
  setMostrarFuerzas: (v: boolean) => void;
  togglePausa: () => void;
  publicarLectura: (l: LecturaDipolo | null) => void;
}

/** `prefers-reduced-motion` (mismo criterio que `simulacionDinamicaStore.ts`): arranca en pausa. */
const prefiereMenosMovimiento =
  typeof window !== "undefined" &&
  typeof window.matchMedia === "function" &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

function acotar(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}

export const useDipoloStore = create<EstadoDipoloStore>((set) => ({
  modoCampo: "uniforme",
  orientacionPlacas: "vertical",
  polaridadPlacas: 1,
  voltajeKV: 50, // recomendación de la spec E5.0 §4: periodos de 1.5-5.8s en todo el rango de q/d.
  qUC: 1,
  dPx: 50,
  qFuenteUC: 5, // misma configuración verificada en el prototipo de la spec E5.1 §4.
  signoFuente: 1,
  mostrarFuerzas: true,
  enPausa: prefiereMenosMovimiento,
  lectura: null,

  setModoCampo: (m) => set({ modoCampo: m }),
  setOrientacionPlacas: (o) => set({ orientacionPlacas: o }),
  alternarPolaridadPlacas: () => set((s) => ({ polaridadPlacas: s.polaridadPlacas === 1 ? -1 : 1 })),
  setVoltajeKV: (v) => set({ voltajeKV: acotar(v, VOLTAJE_MIN_KV, VOLTAJE_MAX_KV) }),
  setQUC: (q) => set({ qUC: acotar(q, Q_MIN, Q_MAX) }),
  setDPx: (d) => set({ dPx: acotar(d, D_MIN_PX, D_MAX_PX) }),
  setQFuenteUC: (q) => set({ qFuenteUC: acotar(q, Q_MIN, Q_MAX) }),
  alternarSignoFuente: () => set((s) => ({ signoFuente: s.signoFuente === 1 ? -1 : 1 })),
  setMostrarFuerzas: (v) => set({ mostrarFuerzas: v }),
  togglePausa: () => set((s) => ({ enPausa: !s.enPausa })),
  publicarLectura: (l) => set({ lectura: l }),
}));
