import { useEffect, useState } from "react";
import type { ResumenRC, SimulacionRC } from "../../render/circuitos/simulacionRC";

/** Cadencia con la que la interfaz lee los totales del transitorio (~10 Hz, igual que las lecturas del lienzo). */
const INTERVALO_MS = 100;

/**
 * Totales del transitorio para la interfaz. El estado del circuito vive en `SimulacionRC` (un ref de la página,
 * fuera de React); aquí solo se copia una lectura a ~10 Hz. `alCambiarFase` se llama cuando cambia la fase
 * («cargando» → «cargado», etc.), no en cada lectura.
 */
export function useResumenRC(sim: SimulacionRC, alCambiarFase?: (fase: ResumenRC["fase"]) => void): ResumenRC | null {
  const [resumen, setResumen] = useState<ResumenRC | null>(null);
  useEffect(() => {
    let fase: ResumenRC["fase"] | null = null;
    const leer = () => {
      const r = sim.resumen();
      if (r && r.fase !== fase) {
        fase = r.fase;
        alCambiarFase?.(r.fase);
      }
      setResumen(r);
    };
    leer();
    const id = window.setInterval(leer, INTERVALO_MS);
    return () => window.clearInterval(id);
  }, [sim, alCambiarFase]);
  return resumen;
}
