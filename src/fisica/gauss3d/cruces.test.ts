/**
 * README de pruebas — cruces.ts (contrato §2 Cruces, §3, tests obligatorios 8 y 14).
 * Parte 1: polilíneas hechas a mano con cruces conocidos analíticamente (esfera R=5, cubo a=8, cilindro R4×8, parche l=4).
 * Parte 2 (test 8): para los escenarios cerrados 2,3,5,6,7,9 y 40 posiciones aleatorias por forma (semilla fija),
 *   salen − entran = Σ signo_i·lineasPorCarga[i] de las cargas encerradas, EXACTO (enteros), calculado aquí con un predicado dentro/fuera propio.
 * Parte 3 (test 14, informativo): tiempos de flujo+líneas+cruces; se registran con console.log y NO hacen fallar.
 * Supuestos: segmento = índice global del punto previo (inicio[linea] + k); posiciones/t verificadas contra a + t(b−a) con Float32;
 *   en la esfera, sentido = signo de (tramo · posición) (normal exterior radial).
 */
import { describe, expect, it } from "vitest";
import { NIVELES_GAUSS3D } from "./constantes";
import { calcularCruces, contarSalenEntran, lineasNetasEsperadas } from "./cruces";
import { calcularFlujo } from "./flujo";
import { repartirLineas, trazarLineas3D } from "./lineas3d";
import { generarMalla } from "./mallas";
import { crearBufferesCruces } from "./unionesBuffers";
import type { Carga3D, LineasCampo3D, Superficie } from "./tipos";
import {
  cargasAleatoriasValidas,
  construirLineas,
  crucesVacios,
  dentroRef,
  distSignoRef,
  escenarioRef,
  prng,
  rLimiteDe,
} from "./referencia";

const C = (x: number, y: number, z: number, q: number): Carga3D => ({ x, y, z, q });
const ESFERA: Superficie = { tipo: "esfera", radio: 5 };
const cerca = (a: number, b: number, tol = 1e-5) => expect(Math.abs(a - b)).toBeLessThanOrEqual(tol);

