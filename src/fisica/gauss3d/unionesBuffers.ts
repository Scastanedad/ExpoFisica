/** Preasignación de los buffers planos de líneas y cruces (contrato §3, §4 «capacidades fijas por diseño»). */
import { MAX_PUNTOS_LINEA } from "./constantes";
import type { Cruces, LineasCampo3D } from "./tipos";

/** Buffers vacíos con capacidad para `maxLineas` líneas de hasta MAX_PUNTOS_LINEA puntos. */
export function crearBufferesLineas(maxLineas: number): LineasCampo3D {
  return {
    n: 0,
    inicio: new Uint32Array(maxLineas + 1),
    puntos: new Float32Array(3 * maxLineas * MAX_PUNTOS_LINEA),
    carga: new Uint8Array(maxLineas),
    signo: new Int8Array(maxLineas),
    sentido: new Int8Array(maxLineas),
    fin: new Uint8Array(maxLineas),
    finCarga: new Int8Array(maxLineas),
    lineasPorCarga: new Uint16Array(2),
  };
}

/** Buffers vacíos con capacidad para `maxCruces` cruces. */
export function crearBufferesCruces(maxCruces: number): Cruces {
  return {
    n: 0,
    posicion: new Float32Array(3 * maxCruces),
    linea: new Uint32Array(maxCruces),
    segmento: new Uint32Array(maxCruces),
    t: new Float32Array(maxCruces),
    sentido: new Int8Array(maxCruces),
    salen: 0,
    entran: 0,
  };
}
