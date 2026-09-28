import { describe, expect, test } from "vitest";
import type { PuntoCarga } from "./coulomb";
import { campoPlacas, campoUniformeASim } from "./campoExterno";
import { aplicarZonaExclusion, camposActivos, campoTotalEnPunto } from "./campoEscena";
import {
  DIST_MIN_EXCLUSION_CARGA_LIBRE,
  MASA_CARGA_LIBRE,
  SUBPASOS_MAX_CARGA_LIBRE,
  calcularLecturaCargaLibre,
  estadoInicialCargaLibre,
  fuerzaSobreCargaLibre,
  pasoAvanceCargaLibre,
  subpasosCargaLibre,
  type EstadoCargaLibre,
  type LimitesCargaLibre,
  type ParametrosCargaLibre,
} from "./cargaLibre";
import { reflejarEje } from "./dinamica";
import { pxAMetros, RADIO_CARGA_PX } from "./escala";
import { estadoInicialDipolo, pasoAvanceDipolo, type ParametrosDipolo } from "./dipolo";

const LIMITES: LimitesCargaLibre = { ancho: 700, alto: 500 };
/** Caja enorme: sin paredes a efectos prácticos (aísla la física del campo del rebote). */
const SIN_PAREDES: LimitesCargaLibre = { ancho: 1e7, alto: 1e7 };
const DT = 1 / 60;

function uniforme(externoSim: readonly [number, number], q = 1): ParametrosCargaLibre {
  return { q, masa: MASA_CARGA_LIBRE, modoCampo: "uniforme", externoSim, cargaFuente: null };
}

function puntual(fuente: PuntoCarga, q = 1): ParametrosCargaLibre {
  return { q, masa: MASA_CARGA_LIBRE, modoCampo: "puntual", externoSim: null, cargaFuente: fuente };
}

function simular(e: EstadoCargaLibre, p: ParametrosCargaLibre, segundos: number, lim: LimitesCargaLibre): EstadoCargaLibre {
  let estado = e;
  for (let t = 0; t < segundos - 1e-9; t += DT) estado = pasoAvanceCargaLibre(estado, p, DT, lim);
  return estado;
}

/** Energía mecánica en J (K + U) de la lectura: la cantidad que se conserva. */
function energiaTotalJ(e: EstadoCargaLibre, p: ParametrosCargaLibre): number {
  const l = calcularLecturaCargaLibre(e, p);
  return l.energiaCineticaJ + l.energiaJ;
}

describe("campoEscena (extraído de dipolo.ts)", () => {
  test("camposActivos: uniforme ignora la fuente; puntual ignora el campo externo", () => {
    const fuente: PuntoCarga = { x: 10, y: 20, q: 3 };
    const u = camposActivos({ modoCampo: "uniforme", externoSim: [0, 0.02], cargaFuente: fuente });
    expect(u.cargasFuente).toEqual([]);
    expect(u.externoSim).toEqual([0, 0.02]);
    const p = camposActivos({ modoCampo: "puntual", externoSim: [0, 0.02], cargaFuente: fuente });
    expect(p.cargasFuente).toEqual([fuente]);
    expect(p.externoSim).toBeNull();
  });

  test("campoTotalEnPunto: solo campo externo = el vector externo exacto", () => {
    expect(campoTotalEnPunto(123, 45, [], [0.01, -0.03])).toEqual([0.01, -0.03]);
  });

  test("aplicarZonaExclusion: proyecta a distMin y anula solo la velocidad radial entrante", () => {
    const fuente: PuntoCarga = { x: 0, y: 0, q: 1 };
    const r = aplicarZonaExclusion(5, 0, -10, 7, fuente, 20);
    expect(r.x).toBeCloseTo(20, 12);
    expect(r.y).toBeCloseTo(0, 12);
    expect(r.vx).toBeCloseTo(0, 12); // radial entrante: fuera
    expect(r.vy).toBeCloseTo(7, 12); // tangencial: intacta
    // Radial SALIENTE: se conserva (no "pega" la carga a la fuente).
    const s = aplicarZonaExclusion(5, 0, 10, 0, fuente, 20);
    expect(s.vx).toBeCloseTo(10, 12);
    // Fuera de la zona: sin cambios.
    expect(aplicarZonaExclusion(50, 0, -10, 0, fuente, 20)).toEqual({ x: 50, y: 0, vx: -10, vy: 0 });
  });
});

