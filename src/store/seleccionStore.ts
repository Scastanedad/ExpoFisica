/**
 * Carga "seleccionada" para la alternativa al arrastre (teclado / tocar el
 * destino). Es estado de UI que cambia por acción del usuario, no una
 * posición: por eso vive en Zustand y NO en un ref. Lo comparten el
 * `PanelCargas` (que la selecciona) y el canvas (que dibuja el anillo y coloca
 * la carga al tocar). Solo hay una estación montada a la vez, así que un
 * único store basta; los ids de cada estación no colisionan.
 */
import { create } from "zustand";

interface EstadoSeleccion {
  seleccionadaId: string | null;
  /** true: tocar el canvas coloca la carga seleccionada allí. */
  colocarConToque: boolean;
  /**
   * true mientras el puntero arrastra una carga (fase 2 §C: `cursor: grabbing`).
   * Cambia solo al empezar/terminar el gesto (pointerdown/up), no por frame.
   */
  arrastrando: boolean;
  /**
   * Última carga elegida (chip enfocado, tocado o arrastrado): la que muestra el
   * control de magnitud y lleva el anillo discontinuo tenue en el lienzo (fase 2
   * §B3). A diferencia de `seleccionadaId`, NUNCA se borra sola (ni al perder el
   * foco ni al deseleccionar): solo cambia cuando se elige OTRA carga. Así "qué
   * carga se edita" queda siempre claro, incluso con el foco en el editor.
   */
  editandoId: string | null;
  seleccionar: (id: string | null, colocarConToque?: boolean) => void;
  setArrastrando: (valor: boolean) => void;
}

export const useSeleccionStore = create<EstadoSeleccion>((set) => ({
  seleccionadaId: null,
  colocarConToque: false,
  arrastrando: false,
  editandoId: null,
  seleccionar: (id, colocarConToque = false) =>
    set((estado) => ({
      seleccionadaId: id,
      colocarConToque: id !== null && colocarConToque,
      editandoId: id ?? estado.editandoId,
    })),
  setArrastrando: (valor) => set({ arrastrando: valor }),
}));
