/**
 * README de pruebas — superficies.ts (contrato §1, §3, test obligatorio 12).
 * Geometría analítica escrita a mano en referencia.ts. Supuestos documentados (no fijados literalmente en el contrato):
 *  - `distanciaConSigno` es la distancia euclídea exacta a la superficie (también fuera de aristas/esquinas);
 *  - `radioEnvolvente`: esfera R, cubo a√3/2, cilindro √(R²+(h/2)²), parche l√2/2 (esfera centrada en el origen;
 *    cubo a=16 → 13.86, 3× = 41.6 u como cita el contrato);
 *  - `crearSuperficie(tipo, params)` acepta los campos del tipo (radio, lado, altura, theta, phi) parciales.
 */
import { describe, expect, it } from "vitest";
import { DIST_MIN_CARGAS, DIST_MIN_SUP } from "./constantes";
import {
  ajustarCargaFueraDeSuperficie,
  ajustarDistanciaCargas,
  area,
  cargasEncerradas,
  crearSuperficie,
  distanciaConSigno,
  estaDentro,
  normalParche,
  qEncerrada,
  radioEnvolvente,
} from "./superficies";
import type { Carga3D, Superficie, TipoSuperficie } from "./tipos";
import { areaRef, dentroRef, normaParche, prng, radioEnvolventeRef } from "./referencia";

type Params = Record<string, number>;
const crear = crearSuperficie as unknown as (t: TipoSuperficie, p?: Params) => Superficie;
const C = (x: number, y: number, z: number, q = 1): Carga3D => ({ x, y, z, q });
const dist = (a: Carga3D, b: Carga3D) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);

describe("crearSuperficie", () => {
  it("defaults de §1", () => {
    expect(crear("esfera")).toEqual({ tipo: "esfera", radio: 5 });
    expect(crear("cubo")).toEqual({ tipo: "cubo", lado: 8 });
    expect(crear("cilindro")).toEqual({ tipo: "cilindro", radio: 4, altura: 8 });
    expect(crear("parche")).toEqual({ tipo: "parche", lado: 4, theta: 0, phi: 0 });
  });
  it("params parciales sobrescriben solo lo indicado", () => {
    expect(crear("esfera", { radio: 3 })).toEqual({ tipo: "esfera", radio: 3 });
    expect(crear("cilindro", { altura: 12 })).toEqual({ tipo: "cilindro", radio: 4, altura: 12 });
    expect(crear("parche", { lado: 10 })).toMatchObject({ tipo: "parche", lado: 10, theta: 0, phi: 0 });
  });
});

describe("normalParche", () => {
  it("n = (sinθ cosφ, sinθ sinφ, cosθ), unitaria", () => {
    for (const [theta, phi] of [[0, 0], [Math.PI / 6, 0], [Math.PI / 3, 1], [Math.PI / 2, 2.2], [Math.PI, 0]]) {
      const s = { tipo: "parche", lado: 4, theta, phi } as const;
      const n = normalParche(s);
      const r = normaParche(s);
      for (let i = 0; i < 3; i++) expect(n[i]).toBeCloseTo(r[i], 13);
      expect(Math.hypot(n[0], n[1], n[2])).toBeCloseTo(1, 13);
    }
  });
});

describe("radioEnvolvente y area", () => {
  const sups: Superficie[] = [
    { tipo: "esfera", radio: 2 },
    { tipo: "esfera", radio: 8 },
    { tipo: "cubo", lado: 16 },
    { tipo: "cilindro", radio: 8, altura: 16 },
    { tipo: "parche", lado: 12, theta: 0.3, phi: 0.2 },
  ];
  for (const s of sups) {
    it(`${s.tipo}: radioEnvolvente y area analíticos`, () => {
      expect(radioEnvolvente(s)).toBeCloseTo(radioEnvolventeRef(s), 12);
      expect(area(s)).toBeCloseTo(areaRef(s), 9);
    });
  }
  it("cubo a=16: límite 3·R_env ≈ 41.6 u (cita del contrato)", () => {
    expect(3 * radioEnvolvente({ tipo: "cubo", lado: 16 })).toBeCloseTo(41.569, 2);
  });
});

