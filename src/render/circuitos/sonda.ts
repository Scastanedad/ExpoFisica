/**
 * Sonda de potencial y corriente sobre cualquier punto del cable (spec criterios §1). Pura.
 *
 * Posición = (tramo, t ∈ [0,1]) en la GEOMETRÍA, no en el netlist: así sobrevive a un cambio de
 * tamaño del lienzo. Lectura:
 *  - cable: V = potencial del nodo del tramo; I = Σ signo·i_ab de los `terminos` del tramo (convención
 *    a→b; en las barras de ramas paralelas es el acumulado KCL), con signo respecto a la flecha dibujada.
 *  - cuerpo de un resistor/capacitor: V interpolado linealmente entre sus terminales; I del elemento.
 */
import {
  interpolarCuerpo,
  lecturaSondaCable,
  type Netlist,
  type Resultado,
} from "../../fisica/circuitos";
import { nodoDeRef, puntoEnTramo, type GeometriaCircuito } from "./distribucion";

export interface PosicionSonda {
  tramo: string;
  /** Posición normalizada a lo largo del tramo. */
  t: number;
}

export interface LecturaSondaCircuito {
  tramo: string;
  /** Elemento al que pertenece el tramo (cable corto o cuerpo), si lo hay. */
  elemento: string | null;
  sobreCuerpo: boolean;
  /** Potencial respecto al borne − de la batería [V]. */
  v: number;
  /** Corriente con signo respecto a la flecha dibujada [A]. */
  i: number;
  iAbs: number;
  /** Posición en el lienzo. */
  x: number;
  y: number;
}

export function leerSonda(
  geom: GeometriaCircuito,
  net: Netlist,
  r: Resultado,
  pos: PosicionSonda,
): LecturaSondaCircuito | null {
  const tramo = geom.tramos.find((t) => t.id === pos.tramo);
  if (!tramo) return null;
  const t = Math.max(0, Math.min(1, pos.t));
  const { x, y } = puntoEnTramo(tramo, t * tramo.longitud);
  if (tramo.cuerpo && tramo.elemento) {
    const el = net.elementos.find((e) => e.id === tramo.elemento);
    if (el) {
      const i = r.i[el.id] ?? 0;
      return {
        tramo: tramo.id,
        elemento: el.id,
        sobreCuerpo: true,
        v: interpolarCuerpo(r.v[el.a] ?? 0, r.v[el.b] ?? 0, t),
        i,
        iAbs: Math.abs(i),
        x,
        y,
      };
    }
  }
  const l = lecturaSondaCable(r, nodoDeRef(net, tramo.ref), tramo.terminos);
  return { tramo: tramo.id, elemento: tramo.elemento ?? null, sobreCuerpo: false, v: l.v ?? 0, i: l.i, iAbs: l.iAbs, x, y };
}

/** Tramo siguiente/anterior en el orden de la geometría (sonda con teclado). `null` actual = el primero. */
export function tramoVecino(geom: GeometriaCircuito, actual: string | null, paso: 1 | -1): string | null {
  const n = geom.tramos.length;
  if (n === 0) return null;
  const k = actual === null ? -1 : geom.tramos.findIndex((t) => t.id === actual);
  if (k < 0) return geom.tramos[paso === 1 ? 0 : n - 1].id;
  return geom.tramos[(k + paso + n) % n].id;
}
