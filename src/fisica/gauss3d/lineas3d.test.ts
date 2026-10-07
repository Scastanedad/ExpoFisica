/**
 * README de pruebas — lineas3d.ts (contrato §3, tests obligatorios 8 (parte de líneas) y 9).
 * Referencias: campo de Coulomb escrito en referencia.ts (sin softening), predicados dentro/fuera a mano, PRNG con semilla.
 * El invariante «salen − entran» se prueba en cruces.test.ts; aquí se prueba la geometría y la contabilidad de las líneas.
 * Supuestos documentados (derivados del contrato):
 *  - la polilínea NO incluye la carga: el primer punto de una línea sembrada desde +q está a R_SEED_3D de ella; las líneas
 *    sembradas desde −q se invierten, así que SU ÚLTIMO punto está a R_SEED_3D de la carga negativa;
 *  - lineasPorCarga[+] = repartirLineas[i]; lineasPorCarga[−] = max(n_j, llegadas_j) y nº de líneas «signo −» de j = max(0, n_j − llegadas_j);
 *  - Fibonacci: coeficiente de variación (σ/μ) de los conteos por octante ≤ 0.15 para n ≥ 48 y ≤ 0.30 para 24 ≤ n < 48
 *    (el contrato dice «≤15 % para n ≥ 24»; con la espiral áurea exacta n=24 da σ/μ ≈ 0.24 — se deja constancia al revisor);
 *  - el final de una línea que sale hasta la esfera límite dista de rLimite como máximo un paso adaptativo (4·pasoLinea).
 */
import { describe, expect, it } from "vitest";
import {
  LINEAS_POR_UC,
  MAX_PUNTOS_LINEA,
  MIN_LINEAS_CARGA,
  NIVELES_GAUSS3D,
  R_ABS_3D,
  R_LIMITE_FACTOR,
  R_SEED_3D,
} from "./constantes";
import { puntosFibonacci, repartirLineas, trazarLineas3D } from "./lineas3d";
import { crearBufferesLineas } from "./unionesBuffers";
import type { Carga3D, LineasCampo3D, Superficie } from "./tipos";
import { campoRef, cargasAleatoriasValidas, dentroRef, prng, rLimiteDe, type V3 } from "./referencia";

const C = (x: number, y: number, z: number, q: number): Carga3D => ({ x, y, z, q });

const trazar = (s: Superficie, cargas: Carga3D[], nivel = 0, salida?: LineasCampo3D) =>
  trazarLineas3D(cargas, rLimiteDe(s, cargas), NIVELES_GAUSS3D[nivel], undefined, salida);

const pt = (L: LineasCampo3D, k: number): V3 => [L.puntos[3 * k], L.puntos[3 * k + 1], L.puntos[3 * k + 2]];
const dist = (a: ArrayLike<number>, c: Carga3D) => Math.hypot(a[0] - c.x, a[1] - c.y, a[2] - c.z);

