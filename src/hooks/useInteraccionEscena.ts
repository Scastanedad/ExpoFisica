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
 *     teclado se resuelve en el panel a través del `ControladorEscena`. La
 *     sonda q₀ (E3.1) usa el mismo mecanismo: el `ControladorEscena` enruta
 *     el id reservado `ID_SONDA_Q0` a `opciones.sonda` en vez de a la lista
 *     de cargas (corrección post revisión UI, antes q₀ solo se arrastraba).
 *  4. "Empujón" (solo estación dinámica, E2.5 §4): si la página pasa
 *     `alAgarrar`/`alSoltar`, al agarrar la carga se avisa (queda anclada al
 *     puntero) y al soltar se entrega la velocidad del puntero (regresión por
 *     mínimos cuadrados en los últimos 100 ms, en px lógicos por s de reloj, sin
 *     tope: el Worker aplica zona muerta, tope y conversión). Cancelar el
 *     gesto suelta con velocidad 0: nunca queda una carga anclada de por vida.
 *     Teclado y "tocar el destino" NO pasan por aquí: recolocan en reposo.
 *
 * Todas las conversiones de coordenadas usan `getBoundingClientRect()` en el
 * momento del evento, así que son correctas a cualquier tamaño CSS del canvas.
 */
import { useEffect, useRef, type RefObject } from "react";
import { emitirCargaColocada } from "../render/eventosEscena";
import {
  ID_SONDA_Q0,
  limitarPosicion,
  type ControladorEscena,
  type Posicion,
} from "../render/controladorEscena";
import { indiceCargaBajo, radioAgarre } from "../render/geometriaCargas";
import { estimarVelocidadPuntero, type MuestraPuntero } from "../fisica/empujon";
import { useSeleccionStore } from "../store/seleccionStore";

/** Un toque que se desplaza más que esto (px CSS) es un gesto, no un "toque para colocar". */
const UMBRAL_TOQUE_CSS = 10;
/** Las muestras del puntero más viejas que esto (ms) se descartan: solo cuentan los últimos 100 ms. */
const HISTORIAL_PUNTERO_MS = 250;
const MUESTRAS_MAX = 64;

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
  /** El puntero sujeta la carga `id` (estación dinámica: queda anclada). */
  alAgarrar?: (id: string) => void;
  /** El puntero suelta la carga con velocidad `v` (px lógicos/s de pantalla, sin tope); (0, 0) si se cancela. */
  alSoltar?: (id: string, v: { vx: number; vy: number }) => void;
  /**
   * Carga de prueba q₀ (E3.1), solo "Cargas en reposo": una segunda entidad
   * arrastrable, independiente de `ids`/`posicion`/`colocar` (nunca está en la
   * lista de cargas reales). Se arrastra con la misma zona de agarre
   * (`radioAgarre`) que una carga real; si el puntero no cae ni sobre una
   * carga real ni sobre la sonda, sigue el flujo normal ("tocar el destino").
   * Con `controladorRef`, también se mueve con teclado/"tocar el destino" bajo
   * el id reservado `ID_SONDA_Q0` (`PanelSondaQ0.tsx` es quien la selecciona).
   */
  sonda?: {
    posicion: () => Posicion;
    colocar: (x: number, y: number) => void;
    /** Cada muestra (px lógicos) mientras se arrastra, para grabar una traza (E3.1 §6). */
    alMuestrear?: (p: Posicion) => void;
    /** Al terminar el gesto (soltar o cancelar). */
    alSoltar?: () => void;
  };
}

