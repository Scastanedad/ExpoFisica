/**
 * Canvas de la estación 5 (Ley de Gauss). Dibuja bajo demanda (sin bucle continuo: un `requestAnimationFrame` por
 * cambio, y sin dibujo si la firma no cambia) y traduce los eventos del puntero y del teclado a llamadas del
 * controlador (`controladorGauss3d.ts`), que guarda las posiciones x, y de las cargas fuera de React.
 *
 *  - Arrastre sobre una carga: la mueve en su plano horizontal (intersección rayo–plano).
 *  - Arrastre en el vacío: gira la vista (azimut). La rueda NO se captura.
 *  - Flechas del teclado (lienzo enfocado): mueven la carga seleccionada (WCAG 2.5.7).
 *  - `touch-action: pan-y pinch-zoom`: el dedo vertical sigue desplazando la página; sobre una carga se bloquea.
 */
import { useEffect, useRef, type KeyboardEvent as TeclaReact, type RefObject } from "react";
import { useGauss3dStore } from "../store/gauss3dStore";
import { crearControladorGauss3D, type ControladorGauss3D } from "./controladorGauss3d";
import { DPR_MAXIMO } from "./dimensiones";

export interface PropsCanvasGauss3D {
  /** Se publica aquí el controlador (para los controles que viven fuera del lienzo). */
  controladorRef: RefObject<ControladorGauss3D | null>;
  /** Nombre corto del lienzo (aria-label). La descripción larga de la escena va en `idDescripcion`. */
  descripcion: string;
  /** Id del elemento (oculto) con la descripción textual de la escena, actualizada al cambiar (`aria-describedby`). */
  idDescripcion?: string;
  /** Id del elemento con las instrucciones de uso del teclado (`aria-describedby`). */
  idAyuda?: string;
  /** Texto para la región viva (movimiento con el teclado). */
  anunciar?: (texto: string) => void;
}

export function CanvasGauss3D({ controladorRef, descripcion, idDescripcion, idAyuda, anunciar }: PropsCanvasGauss3D) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const anunciarRef = useRef(anunciar);
  useEffect(() => {
    anunciarRef.current = anunciar;
  });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const store = useGauss3dStore;
    const ctrl = crearControladorGauss3D({
      leerUI: () => store.getState(),
      corregirZ: (id, z) => store.getState().corregirZ(id, z),
      seleccionar: (i) => store.getState().seleccionar(i),
      publicarLectura: (l) => {
        canvas.dataset.calidad = `${l.tipo}:${l.calidad}`;
        store.getState().publicarLectura(l);
      },
      publicarAzimutDeg: (g) => store.getState().setAzimutDeg(g),
      anunciar: (t) => anunciarRef.current?.(t),
      pedirCuadro: (cb) => requestAnimationFrame(() => cb()),
      cancelarCuadro: (id) => cancelAnimationFrame(id),
      fijarTemporizador: (cb, ms) => window.setTimeout(cb, ms),
      cancelarTemporizador: (id) => window.clearTimeout(id),
      ahora: () => performance.now(),
    });
    controladorRef.current = ctrl;
    const cancelarSuscripcion = store.subscribe((nuevo, previo) => ctrl.alCambiarUI(nuevo, previo));

    function medir() {
      const r = canvas!.getBoundingClientRect();
      if (r.width <= 0 || r.height <= 0) return;
      const dpr = Math.min(window.devicePixelRatio || 1, DPR_MAXIMO);
      const bw = Math.round(r.width * dpr);
      const bh = Math.round(r.height * dpr);
      if (canvas!.width !== bw || canvas!.height !== bh) {
        canvas!.width = bw;
        canvas!.height = bh;
      }
      const ctx = canvas!.getContext("2d", { alpha: false });
      ctx?.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctrl.fijarLienzo(ctx, r.width, r.height, dpr);
    }
    medir();
    const observador = new ResizeObserver(medir);
    observador.observe(canvas);

    function local(e: PointerEvent) {
      const r = canvas!.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top };
    }
    let activo = -1;

    function onPointerDown(e: PointerEvent) {
      if (e.pointerType === "mouse" && e.button !== 0) return;
      if (activo !== -1) return; // un solo puntero a la vez (el segundo dedo es zoom/scroll del navegador)
      const p = local(e);
      activo = e.pointerId;
      canvas!.setPointerCapture(e.pointerId);
      canvas!.dataset.gesto = ctrl.punteroAbajo(p.x, p.y);
    }
    function onPointerMove(e: PointerEvent) {
      const p = local(e);
      if (activo === e.pointerId) {
        ctrl.punteroMueve(p.x, p.y);
      } else if (activo === -1 && e.pointerType === "mouse") {
        const sobre = ctrl.hayCargaBajo(p.x, p.y);
        if ((canvas!.dataset.sobre === "carga") !== sobre) canvas!.dataset.sobre = sobre ? "carga" : "";
      }
    }
    function terminar(e: PointerEvent, cancelado: boolean) {
      if (activo !== e.pointerId) return;
      activo = -1;
      delete canvas!.dataset.gesto;
      if (cancelado) ctrl.punteroCancelado();
      else {
        const p = local(e);
        ctrl.punteroMueve(p.x, p.y);
        ctrl.punteroArriba();
      }
    }
    const onPointerUp = (e: PointerEvent) => terminar(e, false);
    const onPointerCancel = (e: PointerEvent) => terminar(e, true);
    // Scroll vertical con el dedo salvo que el toque empiece sobre una carga.
    function onTouchStart(e: TouchEvent) {
      if (e.touches.length !== 1 || !e.cancelable) return;
      const r = canvas!.getBoundingClientRect();
      const t = e.touches[0];
      if (ctrl.hayCargaBajo(t.clientX - r.left, t.clientY - r.top)) e.preventDefault();
    }

    canvas.addEventListener("pointerdown", onPointerDown);
    canvas.addEventListener("pointermove", onPointerMove);
    canvas.addEventListener("pointerup", onPointerUp);
    canvas.addEventListener("pointercancel", onPointerCancel);
    canvas.addEventListener("lostpointercapture", onPointerCancel);
    canvas.addEventListener("touchstart", onTouchStart, { passive: false });
    return () => {
      canvas.removeEventListener("pointerdown", onPointerDown);
      canvas.removeEventListener("pointermove", onPointerMove);
      canvas.removeEventListener("pointerup", onPointerUp);
      canvas.removeEventListener("pointercancel", onPointerCancel);
      canvas.removeEventListener("lostpointercapture", onPointerCancel);
      canvas.removeEventListener("touchstart", onTouchStart);
      observador.disconnect();
      cancelarSuscripcion();
      ctrl.destruir();
      controladorRef.current = null;
    };
  }, [controladorRef]);

  function alPulsarTecla(e: TeclaReact<HTMLCanvasElement>) {
    if (e.altKey || e.ctrlKey || e.metaKey) return;
    if (controladorRef.current?.tecla(e.key, e.shiftKey)) e.preventDefault(); // que las flechas no desplacen la página
  }

  return (
    <canvas
      ref={canvasRef}
      className="lienzo lienzo-gauss3d"
      role="img"
      tabIndex={0}
      aria-label={descripcion}
      aria-describedby={[idDescripcion, idAyuda].filter(Boolean).join(" ") || undefined}
      aria-keyshortcuts="ArrowUp ArrowDown ArrowLeft ArrowRight Shift+ArrowUp Shift+ArrowDown Shift+ArrowLeft Shift+ArrowRight"
      onKeyDown={alPulsarTecla}
      onKeyUp={() => controladorRef.current?.soltar()}
    />
  );
}
