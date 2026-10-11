/**
 * Transitorio RC por Euler implícito (modelo compañero de capacitor), spec E6-E7-circuitos §3-§4.
 * La matriz se factoriza una sola vez por instancia: cambiar C, topología, E, R o el interruptor
 * implica crear otra instancia (usar `transitorioDesde`, que decide si se conserva el estado).
 */
import { arbolANetlist, equivalente } from "./arbol";
import { construirZ, ensamblar, factorizar, interpretar, resolverLU, type Ensamblado, type LU } from "./mna";
import type { Bloque, ModoCircuito, Netlist, OpcionesArmado, Resultado } from "./tipos";

/** Pasos por constante de tiempo: h = τ/200. */
export const PASOS_POR_TAU = 200;
/** Máximo de pasos por llamada a `avanzar` (evita bucles largos tras una pausa de pestaña). */
export const MAX_PASOS_POR_LLAMADA = 5000;

/** τ = (R_carga + r_int)·C_eq al cargar; τ = R_carga·C_eq al descargar (la batería, y su r_int, salen del lazo). */
export function tauRC(arbol: Bloque, rCarga: number, rInt = 0, modo: ModoCircuito = "cargar"): number {
  const r = modo === "descargar" ? rCarga : rCarga + rInt;
  return r * equivalente(arbol, "C");
}

export const pasoTemporal = (tau: number): number => tau / PASOS_POR_TAU;

export class Transitorio {
  readonly netlist: Netlist;
  readonly h: number;
  /** Tiempo real simulado [s]. */
  t = 0;
  pasos = 0;
  /** v_ab de cada capacitor. */
  estado: Record<string, number>;
  /** Interruptor Abierto: se congela el estado, I = 0 (sin resolver: la subred flotante es singular). */
  abierto = false;
  ultimo: Resultado;
  /** Energía entregada por la fuente [J] (Σ E·I_bat·h). */
  eBateria = 0;
  /** Energía disipada en todos los resistores [J] (Σ I²R·h). */
  eDisipada = 0;
  private acumulador = 0;
  private readonly ens: Ensamblado;
  private readonly lu: LU;

  constructor(netlist: Netlist, h: number, estadoInicial: Record<string, number> = {}) {
    this.netlist = netlist;
    this.h = h;
    this.estado = {};
    for (const el of netlist.elementos) if (el.tipo === "C") this.estado[el.id] = estadoInicial[el.id] ?? 0;
    this.ens = ensamblar(netlist, h);
    this.lu = factorizar(this.ens.M, this.ens.n);
    this.ultimo = this.congelado();
  }

  private congelado(): Resultado {
    const i: Record<string, number> = {};
    for (const el of this.netlist.elementos) i[el.id] = 0;
    // Potenciales desde tierra: cada C aporta v_ab del estado; R con I = 0 no cae voltaje.
    // La fuente no se recorre (con el interruptor Abierto está desconectada).
    const n = this.netlist.nNodos;
    const v = new Array<number>(n).fill(0);
    const visto = new Array<boolean>(n).fill(false);
    visto[0] = true;
    let cambio = true;
    while (cambio) {
      cambio = false;
      for (const el of this.netlist.elementos) {
        if (el.tipo === "V") continue;
        const d = el.tipo === "C" ? (this.estado[el.id] ?? 0) : 0;
        if (visto[el.b] && !visto[el.a]) {
          v[el.a] = v[el.b] + d;
          visto[el.a] = true;
          cambio = true;
        } else if (visto[el.a] && !visto[el.b]) {
          v[el.b] = v[el.a] - d;
          visto[el.b] = true;
          cambio = true;
        }
      }
    }
    return { v, i, iBat: 0, estadoC: { ...this.estado } };
  }

  /** Energía almacenada en los capacitores [J] = Σ ½ C v². */
  uAlmacenada(): number {
    let u = 0;
    for (const el of this.netlist.elementos) if (el.tipo === "C") u += 0.5 * el.valor * this.estado[el.id] ** 2;
    return u;
  }

