import { describe, expect, it } from "vitest";
import { arbolANetlist, e, paralelo, serie } from "./arbol";
import { I_CERO, I_PARADA, cargasEnPlaca, esCorrienteNula, factorTiempo, iReferenciaE6, tauVisual, V_MAX_PX, velocidadParticula } from "./escalas";
import {
  corrienteBarra,
  interpolarCuerpo,
  lecturaSondaCable,
  lecturasElementos,
  sumaKCL,
} from "./lecturas";
import { resolverDC } from "./mna";
import { netlistPresetE6, PRESETS_E6 } from "./presets";
import { pasoTemporal, tauRC, Transitorio } from "./transitorio";

describe("escala de tiempo (criterio 14)", () => {
  it("ejemplos de la spec: 0,1 s ⇒ 3,0 s (F = 30) y 10 µs ⇒ 1,0 s", () => {
    expect(tauVisual(0.1)).toBeCloseTo(3, 12);
    expect(factorTiempo(0.1)).toBeCloseTo(30, 9);
    expect(tauVisual(10e-6)).toBeCloseTo(1, 12);
    expect(factorTiempo(10e-6)).toBeCloseTo(1e5, 3);
  });
  it("monótona creciente en τ_real y acotada a [0,5; 4] s (con clamp fuera de rango)", () => {
    let prev = -Infinity;
    for (let x = -9; x <= 3; x += 0.1) {
      const t = tauVisual(10 ** x);
      expect(t).toBeGreaterThanOrEqual(prev);
      expect(t).toBeGreaterThanOrEqual(0.5);
      expect(t).toBeLessThanOrEqual(4);
      prev = t;
    }
    expect(tauVisual(1.7e-6)).toBeGreaterThan(0.5);
    expect(tauVisual(10)).toBeCloseTo(4, 12);
  });
});

describe("velocidad de partículas (criterio 13)", () => {
  it("E6: proporcional a I sobre el suelo, signo = signo de I, mínimo visible", () => {
    const iRef = 6e-3;
    const v1 = velocidadParticula(3e-3, iRef);
    const v2 = velocidadParticula(1.5e-3, iRef);
    expect(v1 / v2).toBeCloseTo(2, 12);
    expect(velocidadParticula(iRef, iRef)).toBeCloseTo(V_MAX_PX, 12);
    expect(velocidadParticula(-3e-3, iRef)).toBe(-v1);
    expect(velocidadParticula(1e-6, iRef)).toBeCloseTo(0.04 * V_MAX_PX, 12); // suelo del 4 %
  });
  it("umbral único: I_PARADA = I_CERO = 1 nA para partículas y para «≈ 0»", () => {
    expect(I_PARADA).toBe(I_CERO);
    expect(I_CERO).toBe(1e-9);
    expect(esCorrienteNula(5e-10)).toBe(true);
    expect(esCorrienteNula(-2e-9)).toBe(false);
    expect(velocidadParticula(5e-10, 6e-3)).toBe(0);
    expect(velocidadParticula(2e-9, 6e-3)).not.toBe(0);
  });
  it("|I| < umbral ⇒ se detienen (Wheatstone equilibrado)", () => {
    const eq = PRESETS_E6.find((p) => p.id === "wheatstoneEq")!;
    const net = netlistPresetE6(eq);
    const r = resolverDC(net);
    expect(velocidadParticula(r.i.R5, iReferenciaE6(net, r))).toBe(0);
    expect(velocidadParticula(r.i.R1, iReferenciaE6(net, r))).toBeGreaterThan(0);
  });
  it("lineal con I_ref común: KCL 2:1 ⇒ velocidades 2:1 (escalera)", () => {
    const esc = PRESETS_E6.find((p) => p.id === "escalera")!;
    const net = netlistPresetE6(esc);
    const r = resolverDC(net);
    const iRef = iReferenciaE6(net, r);
    expect(iRef).toBeCloseTo(6e-3, 9);
    const f = (id: string) => velocidadParticula(r.i[id], iRef);
    expect(f("R1") / f("R2")).toBeCloseTo(2, 9);
    expect(f("R3") / f("R4")).toBeCloseTo(2, 9);
  });
  it("E7: sin suelo y v(t)/v(0) = e^{−t/τ}", () => {
    const arbol = serie(e("C1", 200e-6), e("C2", 400e-6), e("C3", 400e-6));
    const tau = tauRC(arbol, 1000);
    const s = new Transitorio(arbolANetlist(arbol, { modo: "cargar", E: 12, rCarga: 1000 }), pasoTemporal(tau));
    const iRef = 12 / 1000;
    const v = (k: number) => {
      for (let j = 0; j < k; j++) s.paso();
      return velocidadParticula(s.ultimo.iBat, iRef, 0);
    };
    const v1 = v(1);
    for (let k = 1; k < 200; k++) s.paso();
    const vTau = velocidadParticula(s.ultimo.iBat, iRef, 0);
    expect(Math.abs(vTau / v1 - Math.exp(-1))).toBeLessThan(0.01);
    for (let k = 0; k < 800; k++) s.paso();
    const v5 = velocidadParticula(s.ultimo.iBat, iRef, 0);
    expect(v5).toBeLessThan(0.0072 * V_MAX_PX);
    expect(v5).toBeLessThan(0.04 * V_MAX_PX); // un E6 con suelo seguiría moviéndose; E7 se frena
  });
  it("cargas en placa: round(8·|Q|/Q_ref), mínimo 1 si > 1 %", () => {
    expect(cargasEnPlaca(1.2e-3, 1.2e-3)).toBe(8);
    expect(cargasEnPlaca(-0.6e-3, 1.2e-3)).toBe(4);
    expect(cargasEnPlaca(0.02 * 1.2e-3, 1.2e-3)).toBe(1);
    expect(cargasEnPlaca(0.005 * 1.2e-3, 1.2e-3)).toBe(0);
  });
});

