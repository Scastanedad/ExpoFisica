/**
 * Reducción paso a paso a R_eq / C_eq (spec E6-E7-circuitos-presets §4). Cada paso colapsa el
 * primer bloque (recorrido posorden, izquierda→derecha) cuyos hijos son todos hojas.
 * Las fórmulas se invierten entre resistores y capacitores.
 */
import { hojas, type Dominio } from "./arbol";
import { formatearSI } from "./formato";
import type { Bloque } from "./tipos";

export interface OperandoReduccion {
  id: string;
  valor: number;
}

export interface PasoReduccion {
  tipo: "s" | "p";
  dominio: Dominio;
  operandos: OperandoReduccion[];
  resultado: OperandoReduccion;
  /** Fórmula con símbolos y con números (3 cifras significativas y prefijos). */
  formula: string;
  /** Árbol tras aplicar el paso. */
  arbol: Bloque;
}

export const MENSAJE_PUENTE_NO_REDUCIBLE =
  "No es serie-paralelo: no se reduce. Se resuelve con el método nodal (potenciales de los nodos A y B).";
export const FRASE_CAPACITORES_AL_REVES =
  "En capacitores serie y paralelo se comportan al contrario que en resistores.";

type Hoja = Extract<Bloque, { t: "e" }>;
const hijosHoja = (b: Extract<Bloque, { t: "s" | "p" }>): Hoja[] | null =>
  b.hijos.every((h) => h.t === "e") ? (b.hijos as Hoja[]) : null;

function formulaPaso(tipo: "s" | "p", dominio: Dominio, ops: OperandoReduccion[], res: OperandoReduccion): string {
  const unidad = dominio === "R" ? "Ω" : "F";
  const suma = (tipo === "s") === (dominio === "R");
  const nombres = ops.map((o) => o.id);
  const valores = ops.map((o) => formatearSI(o.valor, unidad));
  const fin = formatearSI(res.valor, unidad);
  if (suma) return `${res.id} = ${nombres.join(" + ")} = ${valores.join(" + ")} = ${fin}`;
  if (ops.length === 2) {
    return `${res.id} = ${nombres[0]}·${nombres[1]}/(${nombres[0]} + ${nombres[1]}) = ${valores[0]}·${valores[1]}/(${valores[0]} + ${valores[1]}) = ${fin}`;
  }
  const inv = (xs: string[]) => xs.map((x) => `1/${x}`).join(" + ");
  return `1/${res.id} = ${inv(nombres)} = ${inv(valores)} ⇒ ${res.id} = ${fin}`;
}

/** Un paso de reducción, o null si el árbol ya es una sola hoja. */
export function siguientePaso(arbol: Bloque, dominio: Dominio, contador = { s: 0, p: 0 }): PasoReduccion | null {
  const sal: { paso: PasoReduccion | null } = { paso: null };
  const rec = (b: Bloque): Bloque => {
    if (sal.paso !== null || b.t === "e") return b;
    const hs = hijosHoja(b);
    if (hs) {
      const ops = hs.map((h) => ({ id: h.id, valor: h.valor }));
      const suma = (b.t === "s") === (dominio === "R");
      const valor = suma ? ops.reduce((a, o) => a + o.valor, 0) : 1 / ops.reduce((a, o) => a + 1 / o.valor, 0);
      const id = `${dominio}${b.t}${++contador[b.t]}`;
      const res = { id, valor };
      sal.paso = { tipo: b.t, dominio, operandos: ops, resultado: res, formula: formulaPaso(b.t, dominio, ops, res), arbol: arbol };
      return { t: "e", id, valor };
    }
    return { t: b.t, hijos: b.hijos.map(rec) };
  };
  const nuevo = rec(arbol);
  if (sal.paso === null) return null;
  sal.paso.arbol = nuevo;
  return sal.paso;
}

/** Todos los pasos hasta quedar un solo elemento. `equivalente` = valor final. Nº de pasos = bloques internos. */
export function reducirPasoAPaso(
  arbol: Bloque,
  dominio: Dominio,
): { pasos: PasoReduccion[]; equivalente: number } {
  const pasos: PasoReduccion[] = [];
  const contador = { s: 0, p: 0 };
  let actual = arbol;
  for (;;) {
    const p = siguientePaso(actual, dominio, contador);
    if (p === null) break;
    pasos.push(p);
    actual = p.arbol;
  }
  const unica = hojas(actual)[0];
  return { pasos, equivalente: unica.valor };
}