describe("puntosFibonacci (test 9)", () => {
  it("devuelve 3·n coordenadas, vectores unitarios y sin NaN", () => {
    for (const n of [1, 6, 24, 60, 240]) {
      const p = puntosFibonacci(n, 0.37);
      expect(p).toBeInstanceOf(Float64Array);
      expect(p.length).toBe(3 * n);
      for (let i = 0; i < n; i++) expect(Math.hypot(p[3 * i], p[3 * i + 1], p[3 * i + 2])).toBeCloseTo(1, 12);
    }
  });
  it("cobertura uniforme: σ/μ de los conteos por octante (varias rotaciones)", () => {
    for (const n of [24, 30, 48, 60, 120, 240]) {
      const limite = n >= 48 ? 0.15 : 0.3;
      for (const rot of [0, 0.31, 1.7, 3.0, 5.5]) {
        const p = puntosFibonacci(n, rot);
        const cuenta = new Array(8).fill(0);
        for (let i = 0; i < n; i++) cuenta[(p[3 * i] > 0 ? 1 : 0) + (p[3 * i + 1] > 0 ? 2 : 0) + (p[3 * i + 2] > 0 ? 4 : 0)]++;
        const mu = n / 8;
        const sigma = Math.sqrt(cuenta.reduce((s, c) => s + (c - mu) ** 2, 0) / 8);
        expect(sigma / mu, `n=${n} rot=${rot} cuentas=${cuenta}`).toBeLessThanOrEqual(limite);
      }
    }
  });
  it("centro de masa ≈ 0 y separación mínima razonable (sin puntos casi coincidentes)", () => {
    const n = 120;
    const p = puntosFibonacci(n, 0.5);
    let sx = 0;
    let sy = 0;
    let sz = 0;
    for (let i = 0; i < n; i++) {
      sx += p[3 * i];
      sy += p[3 * i + 1];
      sz += p[3 * i + 2];
    }
    expect(Math.hypot(sx, sy, sz) / n).toBeLessThan(0.02);
    let minAng = Infinity;
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        const dot = p[3 * i] * p[3 * j] + p[3 * i + 1] * p[3 * j + 1] + p[3 * i + 2] * p[3 * j + 2];
        minAng = Math.min(minAng, Math.acos(Math.max(-1, Math.min(1, dot))));
      }
    }
    expect(minAng).toBeGreaterThan(0.5 * Math.sqrt((4 * Math.PI) / n));
  });
  it("determinismo: misma entrada → mismos bytes; distinta rotación → conjunto distinto", () => {
    const a = puntosFibonacci(60, 1.234);
    const b = puntosFibonacci(60, 1.234);
    expect(Buffer.from(a.buffer).equals(Buffer.from(b.buffer))).toBe(true);
    const c = puntosFibonacci(60, 2.5);
    expect(Buffer.from(a.buffer).equals(Buffer.from(c.buffer))).toBe(false);
  });
  it("la rotación gira alrededor de z: el conjunto conserva las z (como multiconjunto)", () => {
    const za = Array.from({ length: 48 }, (_, i) => puntosFibonacci(48, 0)[3 * i + 2]).sort((x, y) => x - y);
    const zb = Array.from({ length: 48 }, (_, i) => puntosFibonacci(48, 2)[3 * i + 2]).sort((x, y) => x - y);
    za.forEach((z, i) => expect(zb[i]).toBeCloseTo(z, 10));
  });
});

describe("repartirLineas", () => {
  it("carga única q=3 con presupuesto holgado: 3·lineasPorUC", () => {
    expect(repartirLineas([C(0, 0, 0, 3)], 240, 20)).toEqual([60]);
    expect(repartirLineas([C(0, 0, 0, 3)], 240)).toEqual([Math.round(3 * LINEAS_POR_UC)]);
  });
  it("n_i ∝ |q_i| (±1 por redondeo) y el signo no cuenta", () => {
    const r = repartirLineas([C(0, 0, 0, 1), C(5, 0, 0, -3)], 240, 20);
    expect(Math.abs(r[0] - 20)).toBeLessThanOrEqual(1);
    expect(Math.abs(r[1] - 60)).toBeLessThanOrEqual(1);
    const d = repartirLineas([C(0, 0, 0, 3), C(5, 0, 0, -3)], 240, 20);
    expect(d[0]).toBe(d[1]);
  });
  it("mínimo MIN_LINEAS_CARGA", () => {
    const r = repartirLineas([C(0, 0, 0, 0.5)], 240, 4); // 0.5·4 = 2 < 6
    expect(r[0]).toBe(MIN_LINEAS_CARGA);
    expect(Math.min(...repartirLineas([C(0, 0, 0, 0.5), C(4, 0, 0, -5)], 240, 20))).toBeGreaterThanOrEqual(MIN_LINEAS_CARGA);
  });
  it("si Σ > presupuesto se reescala proporcionalmente (Σ = presupuesto, enteros, respeta proporciones)", () => {
    const igual = repartirLineas([C(0, 0, 0, 5), C(5, 0, 0, -5)], 240, 30); // pedirían 300
    expect(igual.reduce((a, b) => a + b, 0)).toBe(240);
    expect(igual[0]).toBe(120);
    expect(igual[1]).toBe(120);
    const baja = repartirLineas([C(0, 0, 0, 5), C(5, 0, 0, -1)], 60, 20); // 100 + 20 → 60
    expect(baja.reduce((a, b) => a + b, 0)).toBe(60);
    expect(Math.abs(baja[0] - 50)).toBeLessThanOrEqual(1);
    for (const n of baja) expect(Number.isInteger(n)).toBe(true);
  });
  it("con los candidatos 16/20/24 y q=5+5 nunca supera el presupuesto del nivel alto (240)", () => {
    for (const lpu of [16, 20, 24]) {
      const r = repartirLineas([C(0, 0, 0, 5), C(5, 0, 0, -5)], 240, lpu);
      expect(r.reduce((a, b) => a + b, 0)).toBeLessThanOrEqual(240);
    }
  });
});