describe("estaDentro / distanciaConSigno", () => {
  it("esfera: |p|−R exacta; dentro iff d<0", () => {
    const s: Superficie = { tipo: "esfera", radio: 5 };
    expect(distanciaConSigno(s, [0, 0, 0])).toBeCloseTo(-5, 12);
    expect(distanciaConSigno(s, [3, 4, 0])).toBeCloseTo(0, 12);
    expect(distanciaConSigno(s, [0, 0, 8])).toBeCloseTo(3, 12);
    expect(estaDentro(s, [1, 1, 1])).toBe(true);
    expect(estaDentro(s, [0, 0, 5.01])).toBe(false);
  });
  it("cubo: distancia euclídea exacta (cara, arista, esquina); dentro = −(a/2 − max|c|)", () => {
    const s: Superficie = { tipo: "cubo", lado: 8 };
    expect(distanciaConSigno(s, [0, 0, 0])).toBeCloseTo(-4, 12);
    expect(distanciaConSigno(s, [1, -3, 2])).toBeCloseTo(-1, 12);
    expect(distanciaConSigno(s, [6, 0, 0])).toBeCloseTo(2, 12);
    expect(distanciaConSigno(s, [6, 7, 0])).toBeCloseTo(Math.hypot(2, 3), 12);
    expect(distanciaConSigno(s, [5, 5, 5])).toBeCloseTo(Math.sqrt(3), 12);
    expect(estaDentro(s, [3.9, -3.9, 3.9])).toBe(true);
    expect(estaDentro(s, [4.1, 0, 0])).toBe(false);
  });
  it("cilindro: cuerpo, tapa y borde de tapa", () => {
    const s: Superficie = { tipo: "cilindro", radio: 4, altura: 8 };
    expect(distanciaConSigno(s, [0, 0, 0])).toBeCloseTo(-4, 12);
    expect(distanciaConSigno(s, [0, 0, 3])).toBeCloseTo(-1, 12);
    expect(distanciaConSigno(s, [6, 0, 0])).toBeCloseTo(2, 12);
    expect(distanciaConSigno(s, [0, 0, 7])).toBeCloseTo(3, 12);
    expect(distanciaConSigno(s, [7, 0, 6])).toBeCloseTo(Math.hypot(3, 2), 12);
    expect(estaDentro(s, [3.9, 0, 3.9])).toBe(true);
    expect(estaDentro(s, [4.1, 0, 0])).toBe(false);
    expect(estaDentro(s, [0, 0, 4.1])).toBe(false);
  });
  it("parche: estaDentro siempre false; distancia al plano con signo según n", () => {
    const s: Superficie = { tipo: "parche", lado: 4, theta: 0, phi: 0 };
    expect(estaDentro(s, [0, 0, 0])).toBe(false);
    expect(estaDentro(s, [0, 0, -3])).toBe(false);
    expect(distanciaConSigno(s, [0, 0, 6])).toBeCloseTo(6, 12);
    expect(distanciaConSigno(s, [0, 0, -6])).toBeCloseTo(-6, 12);
    const incl: Superficie = { tipo: "parche", lado: 4, theta: Math.PI / 2, phi: 0 }; // n = +x
    expect(distanciaConSigno(incl, [3, 7, -2])).toBeCloseTo(3, 12);
    expect(distanciaConSigno(incl, [-2, 0, 0])).toBeCloseTo(-2, 12);
  });
  it("estaDentro coincide con el predicado de referencia (500 puntos aleatorios por forma)", () => {
    const rnd = prng(7);
    const sups: Superficie[] = [
      { tipo: "esfera", radio: 5 },
      { tipo: "cubo", lado: 8 },
      { tipo: "cilindro", radio: 4, altura: 8 },
    ];
    for (const s of sups) {
      for (let i = 0; i < 500; i++) {
        const p: [number, number, number] = [(rnd() - 0.5) * 20, (rnd() - 0.5) * 20, (rnd() - 0.5) * 20];
        expect(estaDentro(s, p)).toBe(dentroRef(s, p));
      }
    }
  });
});

describe("cargasEncerradas / qEncerrada", () => {
  const s: Superficie = { tipo: "esfera", radio: 5 };
  it("índices y suma de las cargas estrictamente dentro", () => {
    const cs = [C(-2, 0, 0, 3), C(8, 0, 0, -1.5)];
    expect(cargasEncerradas(s, cs)).toEqual([0]);
    expect(qEncerrada(s, cs)).toBe(3);
    expect(cargasEncerradas(s, [C(1, 0, 0, 2), C(0, 1, 0, -2)])).toEqual([0, 1]);
    expect(qEncerrada(s, [C(1, 0, 0, 2), C(0, 1, 0, -2)])).toBe(0);
    expect(cargasEncerradas(s, [C(9, 0, 0), C(0, 0, 7)])).toEqual([]);
    expect(qEncerrada(s, [C(9, 0, 0), C(0, 0, 7)])).toBe(0);
  });
  it("parche: nunca encierra carga", () => {
    const p: Superficie = { tipo: "parche", lado: 10, theta: 0, phi: 0 };
    expect(cargasEncerradas(p, [C(0, 0, -3, 3)])).toEqual([]);
    expect(qEncerrada(p, [C(0, 0, -3, 3)])).toBe(0);
  });
});

