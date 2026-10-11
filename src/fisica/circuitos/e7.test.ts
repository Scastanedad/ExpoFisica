import { describe, expect, it } from "vitest";
import { arbolANetlist, e, equivalente, estadoCargado, hojas, paralelo, serie } from "./arbol";
import { cargaNetaNodo, lecturasElementos, nodosAislados, sumaKCL } from "./lecturas";
import { PRESETS_E7 } from "./presets";
import {
  analitico,
  pasoTemporal,
  tauRC,
  Transitorio,
  transitorioDeArbol,
  transitorioDesde,
} from "./transitorio";
import type { Bloque } from "./tipos";

const NET = (arbol: Bloque, modo: "cargar" | "descargar" | "abierto", rCarga = 1000, rInt = 0) =>
  arbolANetlist(arbol, { modo, E: 12, rCarga, rInt });

describe.each(PRESETS_E7)("E7 carga desde 0: $nombre", (p) => {
  const tau = tauRC(p.arbol, p.rCarga);
  const h = pasoTemporal(tau);
  const net = NET(p.arbol, "cargar", p.rCarga);
  const sim = new Transitorio(net, h);

  it("τ = R·C_eq = 0,1 s y C_eq = 100 µF", () => {
    expect(equivalente(p.arbol, "C")).toBeCloseTo(p.cEq, 18);
    expect(tau).toBeCloseTo(0.1, 12);
  });

  it("I(0⁺) = E/R (rel 0,5 %, primer paso)", () => {
    const r = sim.paso();
    expect(Math.abs(r.iBat - 12 / p.rCarga) / (12 / p.rCarga)).toBeLessThan(0.005);
    expect(r.i.Rc).toBeCloseTo(r.iBat, 12);
  });

  it("curva: V_C(τ)/E = 0,632 ± 0,003, V_i(t)/V_i(∞) igual para todos y = 1−e^{−t/τ} (criterio 7)", () => {
    const s = new Transitorio(net, h);
    const ids = hojas(p.arbol).map((x) => x.id);
    for (let k = 1; k <= 200; k++) {
      s.paso();
      if (k % 20 === 0) {
        const f = ids.map((id) => s.estado[id] / p.final[id].v);
        expect(Math.max(...f) - Math.min(...f)).toBeLessThan(1e-9);
        expect(Math.abs(f[0] - (1 - Math.exp(-s.t / tau)))).toBeLessThan(0.003);
      }
    }
    // V_C equivalente: carga total / C_eq
    const qTot = p.cEq * 12 * (1 - Math.exp(-1));
    const vC = 12 - 1000 * s.ultimo.iBat; // V_C = E − R·I
    expect(Math.abs(vC / 12 - 0.632)).toBeLessThan(0.003);
    expect(qTot).toBeGreaterThan(0);
  });

  it("I(5τ)/I(0) < 1 %, y al final reparte como la tabla de la spec", () => {
    const s = new Transitorio(net, h);
    const i0 = s.paso().iBat;
    for (let k = 1; k < 1000; k++) s.paso();
    expect(s.ultimo.iBat / i0).toBeLessThan(0.01);
    for (let k = 1000; k < 3000; k++) s.paso(); // 15τ
    for (const [id, f] of Object.entries(p.final)) {
      const l = lecturasElementos(net, s.ultimo)[id];
      expect(Math.abs(l.v - f.v)).toBeLessThan(1e-3);
      expect(Math.abs(l.q - f.q) / f.q).toBeLessThan(1e-3);
    }
  });

  it("serie: misma Q; nodos internos aislados con carga neta 0 durante y después de la carga (criterio 8)", () => {
    const s = new Transitorio(net, h);
    const aislados = nodosAislados(net);
    for (let k = 0; k < 300; k++) {
      s.paso();
      for (const n of aislados) expect(Math.abs(cargaNetaNodo(net, s.estado, n))).toBeLessThan(1e-9 * 1.2e-3);
    }
    if (p.id === "serie3") {
      const q = ["C1", "C2", "C3"].map((id) => lecturasElementos(net, s.ultimo)[id].q);
      expect(Math.abs(q[0] - q[1]) / q[0]).toBeLessThan(1e-9);
      expect(Math.abs(q[1] - q[2]) / q[1]).toBeLessThan(1e-9);
    }
  });

  it("KCL en todos los nodos durante la carga (criterio 1)", () => {
    const s = new Transitorio(net, h);
    for (let k = 0; k < 100; k++) {
      const r = s.paso();
      for (let n = 0; n < net.nNodos; n++) expect(Math.abs(sumaKCL(net, r, n))).toBeLessThan(1e-9);
    }
  });
});

