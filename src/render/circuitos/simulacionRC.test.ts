import { describe, expect, it } from "vitest";
import { PRESETS_E7, conValor, e, paralelo, serie } from "../../fisica/circuitos";
import { CAPACIDAD_HISTORIAL, SimulacionRC, faseDe, type ParametrosRC } from "./simulacionRC";

const uF = 1e-6;
const P = PRESETS_E7[0]; // 3 en serie: C_eq = 100 µF, R = 1 kΩ, τ = 0,1 s
const base = (extra: Partial<ParametrosRC> = {}): ParametrosRC => ({ arbol: P.arbol, modo: "cargar", E: 12, rCarga: 1000, ...extra });

/** Avanza `segPantalla` segundos de pantalla a 60 fotogramas por segundo. */
function correr(sim: SimulacionRC, segPantalla: number): void {
  const n = Math.round(segPantalla * 60);
  for (let k = 0; k < n; k++) sim.avanzar(1 / 60);
}

describe("SimulacionRC: reloj dilatado", () => {
  it("el preset por defecto muestra τ = 3 s en pantalla con F = 30", () => {
    const s = new SimulacionRC();
    s.configurar(base());
    expect(s.tauReal).toBeCloseTo(0.1, 12);
    expect(s.tauPantalla).toBeCloseTo(3, 9);
    expect(s.factorTiempo).toBeCloseTo(30, 6);
  });

  it("en un τ de pantalla el capacitor llega al 63,2 % de E (reloj real = pantalla / F)", () => {
    const s = new SimulacionRC();
    s.configurar(base());
    correr(s, s.tauPantalla);
    const r = s.resumen()!;
    expect(r.tiempoReal).toBeCloseTo(0.1, 2);
    expect(r.vRed / 12).toBeCloseTo(0.632, 2);
  });

  it("I(0⁺) = E/R con el signo de carga, y la corriente decae como e^(−t/τ)", () => {
    const s = new SimulacionRC();
    s.configurar(base());
    correr(s, 0.05);
    const i0 = s.resumen()!.i;
    expect(i0).toBeGreaterThan(0);
    expect(i0 / (12 / 1000)).toBeGreaterThan(0.97);
    correr(s, s.tauPantalla);
    expect(s.resumen()!.i / i0).toBeCloseTo(Math.exp(-1), 1);
  });
});

describe("SimulacionRC: carga, descarga y balance de energía", () => {
  it("al terminar de cargar: entregada = C·E², almacenada = disipada = ½C·E² (±1 %)", () => {
    const s = new SimulacionRC();
    s.configurar(base());
    correr(s, 6 * s.tauPantalla);
    const r = s.resumen()!;
    expect(r.fase).toBe("cargado");
    const ce2 = 100 * uF * 144;
    const dentro1 = (x: number) => Math.abs(x - 1) < 0.01;
    expect(dentro1(r.eEntregada / ce2)).toBe(true);
    expect(dentro1(r.uAlmacenada / (ce2 / 2))).toBe(true);
    expect(dentro1(r.eDisipada / (ce2 / 2))).toBe(true);
    expect(r.q).toBeCloseTo(1.2e-3, 5);
  });

  it("la descarga invierte el sentido de la corriente y disipa toda la energía almacenada", () => {
    const s = new SimulacionRC();
    s.configurar(base());
    correr(s, 6 * s.tauPantalla);
    const antes = s.resumen()!;
    s.configurar(base({ modo: "descargar" }));
    correr(s, 0.05);
    const r0 = s.resumen()!;
    expect(r0.i).toBeLessThan(0);
    expect(Math.abs(r0.i)).toBeCloseTo(12 / 1000, 3);
    correr(s, 6 * s.tauPantalla);
    const fin = s.resumen()!;
    expect(fin.fase).toBe("descargado");
    expect(fin.vRed / 12).toBeLessThan(0.01);
    expect(Math.abs((fin.eDisipada - antes.eDisipada) / antes.uAlmacenada - 1)).toBeLessThan(0.01);
  });

  it("en descarga la fase es «descargando» y en carga «cargando» mientras falta más del 1 %", () => {
    expect(faseDe("cargar", 0, 12)).toBe("cargando");
    expect(faseDe("cargar", 6, 12)).toBe("cargando");
    expect(faseDe("cargar", 11.9, 12)).toBe("cargado");
    expect(faseDe("descargar", 6, 12)).toBe("descargando");
    expect(faseDe("descargar", 0.05, 12)).toBe("descargado");
    expect(faseDe("cargar", 12, 5)).toBe("descargando"); // se bajó E con el capacitor lleno
  });
});