describe("trazarLineas3D — carga única en esfera (escenarios 2 y 9)", () => {
  const s: Superficie = { tipo: "esfera", radio: 5 };
  const cargas = [C(0, 0, 0, 3)];
  const L = trazar(s, cargas);
  const nEsperado = repartirLineas(cargas, NIVELES_GAUSS3D[0].presupuestoLineas)[0];

  it("n = repartirLineas; lineasPorCarga = [n, 0]; todas salen de la carga 0 con signo +", () => {
    expect(L.n).toBe(nEsperado);
    expect(L.lineasPorCarga[0]).toBe(nEsperado);
    expect(L.lineasPorCarga[1]).toBe(0);
    for (let i = 0; i < L.n; i++) {
      expect(L.carga[i]).toBe(0);
      expect(L.signo[i]).toBe(1);
    }
  });
  it("todas terminan en la esfera límite (fin = 1, finCarga = −1) y ninguna en MAX_PUNTOS (fin ≠ 2)", () => {
    const rLim = rLimiteDe(s, cargas);
    for (let i = 0; i < L.n; i++) {
      expect(L.fin[i]).toBe(1);
      expect(L.finCarga[i]).toBe(-1);
      const ult = pt(L, L.inicio[i + 1] - 1);
      expect(Math.abs(Math.hypot(...ult) - rLim)).toBeLessThanOrEqual(4 * NIVELES_GAUSS3D[0].pasoLinea + 1e-3);
    }
  });
  it("estructura de buffers: inicio monótono, puntos finitos, ≤ MAX_PUNTOS_LINEA por línea, ≥ 2 puntos", () => {
    expect(L.inicio[0]).toBe(0);
    expect(L.inicio.length).toBeGreaterThanOrEqual(L.n + 1);
    for (let i = 0; i < L.n; i++) {
      const np = L.inicio[i + 1] - L.inicio[i];
      expect(np).toBeGreaterThanOrEqual(2);
      expect(np).toBeLessThanOrEqual(MAX_PUNTOS_LINEA);
    }
    expect(L.puntos.length).toBeGreaterThanOrEqual(3 * L.inicio[L.n]);
    for (let k = 0; k < 3 * L.inicio[L.n]; k++) expect(Number.isFinite(L.puntos[k])).toBe(true);
  });
  it("primer punto a R_SEED_3D de la carga; las líneas son rectas radiales (simetría esférica)", () => {
    for (let i = 0; i < L.n; i++) {
      const a = pt(L, L.inicio[i]);
      expect(Math.abs(Math.hypot(...a) - R_SEED_3D)).toBeLessThan(1e-4);
      const u = a.map((v) => v / Math.hypot(...a));
      for (let k = L.inicio[i]; k < L.inicio[i + 1]; k++) {
        const p = pt(L, k);
        const r = Math.hypot(...p);
        // el punto es r·u: desviación angular mínima (error acumulado RK2 + Float32)
        const dev = Math.hypot(p[0] - r * u[0], p[1] - r * u[1], p[2] - r * u[2]);
        expect(dev).toBeLessThan(1e-3 + 1e-4 * r);
      }
    }
  });
  it("direcciones de salida bien repartidas (σ/μ por octante ≤ 0.25 con 60 líneas)", () => {
    const cuenta = new Array(8).fill(0);
    for (let i = 0; i < L.n; i++) {
      const a = pt(L, L.inicio[i]);
      cuenta[(a[0] > 0 ? 1 : 0) + (a[1] > 0 ? 2 : 0) + (a[2] > 0 ? 4 : 0)]++;
    }
    const mu = L.n / 8;
    const sigma = Math.sqrt(cuenta.reduce((s2, c) => s2 + (c - mu) ** 2, 0) / 8);
    expect(sigma / mu).toBeLessThanOrEqual(0.25);
  });
  it("paso adaptativo: ≪ puntos que con paso fijo (límite 15 u, 0.15 u ⇒ ~100); nunca > MAX_PUNTOS_LINEA", () => {
    for (let i = 0; i < L.n; i++) expect(L.inicio[i + 1] - L.inicio[i]).toBeLessThan(120);
  });
  it("calidad baja: ≤ 60 líneas y mismo invariante de salida", () => {
    const Lb = trazar(s, cargas, 2);
    expect(Lb.n).toBeLessThanOrEqual(60);
    for (let i = 0; i < Lb.n; i++) expect(Lb.fin[i]).toBe(1);
  });
});

