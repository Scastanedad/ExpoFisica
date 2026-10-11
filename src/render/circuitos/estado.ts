/**
 * Estado eléctrico que consume `CanvasCircuito`: netlist + resultado vigente + escala de corriente de
 * las partículas. El lienzo no sabe si viene de un DC (E6) o de un transitorio (E7).
 */
import {
  SUELO_E6,
  arbolANetlist,
  e,
  iReferenciaE6,
  netlistWheatstone,
  resolverDC,
  serie,
  hojas,
  type Bloque,
  type Transitorio,
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

/** Valores de los cinco resistores del puente de Wheatstone [Ω]. */
export interface ValoresPuente {
  R1: number;
  R2: number;
  R3: number;
  R4: number;
  R5: number;
}

/**
 * El puente no es un árbol serie-paralelo, pero el store guarda sus cinco valores en un `Bloque` con las
 * hojas R1..R5 (así el editor de valores y la tabla funcionan igual). La topología la fija `distribuirPuente`
 * y `netlistWheatstone`; la forma de serie de este contenedor no significa nada.
 */
export const arbolDePuente = (v: ValoresPuente): Bloque =>
  serie(e("R1", v.R1), e("R2", v.R2), e("R3", v.R3), e("R4", v.R4), e("R5", v.R5));

export function valoresDePuente(arbol: Bloque): ValoresPuente {
  const v: ValoresPuente = { R1: 1, R2: 1, R3: 1, R4: 1, R5: 1 };
  for (const h of hojas(arbol)) if (h.id in v) v[h.id as keyof ValoresPuente] = h.valor;
  return v;
}

/** E6, puente de Wheatstone: misma salida que `estadoDC` para la netlist fija de cinco resistores. */
export function estadoPuente(arbol: Bloque, E: number, rInt = 0): EstadoElectrico {
  const net = netlistWheatstone(valoresDePuente(arbol), E, rInt);
  const r = resolverDC(net);
  return { net, r, iRef: iReferenciaE6(net, r), suelo: SUELO_E6 };
}

/**
 * E7: estado eléctrico de un transitorio en curso. La escala de partículas usa I_ref = E/R_carga fijo
 * (máxima corriente posible) y SIN suelo (spec §7); las placas se dibujan con Q_ref = C_max·E.
 */
export function estadoTransitorio(t: Transitorio, E: number, rCarga: number): EstadoElectrico {
  const net = t.netlist;
  const q: Record<string, number> = {};
  let cMax = 0;
  for (const el of net.elementos) {
    if (el.tipo !== "C") continue;
    q[el.id] = el.valor * (t.estado[el.id] ?? 0);
    cMax = Math.max(cMax, el.valor);
  }
  return { net, r: t.ultimo, iRef: E / rCarga, suelo: 0, q, qRef: cMax * E };
}