export function useInteraccionEscena(opciones: OpcionesInteraccion) {
  const { canvasRef, ancho, alto, controladorRef } = opciones;
  const opcionesRef = useRef(opciones);
  useEffect(() => {
    opcionesRef.current = opciones;
  });

  // Publica el controlador para teclado / controles externos. Mover q₀ por aquí (teclado o
  // "tocar el destino") NUNCA llama a `sonda.alMuestrear`: no participa en "Registrar el
  // camino" (E3.1 §6), que necesita una traza continua desde un arrastre real.
  useEffect(() => {
    if (!controladorRef) return;
    controladorRef.current = {
      ancho,
      alto,
      posicion: (id) =>
        id === ID_SONDA_Q0 ? opcionesRef.current.sonda?.posicion() : opcionesRef.current.posicion(id),
      mover: (id, x, y) => {
        const p = limitarPosicion(x, y, ancho, alto);
        if (id === ID_SONDA_Q0) opcionesRef.current.sonda?.colocar(p.x, p.y);
        else opcionesRef.current.colocar(id, p.x, p.y);
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
    /** true mientras se arrastra la sonda q₀ (E3.1), independiente de `arrastrandoId`. */
    let arrastrandoSonda = false;
    let seleccionPrevia: { id: string | null; armada: boolean } | null = null;
    let toque: { pointerId: number; clientX: number; clientY: number } | null = null;
    /** Muestras del puntero mientras se arrastra (solo se usan si hay `alSoltar`). */
    let muestras: MuestraPuntero[] = [];

    function registrarMuestra(t: number, p: Posicion) {
      muestras.push({ t, x: p.x, y: p.y });
      if (muestras.length > MUESTRAS_MAX || muestras[0].t < t - HISTORIAL_PUNTERO_MS) {
        muestras = muestras.filter((m) => m.t >= t - HISTORIAL_PUNTERO_MS).slice(-MUESTRAS_MAX);
      }
    }

    /** Termina el arrastre y devuelve la selección previa; suelta la carga con la velocidad dada. */
    function terminarArrastre(v: { vx: number; vy: number }) {
      const id = arrastrandoId;
      arrastrandoId = null;
      muestras = [];
      if (id) opcionesRef.current.alSoltar?.(id, v);
      const previa = seleccionPrevia;
      seleccionPrevia = null;
      useSeleccionStore.getState().seleccionar(previa?.id ?? null, previa?.armada ?? false);
      useSeleccionStore.getState().setArrastrando(false);
    }

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

    /** ¿El punto (px lógicos) cae dentro de la zona de agarre de la sonda q₀? */
    function sondaBajo(p: Posicion): boolean {
      const sonda = opcionesRef.current.sonda;
      if (!sonda) return false;
      const actual = sonda.posicion();
      return Math.hypot(p.x - actual.x, p.y - actual.y) <= radioAgarre(opcionesRef.current.escalaCssRef.current);
    }

    // Scroll vertical con el dedo salvo que el toque empiece sobre una carga o sobre la sonda.
    function onTouchStart(e: TouchEvent) {
      if (e.touches.length !== 1) return;
      const t = e.touches[0];
      const p = aLogicas(t.clientX, t.clientY);
      if ((cargaBajo(p) !== null || sondaBajo(p)) && e.cancelable) e.preventDefault();
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
        muestras = [];
        canvas!.setPointerCapture(e.pointerId);
        s.seleccionar(id, false); // muestra el anillo mientras se arrastra
        s.setArrastrando(true);
        opcionesRef.current.alAgarrar?.(id);
        registrarMuestra(e.timeStamp, limitar(p));
        return;
      }
      if (sondaBajo(p)) {
        const destino = limitar(p);
        arrastrandoSonda = true;
        toque = null;
        canvas!.setPointerCapture(e.pointerId);
        opcionesRef.current.sonda?.colocar(destino.x, destino.y);
        opcionesRef.current.sonda?.alMuestrear?.(destino);
        return;
      }
      toque = { pointerId: e.pointerId, clientX: e.clientX, clientY: e.clientY };
    }

    function onPointerMove(e: PointerEvent) {
      if (arrastrandoId) {
        const p = limitar(aLogicas(e.clientX, e.clientY));
        opcionesRef.current.colocar(arrastrandoId, p.x, p.y);
        registrarMuestra(e.timeStamp, p);
      } else if (arrastrandoSonda) {
        const p = limitar(aLogicas(e.clientX, e.clientY));
        opcionesRef.current.sonda?.colocar(p.x, p.y);
        opcionesRef.current.sonda?.alMuestrear?.(p);
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
        let v = { vx: 0, vy: 0 };
        if (opcionesRef.current.alSoltar) {
          // La posición final del puntero puede diferir de la última muestra: se coloca antes de soltar.
          const p = limitar(aLogicas(e.clientX, e.clientY));
          const ultima = muestras[muestras.length - 1];
          if (!ultima || ultima.x !== p.x || ultima.y !== p.y) {
            opcionesRef.current.colocar(arrastrandoId, p.x, p.y);
          }
          // No se añade una muestra en pointerup: así se detecta que el usuario se detuvo.
          v = estimarVelocidadPuntero(muestras, e.timeStamp);
        }
        terminarArrastre(v);
        return;
      }
      if (arrastrandoSonda) {
        const p = limitar(aLogicas(e.clientX, e.clientY));
        opcionesRef.current.sonda?.colocar(p.x, p.y);
        arrastrandoSonda = false;
        opcionesRef.current.sonda?.alSoltar?.();
        return;
      }
      if (toque && toque.pointerId === e.pointerId) {
        toque = null;
        const { seleccionadaId, colocarConToque } = useSeleccionStore.getState();
        if (seleccionadaId && colocarConToque) {
          const p = limitar(aLogicas(e.clientX, e.clientY));
          if (seleccionadaId === ID_SONDA_Q0) opcionesRef.current.sonda?.colocar(p.x, p.y);
          else opcionesRef.current.colocar(seleccionadaId, p.x, p.y);
          emitirCargaColocada({ id: seleccionadaId, x: p.x, y: p.y });
        }
      }
    }

    // Gesto cancelado o captura perdida: la carga (o la sonda) se suelta en reposo.
    function onPointerCancel() {
      if (arrastrandoId) terminarArrastre({ vx: 0, vy: 0 });
      if (arrastrandoSonda) {
        arrastrandoSonda = false;
        opcionesRef.current.sonda?.alSoltar?.();
      }
      toque = null;
    }

    canvas.addEventListener("touchstart", onTouchStart, { passive: false });
    canvas.addEventListener("pointerdown", onPointerDown);
    canvas.addEventListener("pointermove", onPointerMove);
    canvas.addEventListener("pointerup", onPointerUp);
    canvas.addEventListener("pointercancel", onPointerCancel);
    canvas.addEventListener("lostpointercapture", onPointerCancel);
    return () => {
      if (arrastrandoId) opcionesRef.current.alSoltar?.(arrastrandoId, { vx: 0, vy: 0 });
      canvas.removeEventListener("touchstart", onTouchStart);
      canvas.removeEventListener("pointerdown", onPointerDown);
      canvas.removeEventListener("pointermove", onPointerMove);
      canvas.removeEventListener("pointerup", onPointerUp);
      canvas.removeEventListener("pointercancel", onPointerCancel);
      canvas.removeEventListener("lostpointercapture", onPointerCancel);
      useSeleccionStore.getState().seleccionar(null);
      useSeleccionStore.getState().setArrastrando(false);
    };
  }, [canvasRef, ancho, alto]);
}