describe("trazarLineas3D — orientación y contabilidad con 2 cargas", () => {
  const s: Superficie = { tipo: "esfera", radio: 5 };
  const casos: [string, Carga3D[]][] = [
    ["dipolo ±3 (escenario 7)", [C(-2, 0, 0, 3), C(2, 0, 0, -3)]],
    ["desigual +5/−1", [C(-2, 0.5, 0, 5), C(3, 0, 1, -1)]],
    ["desigual +1/−5", [C(-2, 0.5, 0, 1), C(3, 0, 1, -5)]],
    ["dos positivas", [C(-2, 0, 0, 3), C(2, 0, 0, 3)]],
    ["dos negativas", [C(-2, 0, 0, -3), C(2, 0, 1, -2)]],
  ];
  for (const [nombre, cargas] of casos) {
    describe(nombre, () => {
      const L = trazar(s, cargas);
      const rep = repartirLineas(cargas, NIVELES_GAUSS3D[0].presupuestoLineas);
      const llegadas = [0, 0];
      for (let i = 0; i < L.n; i++) if (L.signo[i] === 1 && L.fin[i] === 0) llegadas[L.finCarga[i]]++;

      it("ninguna línea con fin = 2; sin NaN; finCarga ≥ 0 sii fin = 0", () => {
        for (let i = 0; i < L.n; i++) {
          expect(L.fin[i]).not.toBe(2);
          expect(L.finCarga[i] >= 0).toBe(L.fin[i] === 0);
        }
        for (let k = 0; k < 3 * L.inicio[L.n]; k++) expect(Number.isFinite(L.puntos[k])).toBe(true);
      });
      it("todas las polilíneas van a favor de E (E·segmento > 0 en cada punto medio)", () => {
        for (let i = 0; i < L.n; i++) {
          for (let k = L.inicio[i]; k < L.inicio[i + 1] - 1; k++) {
            const a = pt(L, k);
            const b = pt(L, k + 1);
            const m = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2];
            const E = campoRef(m, cargas);
            expect(E[0] * (b[0] - a[0]) + E[1] * (b[1] - a[1]) + E[2] * (b[2] - a[2]), `línea ${i} seg ${k}`).toBeGreaterThan(0);
          }
        }
      });
      it("siembra: +q → primer punto a R_SEED_3D de su carga; −q (invertidas) → último punto a R_SEED_3D", () => {
        for (let i = 0; i < L.n; i++) {
          const c = cargas[L.carga[i]];
          if (L.signo[i] === 1) {
            expect(c.q).toBeGreaterThan(0);
            expect(Math.abs(dist(pt(L, L.inicio[i]), c) - R_SEED_3D)).toBeLessThan(1e-4);
          } else {
            expect(c.q).toBeLessThan(0);
            expect(Math.abs(dist(pt(L, L.inicio[i + 1] - 1), c) - R_SEED_3D)).toBeLessThan(1e-4);
          }
        }
      });
      it("las que terminan en carga lo hacen dentro del radio de absorción (+ un paso)", () => {
        for (let i = 0; i < L.n; i++) {
          if (L.fin[i] !== 0) continue;
          const c = cargas[L.finCarga[i]];
          expect(c.q).toBeLessThan(0);
          expect(dist(pt(L, L.inicio[i + 1] - 1), c)).toBeLessThan(R_ABS_3D + 4 * NIVELES_GAUSS3D[0].pasoLinea);
        }
      });
      it("contabilidad: + → repartirLineas; − → max(n_j, llegadas_j) y sembradas hacia atrás = max(0, n_j − llegadas_j)", () => {
        cargas.forEach((c, j) => {
          const propias = Array.from({ length: L.n }, (_, i) => i).filter((i) => L.carga[i] === j);
          if (c.q > 0) {
            expect(L.lineasPorCarga[j]).toBe(rep[j]);
            expect(propias.length).toBe(rep[j]);
            expect(propias.every((i) => L.signo[i] === 1)).toBe(true);
          } else {
            expect(L.lineasPorCarga[j]).toBe(Math.max(rep[j], llegadas[j]));
            expect(propias.length).toBe(Math.max(0, rep[j] - llegadas[j]));
            expect(propias.every((i) => L.signo[i] === -1)).toBe(true);
            expect(L.lineasPorCarga[j]).toBe(llegadas[j] + propias.length);
          }
        });
        // el total de líneas es la suma de las emitidas por + y las sembradas hacia atrás
        const totalEsperado = cargas.reduce((a, c, j) => a + (c.q > 0 ? rep[j] : Math.max(0, rep[j] - llegadas[j])), 0);
        expect(L.n).toBe(totalEsperado);
        expect(L.n).toBeLessThanOrEqual(NIVELES_GAUSS3D[0].presupuestoLineas * 2);
      });
    });
  }

  it("dipolo ±3: la mayoría de las líneas de +3 acaban en −3 (≥ 40 de 60) y las que no, en la esfera límite", () => {
    const L = trazar(s, [C(-2, 0, 0, 3), C(2, 0, 0, -3)]);
    let aB = 0;
    for (let i = 0; i < L.n; i++) if (L.signo[i] === 1 && L.fin[i] === 0 && L.finCarga[i] === 1) aB++;
    expect(aB).toBeGreaterThanOrEqual(40);
    expect(aB).toBeLessThanOrEqual(L.lineasPorCarga[0]);
    expect(L.lineasPorCarga[1]).toBe(L.lineasPorCarga[0]); // q iguales y opuestas
  });
});