describe("reflejarEje (dinamica.ts, reutilizada por la carga libre)", () => {
  test("sin cruzar la pared devuelve null", () => {
    expect(reflejarEje(50, 40, 10, 0, 1, 0, 100)).toBeNull();
  });

  test("refleja la posición y la velocidad (sin aceleración: especular exacto)", () => {
    const r = reflejarEje(105, 95, 10, 0, 1, 0, 100);
    expect(r).not.toBeNull();
    expect(r![0]).toBeCloseTo(95, 12);
    expect(r![1]).toBeCloseTo(-10, 12);
  });
});

describe("carga libre: campo uniforme", () => {
  const e0 = campoUniformeASim(campoPlacas("vertical", 1, 50_000, pxAMetros(500)));

  test("F = qE, constante en toda la escena", () => {
    const p = uniforme(e0, 2);
    for (const [x, y] of [[50, 50], [350, 250], [650, 480]] as const) {
      const [fx, fy] = fuerzaSobreCargaLibre(estadoInicialCargaLibre(x, y), p);
      expect(fx).toBeCloseTo(2 * e0[0], 14);
      expect(fy).toBeCloseTo(2 * e0[1], 14);
    }
  });

  test("MRUA exacto: x(t) = x0 + ½(qE/m)t² (Verlet es exacto con aceleración constante)", () => {
    const p = uniforme([0.01, 0], 1.5);
    const a = (1.5 * 0.01) / MASA_CARGA_LIBRE;
    const e = simular(estadoInicialCargaLibre(1000, 1000), p, 3, SIN_PAREDES);
    const t = Math.round(3 / DT) * DT;
    expect(e.x - 1000).toBeCloseTo(0.5 * a * t * t, 6);
    expect(e.vx).toBeCloseTo(a * t, 6);
    expect(e.y).toBe(1000);
  });

  test("la carga positiva va en el sentido del campo; la negativa en contra", () => {
    const pos = simular(estadoInicialCargaLibre(350, 250), uniforme(e0, 1), 1, LIMITES);
    const neg = simular(estadoInicialCargaLibre(350, 250), uniforme(e0, -1), 1, LIMITES);
    expect(Math.sign(pos.y - 250)).toBe(Math.sign(e0[1]));
    expect(Math.sign(neg.y - 250)).toBe(-Math.sign(e0[1]));
  });

  test("calibración: con los valores iniciales (50 kV, 1 µC) se mueve de forma visible en pocos segundos", () => {
    const e = simular(estadoInicialCargaLibre(350, 100), uniforme(e0, 1), 5, LIMITES);
    expect(Math.abs(e.y - 100)).toBeGreaterThan(40);
  });

  test("trabajo-energía: K + U se conserva con rebotes en las paredes (30 s, 300 kV)", () => {
    const eFuerte = campoUniformeASim(campoPlacas("vertical", 1, 300_000, pxAMetros(500)));
    const p = uniforme(eFuerte, 5);
    let e = estadoInicialCargaLibre(200, 60, 40, 0);
    const inicial = energiaTotalJ(e, p);
    const escala = Math.abs(calcularLecturaCargaLibre(estadoInicialCargaLibre(200, 500), p).energiaJ - calcularLecturaCargaLibre(e, p).energiaJ);
    let rebotes = 0;
    let vyPrevio = e.vy;
    for (let t = 0; t < 30; t += DT) {
      e = pasoAvanceCargaLibre(e, p, DT, LIMITES);
      if (vyPrevio > 0 && e.vy < 0) rebotes++;
      vyPrevio = e.vy;
    }
    expect(rebotes).toBeGreaterThanOrEqual(3);
    expect(Math.abs(energiaTotalJ(e, p) - inicial) / escala).toBeLessThan(0.01);
    // Sin fricción ni ganancia: nunca sube por encima de su altura inicial (una "pelota" que rebota).
    expect(e.y).toBeGreaterThan(60 - 2);
  });

  test("nunca sale de la escena", () => {
    const eFuerte = campoUniformeASim(campoPlacas("horizontal", -1, 300_000, pxAMetros(700)));
    let e = estadoInicialCargaLibre(350, 250, 300, -200);
    const p = uniforme(eFuerte, 5);
    for (let t = 0; t < 20; t += DT) {
      e = pasoAvanceCargaLibre(e, p, DT, LIMITES);
      expect(e.x).toBeGreaterThanOrEqual(RADIO_CARGA_PX - 1e-9);
      expect(e.x).toBeLessThanOrEqual(700 - RADIO_CARGA_PX + 1e-9);
      expect(e.y).toBeGreaterThanOrEqual(RADIO_CARGA_PX - 1e-9);
      expect(e.y).toBeLessThanOrEqual(500 - RADIO_CARGA_PX + 1e-9);
    }
  });
});