describe.each(PRESETS_E7)("E7 descarga y energía: $nombre", (p) => {
  const tau = tauRC(p.arbol, p.rCarga);
  const h = pasoTemporal(tau);
  const netC = NET(p.arbol, "cargar", p.rCarga);
  const netD = NET(p.arbol, "descargar", p.rCarga);

  it("balance de energía en carga: E_bat = C·E², E_R = U_C = ½C·E² (±1 %) (criterio 10)", () => {
    const s = new Transitorio(netC, h);
    for (let k = 0; k < 2400; k++) s.paso(); // 12τ
    const cE2 = p.cEq * 144;
    expect(Math.abs(s.eBateria / cE2 - 1)).toBeLessThan(0.01);
    expect(Math.abs(s.eDisipada / (0.5 * cE2) - 1)).toBeLessThan(0.01);
    expect(Math.abs(s.uAlmacenada() / (0.5 * cE2) - 1)).toBeLessThan(0.01);
    // E·I = I²R + dU/dt en cada paso se cumple salvo el defecto O(h) de Euler: acumulado < 1 %.
    expect(Math.abs(s.eBateria - s.eDisipada - s.uAlmacenada()) / cE2).toBeLessThan(0.01);
  });

  it("independiente de R: la energía disipada es ½CE² con R = 100 Ω y 10 kΩ", () => {
    for (const R of [100, 1e4]) {
      const s = new Transitorio(NET(p.arbol, "cargar", R), pasoTemporal(tauRC(p.arbol, R)));
      for (let k = 0; k < 2400; k++) s.paso();
      expect(Math.abs(s.eDisipada / (0.5 * p.cEq * 144) - 1)).toBeLessThan(0.01);
    }
  });

  it("descarga desde estado cargado: I(0⁺) = −E/R, ∫I dt = −Q, V_C(τ)=0,368 E, disipa ½CE² (criterio 9)", () => {
    const s = new Transitorio(netD, h, estadoCargado(p.arbol, 12));
    const r0 = s.paso();
    expect(r0.iBat).toBeLessThan(0);
    expect(Math.abs(r0.iBat + 12 / p.rCarga) / (12 / p.rCarga)).toBeLessThan(0.005);
    let integral = r0.iBat * h;
    const u0 = 0.5 * p.cEq * 144;
    let vCtau = 0;
    for (let k = 1; k < 2400; k++) {
      const r = s.paso();
      integral += r.iBat * h;
      if (k === 199) vCtau = -p.rCarga * r.iBat; // V_C = −R·I (E = 0)
    }
    expect(Math.abs(integral / (-p.cEq * 12) - 1)).toBeLessThan(0.005);
    expect(Math.abs(vCtau / 12 - 0.368)).toBeLessThan(0.003);
    expect(Math.abs(s.eDisipada / u0 - 1)).toBeLessThan(0.01);
    expect(s.eBateria).toBeCloseTo(0, 18);
    expect(s.uAlmacenada() / u0).toBeLessThan(1e-4);
  });

  it("descarga parcial: nodos internos aislados siguen neutros (criterio 8)", () => {
    const s = new Transitorio(netD, h, estadoCargado(p.arbol, 12));
    for (let k = 0; k < 120; k++) s.paso();
    for (const n of nodosAislados(netD)) expect(Math.abs(cargaNetaNodo(netD, s.estado, n))).toBeLessThan(1e-9 * 1.2e-3);
  });
});

