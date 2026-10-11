import { describe, expect, it } from "vitest";
import { arbolANetlist, contarHojas, equivalente, hojas, normalizar, repartoAnalitico } from "./arbol";
import { cargaNetaNodo, lecturasElementos, nodosAislados, potenciaBateria, potenciaResistores, sumaKCL } from "./lecturas";
import { resolverDC } from "./mna";
import { reducirPasoAPaso } from "./reduccion";
import { pasoTemporal, tauRC, Transitorio } from "./transitorio";
import type { Bloque } from "./tipos";

/** PRNG determinista (mulberry32). */
function prng(semilla: number) {
  let a = semilla >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function arbolAleatorio(rnd: () => number, minV: number, maxV: number, prefijo: "R" | "C"): Bloque {
  const n = 1 + Math.floor(rnd() * 6);
  const valor = () => Math.exp(Math.log(minV) + rnd() * (Math.log(maxV) - Math.log(minV)));
  const gen = (m: number, tipo: "s" | "p"): Bloque => {
    if (m === 1) return { t: "e", id: "x", valor: valor() };
    const k = Math.min(m, 2 + Math.floor(rnd() * 2));
    const partes = new Array<number>(k).fill(1);
    for (let r = m - k; r > 0; r--) partes[Math.floor(rnd() * k)]++;
    return { t: tipo, hijos: partes.map((q) => gen(q, tipo === "s" ? "p" : "s")) };
  };
  return normalizar(gen(n, rnd() < 0.5 ? "s" : "p"), prefijo);
}

const N = 200;

describe("árboles aleatorios (semilla fija)", () => {
  const rnd = prng(20261011);
  const arboles = Array.from({ length: N }, () => arbolAleatorio(rnd, 10, 1e4, "R"));

  it("el generador produce 1–6 hojas con variedad de tamaños", () => {
    const tam = new Set(arboles.map(contarHojas));
    expect(Math.min(...tam)).toBeGreaterThanOrEqual(1);
    expect(Math.max(...tam)).toBeLessThanOrEqual(6);
    expect(tam.size).toBeGreaterThanOrEqual(5);
  });

  it("R_eq: MNA = analítico = reducción paso a paso, rel < 1e-12 (criterio 5)", () => {
    for (const a of arboles) {
      const net = arbolANetlist(a, { modo: "dc", E: 12 });
      const r = resolverDC(net);
      const reqMna = 12 / r.iBat;
      const req = equivalente(a, "R");
      const red = reducirPasoAPaso(a, "R").equivalente;
      expect(Math.abs(reqMna - req) / req).toBeLessThan(1e-12);
      expect(Math.abs(red - req) / req).toBeLessThan(1e-12);
    }
  });

  it("KCL en todos los nodos, balance de potencia y Ohm (criterios 1, 3, 6)", () => {
    for (const a of arboles) {
      for (const rInt of [0, 2]) {
        const net = arbolANetlist(a, { modo: "dc", E: 7, rInt });
        const r = resolverDC(net);
        for (let n = 0; n < net.nNodos; n++) expect(Math.abs(sumaKCL(net, r, n))).toBeLessThan(1e-9);
        const pb = potenciaBateria(net, r);
        expect(Math.abs(potenciaResistores(net, r) - pb) / pb).toBeLessThan(1e-9);
        const l = lecturasElementos(net, r);
        for (const el of net.elementos) if (el.tipo === "R") expect(l[el.id].v).toBeCloseTo(el.valor * r.i[el.id], 9);
      }
    }
  });

  it("reparto analítico (divisores) coincide con MNA en cada hoja", () => {
    for (const a of arboles) {
      const r = resolverDC(arbolANetlist(a, { modo: "dc", E: 12 }));
      const rep = repartoAnalitico(a, "R", 12);
      for (const h of hojas(a)) {
        expect(Math.abs(r.i[h.id] - rep[h.id].i)).toBeLessThan(1e-12 + 1e-9 * Math.abs(rep[h.id].i));
      }
    }
  });
});

describe("redes de capacitores aleatorias (semilla fija)", () => {
  const rnd = prng(7);
  const arboles = Array.from({ length: 60 }, () => arbolAleatorio(rnd, 1e-6, 1e-3, "C"));

  it("C_eq: analítico = reducción; τ y paso consistentes", () => {
    for (const a of arboles) {
      const ceq = equivalente(a, "C");
      expect(Math.abs(reducirPasoAPaso(a, "C").equivalente - ceq) / ceq).toBeLessThan(1e-12);
      expect(pasoTemporal(tauRC(a, 1000))).toBeCloseTo((1000 * ceq) / 200, 18);
    }
  });

  it("transitorio: tras 12τ cada V_i = reparto capacitivo, nodos aislados neutros y KCL en cada paso", () => {
    for (const a of arboles.slice(0, 25)) {
      const net = arbolANetlist(a, { modo: "cargar", E: 12, rCarga: 1000 });
      const tau = tauRC(a, 1000);
      const sim = new Transitorio(net, pasoTemporal(tau));
      const pasos = 12 * 200;
      for (let k = 0; k < pasos; k++) {
        const r = sim.paso();
        if (k % 150 === 0) for (let n = 0; n < net.nNodos; n++) expect(Math.abs(sumaKCL(net, r, n))).toBeLessThan(1e-9);
      }
      const rep = repartoAnalitico(a, "C", 12);
      const qTot = equivalente(a, "C") * 12;
      for (const h of hojas(a)) expect(Math.abs(sim.estado[h.id] - rep[h.id].v)).toBeLessThan(1e-4 * 12);
      for (const n of nodosAislados(net)) {
        expect(Math.abs(cargaNetaNodo(net, sim.estado, n))).toBeLessThan(1e-9 * qTot);
      }
    }
  });
});