describe("calcularCruces — polilíneas a mano", () => {
  it("esfera: línea recta por el centro → entra (−1) en x=−5 y sale (+1) en x=+5, t=0.5 de cada tramo", () => {
    const L = construirLineas([[[-10, 0, 0], [0, 0, 0], [10, 0, 0]]]);
    const X = calcularCruces(L, ESFERA);
    expect(X.n).toBe(2);
    expect(Array.from(X.sentido.subarray(0, 2))).toEqual([-1, 1]);
    expect(Array.from(X.segmento.subarray(0, 2))).toEqual([0, 1]);
    expect(Array.from(X.linea.subarray(0, 2))).toEqual([0, 0]);
    cerca(X.t[0], 0.5);
    cerca(X.t[1], 0.5);
    cerca(X.posicion[0], -5);
    cerca(X.posicion[3], 5);
    cerca(X.posicion[1], 0);
    expect(X.salen).toBe(1);
    expect(X.entran).toBe(1);
  });
  it("índice de segmento GLOBAL con varias líneas; un segmento largo entra y sale a la vez", () => {
    const L = construirLineas([
      [[-10, 0, 0], [0, 0, 0], [10, 0, 0]], // puntos 0..2
      [[0, -10, 0], [0, 10, 0]], // puntos 3..4: un solo tramo que atraviesa
    ]);
    const X = calcularCruces(L, ESFERA);
    expect(X.n).toBe(4);
    expect(Array.from(X.linea.subarray(0, 4))).toEqual([0, 0, 1, 1]);
    expect(Array.from(X.segmento.subarray(0, 4))).toEqual([0, 1, 3, 3]);
    expect(Array.from(X.sentido.subarray(0, 4))).toEqual([-1, 1, -1, 1]);
    cerca(X.t[2], 0.25);
    cerca(X.t[3], 0.75);
    cerca(X.posicion[3 * 2 + 1], -5);
    cerca(X.posicion[3 * 3 + 1], 5);
    expect(X.salen).toBe(2);
    expect(X.entran).toBe(2);
  });
  it("una línea que termina dentro solo entra; una que nace dentro solo sale", () => {
    const termina = calcularCruces(construirLineas([[[-10, 0, 0], [0, 0, 0]]]), ESFERA);
    expect(termina.n).toBe(1);
    expect(termina.sentido[0]).toBe(-1);
    expect([termina.salen, termina.entran]).toEqual([0, 1]);
    const nace = calcularCruces(construirLineas([[[0, 0, 0], [0, 12, 0]]]), ESFERA);
    expect(nace.n).toBe(1);
    expect(nace.sentido[0]).toBe(1);
    expect([nace.salen, nace.entran]).toEqual([1, 0]);
  });
  it("líneas que no cruzan (fuera, dentro, rozando por fuera) → 0 cruces", () => {
    const L = construirLineas([
      [[7, 0, 0], [7, 5, 0], [7, 10, 0]],
      [[-1, 0, 0], [1, 1, 1], [2, 2, 2]],
      [[-10, 5.001, 0], [0, 5.001, 0], [10, 5.001, 0]], // tangente por fuera
    ]);
    const X = calcularCruces(L, ESFERA);
    expect(X.n).toBe(0);
    expect(X.salen).toBe(0);
    expect(X.entran).toBe(0);
  });
  it("cubo a=8 y cilindro R4×8: caras y tapas", () => {
    const cubo = calcularCruces(construirLineas([[[-10, 0, 0], [10, 0, 0]]]), { tipo: "cubo", lado: 8 });
    expect(cubo.n).toBe(2);
    expect(Array.from(cubo.sentido.subarray(0, 2))).toEqual([-1, 1]);
    cerca(cubo.t[0], 0.3);
    cerca(cubo.t[1], 0.7);
    cerca(cubo.posicion[0], -4);
    cerca(cubo.posicion[3], 4);
    const cil: Superficie = { tipo: "cilindro", radio: 4, altura: 8 };
    const tapas = calcularCruces(construirLineas([[[1, 0, -10], [1, 0, 10]]]), cil);
    expect(tapas.n).toBe(2);
    expect(Array.from(tapas.sentido.subarray(0, 2))).toEqual([-1, 1]);
    cerca(tapas.posicion[2], -4);
    cerca(tapas.posicion[5], 4);
    const cuerpo = calcularCruces(construirLineas([[[-10, 0, 0], [10, 0, 0]]]), cil);
    expect(cuerpo.n).toBe(2);
    cerca(cuerpo.posicion[0], -4);
    cerca(cuerpo.posicion[3], 4);
  });
  it("parche (n=+z): cruzar a favor de n sale (+1), en contra entra (−1); fuera del cuadrado no cruza", () => {
    const P: Superficie = { tipo: "parche", lado: 4, theta: 0, phi: 0 };
    const arriba = calcularCruces(construirLineas([[[0, 0, -3], [0, 0, 3]]]), P);
    expect(arriba.n).toBe(1);
    expect(arriba.sentido[0]).toBe(1);
    cerca(arriba.t[0], 0.5);
    cerca(arriba.posicion[2], 0);
    expect([arriba.salen, arriba.entran]).toEqual([1, 0]);
    const abajo = calcularCruces(construirLineas([[[0, 0, 3], [0, 0, -3]]]), P);
    expect(abajo.sentido[0]).toBe(-1);
    expect([abajo.salen, abajo.entran]).toEqual([0, 1]);
    expect(calcularCruces(construirLineas([[[3, 0, -3], [3, 0, 3]]]), P).n).toBe(0);
    expect(calcularCruces(construirLineas([[[0, 0, 1], [0, 0, 3]]]), P).n).toBe(0);
  });
  it("reutiliza `out` sin dejar restos de la llamada anterior; crearBufferesCruces sirve como out", () => {
    const out = crucesVacios(10);
    const a = calcularCruces(construirLineas([[[-10, 0, 0], [10, 0, 0]]]), ESFERA, out);
    expect(a.n).toBe(2);
    const b = calcularCruces(construirLineas([[[7, 0, 0], [8, 0, 0]]]), ESFERA, out);
    expect(b.n).toBe(0);
    expect([b.salen, b.entran]).toEqual([0, 0]);
    const buf = crearBufferesCruces(480);
    const c = calcularCruces(construirLineas([[[-10, 0, 0], [10, 0, 0]]]), ESFERA, buf);
    expect(c.n).toBe(2);
    expect([c.salen, c.entran]).toEqual([1, 1]);
  });
});

