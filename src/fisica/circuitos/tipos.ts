/**
 * Tipos del motor de circuitos E6/E7 (spec E6-E7-circuitos-presets §3).
 * SI real: V, A, Ω, F, J, W. Nodo 0 = tierra = borne − de la batería.
 */

/** Hoja: R en Ω o C en F. Rama: serie ('s') o paralelo ('p') con ≥ 2 hijos. */
export type Bloque =
  | { t: "e"; id: string; valor: number }
  | { t: "s" | "p"; hijos: Bloque[] };

export type TipoElemento = "R" | "C" | "V";

/** Terminales a→b. v_ab = V_a − V_b; i_ab > 0 si la corriente convencional va de a a b. */
export interface Elemento {
  id: string;
  tipo: TipoElemento;
  a: number;
  b: number;
  valor: number;
}

/** `nNodos` incluye la tierra (nodos 0..nNodos-1). */
export interface Netlist {
  nNodos: number;
  elementos: Elemento[];
}

/** Resultado de resolver un instante. */
export interface Resultado {
  /** Potencial de cada nodo [V] (v[0] = 0). */
  v: number[];
  /** i_ab de cada elemento [A] (en la fuente: la corriente interna de a a b). */
  i: Record<string, number>;
  /** Corriente que sale del borne + de la batería hacia el circuito: −i_ab(V). */
  iBat: number;
  /** v_ab de cada capacitor (estado entre pasos). Vacío en DC. */
  estadoC: Record<string, number>;
}

/** Modo de armado del netlist: E6 (DC) o los tres estados del interruptor de E7. */
export type ModoCircuito = "dc" | "cargar" | "descargar" | "abierto";

export interface OpcionesArmado {
  modo: ModoCircuito;
  /** Voltaje de la batería [V]. */
  E: number;
  /** Resistor de carga de E7 [Ω] (fuera del tope de 6). */
  rCarga?: number;
  /** Resistencia interna de la batería [Ω]; 0 o ausente = ideal. */
  rInt?: number;
}

/** Error de matriz singular / circuito no válido. */
export class ErrorCircuito extends Error {
  constructor(mensaje: string) {
    super(mensaje);
    this.name = "ErrorCircuito";
  }
}

export const ID_FUENTE = "V";
export const ID_R_INT = "r_int";
export const ID_R_CARGA = "Rc";
export const MAX_ELEMENTOS = 6;