describe("sonda (criterio 16)", () => {
  const esc = PRESETS_E6.find((p) => p.id === "serieParalelo")!; // s(p(R1,R2),R3)
  const net = netlistPresetE6(esc);
  const r = resolverDC(net);

  it("V en un tramo de cable = potencial de su nodo; corriente del tramo en serie con signo", () => {
    // nodo 1 = borne +: 12 V; entre el bloque paralelo y R3 el nodo 2 = 6 V.
    const s1 = lecturaSondaCable(r, 1, [{ id: "V", signo: -1 }]);
    expect(s1.v).toBeCloseTo(12, 12);
    expect(s1.i).toBeCloseTo(6e-3, 12);
    const s2 = lecturaSondaCable(r, 2, [{ id: "R3", signo: 1 }]);
    expect(s2.v).toBeCloseTo(6, 12);
    expect(lecturaSondaCable(r, 2, [{ id: "R3", signo: -1 }]).iAbs).toBeCloseTo(6e-3, 12);
  });

  it("barra paralela: corriente acumulada final = 0 (KCL) y parcial = lo que falta", () => {
    const entra = [{ id: "V", signo: -1 as const }];
    const r1 = [{ id: "R1", signo: 1 as const }];
    const r2 = [{ id: "R2", signo: 1 as const }];
    expect(corrienteBarra(r, entra, [])).toBeCloseTo(6e-3, 12);
    expect(corrienteBarra(r, entra, [r1])).toBeCloseTo(3e-3, 12);
    expect(Math.abs(corrienteBarra(r, entra, [r1, r2]))).toBeLessThan(1e-12);
  });

  it("KCL con 6 ramas en paralelo y barra acumulada final 0", () => {
    const arbol = paralelo(...[1, 2, 3, 4, 5, 6].map((k) => e(`R${k}`, 100 * k)));
    const n = arbolANetlist(arbol, { modo: "dc", E: 12 });
    const rr = resolverDC(n);
    const ramas = [1, 2, 3, 4, 5, 6].map((k) => [{ id: `R${k}`, signo: 1 as const }]);
    expect(Math.abs(corrienteBarra(rr, [{ id: "V", signo: -1 }], ramas))).toBeLessThan(1e-12);
    expect(Math.abs(sumaKCL(n, rr, 1))).toBeLessThan(1e-12);
  });

  it("cuerpo de un resistor: V lineal entre terminales; el capacitor igual (campo uniforme)", () => {
    const l = lecturasElementos(net, r).R3;
    expect(interpolarCuerpo(r.v[2], r.v[0], 0)).toBeCloseTo(6, 12);
    expect(interpolarCuerpo(r.v[2], r.v[0], 1)).toBeCloseTo(0, 12);
    expect(interpolarCuerpo(r.v[2], r.v[0], 0.5)).toBeCloseTo(l.v / 2, 12);
    expect(interpolarCuerpo(10, 0, 2)).toBe(0); // s se acota a [0,1]
  });
});