describe("carga libre: campo de una carga puntual", () => {
  const fuente: PuntoCarga = { x: 350, y: 120, q: 5 };

  test("mismo signo: se aleja; signo opuesto: se acerca", () => {
    const rep = simular(estadoInicialCargaLibre(350, 300), puntual(fuente, 1), 0.3, LIMITES);
    const atr = simular(estadoInicialCargaLibre(350, 300), puntual(fuente, -1), 0.3, LIMITES);
    expect(rep.y).toBeGreaterThan(300);
    expect(atr.y).toBeLessThan(300);
  });

  test("zona de exclusión: atraída, nunca entra a menos de 2·RADIO_CARGA_PX de la fuente", () => {
    let e = estadoInicialCargaLibre(420, 330);
    const p = puntual(fuente, -5);
    let minDist = Infinity;
    for (let t = 0; t < 10; t += DT) {
      e = pasoAvanceCargaLibre(e, p, DT, LIMITES);
      minDist = Math.min(minDist, Math.hypot(e.x - fuente.x, e.y - fuente.y));
    }
    expect(minDist).toBeGreaterThanOrEqual(DIST_MIN_EXCLUSION_CARGA_LIBRE - 1e-6);
    // Y termina pegada a ella (la atracción la mantiene en el contacto; puede deslizar alrededor).
    expect(Math.hypot(e.x - fuente.x, e.y - fuente.y)).toBeLessThan(DIST_MIN_EXCLUSION_CARGA_LIBRE + 3);
  });

  test("repulsión sin paredes: K + U se conserva (≤ 0.5 %)", () => {
    const p = puntual(fuente, 2);
    let e = estadoInicialCargaLibre(380, 170);
    const inicial = energiaTotalJ(e, p);
    for (let t = 0; t < 3; t += DT) e = pasoAvanceCargaLibre(e, p, DT, SIN_PAREDES);
    const final = energiaTotalJ(e, p);
    expect(Math.abs(final - inicial) / Math.abs(inicial)).toBeLessThan(0.005);
    expect(calcularLecturaCargaLibre(e, p).energiaCineticaJ).toBeGreaterThan(0.9 * inicial);
  });

  test("órbita de paso (velocidad tangencial, atracción): K + U se conserva sin tocar la fuente", () => {
    const p = puntual(fuente, -1);
    let e = estadoInicialCargaLibre(350, 320, 900, 0);
    const inicial = energiaTotalJ(e, p);
    let minDist = Infinity;
    for (let t = 0; t < 1; t += DT) {
      e = pasoAvanceCargaLibre(e, p, DT, SIN_PAREDES);
      minDist = Math.min(minDist, Math.hypot(e.x - fuente.x, e.y - fuente.y));
    }
    expect(minDist).toBeGreaterThan(DIST_MIN_EXCLUSION_CARGA_LIBRE);
    const escala = Math.abs(calcularLecturaCargaLibre(e, p).energiaCineticaJ) + Math.abs(inicial);
    expect(Math.abs(energiaTotalJ(e, p) - inicial) / escala).toBeLessThan(0.005);
  });

  test("sin NaN/Infinity en 60 s, arrancando casi encima de la fuente", () => {
    for (const q of [-5, -0.5, 0.5, 5]) {
      let e = estadoInicialCargaLibre(fuente.x + 1e-3, fuente.y);
      const p = puntual(fuente, q);
      for (let t = 0; t < 60; t += DT) e = pasoAvanceCargaLibre(e, p, DT, LIMITES);
      for (const v of [e.x, e.y, e.vx, e.vy]) expect(Number.isFinite(v)).toBe(true);
    }
  });

  test("dt grande (pestaña dormida) o no positivo", () => {
    const p = puntual(fuente, 5);
    const e = estadoInicialCargaLibre(350, 180);
    expect(pasoAvanceCargaLibre(e, p, 0, LIMITES)).toBe(e);
    expect(pasoAvanceCargaLibre(e, p, -1, LIMITES)).toBe(e);
    const tras = pasoAvanceCargaLibre(e, p, 5, LIMITES);
    for (const v of [tras.x, tras.y, tras.vx, tras.vy]) expect(Number.isFinite(v)).toBe(true);
    expect(subpasosCargaLibre(e, p, 5)).toBeLessThanOrEqual(SUBPASOS_MAX_CARGA_LIBRE);
  });
});

