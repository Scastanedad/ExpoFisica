/**
 * Distribución automática de un árbol serie-paralelo (E6/E7), función PURA sin DOM.
 *
 * Reglas (spec E6-E7, plan «Distribución automática»): serie = horizontal, paralelo = ramas apiladas,
 * recursivo. Todo se calcula primero en «unidades» (1 u = lado de la rejilla del dibujo) y se escala de
 * una sola vez para que el circuito completo (batería + lazo + árbol) CABA en el rectángulo dado,
 * centrado. Los rótulos de cada elemento viven DENTRO de su celda, así que no pueden solaparse.
 *
 * Cada trozo de cable es un `Tramo` con la semántica de la sonda (spec criterios §1):
 *  - `ref`: elemento y lado (a/b) cuyo NODO da el potencial del tramo (no se numeran nodos aquí; se
 *    resuelven contra el netlist real con `nodoDeRef`).
 *  - `terminos`: elementos cuya suma con signo es la corriente del tramo EN EL SENTIDO DEL POLILÍNEA
 *    (convención a→b; en barras de ramas paralelas es la suma acumulada por KCL).
 * El polilínea apunta en el sentido de la corriente convencional del circuito (+ de la batería → −), de
 * modo que I > 0 significa «a favor de la flecha dibujada».
 */
import {
  ID_FUENTE,
  ID_R_CARGA,
  type Bloque,
  type Netlist,
  type TerminoCorriente,
} from "../../fisica/circuitos";