describe("contarSalenEntran", () => {
  it("devuelve {salen, entran, neto = salen − entran}", () => {
    const X = calcularCruces(construirLineas([[[-10, 0, 0], [0, 0, 0]], [[0, 0, 0], [0, 10, 0]], [[0, 0, 0], [10, 0, 0]]]), ESFERA);
    expect(contarSalenEntran(X)).toEqual({ salen: 2, entran: 1, neto: 1 });
  });
  it("sin cruces: todo 0", () => {
    expect(contarSalenEntran(crucesVacios(4))).toEqual({ salen: 0, entran: 0, neto: 0 });
  });
});

describe("lineasNetasEsperadas", () => {
  const L60 = (a: number, b: number): LineasCampo3D => construirLineas([], { lineasPorCarga: [a, b] });
  it("Σ signo_i·lineasPorCarga[i] solo sobre las cargas encerradas", () => {
    expect(lineasNetasEsperadas(ESFERA, [C(0, 0, 0, 3)], L60(60, 0))).toBe(60);
    expect(lineasNetasEsperadas(ESFERA, [C(-2, 0, 0, 3), C(2, 0, 0, -3)], L60(60, 60))).toBe(0);
    expect(lineasNetasEsperadas(ESFERA, [C(-2, 0, 0, 3), C(8, 0, 0, -3)], L60(60, 60))).toBe(60);
    expect(lineasNetasEsperadas(ESFERA, [C(-2, 0, 0, 3), C(1, 0, 0, -1)], L60(60, 20))).toBe(40);
    expect(lineasNetasEsperadas(ESFERA, [C(9, 0, 0, 3), C(0, 0, 1, -3)], L60(60, 45))).toBe(-45);
    expect(lineasNetasEsperadas(ESFERA, [C(9, 0, 0, 3), C(0, 0, 9, -3)], L60(60, 45))).toBe(0);
  });
  it("parche: NaN (no hay invariante)", () => {
    expect(lineasNetasEsperadas({ tipo: "parche", lado: 4, theta: 0, phi: 0 }, [C(0, 0, -6, 3)], L60(60, 0))).toBeNaN();
  });
});

/** Traza, calcula cruces y comprueba toda la coherencia del resultado. Devuelve lo necesario para aserciones específicas. */
function evaluar(s: Superficie, cargas: Carga3D[], nivel = 0) {
  const L = trazarLineas3D(cargas, rLimiteDe(s, cargas), NIVELES_GAUSS3D[nivel]);
  const X = calcularCruces(L, s);
  const cnt = contarSalenEntran(X);
  // independiente: Σ signo·lineasPorCarga de las cargas dentro según el predicado de referencia
  let propio = 0;
  cargas.forEach((c, i) => {
    if (dentroRef(s, [c.x, c.y, c.z])) propio += Math.sign(c.q) * L.lineasPorCarga[i];
  });
  return { L, X, cnt, propio, esperado: lineasNetasEsperadas(s, cargas, L) };
}

function verificarCoherencia(s: Superficie, L: LineasCampo3D, X: ReturnType<typeof calcularCruces>) {
  expect(X.n).toBe(X.salen + X.entran);
  let sal = 0;
  let ent = 0;
  for (let k = 0; k < X.n; k++) {
    const l = X.linea[k];
    expect(l).toBeLessThan(L.n);
    expect(X.segmento[k]).toBeGreaterThanOrEqual(L.inicio[l]);
    expect(X.segmento[k]).toBeLessThan(L.inicio[l + 1] - 1);
    expect(X.t[k]).toBeGreaterThanOrEqual(0);
    expect(X.t[k]).toBeLessThan(1);
    const g = X.segmento[k];
    const a = [L.puntos[3 * g], L.puntos[3 * g + 1], L.puntos[3 * g + 2]];
    const b = [L.puntos[3 * g + 3], L.puntos[3 * g + 4], L.puntos[3 * g + 5]];
    const p = [0, 1, 2].map((i) => X.posicion[3 * k + i]);
    for (let i = 0; i < 3; i++) expect(Math.abs(p[i] - (a[i] + X.t[k] * (b[i] - a[i])))).toBeLessThan(2e-4);
    expect(Math.abs(distSignoRef(s, p))).toBeLessThan(2e-3); // el cruce está sobre la superficie
    if (X.sentido[k] === 1) sal++;
    else {
      expect(X.sentido[k]).toBe(-1);
      ent++;
    }
    if (s.tipo === "esfera") {
      const dot = (b[0] - a[0]) * p[0] + (b[1] - a[1]) * p[1] + (b[2] - a[2]) * p[2];
      expect(Math.sign(dot)).toBe(X.sentido[k]);
    }
  }
  expect([sal, ent]).toEqual([X.salen, X.entran]);
}

