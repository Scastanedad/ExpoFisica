/**
 * Firma de lo que dibuja la capa en caché del campo (E2.3 §8): posiciones y
 * magnitud de cada carga, tamaño del canvas, modo, calidad, escala CSS y unidad
 * de la etiqueta. Si la firma no cambia, no se recalcula nada y se reutiliza la
 * capa. Se separa en dos partes para poder limitar la frecuencia de recálculo
 * cuando solo cambian las POSICIONES (estación dinámica: ≤ 30 Hz) sin retrasar
 * los cambios de estructura (modo, magnitud, tamaño, calidad, altas/bajas).
 *
 * Compara arrays tipados, sin construir cadenas: se llama en cada frame. Pura,
 * sin DOM.
 */
import type { PuntoCarga } from "../fisica/coulomb";

export interface DatosFirma {
  puntos: PuntoCarga[];
  ancho: number;
  alto: number;
  escalaCss: number;
  modo: string;
  calidad: number;
  unidad: string;
}

export type CambioFirma = "igual" | "posiciones" | "estructura";

export interface FirmaCapa {
  /** ¿Qué cambió respecto de la última firma guardada? (`estructura` si no hay ninguna). */
  comparar(d: DatosFirma): CambioFirma;
  /** Guarda `d` como la última firma. */
  guardar(d: DatosFirma): void;
}

export function crearFirma(): FirmaCapa {
  let valida = false;
  let modo = "";
  let unidad = "";
  let estructura = new Float64Array(0);
  let posiciones = new Float64Array(0);

  function estructuraDe(d: DatosFirma, out: Float64Array) {
    out[0] = d.ancho;
    out[1] = d.alto;
    out[2] = Math.round(d.escalaCss * 1000);
    out[3] = d.calidad;
    out[4] = d.puntos.length;
    for (let i = 0; i < d.puntos.length; i++) out[5 + i] = d.puntos[i].q;
  }

  return {
    comparar(d) {
      if (!valida || modo !== d.modo || unidad !== d.unidad) return "estructura";
      const n = 5 + d.puntos.length;
      if (estructura.length !== n) return "estructura";
      const escala = Math.round(d.escalaCss * 1000);
      if (
        estructura[0] !== d.ancho ||
        estructura[1] !== d.alto ||
        estructura[2] !== escala ||
        estructura[3] !== d.calidad ||
        estructura[4] !== d.puntos.length
      ) {
        return "estructura";
      }
      for (let i = 0; i < d.puntos.length; i++) if (estructura[5 + i] !== d.puntos[i].q) return "estructura";
      for (let i = 0; i < d.puntos.length; i++) {
        if (posiciones[2 * i] !== d.puntos[i].x || posiciones[2 * i + 1] !== d.puntos[i].y) return "posiciones";
      }
      return "igual";
    },
    guardar(d) {
      const n = 5 + d.puntos.length;
      if (estructura.length !== n) estructura = new Float64Array(n);
      if (posiciones.length !== 2 * d.puntos.length) posiciones = new Float64Array(2 * d.puntos.length);
      estructuraDe(d, estructura);
      for (let i = 0; i < d.puntos.length; i++) {
        posiciones[2 * i] = d.puntos[i].x;
        posiciones[2 * i + 1] = d.puntos[i].y;
      }
      modo = d.modo;
      unidad = d.unidad;
      valida = true;
    },
  };
}
