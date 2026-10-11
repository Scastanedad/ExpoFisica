/**
 * Vista de la reducción paso a paso (spec presets §4): qué árbol se dibuja y qué fórmulas se muestran tras
 * aplicar `k` pasos. Puro: la reducción en sí es `reducirPasoAPaso` del motor.
 */
import { reducirPasoAPaso, type Bloque, type Dominio, type PasoReduccion } from "../../fisica/circuitos";

export interface VistaReduccion {
  /** Nº total de pasos hasta quedar un solo elemento. */
  total: number;
  /** Pasos aplicados (los `k` primeros). */
  aplicados: PasoReduccion[];
  /** Árbol que se dibuja tras `k` pasos (el original si k = 0). */
  arbolVista: Bloque;
  terminada: boolean;
  /** Valor equivalente de todo el circuito [Ω o F]. */
  equivalente: number;
}

export function vistaReduccion(arbol: Bloque, dominio: Dominio, k: number): VistaReduccion {
  const { pasos, equivalente } = reducirPasoAPaso(arbol, dominio);
  const n = Math.max(0, Math.min(pasos.length, Math.floor(k)));
  return {
    total: pasos.length,
    aplicados: pasos.slice(0, n),
    arbolVista: n === 0 ? arbol : pasos[n - 1].arbol,
    terminada: n === pasos.length,
    equivalente,
  };
}