describe("Test 8 — salen − entran = líneas netas de la carga encerrada (escenarios cerrados)", () => {
  const LPU3 = repartirLineas([C(0, 0, 0, 3)], 240)[0]; // 3·LINEAS_POR_UC

  for (const nivel of [0, 1, 2]) {
    it(`nivel ${nivel}: escenarios 2, 3 (dentro y fuera), 5, 6 (fuera / dentro / cruzando), 7, 9`, () => {
      const casos: [string, Superficie, Carga3D[]][] = [
        ["2", escenarioRef(2).superficie, escenarioRef(2).cargas],
        ["3 dentro", escenarioRef(3).superficie, escenarioRef(3).cargas],
        ["3 fuera", ESFERA, [C(8, 0, 0, 3)]],
        ["5 cubo", escenarioRef(5).superficie, escenarioRef(5).cargas],
        ["5 cilindro", { tipo: "cilindro", radio: 4, altura: 8 }, escenarioRef(5).cargas],
        ["5 esfera", ESFERA, escenarioRef(5).cargas],
        ["6 fuera", ESFERA, [C(0, 0, 8, 3)]],
        ["6 en 5.4", ESFERA, [C(0, 0, 5.4, 3)]],
        ["6 en 4.6", ESFERA, [C(0, 0, 4.6, 3)]],
        ["6 dentro", ESFERA, [C(0, 0, 0, 3)]],
        ["7", escenarioRef(7).superficie, escenarioRef(7).cargas],
        ["9", escenarioRef(9).superficie, escenarioRef(9).cargas],
      ];
      for (const [nombre, s, cs] of casos) {
        const { L, X, cnt, propio, esperado } = evaluar(s, cs, nivel);
        expect(cnt.neto, `${nombre}: neto vs lineasNetasEsperadas`).toBe(esperado);
        expect(cnt.neto, `${nombre}: neto vs cálculo propio`).toBe(propio);
        expect(X.salen - X.entran).toBe(cnt.neto);
        verificarCoherencia(s, L, X);
        for (let i = 0; i < L.n; i++) expect(L.fin[i]).not.toBe(2);
      }
    });
  }

  it("escenario 2/9/5: carga única dentro → salen = nº de líneas, entran = 0", () => {
    for (const id of [2, 9, 5]) {
      const { s, cs } = { s: escenarioRef(id).superficie, cs: escenarioRef(id).cargas };
      const { L, cnt } = evaluar(s, cs);
      expect(cnt.entran).toBe(0);
      expect(cnt.salen).toBe(L.lineasPorCarga[0]);
      expect(cnt.salen).toBe(repartirLineas(cs, NIVELES_GAUSS3D[0].presupuestoLineas)[0]);
    }
    expect(evaluar(escenarioRef(2).superficie, escenarioRef(2).cargas).cnt.salen).toBe(LPU3);
  });
  it("escenario 3 fuera: salen = entran > 0, neto 0", () => {
    const { cnt } = evaluar(ESFERA, [C(8, 0, 0, 3)]);
    expect(cnt.neto).toBe(0);
    expect(cnt.salen).toBe(cnt.entran);
    expect(cnt.salen).toBeGreaterThan(0);
  });
  it("escenario 3 dentro: Φ no depende de la posición dentro (neto constante = 3·LPU en varias posiciones)", () => {
    for (const p of [[1.5, 1, 2], [0, 0, 0], [-3, 2, 1], [0, 0, 4.6]] as const) {
      expect(evaluar(ESFERA, [C(p[0], p[1], p[2], 3)]).cnt.neto).toBe(LPU3);
    }
  });
  it("escenario 6: neto 0 con la carga fuera y 3·LPU al cruzar (salto en |z|=R)", () => {
    expect(evaluar(ESFERA, [C(0, 0, 8, 3)]).cnt.neto).toBe(0);
    expect(evaluar(ESFERA, [C(0, 0, 5.4, 3)]).cnt.neto).toBe(0);
    expect(evaluar(ESFERA, [C(0, 0, 4.6, 3)]).cnt.neto).toBe(LPU3);
    expect(evaluar(ESFERA, [C(0, 0, 0, 3)]).cnt.neto).toBe(LPU3);
  });
  it("escenario 7 (dipolo): neto 0, salen = entran > 0 y ≈ 37 % de las líneas de A (flujo del plano medio fuera de ρ = R)", () => {
    const { cnt, L } = evaluar(escenarioRef(7).superficie, escenarioRef(7).cargas);
    expect(cnt.neto).toBe(0);
    expect(cnt.salen).toBe(cnt.entran);
    expect(cnt.salen).toBeGreaterThan(0);
    // CAMBIO JUSTIFICADO (fase 1B): el contrato decía «≈ 8 de 60», pero por Gauss el flujo de A que cruza el plano medio
    // fuera de ρ = R es q·(1 − (1 − d/√(d²+R²))) = d/√(d²+R²) = 2/√29 = 0.371 de sus líneas, y todas ellas salen de la esfera
    // R = 5 (las 8 de 60 son las que llegan hasta la esfera límite, ρ > 17).
    const frac = cnt.salen / L.lineasPorCarga[0];
    expect(Math.abs(frac - 2 / Math.sqrt(29))).toBeLessThan(0.06);
  });
  it("dipolo con cargas ±q de distinto valor en cubo y cilindro: neto 0", () => {
    for (const s of [{ tipo: "cubo", lado: 8 }, { tipo: "cilindro", radio: 4, altura: 8 }] as Superficie[]) {
      for (const q of [0.5, 3, 5]) {
        const { cnt } = evaluar(s, [C(-2, 0, 0, q), C(2, 0, 0, -q)]);
        expect(cnt.neto).toBe(0);
        expect(cnt.salen).toBe(cnt.entran);
      }
    }
  });

  const formas: Superficie[] = [
    { tipo: "esfera", radio: 2 },
    { tipo: "esfera", radio: 5 },
    { tipo: "cubo", lado: 8 },
    { tipo: "cubo", lado: 16 },
    { tipo: "cilindro", radio: 4, altura: 8 },
    { tipo: "cilindro", radio: 8, altura: 16 },
  ];
  for (const s of formas) {
    it(`${s.tipo} ${JSON.stringify(s)}: 40 posiciones aleatorias (1–2 cargas, cualquier signo/par desigual) → neto exacto`, () => {
      const rnd = prng(777);
      let conDentro = 0;
      for (let k = 0; k < 40; k++) {
        const cargas = cargasAleatoriasValidas(s, rnd, k % 4 === 0 ? 1 : 2);
        // bias: la mitad de las veces fuerza una carga dentro para ejercitar el neto ≠ 0
        if (k % 2 === 0) {
          const dentro = C((rnd() - 0.5) * 0.8, (rnd() - 0.5) * 0.8, (rnd() - 0.5) * 0.8, cargas[0].q);
          const lejos = cargas.length < 2 || Math.hypot(cargas[1].x - dentro.x, cargas[1].y - dentro.y, cargas[1].z - dentro.z) >= 0.8;
          if (lejos && Math.abs(distSignoRef(s, [dentro.x, dentro.y, dentro.z])) >= 0.4) cargas[0] = dentro;
        }
        const nivel = k % 5 === 0 ? 2 : 0;
        const { L, X, cnt, propio, esperado } = evaluar(s, cargas, nivel);
        expect(cnt.neto, `k=${k} cargas=${JSON.stringify(cargas)}`).toBe(esperado);
        expect(cnt.neto, `k=${k} propio`).toBe(propio);
        verificarCoherencia(s, L, X);
        if (cargas.some((c) => dentroRef(s, [c.x, c.y, c.z]))) conDentro++;
      }
      expect(conDentro).toBeGreaterThan(10);
    });
  }

  it("cargas a DIST_MIN_SUP de la cara (peor caso de la semilla), dentro y fuera, positivas y negativas", () => {
    const cs: [Superficie, Carga3D][] = [
      [ESFERA, C(0, 0, 4.6, 3)],
      [ESFERA, C(0, 0, 5.4, 3)],
      [ESFERA, C(0, 0, 4.6, -3)],
      [ESFERA, C(0, 0, 5.4, -5)],
      [{ tipo: "cubo", lado: 8 }, C(3.6, 3.6, 3.6, 3)],
      [{ tipo: "cubo", lado: 8 }, C(4.4, 0, 0, -3)],
      [{ tipo: "cilindro", radio: 4, altura: 8 }, C(3.6, 0, 3.6, 3)],
      [{ tipo: "cilindro", radio: 4, altura: 8 }, C(0, 0, 4.4, -0.5)],
    ];
    for (const [s, c] of cs) {
      const { cnt, esperado, L, X } = evaluar(s, [c]);
      expect(cnt.neto, `${s.tipo} ${JSON.stringify(c)}`).toBe(esperado);
      verificarCoherencia(s, L, X);
    }
  });

  it("extremos x,y = ±12, z = ±10 con R=2 y cubo 16 / cilindro 8×16 (ninguna línea con fin=2)", () => {
    const sups: Superficie[] = [{ tipo: "esfera", radio: 2 }, { tipo: "cubo", lado: 16 }, { tipo: "cilindro", radio: 8, altura: 16 }];
    for (const s of sups) {
      for (const [x, y, z] of [[12, 12, 10], [-12, -12, -10], [12, -12, 10]] as const) {
        const { cnt, esperado, L } = evaluar(s, [C(x, y, z, 3), C(0, 0, 0.5, -2)]);
        expect(cnt.neto).toBe(esperado);
        for (let i = 0; i < L.n; i++) expect(L.fin[i]).not.toBe(2);
      }
    }
  });
});

