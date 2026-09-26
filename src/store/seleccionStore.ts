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
  seleccionar: (id: string | null, colocarConToque?: boolean) => void;
}

export const useSeleccionStore = create<EstadoSeleccion>((set) => ({
  seleccionadaId: null,
  colocarConToque: false,
  seleccionar: (id, colocarConToque = false) =>
    set({ seleccionadaId: id, colocarConToque: id !== null && colocarConToque }),
}));
