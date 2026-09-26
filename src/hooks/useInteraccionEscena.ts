/**
 * Interacción de puntero con las cargas de un canvas, común a la estación
 * estática y a la dinámica. Las posiciones NO pasan por estado de React: el
 * canvas dice cómo leerlas (`posicion`) y cómo escribirlas (`colocar`, que en
 * la estática toca un ref y en la dinámica llama a `moverCarga` del Worker).
 *
 * Cubre tres cosas:
 *  1. Arrastre con Pointer Events (mouse, touch y lápiz) con zona de agarre
 *     compensada por `escalaCss` (>= 44 px CSS).
 *  2. Scroll con el dedo fuera de las cargas: el canvas usa `touch-action:
 *     pan-y` y un listener NATIVO `touchstart` no pasivo cancela el gesto
 *     (preventDefault) solo cuando el toque empieza sobre una carga.
 *  3. Alternativa de un toque al arrastre: con una carga "armada" en el
 *     `PanelCargas`, tocar el canvas la coloca en ese punto (WCAG 2.5.7). El
 *     teclado se resuelve en el panel a través del `ControladorEscena`.
 *
 * Todas las conversiones de coordenadas usan `getBoundingClientRect()` en el
 * momento del evento, así que son correctas a cualquier tamaño CSS del canvas.
 */
import { useEffect, useRef, type RefObject } from "react";
import { emitirCargaColocada } from "../render/eventosEscena";
import {
  limitarPosicion,
  type ControladorEscena,
  type Posicion,
} from "../render/controladorEscena";
import { indiceCargaBajo } from "../render/geometriaCargas";
import { useSeleccionStore } from "../store/seleccionStore";

/** Un toque que se desplaza más que esto (px CSS) es un gesto, no un "toque para colocar". */
const UMBRAL_TOQUE_CSS = 10;

export interface OpcionesInteraccion {
  canvasRef: RefObject<HTMLCanvasElement | null>;
  ancho: number;
  alto: number;
  escalaCssRef: RefObject<number>;
  /** Ids de las cargas, en el mismo orden que se dibujan. */
  ids: string[];
  posicion: (id: string) => Posicion | undefined;
  /** Escribe una posición ya limitada (ref en la estática, Worker en la dinámica). */
  colocar: (id: string, x: number, y: number) => void;
  /** Si se pasa, se publica aquí el controlador para los controles externos. */
  controladorRef?: RefObject<ControladorEscena | null>;
}

export function useInteraccionEscena(opciones: OpcionesInteraccion) {
  const { canvasRef, ancho, alto, controladorRef } = opciones;
  const opcionesRef = useRef(opciones);
  useEffect(() => {
    opcionesRef.current = opciones;
  });

  // Publica el controlador para teclado / controles externos.
  useEffect(() => {
    if (!controladorRef) return;
    controladorRef.current = {
      ancho,
      alto,
      posicion: (id) => opcionesRef.current.posicion(id),
      mover: (id, x, y) => {
        const p = limitarPosicion(x, y, ancho, alto);
        opcionesRef.current.colocar(id, p.x, p.y);
      },
    };
    return () => {
      controladorRef.current = null;
    };
  }, [controladorRef, ancho, alto]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    let arrastrandoId: string | null = null;
    let seleccionPrevia: { id: string | null; armada: boolean } | null = null;
    let toque: { pointerId: number; clientX: number; clientY: number } | null = null;

    function aLogicas(clientX: number, clientY: number): Posicion {
      const rect = canvas!.getBoundingClientRect();
      return {
        x: (clientX - rect.left) * (ancho / rect.width),
        y: (clientY - rect.top) * (alto / rect.height),
      };
    }

    function limitar(p: Posicion): Posicion {
      return limitarPosicion(p.x, p.y, ancho, alto);
    }

    /** id de la carga bajo el punto (px lógicos), o null. */
    function cargaBajo(p: Posicion): string | null {
      const o = opcionesRef.current;
      const i = indiceCargaBajo(
        p.x,
        p.y,
        o.ids.map((id) => o.posicion(id)),
        o.escalaCssRef.current,
      );
      return i >= 0 ? o.ids[i] : null;
    }

    // Scroll vertical con el dedo salvo que el toque empiece sobre una carga.
    function onTouchStart(e: TouchEvent) {
      if (e.touches.length !== 1) return;
      const t = e.touches[0];
      if (cargaBajo(aLogicas(t.clientX, t.clientY)) !== null && e.cancelable) e.preventDefault();
    }

    function onPointerDown(e: PointerEvent) {
      if (e.pointerType === "mouse" && e.button !== 0) return;
      const p = aLogicas(e.clientX, e.clientY);
      const id = cargaBajo(p);
      if (id) {
        const s = useSeleccionStore.getState();
        seleccionPrevia = { id: s.seleccionadaId, armada: s.colocarConToque };
        arrastrandoId = id;
        toque = null;
        canvas!.setPointerCapture(e.pointerId);
        s.seleccionar(id, false); // muestra el anillo mientras se arrastra
      } else {
        toque = { pointerId: e.pointerId, clientX: e.clientX, clientY: e.clientY };
      }
    }

    function onPointerMove(e: PointerEvent) {
      if (arrastrandoId) {
        const p = limitar(aLogicas(e.clientX, e.clientY));
        opcionesRef.current.colocar(arrastrandoId, p.x, p.y);
      } else if (
        toque &&
        toque.pointerId === e.pointerId &&
        Math.hypot(e.clientX - toque.clientX, e.clientY - toque.clientY) > UMBRAL_TOQUE_CSS
      ) {
        toque = null; // se desplazó: es un gesto, no un toque
      }
    }

    function onPointerUp(e: PointerEvent) {
      if (arrastrandoId) {
        arrastrandoId = null;
        const previa = seleccionPrevia;
        seleccionPrevia = null;
        useSeleccionStore.getState().seleccionar(previa?.id ?? null, previa?.armada ?? false);
        return;
      }
      if (toque && toque.pointerId === e.pointerId) {
        toque = null;
        const { seleccionadaId, colocarConToque } = useSeleccionStore.getState();
        if (seleccionadaId && colocarConToque) {
          const p = limitar(aLogicas(e.clientX, e.clientY));
          opcionesRef.current.colocar(seleccionadaId, p.x, p.y);
          emitirCargaColocada({ id: seleccionadaId, x: p.x, y: p.y });
        }
      }
    }

    function onPointerCancel() {
      if (arrastrandoId) {
        arrastrandoId = null;
        const previa = seleccionPrevia;
        seleccionPrevia = null;
        useSeleccionStore.getState().seleccionar(previa?.id ?? null, previa?.armada ?? false);
      }
      toque = null;
    }

    canvas.addEventListener("touchstart", onTouchStart, { passive: false });
    canvas.addEventListener("pointerdown", onPointerDown);
    canvas.addEventListener("pointermove", onPointerMove);
    canvas.addEventListener("pointerup", onPointerUp);
    canvas.addEventListener("pointercancel", onPointerCancel);
    return () => {
      canvas.removeEventListener("touchstart", onTouchStart);
      canvas.removeEventListener("pointerdown", onPointerDown);
      canvas.removeEventListener("pointermove", onPointerMove);
      canvas.removeEventListener("pointerup", onPointerUp);
      canvas.removeEventListener("pointercancel", onPointerCancel);
      useSeleccionStore.getState().seleccionar(null);
    };
  }, [canvasRef, ancho, alto]);
}