describe("Test 14 — rendimiento (informativo, NO bloqueante)", () => {
  it("flujo + líneas + cruces en nivel alto: se registra el tiempo medio", () => {
    const { superficie: s, cargas } = escenarioRef(7);
    const nivel = NIVELES_GAUSS3D[0];
    const malla = generarMalla(s, nivel);
    const N = 30;
    // calentamiento
    calcularFlujo(malla, cargas, s);
    calcularCruces(trazarLineas3D(cargas, rLimiteDe(s, cargas), nivel), s);
    const t0 = performance.now();
    for (let i = 0; i < N; i++) {
      calcularFlujo(malla, cargas, s);
      calcularCruces(trazarLineas3D(cargas, rLimiteDe(s, cargas), nivel), s);
    }
    const ms = (performance.now() - t0) / N;
    console.log(`[gauss3d rendimiento] flujo+líneas+cruces nivel alto (esc. 7): ${ms.toFixed(2)} ms (meta < 14 ms)`);
    expect(Number.isFinite(ms)).toBe(true);
  });
});

describe("lineasPorUCEfectivo (revisión fase 1)", () => {
  it("alta con carga única = LINEAS_POR_UC; baja con q=5 (tope 60 líneas) = 12, no 20", async () => {
    const { lineasPorUCEfectivo } = await import("./cruces");
    const { trazarLineas3D } = await import("./lineas3d");
    const { NIVELES_GAUSS3D, LINEAS_POR_UC } = await import("./constantes");
    const cs = [{ x: 1, y: 1, z: 1, q: 5 }];
    expect(lineasPorUCEfectivo(cs, trazarLineas3D(cs, 20, NIVELES_GAUSS3D[0]))).toBe(LINEAS_POR_UC);
    expect(lineasPorUCEfectivo(cs, trazarLineas3D(cs, 20, NIVELES_GAUSS3D[2]))).toBe(12);
  });
});