describe("transitorio: otras propiedades", () => {
  const arbol = serie(e("C1", 200e-6), e("C2", 400e-6), e("C3", 400e-6));
  const tau = tauRC(arbol, 1000);
  const net = NET(arbol, "cargar");

  it("coincide con la solución analítica de V_C(t) e I(t)", () => {
    const h = pasoTemporal(tau);
    const s = new Transitorio(net, h);
    for (let k = 1; k <= 400; k++) {
      s.paso();
      const i = analitico.iCarga(s.t, 12, 0, 1000, tau);
      expect(Math.abs(s.ultimo.iBat - i) / (12 / 1000)).toBeLessThan(0.006);
    }
  });

  it("convergencia de orden 1: h/2 reduce el error de V_C(τ) ≈ 2× (criterio 11)", () => {
    const err = (div: number) => {
      const h = tau / div;
      const s = new Transitorio(net, h);
      for (let k = 0; k < div; k++) s.paso();
      const vC = 12 - 1000 * s.ultimo.iBat;
      return Math.abs(vC - analitico.vCarga(tau, 12, 0, tau));
    };
    const r1 = err(100) / err(200);
    const r2 = err(200) / err(400);
    expect(r1).toBeGreaterThan(1.8);
    expect(r1).toBeLessThan(2.2);
    expect(r2).toBeGreaterThan(1.8);
    expect(r2).toBeLessThan(2.2);
  });

  it("h = τ es estable: sin oscilaciones, V_C monótono creciente y nunca > E", () => {
    const s = new Transitorio(net, tau);
    let prev = 0;
    for (let k = 0; k < 30; k++) {
      const r = s.paso();
      const vC = 12 - 1000 * r.iBat;
      expect(vC).toBeGreaterThanOrEqual(prev - 1e-12);
      expect(vC).toBeLessThanOrEqual(12 + 1e-9);
      expect(r.iBat).toBeGreaterThan(0);
      prev = vC;
    }
  });

  it("batería real: τ = (R + r_int)·C_eq y sin pérdida de KCL", () => {
    const n2 = NET(arbol, "cargar", 1000, 2);
    const t2 = tauRC(arbol, 1000, 2);
    expect(t2).toBeCloseTo(1002 * 100e-6, 15);
    const s = new Transitorio(n2, pasoTemporal(t2));
    for (let k = 0; k < 200; k++) s.paso();
    for (let n = 0; n < n2.nNodos; n++) expect(Math.abs(sumaKCL(n2, s.ultimo, n))).toBeLessThan(1e-9);
  });

  it("interruptor Abierto: se congela el estado, I = 0 y el tiempo no avanza", () => {
    const s = transitorioDeArbol(arbol, { modo: "cargar", E: 12, rCarga: 1000 });
    for (let k = 0; k < 100; k++) s.paso();
    const v = { ...s.estado };
    const t = s.t;
    s.abierto = true;
    for (let k = 0; k < 50; k++) expect(s.paso().iBat).toBe(0);
    expect(s.estado).toEqual(v);
    expect(s.t).toBe(t);
    expect(s.avanzar(1)).toBe(0);
    const ab = transitorioDeArbol(arbol, { modo: "abierto", E: 12, rCarga: 1000 }, s);
    expect(ab.abierto).toBe(true);
    expect(ab.estado).toEqual(v);
  });

  it("avanzar usa paso fijo con acumulador", () => {
    const s = new Transitorio(net, 0.001);
    expect(s.avanzar(0.0025)).toBe(2);
    expect(s.avanzar(0.0006)).toBe(1); // 0,0005 + 0,0006 ≥ 0,001
    expect(s.pasos).toBe(3);
  });
});

describe("reinicio al editar (criterio 12)", () => {
  const arbol = paralelo(e("C1", 100e-6), e("C2", 200e-6));
  const tau = tauRC(arbol, 1000);
  const h = pasoTemporal(tau);
  const base = () => {
    const s = new Transitorio(NET(arbol, "cargar"), h);
    for (let k = 0; k < 150; k++) s.paso();
    return s;
  };

  it("cambiar E, R_carga, r_int o el interruptor conserva v_ab de cada C", () => {
    const s = base();
    const e1 = { ...s.estado };
    expect(Object.values(e1).every((v) => v > 0)).toBe(true);
    const cambios = [
      arbolANetlist(arbol, { modo: "cargar", E: 5, rCarga: 1000 }),
      arbolANetlist(arbol, { modo: "cargar", E: 12, rCarga: 470 }),
      arbolANetlist(arbol, { modo: "cargar", E: 12, rCarga: 1000, rInt: 2 }),
      arbolANetlist(arbol, { modo: "descargar", E: 12, rCarga: 1000 }),
    ];
    for (const n of cambios) expect(transitorioDesde(s, n, h).estado).toEqual(e1);
  });

  it("cambiar un C o la topología deja v_ab = 0 en todos", () => {
    const s = base();
    const otroC = paralelo(e("C1", 100e-6), e("C2", 300e-6));
    const otraTopo = serie(e("C1", 100e-6), e("C2", 200e-6));
    for (const a of [otroC, otraTopo]) {
      const n = transitorioDesde(s, NET(a, "cargar"), h);
      expect(Object.values(n.estado).every((v) => v === 0)).toBe(true);
      expect(Object.keys(n.estado).length).toBe(2);
    }
  });
});
