/**
 * Catálogo de presets E6/E7 (spec E6-E7-circuitos-presets §1-§2) con los valores esperados de la
 * spec (los tests los comprueban) y los lazos explícitos para la prueba de KVL (criterio 2).
 * Todos con E = 12 V y batería ideal.
 */
import { arbolANetlist, e, netlistWheatstone, paralelo, serie } from "./arbol";
import type { Bloque, Netlist } from "./tipos";

export const E_DEFECTO = 12;
export const R_CARGA_DEFECTO = 1000;

/** Lazo: Σ signo·i_ab·R de los elementos = fem (E si el lazo pasa por la batería, 0 si no). */
export interface LazoKVL {
  terminos: { id: string; signo: 1 | -1 }[];
  fem: number;
}

export interface PresetE6 {
  id: string;
  nombre: string;
  E: number;
  /** Serie-paralelo (presets 1-5). El puente no tiene árbol. */
  arbol?: Bloque;
  puente?: { R1: number; R2: number; R3: number; R4: number; R5: number };
  esperado: {
    rEq: number;
    iBat: number;
    /** i_ab de cada resistor [A]. */
    i: Record<string, number>;
    /** Potenciales esperados (solo puente). */
    vNodos?: { A: number; B: number };
  };
  lazos: LazoKVL[];
}

const mA = 1e-3;
const k = 1e3;
const lz = (fem: number, ...t: [string, 1 | -1][]): LazoKVL => ({
  fem,
  terminos: t.map(([id, signo]) => ({ id, signo })),
});

const PUENTE_BASE = { R1: 1 * k, R2: 2 * k, R3: 1.5 * k, R4: 3 * k, R5: 4.7 * k };
const LAZOS_PUENTE = (E: number): LazoKVL[] => [
  lz(E, ["R1", 1], ["R2", 1]),
  lz(E, ["R3", 1], ["R4", 1]),
  lz(E, ["R1", 1], ["R5", 1], ["R4", 1]),
  lz(E, ["R3", 1], ["R5", -1], ["R2", 1]),
  lz(0, ["R1", 1], ["R5", 1], ["R3", -1]),
];

export const PRESETS_E6: PresetE6[] = [
  {
    id: "serie3",
    nombre: "3 en serie",
    E: 12,
    arbol: serie(e("R1", 1 * k), e("R2", 2 * k), e("R3", 3 * k)),
    esperado: { rEq: 6 * k, iBat: 2 * mA, i: { R1: 2 * mA, R2: 2 * mA, R3: 2 * mA } },
    lazos: [lz(12, ["R1", 1], ["R2", 1], ["R3", 1])],
  },
  {
    id: "paralelo3",
    nombre: "3 en paralelo",
    E: 12,
    arbol: paralelo(e("R1", 2 * k), e("R2", 2 * k), e("R3", 4 * k)),
    esperado: { rEq: 800, iBat: 15 * mA, i: { R1: 6 * mA, R2: 6 * mA, R3: 3 * mA } },
    lazos: [lz(12, ["R1", 1]), lz(0, ["R1", 1], ["R2", -1]), lz(0, ["R2", 1], ["R3", -1])],
  },
  {
    id: "serieParalelo",
    nombre: "Serie + paralelo (2‖2 + 1)",
    E: 12,
    arbol: serie(paralelo(e("R1", 2 * k), e("R2", 2 * k)), e("R3", 1 * k)),
    esperado: { rEq: 2 * k, iBat: 6 * mA, i: { R1: 3 * mA, R2: 3 * mA, R3: 6 * mA } },
    lazos: [lz(12, ["R1", 1], ["R3", 1]), lz(12, ["R2", 1], ["R3", 1]), lz(0, ["R1", 1], ["R2", -1])],
  },
  {
    id: "escalera",
    nombre: "Escalera R-2R",
    E: 12,
    arbol: serie(
      e("R1", 1 * k),
      paralelo(e("R2", 2 * k), serie(e("R3", 1 * k), paralelo(e("R4", 2 * k), e("R5", 2 * k)))),
    ),
    esperado: {
      rEq: 2 * k,
      iBat: 6 * mA,
      i: { R1: 6 * mA, R2: 3 * mA, R3: 3 * mA, R4: 1.5 * mA, R5: 1.5 * mA },
    },
    lazos: [
      lz(12, ["R1", 1], ["R2", 1]),
      lz(12, ["R1", 1], ["R3", 1], ["R4", 1]),
      lz(12, ["R1", 1], ["R3", 1], ["R5", 1]),
      lz(0, ["R4", 1], ["R5", -1]),
      lz(0, ["R2", 1], ["R4", -1], ["R3", -1]),
    ],
  },
  {
    id: "mixto6",
    nombre: "Mixto de 6",
    E: 12,
    arbol: serie(
      paralelo(e("R1", 3 * k), e("R2", 6 * k)),
      paralelo(serie(e("R3", 2 * k), e("R4", 4 * k)), e("R5", 6 * k)),
      e("R6", 1 * k),
    ),
    esperado: {
      rEq: 6 * k,
      iBat: 2 * mA,
      i: { R1: (4 / 3) * mA, R2: (2 / 3) * mA, R3: 1 * mA, R4: 1 * mA, R5: 1 * mA, R6: 2 * mA },
    },
    lazos: [
      lz(12, ["R1", 1], ["R3", 1], ["R4", 1], ["R6", 1]),
      lz(12, ["R2", 1], ["R5", 1], ["R6", 1]),
      lz(12, ["R1", 1], ["R5", 1], ["R6", 1]),
      lz(0, ["R1", 1], ["R2", -1]),
      lz(0, ["R5", 1], ["R4", -1], ["R3", -1]),
    ],
  },
  {
    id: "wheatstoneEq",
    nombre: "Puente de Wheatstone equilibrado",
    E: 12,
    puente: { ...PUENTE_BASE },
    esperado: {
      rEq: 1.8 * k,
      iBat: 6.6667 * mA,
      i: { R1: 4 * mA, R2: 4 * mA, R3: (8 / 3) * mA, R4: (8 / 3) * mA, R5: 0 },
      vNodos: { A: 8, B: 8 },
    },
    lazos: LAZOS_PUENTE(12),
  },
  {
    id: "wheatstoneDes",
    nombre: "Puente de Wheatstone desequilibrado",
    E: 12,
    puente: { ...PUENTE_BASE, R4: 4.5 * k },
    esperado: {
      rEq: 1.99573 * k,
      iBat: 6.0128 * mA,
      i: { R1: 3.897 * mA, R2: 4.051 * mA, R3: 2.116 * mA, R4: 1.961 * mA, R5: -0.154 * mA },
      vNodos: { A: 8.1027, B: 8.8267 },
    },
    lazos: LAZOS_PUENTE(12),
  },
];

