import { calcularEstado } from "./modelo";
import type { Parametros } from "./tipos";

export interface Trabajo {
  /** Variación de energía almacenada, J. */
  dU: number;
  /** Variación de carga, C (en conectado, < 0 al separar: la batería recibe carga). */
  dQ: number;
  /** Energía que entrega la batería al capacitor, V·ΔQ, J (negativa: la batería recibe). 0 en aislado. */
  wBateria: number;
  /** Trabajo de quien mueve las placas, J: ΔU − V·ΔQ (aislado: ΔU; conectado: −½V²ΔC). */
  wExterno: number;
}

/** Balance de energía al llevar la separación a `dNueva` (V o Q constantes según el modo). */
export function trabajoSeparar(p: Parametros, dNueva: number): Trabajo {
  const a = calcularEstado(p);
  const b = calcularEstado({ ...p, d: dNueva });
  const dU = b.U - a.U;
  const dQ = b.Q - a.Q;
  const wBateria = p.modo === "conectado" ? a.V * dQ : 0;
  return { dU, dQ, wBateria, wExterno: dU - wBateria };
}