describe("carga libre: independencia del dipolo", () => {
  test("la trayectoria de la carga libre no depende de lo que haga el dipolo", () => {
    const fuente: PuntoCarga = { x: 350, y: 120, q: 5 };
    const pc = puntual(fuente, 1);
    const pd: ParametrosDipolo = { q: 3, d: 60, modoCampo: "puntual", externoSim: null, cargaFuente: fuente, zeta: 0.3 };

    // Sola.
    const sola = simular(estadoInicialCargaLibre(200, 300), pc, 2, LIMITES);

    // Intercalada con un dipolo que se integra (y se "arrastra") en la misma escena.
    let e = estadoInicialCargaLibre(200, 300);
    let dip = estadoInicialDipolo(260, 320, 1);
    for (let t = 0; t < 2 - 1e-9; t += DT) {
      dip = pasoAvanceDipolo(dip, pd, DT);
      dip = { ...dip, cx: dip.cx + 3 };
      e = pasoAvanceCargaLibre(e, pc, DT, LIMITES);
    }
    expect(e).toEqual(sola);
  });
});

describe("carga libre: lectura", () => {
  test("uniforme: F = |q|E en N y U cambia en −qE·Δr", () => {
    const e0 = campoUniformeASim(campoPlacas("vertical", 1, 100_000, pxAMetros(500)));
    const p = uniforme(e0, 2);
    const a = calcularLecturaCargaLibre(estadoInicialCargaLibre(100, 100), p);
    const b = calcularLecturaCargaLibre(estadoInicialCargaLibre(100, 300), p);
    // |E| en SI = 100 kV / 0.1 m = 1e6 V/m; q = 2 µC → 2 N.
    expect(a.fuerzaNetaN).toBeCloseTo(2, 9);
    // ΔU = −qE·Δy = −(2e-6 C)(1e6 V/m)(0.04 m) = −0.08 J (se mueve en el sentido del campo: baja U).
    expect(b.energiaJ - a.energiaJ).toBeCloseTo(-0.08, 9);
    expect(a.rapidezMs).toBe(0);
    expect(a.energiaCineticaJ).toBe(0);
  });
});
