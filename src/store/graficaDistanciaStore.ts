/**
 * Puntos A/B fijados por el usuario en `graficas/PanelGraficaDistancia.tsx`
 * (E4.1 §3), en px lógicos del canvas de "Cargas en reposo". Vive en Zustand
 * (no en un ref) porque solo cambia por una acción del usuario ("Fijar
 * A"/"Fijar B"/"Limpiar") -- nunca se anima cuadro a cuadro, igual criterio
 * que `vA`/`vB` de `cargaPruebaStore.ts` -- y varios consumidores lo leen sin
 * pasar por props: el panel (para graficar) y `render/CanvasRenderer.tsx`
 * (para dibujar un marcador, corrección post revisión UI: sin esto no quedaba
 * ningún rastro visual de dónde se fijaron A y B).
 */
import { create } from "zustand";

export interface PuntoFijado {
  x: number;
  y: number;
}

interface EstadoGraficaDistancia {
  puntoA: PuntoFijado | null;
  puntoB: PuntoFijado | null;
  setPuntoA: (p: PuntoFijado | null) => void;
  setPuntoB: (p: PuntoFijado | null) => void;
  limpiarPuntos: () => void;
}

export const useGraficaDistanciaStore = create<EstadoGraficaDistancia>((set) => ({
  puntoA: null,
  puntoB: null,
  setPuntoA: (p) => set({ puntoA: p }),
  setPuntoB: (p) => set({ puntoB: p }),
  limpiarPuntos: () => set({ puntoA: null, puntoB: null }),
}));