export interface Caja {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface RefNodo {
  /** Id del elemento del netlist cuyo terminal da el nodo. */
  el: string;
  lado: "a" | "b";
}

export interface ElementoColocado {
  id: string;
  tipo: "R" | "C";
  /** Celda completa (cables cortos + cuerpo + rótulos). Las celdas nunca se solapan. */
  celda: Caja;
  /** Cuerpo del símbolo (zigzag / placas). */
  cuerpo: Caja;
  /** Y del eje del cable. */
  yEje: number;
  /** X de los terminales a (entrada) y b (salida). */
  xA: number;
  xB: number;
  /** Zona del nombre (R1…), arriba del cuerpo; dentro de la celda. */
  nombre: Caja;
  /** Zona de las dos líneas V / I, bajo el cuerpo; dentro de la celda. */
  lectura: Caja;
}

export interface FlechaTramo {
  /** Punto medio del segmento más largo del tramo. */
  x: number;
  y: number;
  /** Dirección unitaria en el sentido del polilínea. */
  dx: number;
  dy: number;
  /** Longitud de ese segmento [px]: si es corta no se dibuja la flecha. */
  largo: number;
}

export interface Tramo {
  id: string;
  /** Polilínea plano [x0, y0, x1, y1, …] en el sentido de la corriente convencional. */
  puntos: number[];
  longitud: number;
  ref: RefNodo;
  terminos: TerminoCorriente[];
  /** Si el tramo pertenece a un elemento (cable corto o cuerpo). */
  elemento?: string;
  /** Es el cuerpo del símbolo (R: zigzag; C: espacio entre placas, sin partículas). */
  cuerpo?: "R" | "C";
  flecha: FlechaTramo;
}

export interface BateriaColocada {
  cx: number;
  /** Terminal + (arriba) y − (abajo). */
  yMas: number;
  yMenos: number;
  caja: Caja;
  /** Inicio (izquierda, centrado en vertical) de su rótulo «12 V», a la derecha del cable. */
  rotulo: { x: number; y: number };
}

export type NivelRotulos = "completo" | "reducido" | "minimo";

/** Una línea V/I de 9 caracteres a `fuenteMin` cabe en la celda si s ≥ este múltiplo de `fuenteMin`. */
const S_REDUCIDO_K = 1.42;

export interface GeometriaCircuito {
  ancho: number;
  alto: number;
  /** Píxeles por unidad de rejilla. */
  s: number;
  /** Tamaño de fuente de los rótulos [px lógicos] en modo normal. */
  fuente: number;
  /**
   * Nivel de rótulos según el espacio, sin bajar nunca de `fuenteMin`:
   *  - completo: nombre + valor, V e I en cada elemento;
   *  - reducido: solo V e I (a `fuenteMin`); el nombre y el valor del seleccionado van en `banda`;
   *  - minimo: no caben ni V e I: solo el seleccionado, en `banda`.
   */
  nivel: NivelRotulos;
  /** nivel ≠ completo. */
  compacto: boolean;
  /** Franja superior reservada al rótulo del seleccionado (solo en modo compacto). */
  banda: Caja | null;
  /** Fuente mínima legible usada para decidir el modo compacto [px lógicos]. */
  fuenteMin: number;
  elementos: ElementoColocado[];
  tramos: Tramo[];
  bateria: BateriaColocada;
  /** Caja que contiene todo el circuito. */
  caja: Caja;
}

export interface OpcionesDistribucion {
  /** E7: añade el resistor de carga fijo (id «Rc») en serie, antes del árbol. */
  rCarga?: boolean;
  /** Fuente mínima legible [px lógicos] (la pone el componente: 12 px CSS / escalaCss). */
  fuenteMin?: number;
}

// ---------------------------------------------------------------- constantes (unidades de rejilla)
const EL_W = 4;
const EL_H = 2.9;
const EL_EJE = 1.12;
const LEAD = 1;
const CUERPO_W = 2;
const CUERPO_H = 1;
const BARRA = 0.5;
const GAP_P = 0.15;
/** Fuente en unidades (alto de texto). Una línea de 9 caracteres monoespaciados ≈ 2,5 u < EL_W. */
const FUENTE_U = 0.46;
const ANCHO_CAR = 0.6;
const MARGEN_X = 0.4;
const X_BATERIA = MARGEN_X + 1.2;
const X_ARBOL = X_BATERIA + 1.7;
const COLA_DER = 0.9;
const Y_RIEL_SUP = 0.9;
const SEP_RIEL = 0.6;
const COLA_INF = 0.9;
const S_MAX = 80;
/** Alto de la franja compacta, en múltiplos de la fuente mínima. */
const BANDA_K = 2.6;
export const FUENTE_MIN_DEFECTO = 12;

// ---------------------------------------------------------------- árbol de layout
type LB = { t: "e"; id: string; tipo: "R" | "C" } | { t: "s" | "p"; hijos: LB[] };

function aLayout(b: Bloque, tipo: "R" | "C"): LB {
  if (b.t === "e") return { t: "e", id: b.id, tipo };
  return { t: b.t, hijos: b.hijos.map((h) => aLayout(h, tipo)) };
}

const primeraHoja = (b: LB): Extract<LB, { t: "e" }> => (b.t === "e" ? b : primeraHoja(b.hijos[0]));
const ultimaHoja = (b: LB): Extract<LB, { t: "e" }> => (b.t === "e" ? b : ultimaHoja(b.hijos[b.hijos.length - 1]));

/** Corriente que atraviesa un bloque (entra por su nodo de entrada), como suma de términos. */
export function terminosBloque(b: LB): TerminoCorriente[] {
  if (b.t === "e") return [{ id: b.id, signo: 1 }];
  if (b.t === "s") return terminosBloque(b.hijos[0]);
  return b.hijos.flatMap(terminosBloque);
}

const negar = (t: TerminoCorriente[]): TerminoCorriente[] => t.map((x) => ({ id: x.id, signo: x.signo === 1 ? -1 : 1 }));

interface Medida {
  w: number;
  h: number;
  /** Distancia desde el borde superior hasta la línea de terminales. */
  eje: number;
}

function medir(b: LB): Medida {
  if (b.t === "e") return { w: EL_W, h: EL_H, eje: EL_EJE };
  const ms = b.hijos.map(medir);
  if (b.t === "s") {
    const eje = Math.max(...ms.map((m) => m.eje));
    const bajo = Math.max(...ms.map((m) => m.h - m.eje));
    return { w: ms.reduce((a, m) => a + m.w, 0), h: eje + bajo, eje };
  }
  let y = 0;
  const centros: number[] = [];
  for (const m of ms) {
    centros.push(y + m.eje);
    y += m.h + GAP_P;
  }
  return {
    w: Math.max(...ms.map((m) => m.w)) + 2 * BARRA,
    h: y - GAP_P,
    eje: (centros[0] + centros[centros.length - 1]) / 2,
  };
}

// ---------------------------------------------------------------- generación en unidades
interface Generador {
  elementos: ElementoColocado[];
  tramos: Tramo[];
  n: number;
}

function flechaDe(puntos: number[]): FlechaTramo {
  let mejor = { largo: -1, x: 0, y: 0, dx: 1, dy: 0 };
  for (let k = 0; k + 3 < puntos.length; k += 2) {
    const dx = puntos[k + 2] - puntos[k];
    const dy = puntos[k + 3] - puntos[k + 1];
    const largo = Math.hypot(dx, dy);
    if (largo > mejor.largo) {
      mejor = {
        largo,
        x: (puntos[k] + puntos[k + 2]) / 2,
        y: (puntos[k + 1] + puntos[k + 3]) / 2,
        dx: largo > 0 ? dx / largo : 1,
        dy: largo > 0 ? dy / largo : 0,
      };
    }
  }
  return mejor;
}

function longitudDe(puntos: number[]): number {
  let l = 0;
  for (let k = 0; k + 3 < puntos.length; k += 2) l += Math.hypot(puntos[k + 2] - puntos[k], puntos[k + 3] - puntos[k + 1]);
  return l;
}

function emitirTramo(
  g: Generador,
  id: string,
  puntos: number[],
  ref: RefNodo,
  terminos: TerminoCorriente[],
  extra: Pick<Tramo, "elemento" | "cuerpo"> = {},
): void {
  const longitud = longitudDe(puntos);
  if (longitud < 1e-9) return;
  g.tramos.push({ id, puntos, longitud, ref, terminos, flecha: flechaDe(puntos), ...extra });
}

function colocarElemento(g: Generador, b: Extract<LB, { t: "e" }>, x: number, y: number): void {
  const ya = y + EL_EJE;
  // Hasta 9 caracteres monoespaciados en cada zona («R1 4,7 kΩ», «−12 mA»).
  const nw = 9 * ANCHO_CAR * FUENTE_U;
  const lw = nw;
  g.elementos.push({
    id: b.id,
    tipo: b.tipo,
    celda: { x, y, w: EL_W, h: EL_H },
    cuerpo: { x: x + LEAD, y: ya - CUERPO_H / 2, w: CUERPO_W, h: CUERPO_H },
    yEje: ya,
    xA: x,
    xB: x + EL_W,
    nombre: { x: x + (EL_W - nw) / 2, y: y + 0.04, w: nw, h: 0.56 },
    lectura: { x: x + (EL_W - lw) / 2, y: ya + CUERPO_H / 2 + 0.12, w: lw, h: 2 * 0.53 },
  });
  const t = [{ id: b.id, signo: 1 as const }];
  emitirTramo(g, `${b.id}:a`, [x, ya, x + LEAD, ya], { el: b.id, lado: "a" }, t, { elemento: b.id });
  emitirTramo(g, `${b.id}:cuerpo`, [x + LEAD, ya, x + LEAD + CUERPO_W, ya], { el: b.id, lado: "a" }, t, {
    elemento: b.id,
    cuerpo: b.tipo,
  });
  emitirTramo(g, `${b.id}:b`, [x + LEAD + CUERPO_W, ya, x + EL_W, ya], { el: b.id, lado: "b" }, t, { elemento: b.id });
}

function colocar(g: Generador, b: LB, x: number, y: number): void {
  if (b.t === "e") {
    colocarElemento(g, b, x, y);
    return;
  }
  const m = medir(b);
  if (b.t === "s") {
    let cx = x;
    for (const h of b.hijos) {
      const mh = medir(h);
      colocar(g, h, cx, y + m.eje - mh.eje);
      cx += mh.w;
    }
    return;
  }

  // Paralelo: barra izquierda, ramas apiladas, barra derecha.
  const id = `p${g.n++}`;
  const ya = y + m.eje;
  const xL = x + BARRA;
  const maxW = m.w - 2 * BARRA;
  const xR = xL + maxW;
  const refEntra: RefNodo = { el: primeraHoja(b).id, lado: "a" };
  const refSale: RefNodo = { el: ultimaHoja(b).id, lado: "b" };
  const terminosB = terminosBloque(b);

  interface Toma {
    y: number;
    terminos: TerminoCorriente[];
  }
  const tomas: Toma[] = [];
  let yy = y;
  b.hijos.forEach((h, k) => {
    const mh = medir(h);
    const yt = yy + mh.eje;
    const xc = xL + (maxW - mh.w) / 2;
    colocar(g, h, xc, yy);
    const th = terminosBloque(h);
    emitirTramo(g, `${id}:in${k}`, [xL, yt, xc, yt], { el: primeraHoja(h).id, lado: "a" }, th);
    emitirTramo(g, `${id}:out${k}`, [xc + mh.w, yt, xR, yt], { el: ultimaHoja(h).id, lado: "b" }, th);
    tomas.push({ y: yt, terminos: th });
    yy += mh.h + GAP_P;
  });
  emitirTramo(g, `${id}:entra`, [x, ya, xL, ya], refEntra, terminosB);
  emitirTramo(g, `${id}:sale`, [xR, ya, x + m.w, ya], refSale, terminosB);

  // Barras: se parten en cada toma y en el punto de entrada/salida; cada trozo lleva el acumulado KCL.
  const ys = [...new Set([ya, ...tomas.map((t) => t.y)].map((v) => Math.round(v * 1e6) / 1e6))].sort((a, c) => a - c);
  const eps = 1e-6;
  for (let k = 0; k + 1 < ys.length; k++) {
    const arriba = ys[k] + eps;
    // Barra izquierda: entra la corriente del bloque en `ya` y se va por cada toma (flujo hacia abajo > 0).
    const izq: TerminoCorriente[] = [];
    const der: TerminoCorriente[] = [];
    if (ya <= arriba) {
      izq.push(...terminosB);
      der.push(...negar(terminosB));
    }
    for (const t of tomas) {
      if (t.y <= arriba) {
        izq.push(...negar(t.terminos));
        der.push(...t.terminos);
      }
    }
    emitirTramo(g, `${id}:bi${k}`, [xL, ys[k], xL, ys[k + 1]], refEntra, izq);
    emitirTramo(g, `${id}:bd${k}`, [xR, ys[k], xR, ys[k + 1]], refSale, der);
  }
}

// ---------------------------------------------------------------- escala
const nodoCaja = (c: Caja, s: number, ox: number, oy: number): Caja => ({
  x: c.x * s + ox,
  y: c.y * s + oy,
  w: c.w * s,
  h: c.h * s,
});

function escalarTramo(t: Tramo, s: number, ox: number, oy: number): Tramo {
  const puntos = t.puntos.map((v, k) => (k % 2 === 0 ? v * s + ox : v * s + oy));
  return {
    ...t,
    puntos,
    longitud: t.longitud * s,
    flecha: { ...t.flecha, x: t.flecha.x * s + ox, y: t.flecha.y * s + oy, largo: t.flecha.largo * s },
  };
}

/**
 * Distribuye el árbol en un rectángulo `ancho` × `alto` [px lógicos]. Siempre cabe: el tamaño de los
 * elementos sale de la cabida. Si los rótulos completos quedarían por debajo de `fuenteMin`, se activa
 * el modo compacto y se reserva una franja superior para el rótulo del seleccionado.
 * `tipoHojas` solo cambia el símbolo (resistor o capacitor).
 */
export function distribuirCircuito(
  arbol: Bloque,
  tipoHojas: "R" | "C",
  rect: { ancho: number; alto: number },
  opciones: OpcionesDistribucion = {},
): GeometriaCircuito {
  const { ancho, alto } = rect;
  const fuenteMin = opciones.fuenteMin ?? FUENTE_MIN_DEFECTO;
  const rCarga = opciones.rCarga === true;
  let raiz = aLayout(arbol, tipoHojas);
  if (rCarga) {
    const rc: LB = { t: "e", id: ID_R_CARGA, tipo: "R" };
    raiz = { t: "s", hijos: [rc, ...(raiz.t === "s" ? raiz.hijos : [raiz])] };
  }

  const m = medir(raiz);
  const g: Generador = { elementos: [], tramos: [], n: 0 };

  const xi = X_ARBOL;
  const xo = xi + m.w;
  const xr = xo + COLA_DER;
  const wU = xr + MARGEN_X;
  const yTop = Y_RIEL_SUP + SEP_RIEL;
  const yA = yTop + m.eje;
  const yB = yTop + m.h + SEP_RIEL;
  const hU = yB + COLA_INF;
  const yRiel = Y_RIEL_SUP;
  const cy = (yRiel + yB) / 2;
  const yMas = cy - 0.6;
  const yMenos = cy + 0.6;

  colocar(g, raiz, xi, yTop);

  const primera = primeraHoja(raiz);
  const ultima = ultimaHoja(raiz);
  const iBat: TerminoCorriente[] = [{ id: ID_FUENTE, signo: -1 }];
  // Lazo exterior en el sentido de la corriente convencional: + de la batería → riel superior → árbol → riel derecho → riel inferior → −.
  emitirTramo(g, "riel-sup", [X_BATERIA, yMas, X_BATERIA, yRiel, xi, yRiel, xi, yA], { el: primera.id, lado: "a" }, iBat);
  emitirTramo(g, "riel-der", [xo, yA, xr, yA, xr, yB], { el: ultima.id, lado: "b" }, iBat);
  emitirTramo(g, "riel-inf", [xr, yB, X_BATERIA, yB, X_BATERIA, yMenos], { el: ultima.id, lado: "b" }, iBat);

  const bateriaU: BateriaColocada = {
    cx: X_BATERIA,
    yMas,
    yMenos,
    caja: { x: X_BATERIA - 1.1, y: yMas, w: 2.6, h: yMenos - yMas + 0.3 + 0.55 },
    rotulo: { x: X_BATERIA + 0.35, y: yMenos + 0.55 },
  };

  // Escala: cabe el lazo entero; en modo compacto se reserva la franja superior.
  const sAncho = ancho / wU;
  let s = Math.min(sAncho, alto / hU, S_MAX);
  let nivel: NivelRotulos = FUENTE_U * s >= fuenteMin ? "completo" : "reducido";
  const banda = nivel !== "completo" ? BANDA_K * fuenteMin : 0;
  if (nivel !== "completo") {
    s = Math.min(sAncho, Math.max(alto - banda, 1) / hU, S_MAX);
    // Con la franja reservada puede que ya quepan los rótulos completos; si no, V e I; si no, solo el seleccionado.
    nivel = FUENTE_U * s >= fuenteMin ? "completo" : s >= S_REDUCIDO_K * fuenteMin ? "reducido" : "minimo";
  }
  const ox = (ancho - wU * s) / 2;
  const oy = banda + (alto - banda - hU * s) / 2;

  const elementos = g.elementos.map<ElementoColocado>((e) => ({
    ...e,
    celda: nodoCaja(e.celda, s, ox, oy),
    cuerpo: nodoCaja(e.cuerpo, s, ox, oy),
    yEje: e.yEje * s + oy,
    xA: e.xA * s + ox,
    xB: e.xB * s + ox,
    nombre: nodoCaja(e.nombre, s, ox, oy),
    lectura: nodoCaja(e.lectura, s, ox, oy),
  }));
  const tramos = g.tramos.map((t) => escalarTramo(t, s, ox, oy));
  const bateria: BateriaColocada = {
    cx: bateriaU.cx * s + ox,
    yMas: bateriaU.yMas * s + oy,
    yMenos: bateriaU.yMenos * s + oy,
    caja: nodoCaja(bateriaU.caja, s, ox, oy),
    rotulo: { x: bateriaU.rotulo.x * s + ox, y: bateriaU.rotulo.y * s + oy },
  };

  return {
    ancho,
    alto,
    s,
    fuente: FUENTE_U * s,
    nivel,
    compacto: nivel !== "completo",
    banda: nivel !== "completo" ? { x: 0, y: 0, w: ancho, h: banda } : null,
    fuenteMin,
    elementos,
    tramos,
    bateria,
    caja: { x: ox, y: oy, w: wU * s, h: hU * s },
  };
}

// ---------------------------------------------------------------- utilidades de consulta
/** Nodo del netlist al que pertenece un tramo (resuelve `ref` contra los elementos reales). */
export function nodoDeRef(net: Netlist, ref: RefNodo): number {
  const el = net.elementos.find((x) => x.id === ref.el);
  if (!el) return 0;
  return ref.lado === "a" ? el.a : el.b;
}

/** Punto a distancia `dist` [px] a lo largo del polilínea del tramo. */
export function puntoEnTramo(t: Tramo, dist: number, out: { x: number; y: number } = { x: 0, y: 0 }): { x: number; y: number } {
  let d = Math.max(0, Math.min(t.longitud, dist));
  const p = t.puntos;
  for (let k = 0; k + 3 < p.length; k += 2) {
    const l = Math.hypot(p[k + 2] - p[k], p[k + 3] - p[k + 1]);
    if (d <= l || k + 4 >= p.length) {
      const f = l > 0 ? Math.min(1, d / l) : 0;
      out.x = p[k] + (p[k + 2] - p[k]) * f;
      out.y = p[k + 1] + (p[k + 3] - p[k + 1]) * f;
      return out;
    }
    d -= l;
  }
  out.x = p[p.length - 2];
  out.y = p[p.length - 1];
  return out;
}

export interface ImpactoTramo {
  tramo: Tramo;
  /** Posición normalizada a lo largo del tramo [0, 1]. */
  t: number;
  /** Distancia del puntero al tramo [px]. */
  distancia: number;
}

/** Tramo más cercano al punto (x, y) dentro de `radio` [px]; null si ninguno. */
export function tramoCercano(geom: GeometriaCircuito, x: number, y: number, radio: number): ImpactoTramo | null {
  let mejor: ImpactoTramo | null = null;
  for (const tramo of geom.tramos) {
    const p = tramo.puntos;
    let acumulado = 0;
    for (let k = 0; k + 3 < p.length; k += 2) {
      const ax = p[k];
      const ay = p[k + 1];
      const dx = p[k + 2] - ax;
      const dy = p[k + 3] - ay;
      const l2 = dx * dx + dy * dy;
      const l = Math.sqrt(l2);
      const u = l2 > 0 ? Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / l2)) : 0;
      const d = Math.hypot(x - (ax + u * dx), y - (ay + u * dy));
      if (d <= radio && (mejor === null || d < mejor.distancia)) {
        mejor = { tramo, t: tramo.longitud > 0 ? (acumulado + u * l) / tramo.longitud : 0, distancia: d };
      }
      acumulado += l;
    }
  }
  return mejor;
}
