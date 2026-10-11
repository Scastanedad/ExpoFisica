import { describe, expect, it } from "vitest";
import { arbolANetlist, e, equivalente, paralelo, serie } from "./arbol";
import { avisosPotencia, lecturasElementos, potenciaBateria, potenciaResistores, sumaKCL } from "./lecturas";
import { factorizar, resolverDC, resolverLineal } from "./mna";
import { netlistPresetE6, PRESETS_E6 } from "./presets";
import { ErrorCircuito, type Netlist } from "./tipos";

const R_DE = (net: Netlist, id: string) => net.elementos.find((x) => x.id === id)?.valor as number;

describe("MNA: álgebra lineal", () => {
  it("resuelve un sistema con cero en la diagonal (necesita pivoteo)", () => {
    const x = resolverLineal([0, 2, 1, 1], [4, 3], 2);
    expect(x[0]).toBeCloseTo(1, 12);
    expect(x[1]).toBeCloseTo(2, 12);
  });
  it("matriz singular lanza ErrorCircuito", () => {
    expect(() => factorizar([1, 2, 2, 4], 2)).toThrow(ErrorCircuito);
  });
  it("circuito con subred flotante (R sin camino a tierra) lanza ErrorCircuito", () => {
    const net: Netlist = {
      nNodos: 4,
      elementos: [
        { id: "V", tipo: "V", a: 1, b: 0, valor: 5 },
        { id: "R1", tipo: "R", a: 1, b: 0, valor: 100 },
        { id: "R2", tipo: "R", a: 2, b: 3, valor: 100 },
      ],
    };
    expect(() => resolverDC(net)).toThrow(ErrorCircuito);
  });
});

describe.each(PRESETS_E6)("E6 preset $nombre", (p) => {
  const net = netlistPresetE6(p);
  const r = resolverDC(net);

  it("R_eq e I_bat de la spec (criterio 3)", () => {
    expect(p.E / r.iBat).toBeCloseTo(p.esperado.rEq, 1);
    expect(r.iBat).toBeCloseTo(p.esperado.iBat, 6);
    if (p.arbol) expect(equivalente(p.arbol, "R")).toBeCloseTo(p.esperado.rEq, 9);
  });

  it("corriente de cada resistor igual a la tabla de la spec", () => {
    for (const [id, i] of Object.entries(p.esperado.i)) {
      expect(r.i[id], id).toBeCloseTo(i, 6);
    }
  });

  it("KCL en cada nodo |ΣI| < 1e-9 A (criterio 1)", () => {
    for (let n = 0; n < net.nNodos; n++) expect(Math.abs(sumaKCL(net, r, n))).toBeLessThan(1e-9);
  });

  it("KVL en lazos explícitos con I·R (criterio 2)", () => {
    for (const lazo of p.lazos) {
      const s = lazo.terminos.reduce((a, t) => a + t.signo * r.i[t.id] * R_DE(net, t.id), 0);
      expect(Math.abs(s - lazo.fem)).toBeLessThan(1e-9);
    }
  });

  it("balance de potencia ΣP = E·I_bat (rel < 1e-9) y P_i ≥ 0 y < 0,25 W", () => {
    const pb = potenciaBateria(net, r);
    expect(Math.abs(potenciaResistores(net, r) - pb) / pb).toBeLessThan(1e-9);
    const lect = lecturasElementos(net, r);
    for (const el of net.elementos) {
      if (el.tipo !== "R") continue;
      expect(lect[el.id].p).toBeGreaterThanOrEqual(0);
      expect(lect[el.id].p).toBeLessThan(0.25);
      expect(Math.abs(lect[el.id].v - el.valor * r.i[el.id])).toBeLessThan(1e-9); // Ohm
    }
    expect(avisosPotencia(net, r).resistorQuemado).toEqual([]);
  });

  it("escalado: duplicar E duplica todas las corrientes (criterio 6)", () => {
    const r2 = resolverDC(netlistPresetE6(p, 0, 2 * p.E));
    for (const el of net.elementos) expect(r2.i[el.id]).toBeCloseTo(2 * r.i[el.id], 12);
  });

  it("con batería real: V_t = E − r_int·I y ΣP + r_int·I² = E·I_bat (criterio 3)", () => {
    const netR = netlistPresetE6(p, 2);
    const rr = resolverDC(netR);
    expect(rr.v[1]).toBeCloseTo(p.E - 2 * rr.iBat, 9);
    const pb = potenciaBateria(netR, rr);
    expect(Math.abs(potenciaResistores(netR, rr) - pb) / pb).toBeLessThan(1e-9);
    expect(rr.i.r_int).toBeCloseTo(rr.iBat, 12);
    expect(rr.iBat).toBeLessThan(r.iBat);
  });
});

