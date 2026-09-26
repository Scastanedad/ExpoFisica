/**
 * Mantiene en un ref la relación (ancho CSS del canvas)/(ancho lógico), es
 * decir, cuánto lo reduce (o amplía) CSS. Lo actualiza un ResizeObserver, no
 * el bucle de animación: nunca se llama a getBoundingClientRect() dentro del
 * rAF, y como es un ref no provoca renders de React.
 */
import { useEffect, useRef, type RefObject } from "react";

export function useEscalaCss(canvasRef: RefObject<HTMLCanvasElement | null>, ancho: number) {
  const escalaCssRef = useRef(1);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    function actualizar() {
      if (!canvas) return;
      const anchoCss = canvas.getBoundingClientRect().width;
      if (anchoCss > 0) escalaCssRef.current = anchoCss / ancho;
    }
    actualizar();

    const observador = new ResizeObserver(actualizar);
    observador.observe(canvas);
    return () => observador.disconnect();
  }, [canvasRef, ancho]);

  return escalaCssRef;
}
