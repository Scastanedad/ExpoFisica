/**
 * Mensaje de confirmación breve y no intrusivo (p. ej. "CSV descargado"),
 * mismo patrón que ya usa `ui/PanelSondaQ0.tsx`/`ui/PanelCargas.tsx` para sus
 * anuncios de movimiento (`aria-live="polite"`), pero VISIBLE además de
 * anunciado -- corrección post revisión UI: "Exportar CSV" no daba ninguna
 * señal de que la descarga había ocurrido. Se borra solo tras `duracionMs`
 * (por defecto 2.5 s) para no dejar un mensaje viejo pegado en pantalla.
 */
import { useCallback, useEffect, useRef, useState } from "react";

export function useAvisoTemporal(duracionMs = 2500): [string, (mensaje: string) => void] {
  const [aviso, setAviso] = useState("");
  const idTimeoutRef = useRef<number | null>(null);

  const mostrarAviso = useCallback(
    (mensaje: string) => {
      setAviso(mensaje);
      if (idTimeoutRef.current !== null) window.clearTimeout(idTimeoutRef.current);
      idTimeoutRef.current = window.setTimeout(() => setAviso(""), duracionMs);
    },
    [duracionMs],
  );

  useEffect(() => {
    return () => {
      if (idTimeoutRef.current !== null) window.clearTimeout(idTimeoutRef.current);
    };
  }, []);

  return [aviso, mostrarAviso];
}