describe("SimulacionRC: cambios en vivo", () => {
  it("cambiar E o el interruptor conserva la carga; no avisa reinicio", () => {
    const s = new SimulacionRC();
    s.configurar(base());
    correr(s, s.tauPantalla);
    const v = s.resumen()!.vRed;
    expect(s.configurar(base({ E: 6 }))).toEqual({ cambio: true, reiniciado: false });
    expect(s.resumen()!.vRed).toBeCloseTo(v, 9);
    expect(s.configurar(base({ E: 6, modo: "descargar" })).reiniciado).toBe(false);
    expect(s.resumen()!.vRed).toBeCloseTo(v, 9);
  });

  it("cambiar un C o la topología reinicia a descargado y lo avisa; sin carga no avisa", () => {
    const s = new SimulacionRC();
    expect(s.configurar(base()).reiniciado).toBe(false);
    correr(s, 2);
    const otro = conValor(P.arbol, "C1", 300 * uF);
    expect(s.configurar(base({ arbol: otro })).reiniciado).toBe(true);
    expect(s.resumen()!.vRed).toBe(0);
    expect(s.historial.n).toBe(0);
    expect(s.configurar(base({ arbol: paralelo(e("C1", 100 * uF), e("C2", 100 * uF)) })).reiniciado).toBe(false);
    const topo = serie(e("C1", 100 * uF), e("C2", 100 * uF));
    correr(s, 1);
    expect(s.configurar(base({ arbol: topo })).reiniciado).toBe(true);
  });

  it("los parámetros iguales no reconfiguran (conserva el transitorio)", () => {
    const s = new SimulacionRC();
    const p = base();
    s.configurar(p);
    correr(s, 1);
    const t = s.resumen()!.tiempoReal;
    expect(s.configurar({ ...p }).cambio).toBe(false);
    expect(s.resumen()!.tiempoReal).toBe(t);
  });

  it("reiniciar() deja el circuito descargado y el historial vacío, con el interruptor en su sitio", () => {
    const s = new SimulacionRC();
    s.configurar(base());
    correr(s, 3);
    s.reiniciar();
    const r = s.resumen()!;
    expect(r.vRed).toBe(0);
    expect(r.eEntregada).toBe(0);
    expect(s.historial.n).toBe(0);
    expect(s.parametros?.modo).toBe("cargar");
  });

  it("el estado para el lienzo trae I_ref = E/R y las cargas de las placas", () => {
    const s = new SimulacionRC();
    expect(s.estado()).toBeNull();
    s.configurar(base());
    correr(s, 3);
    const est = s.estado()!;
    expect(est.iRef).toBeCloseTo(0.012, 12);
    expect(est.suelo).toBe(0);
    expect(Object.keys(est.q ?? {})).toEqual(["C1", "C2", "C3"]);
  });
});

describe("SimulacionRC: historial para la gráfica", () => {
  it("t crece de forma monótona, en tiempo real, y V parte de 0", () => {
    const s = new SimulacionRC();
    s.configurar(base());
    correr(s, 2 * s.tauPantalla);
    const h = s.historial;
    expect(h.n).toBeGreaterThan(20);
    for (let k = 1; k < h.n; k++) expect(h.t[k]).toBeGreaterThan(h.t[k - 1]);
    expect(h.t[h.n - 1]).toBeLessThanOrEqual(0.2 + 1e-9);
    expect(h.v[0] / 12).toBeLessThan(0.02);
    expect(h.i[0]).toBeGreaterThan(0);
  });

  it("nunca supera su capacidad: se decima y se mantiene ordenado y completo", () => {
    const s = new SimulacionRC();
    s.configurar(base());
    correr(s, 60 * 3); // 60 τ
    const h = s.historial;
    expect(h.n).toBeLessThanOrEqual(CAPACIDAD_HISTORIAL);
    for (let k = 1; k < h.n; k++) expect(h.t[k]).toBeGreaterThan(h.t[k - 1]);
    expect(h.t[h.n - 1]).toBeGreaterThan(0.9 * 60 * 0.1);
  });

  it("se conserva al pasar de cargar a descargar (misma τ) y se vacía si cambia R_carga", () => {
    const s = new SimulacionRC();
    s.configurar(base());
    correr(s, 3);
    const n1 = s.historial.n;
    s.configurar(base({ modo: "descargar" }));
    correr(s, 3);
    expect(s.historial.n).toBeGreaterThan(n1);
    const tCambio = s.historial.t[n1 - 1];
    expect(s.historial.t[n1]).toBeGreaterThan(tCambio);
    s.configurar(base({ modo: "descargar", rCarga: 2000 }));
    expect(s.historial.n).toBe(0);
  });
});