describe("Puente de Wheatstone (criterio 4)", () => {
  const eq = PRESETS_E6.find((p) => p.id === "wheatstoneEq")!;
  const des = PRESETS_E6.find((p) => p.id === "wheatstoneDes")!;

  it("equilibrado: I(R5) < 1e-12 A, V_A = V_B y R1/R2 = R3/R4", () => {
    const net = netlistPresetE6(eq);
    const r = resolverDC(net);
    expect(Math.abs(r.i.R5)).toBeLessThan(1e-12);
    expect(Math.abs(r.v[2] - r.v[3])).toBeLessThan(1e-9);
    expect(r.v[2]).toBeCloseTo(8, 9);
    expect(eq.puente!.R1 / eq.puente!.R2).toBeCloseTo(eq.puente!.R3 / eq.puente!.R4, 12);
  });

  it("desequilibrado: I(R5) = −0,1540 mA (±0,0001 mA), de B hacia A, V_A y V_B de la spec", () => {
    const r = resolverDC(netlistPresetE6(des));
    expect(Math.abs(r.i.R5 * 1e3 + 0.154)).toBeLessThan(1e-4);
    expect(r.i.R5).toBeLessThan(0); // a = A, b = B: negativo ⇒ de B a A
    expect(r.v[3]).toBeGreaterThan(r.v[2]); // fluye hacia el menor potencial (A)
    expect(r.v[2]).toBeCloseTo(8.1027, 3);
    expect(r.v[3]).toBeCloseTo(8.8267, 3);
    expect(12 / r.iBat).toBeCloseTo(1995.73, 1);
  });

  it("el cambio de orientación conserva la corriente (criterio 15): a=A, b=B", () => {
    const net = netlistPresetE6(des);
    const r5 = net.elementos.find((x) => x.id === "R5")!;
    expect([r5.a, r5.b]).toEqual([2, 3]);
  });
});

describe("Casos límite (spec criterios §3)", () => {
  it("corriente máxima: 6×10 Ω en paralelo a 12 V ⇒ 7,2 A, con aviso de pila real", () => {
    const arbol = paralelo(...[1, 2, 3, 4, 5, 6].map((k) => e(`R${k}`, 10)));
    const net = arbolANetlist(arbol, { modo: "dc", E: 12 });
    const r = resolverDC(net);
    expect(r.iBat).toBeCloseTo(7.2, 9);
    const av = avisosPotencia(net, r);
    expect(av.pilaReal).toBe(true);
    expect(av.resistorQuemado.length).toBe(6);
  });

  it("R extremas (conductancias 1000:1) mantienen KCL y balance", () => {
    const arbol = serie(paralelo(e("R1", 10), e("R2", 1e4)), e("R3", 1e4), paralelo(e("R4", 10), e("R5", 1e4)));
    const net = arbolANetlist(arbol, { modo: "dc", E: 12, rInt: 2 });
    const r = resolverDC(net);
    for (let n = 0; n < net.nNodos; n++) expect(Math.abs(sumaKCL(net, r, n))).toBeLessThan(1e-9);
    const pb = potenciaBateria(net, r);
    expect(Math.abs(potenciaResistores(net, r) - pb) / pb).toBeLessThan(1e-9);
  });

  it("resistor casi abierto (R = 1e12 Ω) en paralelo no altera el resto", () => {
    const net = arbolANetlist(paralelo(e("R1", 1000), e("R2", 1e12)), { modo: "dc", E: 12 });
    const r = resolverDC(net);
    expect(r.i.R1).toBeCloseTo(0.012, 12);
    expect(Math.abs(r.i.R2)).toBeLessThan(1e-10);
  });

  it("corto: R mínima (10 Ω) en serie con r_int sigue siendo finito", () => {
    const net = arbolANetlist(e("R1", 10), { modo: "dc", E: 12, rInt: 2 });
    expect(resolverDC(net).iBat).toBeCloseTo(1, 12);
  });
});