  /** Un paso h. Con el interruptor Abierto no avanza: devuelve el estado congelado (I = 0). */
  paso(): Resultado {
    if (this.abierto) {
      this.ultimo = this.congelado();
      return this.ultimo;
    }
    const z = construirZ(this.netlist, this.ens, this.h, this.estado);
    const x = resolverLU(this.lu, z);
    const r = interpretar(this.netlist, this.ens, x, this.h, this.estado);
    this.estado = r.estadoC;
    this.t += this.h;
    this.pasos++;
    for (const el of this.netlist.elementos) {
      if (el.tipo === "R") this.eDisipada += r.i[el.id] ** 2 * el.valor * this.h;
      else if (el.tipo === "V") this.eBateria += -el.valor * r.i[el.id] * this.h;
    }
    this.ultimo = r;
    return r;
  }

  /** Reloj de paso fijo (patrón E2.2): avanza `dtReal` segundos reales; devuelve los pasos dados. */
  avanzar(dtReal: number): number {
    if (this.abierto) return 0;
    this.acumulador += dtReal;
    let n = 0;
    while (this.acumulador >= this.h && n < MAX_PASOS_POR_LLAMADA) {
      this.paso();
      this.acumulador -= this.h;
      n++;
    }
    if (n === MAX_PASOS_POR_LLAMADA) this.acumulador = 0;
    return n;
  }
}

export function crearTransitorio(netlist: Netlist, h: number, estado?: Record<string, number>): Transitorio {
  return new Transitorio(netlist, h, estado);
}

function mismosCapacitores(a: Netlist, b: Netlist): boolean {
  const ca = a.elementos.filter((x) => x.tipo === "C");
  const cb = b.elementos.filter((x) => x.tipo === "C");
  return (
    ca.length === cb.length &&
    ca.every((x, k) => x.id === cb[k].id && x.a === cb[k].a && x.b === cb[k].b && x.valor === cb[k].valor)
  );
}

/**
 * Nueva instancia tras un cambio en vivo. Cambiar E, R_carga, r_int o el interruptor conserva v_ab
 * de cada C; cambiar cualquier C o la topología reinicia a descargado (criterio 12).
 */
export function transitorioDesde(previo: Transitorio | null, netlist: Netlist, h: number): Transitorio {
  const conservar = previo !== null && mismosCapacitores(previo.netlist, netlist);
  return new Transitorio(netlist, h, conservar ? previo.estado : {});
}

/** Armado + paso sugerido τ/200 en una sola llamada (E7). */
export function transitorioDeArbol(
  arbol: Bloque,
  op: OpcionesArmado & { rCarga: number },
  previo: Transitorio | null = null,
): Transitorio {
  const net = arbolANetlist(arbol, op);
  const h = pasoTemporal(tauRC(arbol, op.rCarga, op.rInt ?? 0, op.modo));
  const t = transitorioDesde(previo, net, h);
  t.abierto = op.modo === "abierto";
  return t;
}

/** Soluciones analíticas del RC con τ único (spec §3), para validar y para curvas de referencia. */
export const analitico = {
  /** V_C(t) cargando hacia E desde V_C0. */
  vCarga: (t: number, E: number, vC0: number, tau: number) => E + (vC0 - E) * Math.exp(-t / tau),
  /** I(t) de carga: ((E − V_C0)/R) e^{−t/τ}. */
  iCarga: (t: number, E: number, vC0: number, R: number, tau: number) => ((E - vC0) / R) * Math.exp(-t / tau),
  /** V_C(t) descargando desde V_C0. */
  vDescarga: (t: number, vC0: number, tau: number) => vC0 * Math.exp(-t / tau),
  /** I(t) de descarga (negativa: sentido invertido). */
  iDescarga: (t: number, vC0: number, R: number, tau: number) => -(vC0 / R) * Math.exp(-t / tau),
};
