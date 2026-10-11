import { describe, expect, it } from "vitest";
import {
  PRESETS_E7,
  R_CARGA_DEFECTO,
  sumaTerminos,
  tauRC,
  transitorioDeArbol,
  type Transitorio,
} from "../../fisica/circuitos";
import { distribuirCircuito } from "./distribucion";
import { estadoTransitorio } from "./estado";
import { corrientesTramos, crearParticulas, velocidadesTramos } from "./particulas";
import { leerSonda } from "./sonda";

const rect = { ancho: 960, alto: 540 };
const E = 12;

function cargar(p: (typeof PRESETS_E7)[number], factorTau: number): Transitorio {
  const t = transitorioDeArbol(p.arbol, { modo: "cargar", E, rCarga: R_CARGA_DEFECTO });
  t.avanzar(factorTau * tauRC(p.arbol, R_CARGA_DEFECTO));
  return t;
}

describe("estadoTransitorio (E7)", () => {
  it("I_ref = E/R_carga, sin suelo, Q_ref = C_max·E y q = C·v_ab", () => {
    const p = PRESETS_E7[0]; // 3 en serie: 200, 400, 400 µF
    const est = estadoTransitorio(cargar(p, 6), E, R_CARGA_DEFECTO);
    expect(est.iRef).toBeCloseTo(12e-3, 12);
    expect(est.suelo).toBe(0);
    expect(est.qRef).toBeCloseTo(400e-6 * 12, 12);
    // Tras 6τ la carga es la final de la spec: 1,2 mC en cada capacitor de la serie.
    for (const id of ["C1", "C2", "C3"]) expect(est.q?.[id]).toBeCloseTo(1.2e-3, 5);
  });

  it("todo el lazo exterior y la raíz llevan la misma corriente en cada preset, y en 5τ las partículas casi paran", () => {
    for (const p of PRESETS_E7) {
      const g = distribuirCircuito(p.arbol, "C", rect, { rCarga: true });
      const t0 = cargar(p, 0.01);
      const est0 = estadoTransitorio(t0, E, R_CARGA_DEFECTO);
      const corr0 = corrientesTramos(g, est0.r);
      const iBat = est0.r.iBat;
      expect(iBat).toBeGreaterThan(0);
      for (const id of ["riel-sup", "riel-der", "riel-inf", "Rc:a", "Rc:cuerpo", "Rc:b"]) {
        const k = g.tramos.findIndex((x) => x.id === id);
        expect(corr0[k], `${p.id} ${id}`).toBeCloseTo(iBat, 9);
      }
      const v0 = velocidadesTramos(g, corr0, est0.iRef, est0.suelo);
      const t5 = cargar(p, 5);
      const est5 = estadoTransitorio(t5, E, R_CARGA_DEFECTO);
      const v5 = velocidadesTramos(g, corrientesTramos(g, est5.r), est5.iRef, est5.suelo);
      const k = g.tramos.findIndex((x) => x.id === "riel-sup");
      expect(v5[k] / v0[k]).toBeLessThan(0.01);
    }
  });

  it("al descargar la corriente invierte el sentido (flecha y puntos al revés)", () => {
    const p = PRESETS_E7[2];
    const g = distribuirCircuito(p.arbol, "C", rect, { rCarga: true });
    const carga = cargar(p, 6);
    const descarga = transitorioDeArbol(p.arbol, { modo: "descargar", E, rCarga: R_CARGA_DEFECTO }, carga);
    descarga.avanzar(0.001);
    const est = estadoTransitorio(descarga, E, R_CARGA_DEFECTO);
    const k = g.tramos.findIndex((x) => x.id === "riel-sup");
    const corr = corrientesTramos(g, est.r);
    expect(corr[k]).toBeLessThan(0);
    const vel = velocidadesTramos(g, corr, est.iRef, est.suelo);
    expect(vel[k]).toBeLessThan(0);
    // El capacitor conserva su carga al empezar a descargar.
    expect(est.q?.C3).toBeGreaterThan(1e-3);
  });

  it("la sonda en el cuerpo de un capacitor interpola V entre placas y los capacitores no tienen partículas ahí", () => {
    const p = PRESETS_E7[0];
    const g = distribuirCircuito(p.arbol, "C", rect, { rCarga: true });
    const est = estadoTransitorio(cargar(p, 6), E, R_CARGA_DEFECTO);
    const net = est.net;
    const ini = leerSonda(g, net, est.r, { tramo: "C1:cuerpo", t: 0 })!;
    const fin = leerSonda(g, net, est.r, { tramo: "C1:cuerpo", t: 1 })!;
    expect(ini.v - fin.v).toBeCloseTo(6, 1); // C1 queda a 6 V (preset 1), 99,75 % a 6τ
    expect(leerSonda(g, net, est.r, { tramo: "C1:cuerpo", t: 0.5 })!.v).toBeCloseTo((ini.v + fin.v) / 2, 9);
    const part = crearParticulas(g);
    const k = g.tramos.findIndex((x) => x.id === "C1:cuerpo");
    expect(part.cuenta[k]).toBe(0);
    // KCL de la sonda: la corriente del cable de R_carga es la del lazo.
    expect(sumaTerminos(est.r, g.tramos.find((x) => x.id === "riel-sup")!.terminos)).toBeCloseTo(est.r.iBat, 12);
  });
});