describe("ajustarCargaFueraDeSuperficie (test 12)", () => {
  const sups: Superficie[] = [
    { tipo: "esfera", radio: 5 },
    { tipo: "cubo", lado: 8 },
    { tipo: "cilindro", radio: 4, altura: 8 },
  ];
  for (const s of sups) {
    it(`${s.tipo}: |d| ≥ DIST_MIN_SUP; dentro de la franja conserva el lado de la previa; fuera de ella respeta lo pedido`, () => {
      const rnd = prng(11);
      for (let i = 0; i < 300; i++) {
        const previaFuera = rnd() < 0.5;
        const lado = previaFuera ? 1 : -1;
        const rp = previaFuera ? 9 : 1.5;
        const previa = C(0.6 * rp, 0.8 * rp, 0);
        expect(Math.sign(distanciaConSigno(s, [previa.x, previa.y, previa.z]))).toBe(lado);
        const rr = 1 + rnd() * 8;
        const ang = rnd() * 6.28;
        const pedida = C(rr * Math.cos(ang), rr * Math.sin(ang), (rnd() - 0.5) * 6, 2);
        const dPed = distanciaConSigno(s, [pedida.x, pedida.y, pedida.z]);
        const r = ajustarCargaFueraDeSuperficie(s, pedida, previa);
        const dR = distanciaConSigno(s, [r.x, r.y, r.z]);
        expect(Math.abs(dR)).toBeGreaterThanOrEqual(DIST_MIN_SUP - 1e-9);
        expect(r.q).toBe(2);
        if (Math.abs(dPed) >= DIST_MIN_SUP) {
          expect(r).toMatchObject({ x: pedida.x, y: pedida.y, z: pedida.z });
        } else {
          expect(Math.sign(dR)).toBe(lado);
        }
      }
    });
  }

  it("esfera: pedida a 0.1 u dentro; previa fuera → d = +0.4; previa dentro → d = −0.4", () => {
    const s: Superficie = { tipo: "esfera", radio: 5 };
    const pedida = C(0, 0, 4.9);
    const a = ajustarCargaFueraDeSuperficie(s, pedida, C(0, 0, 8));
    expect(distanciaConSigno(s, [a.x, a.y, a.z])).toBeCloseTo(DIST_MIN_SUP, 9);
    const b = ajustarCargaFueraDeSuperficie(s, pedida, C(0, 0, 2));
    expect(distanciaConSigno(s, [b.x, b.y, b.z])).toBeCloseTo(-DIST_MIN_SUP, 9);
  });

  it("esfera: cruzar — al salir de la franja por el otro lado la carga salta allí", () => {
    const s: Superficie = { tipo: "esfera", radio: 5 };
    const j = ajustarCargaFueraDeSuperficie(s, C(0, 0, 3), C(0, 0, 5.4));
    expect(j).toMatchObject({ x: 0, y: 0, z: 3 });
    expect(estaDentro(s, [j.x, j.y, j.z])).toBe(true);
  });

  it("sin previa: va al lado más cercano de la franja", () => {
    const s: Superficie = { tipo: "esfera", radio: 5 };
    const fuera = ajustarCargaFueraDeSuperficie(s, C(0, 0, 5.1));
    expect(distanciaConSigno(s, [fuera.x, fuera.y, fuera.z])).toBeCloseTo(DIST_MIN_SUP, 9);
    const dentro = ajustarCargaFueraDeSuperficie(s, C(0, 0, 4.9));
    expect(distanciaConSigno(s, [dentro.x, dentro.y, dentro.z])).toBeCloseTo(-DIST_MIN_SUP, 9);
  });

  it("es pura: no muta la carga de entrada", () => {
    const s: Superficie = { tipo: "esfera", radio: 5 };
    const c = C(0, 0, 4.9, 2);
    ajustarCargaFueraDeSuperficie(s, c, C(0, 0, 8));
    expect(c).toEqual(C(0, 0, 4.9, 2));
  });
});

describe("ajustarDistanciaCargas (test 12)", () => {
  it("mueve b hasta DIST_MIN_CARGAS si está más cerca; a no cambia; q se conserva", () => {
    const a = C(1, 2, 3, 3);
    const b = C(1.2, 2.1, 3.1, -2);
    const r = ajustarDistanciaCargas(a, b);
    expect(dist(a, r)).toBeGreaterThanOrEqual(DIST_MIN_CARGAS - 1e-9);
    expect(dist(a, r)).toBeLessThan(DIST_MIN_CARGAS + 1e-6);
    expect(r.q).toBe(-2);
    expect(a).toEqual(C(1, 2, 3, 3));
  });
  it("si ya están lejos devuelve b igual", () => {
    expect(ajustarDistanciaCargas(C(0, 0, 0), C(3, 0, 0, 2))).toMatchObject({ x: 3, y: 0, z: 0, q: 2 });
  });
  it("cargas coincidentes: resultado finito a distancia ≥ DIST_MIN_CARGAS", () => {
    const r = ajustarDistanciaCargas(C(0, 0, 0), C(0, 0, 0, -1));
    expect(Number.isFinite(r.x + r.y + r.z)).toBe(true);
    expect(dist(C(0, 0, 0), r)).toBeGreaterThanOrEqual(DIST_MIN_CARGAS - 1e-9);
  });
});
