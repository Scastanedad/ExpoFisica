/**
 * Árbol serie-paralelo: normalización, edición (tope de 6), equivalente
 * analítico y conversión pura a netlist (spec E6-E7-circuitos-presets §3).
 */
import {
  ErrorCircuito,
  ID_FUENTE,
  ID_R_CARGA,
  ID_R_INT,
  MAX_ELEMENTOS,
  type Bloque,
  type Elemento,
  type Netlist,
  type OpcionesArmado,
} from "./tipos";

export type Dominio = "R" | "C";
type Hoja = Extract<Bloque, { t: "e" }>;

export const e = (id: string, valor: number): Bloque => ({ t: "e", id, valor });
export const serie = (...hijos: Bloque[]): Bloque => ({ t: "s", hijos });
export const paralelo = (...hijos: Bloque[]): Bloque => ({ t: "p", hijos });

export function hojas(b: Bloque): Hoja[] {
  if (b.t === "e") return [b];
  return b.hijos.flatMap(hojas);
}

export function contarHojas(b: Bloque): number {
  return hojas(b).length;
}

function aplanar(b: Bloque): Bloque | null {
  if (b.t === "e") return b;
  const hijos: Bloque[] = [];
  for (const h of b.hijos) {
    const a = aplanar(h);
    if (a === null) continue;
    if (a.t === b.t) hijos.push(...a.hijos);
    else hijos.push(a);
  }
  if (hijos.length === 0) return null;
  if (hijos.length === 1) return hijos[0];
  return { t: b.t, hijos };
}

/**
 * Normaliza: fusiona s dentro de s y p dentro de p, colapsa bloques de 1 hijo y
 * renumera los ids `${prefijo}1..` en orden de lectura (DFS izquierda→derecha).
 */
export function normalizar(b: Bloque, prefijo: Dominio): Bloque {
  const limpio = aplanar(b);
  if (limpio === null) throw new ErrorCircuito("árbol vacío");
  let n = 0;
  const renum = (x: Bloque): Bloque =>
    x.t === "e" ? { t: "e", id: `${prefijo}${++n}`, valor: x.valor } : { t: x.t, hijos: x.hijos.map(renum) };
  return renum(limpio);
}

/** Sustituye la hoja `id` con f(hoja); f devuelve null para quitarla. */
function mapearHoja(b: Bloque, id: string, f: (h: Hoja) => Bloque | null): Bloque | null {
  if (b.t === "e") return b.id === id ? f(b) : b;
  const hijos = b.hijos.map((h) => mapearHoja(h, id, f)).filter((h): h is Bloque => h !== null);
  if (hijos.length === 0) return null;
  return { t: b.t, hijos };
}

function agregar(arbol: Bloque, id: string, tipo: "s" | "p", prefijo: Dominio, valor?: number): Bloque | null {
  const hoja = hojas(arbol).find((h) => h.id === id);
  if (!hoja || contarHojas(arbol) >= MAX_ELEMENTOS) return null;
  const nuevo = e("nuevo", valor ?? hoja.valor);
  const r = mapearHoja(arbol, id, (h) => ({ t: tipo, hijos: [h, nuevo] }));
  return r && normalizar(r, prefijo);
}

/** «Añadir en serie» sobre la hoja `id`. null si ya hay 6 elementos (se rechaza el séptimo) o no existe `id`. */
export const agregarSerie = (arbol: Bloque, id: string, prefijo: Dominio, valor?: number) =>
  agregar(arbol, id, "s", prefijo, valor);

/** «Añadir en paralelo» sobre la hoja `id`. */
export const agregarParalelo = (arbol: Bloque, id: string, prefijo: Dominio, valor?: number) =>
  agregar(arbol, id, "p", prefijo, valor);

/** Quita la hoja `id` (mínimo 1 elemento: null si es la única o no existe). */
export function quitar(arbol: Bloque, id: string, prefijo: Dominio): Bloque | null {
  if (contarHojas(arbol) <= 1 || !hojas(arbol).some((h) => h.id === id)) return null;
  const r = mapearHoja(arbol, id, () => null);
  return r && normalizar(r, prefijo);
}

/** Cambia el valor de una hoja sin tocar la estructura (ids estables). */
export function conValor(arbol: Bloque, id: string, valor: number): Bloque {
  return mapearHoja(arbol, id, (h) => ({ ...h, valor })) as Bloque;
}

/** Equivalente analítico: R_eq (serie Σ, paralelo 1/Σ1/R) o C_eq (al revés). */
export function equivalente(b: Bloque, dominio: Dominio): number {
  if (b.t === "e") return b.valor;
  const vs = b.hijos.map((h) => equivalente(h, dominio));
  const sumar = (b.t === "s") === (dominio === "R");
  return sumar ? vs.reduce((a, x) => a + x, 0) : 1 / vs.reduce((a, x) => a + 1 / x, 0);
}

export interface RepartoHoja {
  v: number;
  i: number;
  q: number;
}

/**
 * Reparto analítico (divisores) con `total` = voltaje aplicado a la raíz.
 * R: v = V·R/R_eq (serie) o V (paralelo), i = v/R.  C: serie misma Q (v ∝ 1/C_eq), paralelo mismo V; q = C·v.
 */