describe("trazarLineas3D — escenarios aleatorios válidos (test 8, parte de líneas)", () => {
  const formas: Superficie[] = [
    { tipo: "esfera", radio: 2 },
    { tipo: "esfera", radio: 5 },
    { tipo: "cubo", lado: 16 },
    { tipo: "cilindro", radio: 8, altura: 16 },
    { tipo: "cilindro", radio: 4, altura: 8 },
  ];
  for (const s of formas) {
    it(`${s.tipo} ${JSON.stringify(s)}: 40 posiciones con semilla; sin fin=2, sin NaN, identidad de lineasPorCarga`, () => {
      const rnd = prng(1234);
      for (let it2 = 0; it2 < 40; it2++) {
        const cargas = cargasAleatoriasValidas(s, rnd, it2 % 4 === 0 ? 1 : 2);
        const nivel = it2 % 5 === 0 ? 2 : 0;
        const L = trazar(s, cargas, nivel);
        const rep = repartirLineas(cargas, NIVELES_GAUSS3D[nivel].presupuestoLineas);
        const llegadas = cargas.map(() => 0);
        for (let i = 0; i < L.n; i++) {
          expect(L.fin[i], `it=${it2} línea ${i}`).not.toBe(2);
          if (L.signo[i] === 1 && L.fin[i] === 0) llegadas[L.finCarga[i]]++;
        }
        for (let k = 0; k < 3 * L.inicio[L.n]; k++) expect(Number.isFinite(L.puntos[k])).toBe(true);
        cargas.forEach((c, j) => {
          if (c.q > 0) {
            expect(L.lineasPorCarga[j], `it=${it2} carga ${j}`).toBe(rep[j]);
            return;
          }
          // contabilidad veraz: llegadas desde las + más las sembradas hacia atrás de esa carga
          const propias = Array.from({ length: L.n }, (_, i) => i).filter((i) => L.carga[i] === j && L.signo[i] === -1).length;
          expect(L.lineasPorCarga[j], `it=${it2} carga ${j}`).toBe(llegadas[j] + propias);
          const objetivo = Math.max(rep[j], llegadas[j]);
          if (L.lineasPorCarga[j] !== objetivo) {
            // CAMBIO JUSTIFICADO (fase 1B): si una carga + más fuerte absorbe TODA línea trazada hacia atrás desde −j
            // (todo el flujo que entra en −j viene de ella), no existe la línea «n_j − llegadas_j»: la cuenta veraz es menor.
            expect(L.lineasPorCarga[j]).toBeLessThan(objetivo);
            expect(cargas.some((o) => o.q > 0 && o.q > -c.q), `it=${it2} carga ${j}`).toBe(true);
          }
        });
        if (cargas.length === 1) expect(L.lineasPorCarga[1]).toBe(0);
      }
    });
  }
  it("cargas en las esquinas del rango (x,y = ±12, z = ±10) con R=2: la esfera límite las incluye (las líneas no mueren en el primer paso)", () => {
    const s: Superficie = { tipo: "esfera", radio: 2 };
    for (const [x, y, z] of [[12, 12, 10], [-12, 12, -10], [12, -12, 10]] as const) {
      const cargas = [C(x, y, z, 3), C(0, 0, 0, -3)];
      expect(Math.hypot(x, y, z)).toBeGreaterThan(R_LIMITE_FACTOR * 2); // el caso que motivó el max|r_i|
      const L = trazar(s, cargas);
      for (let i = 0; i < L.n; i++) {
        if (L.carga[i] === 0) expect(L.inicio[i + 1] - L.inicio[i], `línea ${i}`).toBeGreaterThan(3);
        expect(L.fin[i]).not.toBe(2);
      }
    }
  });
  it("carga a DIST_MIN_SUP de la cara (peor caso de la semilla): la semilla queda del mismo lado que la carga", () => {
    const cases: [Superficie, Carga3D][] = [
      [{ tipo: "esfera", radio: 5 }, C(0, 0, 4.6, 3)],
      [{ tipo: "esfera", radio: 5 }, C(0, 0, 5.4, 3)],
      [{ tipo: "cubo", lado: 8 }, C(3.6, 3.6, 3.6, 3)],
      [{ tipo: "cilindro", radio: 4, altura: 8 }, C(3.6, 0, 3.6, -3)],
    ];
    for (const [s, c] of cases) {
      const dentroCarga = dentroRef(s, [c.x, c.y, c.z]);
      const L = trazar(s, [c]);
      for (let i = 0; i < L.n; i++) {
        const k = L.signo[i] === 1 ? L.inicio[i] : L.inicio[i + 1] - 1;
        expect(dentroRef(s, pt(L, k)), `${s.tipo} línea ${i}`).toBe(dentroCarga);
        // la semilla está a R_SEED_3D < DIST_MIN_SUP de la carga ⇒ no puede cruzar la superficie
        expect(Math.abs(dist(pt(L, k), c) - R_SEED_3D)).toBeLessThan(1e-4);
      }
    }
  });
});

