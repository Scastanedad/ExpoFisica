/**
 * Mide cuánto estira CSS el canvas y, con eso, fija la resolución real del
 * bitmap (backing store) para que se vea nítido en cualquier pantalla.
 *
 * Un `ResizeObserver` sobre el propio `<canvas>` (nunca dentro del bucle de
 * animación: no se llama a getBoundingClientRect() en cada rAF) mide:
 *
 *  - `escalaCssRef` = (ancho CSS del canvas) / (ancho lógico). Es el factor
 *    COSMÉTICO que ya usaban dibujarCuadricula.ts, geometriaCargas.ts, etc.
 *    para compensar grosores de línea y tamaños de fuente -- eso no cambia.
 *  - `factorResolucionRef` = escalaCss * devicePixelRatio (acotado a
 *    DPR_MAXIMO). Es el factor TOTAL que multiplica el sistema de
 *    coordenadas lógico (0..ancho, 0..alto) para obtener la resolución real
 *    del bitmap: `canvas.width/height` se fija a `ancho/alto * factor` (píxeles
 *    de dispositivo, no las unidades lógicas 700x500) y se aplica
 *    `ctx.setTransform(factor, 0, 0, factor, 0, 0)` para que todo el código de
 *    dibujo, que sigue usando coordenadas lógicas, caiga en el lugar correcto
 *    sobre ese bitmap de mayor resolución. Fijar `canvas.width`/`height`
 *    resetea la transformación a la identidad, así que hay que reaplicarla
 *    cada vez que cambia el tamaño CSS o el DPR (por eso vive aquí, en el
 *    mismo observer, y no se duplica en cada CanvasRenderer).
 *
 * `render/capaCampo.ts` hace lo mismo en su propio canvas offscreen: por eso
 * expone `factorResolucionRef`, no solo `escalaCssRef`.
 */
import { useEffect, useRef, type RefObject } from "react";
import { DPR_MAXIMO } from "../render/dimensiones";

export interface EscalaCanvas {
  /** (ancho CSS)/(ancho lógico): factor cosmético para grosores de línea y fuentes. */
  escalaCssRef: RefObject<number>;
  /** escalaCss * devicePixelRatio (acotado): factor real del bitmap del canvas. */
  factorResolucionRef: RefObject<number>;
}

export function useEscalaCss(
  canvasRef: RefObject<HTMLCanvasElement | null>,
  ancho: number,
  alto: number,
): EscalaCanvas {
  const escalaCssRef = useRef(1);
  const factorResolucionRef = useRef(1);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    function actualizar() {
      if (!canvas) return;
      const anchoCss = canvas.getBoundingClientRect().width;
      if (anchoCss <= 0) return;
      const escalaCss = anchoCss / ancho;
      escalaCssRef.current = escalaCss;

      const dpr = Math.min(window.devicePixelRatio || 1, DPR_MAXIMO);
      const factor = escalaCss * dpr;
      factorResolucionRef.current = factor;

      const anchoBitmap = Math.round(ancho * factor);
      const altoBitmap = Math.round(alto * factor);
      if (canvas.width !== anchoBitmap || canvas.height !== altoBitmap) {
        canvas.width = anchoBitmap;
        canvas.height = altoBitmap;
      }
      // `canvas.width =` (arriba) resetea la transformación a la identidad; se reaplica
      // siempre (idempotente) para no depender de si el bitmap cambió de tamaño.
      const ctx = canvas.getContext("2d");
      ctx?.setTransform(factor, 0, 0, factor, 0, 0);
    }
    actualizar();

    const observador = new ResizeObserver(actualizar);
    observador.observe(canvas);

    // El tamaño CSS puede no cambiar y aun así cambiar el DPR (mover la ventana a otro
    // monitor, zoom del sistema operativo): un ResizeObserver del elemento no lo detecta.
    // `matchMedia` de un DPR concreto solo avisa una vez (deja de coincidir); para seguir
    // detectando cambios posteriores hay que re-suscribirse al DPR nuevo cada vez que dispara.
    let mediaQuery: MediaQueryList | null = null;
    function suscribirDpr() {
      mediaQuery?.removeEventListener("change", alCambiarDpr);
      mediaQuery = window.matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`);
      mediaQuery.addEventListener("change", alCambiarDpr);
    }
    function alCambiarDpr() {
      actualizar();
      suscribirDpr();
    }
    suscribirDpr();

    return () => {
      observador.disconnect();
      mediaQuery?.removeEventListener("change", alCambiarDpr);
    };
  }, [canvasRef, ancho, alto]);

  return { escalaCssRef, factorResolucionRef };
}