export function repartoAnalitico(b: Bloque, dominio: Dominio, total: number): Record<string, RepartoHoja> {
  const out: Record<string, RepartoHoja> = {};
  const rec = (x: Bloque, v: number) => {
    if (x.t === "e") {
      out[x.id] = dominio === "R" ? { v, i: v / x.valor, q: 0 } : { v, i: 0, q: x.valor * v };
      return;
    }
    if (x.t === "p") {
      for (const h of x.hijos) rec(h, v);
      return;
    }
    const w = x.hijos.map((h) => {
      const eq = equivalente(h, dominio);
      return dominio === "R" ? eq : 1 / eq;
    });
    const sw = w.reduce((a, y) => a + y, 0);
    x.hijos.forEach((h, k) => rec(h, (v * w[k]) / sw));
  };
  rec(b, total);
  return out;
}

/** v_ab de cada capacitor con la red completamente cargada a E (a = lado del +). */
export function estadoCargado(arbol: Bloque, E: number): Record<string, number> {
  const r = repartoAnalitico(arbol, "C", E);
  return Object.fromEntries(Object.entries(r).map(([id, x]) => [id, x.v]));
}

/**
 * Árbol → netlist (pura). Fuente V (a = +, b = 0). Nodo 1 = borne + externo; con rInt > 0,
 * `r_int` va del borne interno de la fuente (último nodo) al nodo 1.
 * dc: raíz entre 1 y 0 (hojas R). cargar/descargar/abierto: Rc entre 1 y 2, raíz entre 2 y 0 (hojas C);
 * «descargar» fija la fuente en 0 V (cable, lazo cerrado); «abierto» se arma como «cargar»
 * (el simulador lo congela y no lo resuelve).
 */
export function arbolANetlist(arbol: Bloque, op: OpcionesArmado): Netlist {
  const tipoHoja = op.modo === "dc" ? "R" : "C";
  // En «descargar» la batería se desconecta: r_int sale del lazo (τ = Rc·C_eq).
  const rInt = op.modo === "descargar" ? 0 : (op.rInt ?? 0);
  let nodos = 2; // 0 tierra, 1 borne + externo
  const nuevoNodo = () => nodos++;

  let nodoRaiz = 1;
  if (op.modo !== "dc") {
    if (op.rCarga === undefined || !(op.rCarga > 0)) throw new ErrorCircuito("falta rCarga > 0");
    nodoRaiz = nuevoNodo();
  }

  const hojasEl: Elemento[] = [];
  const construir = (b: Bloque, nIn: number, nOut: number) => {
    if (b.t === "e") {
      if (!(b.valor > 0) || !Number.isFinite(b.valor)) throw new ErrorCircuito(`valor inválido en ${b.id}`);
      hojasEl.push({ id: b.id, tipo: tipoHoja, a: nIn, b: nOut, valor: b.valor });
    } else if (b.t === "p") {
      for (const h of b.hijos) construir(h, nIn, nOut);
    } else {
      let ant = nIn;
      b.hijos.forEach((h, k) => {
        const sig = k === b.hijos.length - 1 ? nOut : nuevoNodo();
        construir(h, ant, sig);
        ant = sig;
      });
    }
  };
  construir(arbol, nodoRaiz, 0);

  const E = op.modo === "descargar" ? 0 : op.E;
  const cabecera: Elemento[] = [];
  if (rInt > 0) {
    const nFuente = nuevoNodo();
    cabecera.push({ id: ID_FUENTE, tipo: "V", a: nFuente, b: 0, valor: E });
    cabecera.push({ id: ID_R_INT, tipo: "R", a: nFuente, b: 1, valor: rInt });
  } else {
    cabecera.push({ id: ID_FUENTE, tipo: "V", a: 1, b: 0, valor: E });
  }
  if (op.modo !== "dc") cabecera.push({ id: ID_R_CARGA, tipo: "R", a: 1, b: nodoRaiz, valor: op.rCarga as number });
  return { nNodos: nodos, elementos: [...cabecera, ...hojasEl] };
}

/**
 * Puente de Wheatstone (netlist fija, 5 resistores): nodos 1 (+), A=2, B=3, 0.
 * R1: 1→2, R2: 2→0, R3: 1→3, R4: 3→0, R5: 2→3 (a = A, b = B). Equilibrio: R1/R2 = R3/R4.
 */
export function netlistWheatstone(
  v: { R1: number; R2: number; R3: number; R4: number; R5: number },
  E: number,
  rInt = 0,
): Netlist {
  const els: Elemento[] = [];
  let nNodos = 4;
  if (rInt > 0) {
    els.push({ id: ID_FUENTE, tipo: "V", a: nNodos, b: 0, valor: E });
    els.push({ id: ID_R_INT, tipo: "R", a: nNodos, b: 1, valor: rInt });
    nNodos++;
  } else els.push({ id: ID_FUENTE, tipo: "V", a: 1, b: 0, valor: E });
  els.push(
    { id: "R1", tipo: "R", a: 1, b: 2, valor: v.R1 },
    { id: "R2", tipo: "R", a: 2, b: 0, valor: v.R2 },
    { id: "R3", tipo: "R", a: 1, b: 3, valor: v.R3 },
    { id: "R4", tipo: "R", a: 3, b: 0, valor: v.R4 },
    { id: "R5", tipo: "R", a: 2, b: 3, valor: v.R5 },
  );
  return { nNodos, elementos: els };
}