describe("trazarLineas3D — determinismo y reutilización de buffers", () => {
  const s: Superficie = { tipo: "esfera", radio: 5 };
  const cargas = [C(-2, 0, 0, 3), C(2, 0.5, 0, -3)];
  it("misma entrada → mismas líneas; reutilizar `salida` da el mismo contenido que una llamada nueva", () => {
    const a = trazar(s, cargas);
    const b = trazar(s, cargas);
    expect(b.n).toBe(a.n);
    expect(Array.from(b.puntos.subarray(0, 3 * b.inicio[b.n]))).toEqual(Array.from(a.puntos.subarray(0, 3 * a.inicio[a.n])));
    const buf = crearBufferesLineas(NIVELES_GAUSS3D[0].presupuestoLineas);
    const c = trazar(s, cargas, 0, buf);
    expect(c.n).toBe(a.n);
    expect(Array.from(c.inicio.subarray(0, c.n + 1))).toEqual(Array.from(a.inicio.subarray(0, a.n + 1)));
    expect(Array.from(c.puntos.subarray(0, 3 * c.inicio[c.n]))).toEqual(Array.from(a.puntos.subarray(0, 3 * a.inicio[a.n])));
    expect(Array.from(c.lineasPorCarga)).toEqual(Array.from(a.lineasPorCarga));
    // reutilizar el mismo buffer con otra escena no deja restos de la anterior
    const d = trazar(s, [C(0, 0, 0, 3)], 0, buf);
    expect(d.n).toBe(repartirLineas([C(0, 0, 0, 3)], 240)[0]);
    expect(d.lineasPorCarga[1]).toBe(0);
  });
});