/** Netlist de un preset E6 (con r_int opcional). */
export function netlistPresetE6(p: PresetE6, rInt = 0, E: number = p.E): Netlist {
  if (p.puente) return netlistWheatstone(p.puente, E, rInt);
  return arbolANetlist(p.arbol as Bloque, { modo: "dc", E, rInt });
}

const uF = 1e-6;

export interface PresetE7 {
  id: string;
  nombre: string;
  E: number;
  rCarga: number;
  arbol: Bloque;
  /** C_eq = 100 µF en todos. */
  cEq: number;
  /** Reparto final (t ≫ τ): v [V] y q [C] de cada capacitor. */
  final: Record<string, { v: number; q: number }>;
}

export const PRESETS_E7: PresetE7[] = [
  {
    id: "serie3",
    nombre: "3 en serie",
    E: 12,
    rCarga: R_CARGA_DEFECTO,
    cEq: 100 * uF,
    arbol: serie(e("C1", 200 * uF), e("C2", 400 * uF), e("C3", 400 * uF)),
    final: { C1: { v: 6, q: 1.2e-3 }, C2: { v: 3, q: 1.2e-3 }, C3: { v: 3, q: 1.2e-3 } },
  },
  {
    id: "paralelo3",
    nombre: "3 en paralelo",
    E: 12,
    rCarga: R_CARGA_DEFECTO,
    cEq: 100 * uF,
    arbol: paralelo(e("C1", 20 * uF), e("C2", 30 * uF), e("C3", 50 * uF)),
    final: { C1: { v: 12, q: 240 * uF }, C2: { v: 12, q: 360 * uF }, C3: { v: 12, q: 600 * uF } },
  },
  {
    id: "serieParalelo",
    nombre: "Serie + paralelo (2‖2 + 1)",
    E: 12,
    rCarga: R_CARGA_DEFECTO,
    cEq: 100 * uF,
    arbol: serie(paralelo(e("C1", 100 * uF), e("C2", 100 * uF)), e("C3", 200 * uF)),
    final: { C1: { v: 6, q: 600 * uF }, C2: { v: 6, q: 600 * uF }, C3: { v: 6, q: 1.2e-3 } },
  },
  {
    id: "escalera",
    nombre: "Escalera",
    E: 12,
    rCarga: R_CARGA_DEFECTO,
    cEq: 100 * uF,
    arbol: serie(
      e("C1", 200 * uF),
      paralelo(e("C2", 100 * uF), serie(e("C3", 200 * uF), paralelo(e("C4", 100 * uF), e("C5", 100 * uF)))),
    ),
    final: {
      C1: { v: 6, q: 1.2e-3 },
      C2: { v: 6, q: 600 * uF },
      C3: { v: 3, q: 600 * uF },
      C4: { v: 3, q: 300 * uF },
      C5: { v: 3, q: 300 * uF },
    },
  },
  {
    id: "mixto6",
    nombre: "Mixto de 6",
    E: 12,
    rCarga: R_CARGA_DEFECTO,
    cEq: 100 * uF,
    arbol: serie(
      paralelo(e("C1", 100 * uF), e("C2", 200 * uF)),
      paralelo(serie(e("C3", 200 * uF), e("C4", 200 * uF)), e("C5", 200 * uF)),
      e("C6", 300 * uF),
    ),
    final: {
      C1: { v: 4, q: 400 * uF },
      C2: { v: 4, q: 800 * uF },
      C3: { v: 2, q: 400 * uF },
      C4: { v: 2, q: 400 * uF },
      C5: { v: 4, q: 800 * uF },
      C6: { v: 4, q: 1.2e-3 },
    },
  },
];
