/**
 * Estado eléctrico que consume `CanvasCircuito`: netlist + resultado vigente + escala de corriente de
 * las partículas. El lienzo no sabe si viene de un DC (E6) o de un transitorio (E7).
 */
import {
  SUELO_E6,
  arbolANetlist,
  iReferenciaE6,
  resolverDC,
  type Bloque,
  type Netlist,
  type Resultado,
} from "../../fisica/circuitos";

export interface EstadoElectrico {
  net: Netlist;
  r: Resultado;
  /** I_ref de la escala lineal de partículas [A]. */
  iRef: number;
  /** Suelo visible (fracción de I_ref): 0,04 en E6; 0 en E7. */
  suelo: number;
  /** Carga de la placa conectada a `a` de cada capacitor [C] (E7). */
  q?: Record<string, number>;
  /** Q_ref = C_max·E para dibujar las cargas de las placas. */
  qRef?: number;
}

/** E6: solución en régimen estacionario del árbol de resistores. Lanza ErrorCircuito si no es válido. */
export function estadoDC(arbol: Bloque, E: number, rInt = 0): EstadoElectrico {
  const net = arbolANetlist(arbol, { modo: "dc", E, rInt });
  const r = resolverDC(net);
  return { net, r, iRef: iReferenciaE6(net, r), suelo: SUELO_E6 };
}
