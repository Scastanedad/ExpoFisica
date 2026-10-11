/**
 * Lecturas derivadas de un Resultado: por elemento (V, I, P, Q, energía), por nodo/tramo (sonda)
 * y comprobaciones de conservación (KCL, carga neta de nodos aislados). Spec E6-E7-circuitos-criterios §1.
 */
import type { Netlist, Resultado } from "./tipos";

export interface LecturaElemento {
  id: string;
  tipo: "R" | "C" | "V";
  /** v_ab [V]. */
  v: number;
  /** i_ab [A]. */
  i: number;
  /** v_ab·i_ab [W]. R: disipada ≥ 0. C: rapidez de almacenamiento (negativa al descargar). V: absorbida (entrega = −p). */
  p: number;
  /** Carga de la placa conectada a `a` [C] (solo C): C·v_ab. */
  q: number;
  /** Energía almacenada ½CV² [J] (solo C). */
  u: number;
}

export function lecturasElementos(net: Netlist, r: Resultado): Record<string, LecturaElemento> {
  const out: Record<string, LecturaElemento> = {};
  for (const el of net.elementos) {
    const v = r.v[el.a] - r.v[el.b];
    const i = r.i[el.id] ?? 0;
    out[el.id] = {
      id: el.id,
      tipo: el.tipo,
      v,
      i,
      p: v * i,
      q: el.tipo === "C" ? el.valor * v : 0,
      u: el.tipo === "C" ? 0.5 * el.valor * v * v : 0,
    };
  }
  return out;
}

/** Potencia entregada por la batería E·I_bat [W] (positiva = entrega energía). */
export function potenciaBateria(net: Netlist, r: Resultado): number {
  const fuente = net.elementos.find((x) => x.tipo === "V");
  return fuente ? fuente.valor * r.iBat : 0;
}

/** Σ P de resistores (incluida r_int) [W]. */
export function potenciaResistores(net: Netlist, r: Resultado): number {
  let s = 0;
  for (const el of net.elementos) if (el.tipo === "R") s += r.i[el.id] ** 2 * el.valor;
  return s;
}

/** Corriente neta que sale de un nodo por los elementos (debe ser 0 por KCL, incluye capacitores y fuente). */
export function sumaKCL(net: Netlist, r: Resultado, nodo: number): number {
  let s = 0;
  for (const el of net.elementos) {
    const i = r.i[el.id] ?? 0;
    if (el.a === nodo) s += i;
    if (el.b === nodo) s -= i;
  }
  return s;
}

/** Nodos (≠ 0) a los que solo llegan capacitores: nodos internos aislados. */
export function nodosAislados(net: Netlist): number[] {
  const out: number[] = [];
  for (let n = 1; n < net.nNodos; n++) {
    const tocan = net.elementos.filter((el) => el.a === n || el.b === n);
    if (tocan.length > 0 && tocan.every((el) => el.tipo === "C")) out.push(n);
  }
  return out;
}

/** Carga neta de las placas conectadas a un nodo [C]: Σ_{a=n} C·v_ab − Σ_{b=n} C·v_ab. */
export function cargaNetaNodo(net: Netlist, estadoC: Record<string, number>, nodo: number): number {
  let q = 0;
  for (const el of net.elementos) {
    if (el.tipo !== "C") continue;
    const qc = el.valor * (estadoC[el.id] ?? 0);
    if (el.a === nodo) q += qc;
    if (el.b === nodo) q -= qc;
  }
  return q;
}

/** Suma con signo de i_ab de varios elementos: corriente de un tramo en el sentido dibujado. */
export interface TerminoCorriente {
  id: string;
  signo: 1 | -1;
}

export function sumaTerminos(r: Resultado, terminos: TerminoCorriente[]): number {
  return terminos.reduce((s, t) => s + t.signo * (r.i[t.id] ?? 0), 0);
}

export interface LecturaSonda {
  /** Potencial respecto al borne − de la batería [V]. */
  v: number;
  /** Corriente con signo respecto a la flecha dibujada [A]. */
  i: number;
  /** |I| (la usa la velocidad de las partículas). */
  iAbs: number;
}

/** Sonda en un cable: V = potencial del nodo, I = suma con signo de los elementos del tramo. */
export function lecturaSondaCable(r: Resultado, nodo: number, terminos: TerminoCorriente[]): LecturaSonda {
  const i = sumaTerminos(r, terminos);
  return { v: r.v[nodo], i, iAbs: Math.abs(i) };
}

/**
 * Tramo de barra que une ramas en paralelo: I acumulada = I_entra − Σ ramas ya derivadas (KCL).
 * En el extremo final de la barra vale 0 (o la corriente restante si falta derivar alguna).
 */
export function corrienteBarra(r: Resultado, entra: TerminoCorriente[], derivadas: TerminoCorriente[][]): number {
  return derivadas.reduce((s, d) => s - sumaTerminos(r, d), sumaTerminos(r, entra));
}

/** Sonda sobre el cuerpo de un resistor/capacitor: V lineal entre terminales; s ∈ [0,1] desde `a`. */
export function interpolarCuerpo(va: number, vb: number, s: number): number {
  const t = Math.max(0, Math.min(1, s));
  return va - t * (va - vb);
}

/** Avisos opcionales de la spec §5 (no limitan la simulación). */
export function avisosPotencia(net: Netlist, r: Resultado): { pilaReal: boolean; resistorQuemado: string[] } {
  const quemados = net.elementos.filter((el) => el.tipo === "R" && r.i[el.id] ** 2 * el.valor > 0.25).map((x) => x.id);
  return { pilaReal: Math.abs(r.iBat) > 1, resistorQuemado: quemados };
}
