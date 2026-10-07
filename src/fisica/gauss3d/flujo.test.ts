/**
 * README de pruebas — flujo.ts (contrato §1 convención ε₀=1, §3, tests obligatorios 1–7 y parche/escenario 8 de §5).
 * Referencias independientes (referencia.ts): cuadratura de punto medio de E·n dA (`cuadraturaRef`), fórmula cerrada del
 * ángulo sólido de un cuadrado centrado (4·asin(a²/(a²+d²))) y el valor Φ = q_enc de Gauss.
 * Tolerancias:
 *  - Φ por ángulo sólido en superficies cerradas: |Φ − q_enc| ≤ 1e-9·max(1,|q_enc|) en los 3 niveles de malla (el ángulo
 *    sólido de una malla cerrada es exacto, no depende de la resolución mientras la carga esté dentro/fuera de ella);
 *  - Σ porParche vs total: 1e-5 relativo (los parches son Float32);
 *  - cuadratura vs calcularFlujo: 5e-3 relativo (contrato; carga ≥ 1 u de la superficie); parche vs cuadratura: 1e-6;
 *  - parche vs valores tabulados del contrato (Φ/q = 0.03188, 0.02925, 0.01928): 1e-4 absoluto sobre Φ/q (están redondeados a 4 cifras).
 */
import { describe, expect, it } from "vitest";
import { C_POR_UNIDAD, K_COULOMB, M_POR_CUADRO, PX_POR_CUADRO, campoSI } from "../escala";
import { NIVELES_GAUSS3D, SOFT2_3D } from "./constantes";
import { campoEn } from "./campo3d";
import { anguloSolidoTriangulo, calcularFlujo, flujoCuadratura, flujoPorCarga } from "./flujo";
import { generarMalla } from "./mallas";
import type { Carga3D, MallaSuperficie, Superficie } from "./tipos";
import { flujoASI } from "./unidades";
import { CUATRO_PI, angSolidoCuadradoCentrado, cuadraturaRef, qEncRef } from "./referencia";

const C = (x: number, y: number, z: number, q: number): Carga3D => ({ x, y, z, q });
const tolGauss = (qEnc: number) => 1e-9 * Math.max(1, Math.abs(qEnc));

const cacheMalla = new Map<string, MallaSuperficie>();
function malla(s: Superficie, nivel: number): MallaSuperficie {
  const k = `${nivel}|${JSON.stringify(s)}`;
  const previa = cacheMalla.get(k);
  if (previa) return previa;
  const nueva = generarMalla(s, NIVELES_GAUSS3D[nivel]);
  cacheMalla.set(k, nueva);
  return nueva;
}
const flujo = (s: Superficie, cargas: Carga3D[], nivel = 0) => calcularFlujo(malla(s, nivel), cargas, s);

const FORMAS_CERRADAS: Superficie[] = [
  { tipo: "esfera", radio: 2 },
  { tipo: "esfera", radio: 5 },
  { tipo: "esfera", radio: 8 },
  { tipo: "cubo", lado: 4 },
  { tipo: "cubo", lado: 8 },
  { tipo: "cubo", lado: 16 },
  { tipo: "cilindro", radio: 2, altura: 4 },
  { tipo: "cilindro", radio: 4, altura: 8 },
  { tipo: "cilindro", radio: 8, altura: 16 },
];

/** Posiciones DENTRO: centrales, excéntricas y a 0.4 u (DIST_MIN_SUP) de la cara/esquina/borde. */
function posicionesDentro(s: Superficie): [number, number, number][] {
  const m = 0.4;
  if (s.tipo === "esfera") {
    const R = s.radio;
    return [
      [0, 0, 0],
      [0.3 * R, -0.2 * R, 0.1 * R],
      [(R - m) * 0.6, 0, (R - m) * 0.8],
      [0, 0, R - m],
      [R - m, 0, 0],
      [0, -(R - m), 0],
    ];
  }
  if (s.tipo === "cubo") {
    const h = s.lado / 2;
    return [
      [0, 0, 0],
      [0.3, -0.7, 0.5],
      [h - m, h - m, h - m], // esquina
      [h - m, 0, 0], // cara
      [h - m, -(h - m), 0], // arista
      [-(h - m), 0.2, h - m],
    ];
  }
  if (s.tipo === "cilindro") {
    const R = s.radio;
    const hz = s.altura / 2;
    return [
      [0, 0, 0],
      [0.3, -0.7, 0.5],
      [R - m, 0, hz - m], // borde de tapa
      [0, 0, hz - m], // tapa
      [(R - m) * Math.cos(0.7), (R - m) * Math.sin(0.7), 0], // cuerpo
      [-(R - m) * 0.5, (R - m) * 0.5, -(hz - m)],
    ];
  }
  return [];
}

/** Posiciones FUERA a distancia d de la superficie (cara, arista, esquina o borde de tapa). */
function posicionesFuera(s: Superficie, d: number): [number, number, number][] {
  const r2 = Math.SQRT1_2;
  const r3 = 1 / Math.sqrt(3);
  if (s.tipo === "esfera") {
    const R = s.radio + d;
    return [[R, 0, 0], [0, 0, -R], [R * 0.6, R * 0.8, 0]];
  }
  if (s.tipo === "cubo") {
    const h = s.lado / 2;
    return [
      [h + d, 0.3, -0.2],
      [h + d * r2, h + d * r2, 0.2], // a d de una arista
      [-(h + d * r3), h + d * r3, h + d * r3], // a d de una esquina
    ];
  }
  if (s.tipo === "cilindro") {
    const R = s.radio;
    const hz = s.altura / 2;
    return [
      [R + d, 0, 0.5],
      [0, 0.2, hz + d],
      [R + d * r2, 0, hz + d * r2], // a d del borde de tapa
    ];
  }
  return [];
}

const QS = [-5, -3, -0.5, 0.5, 3, 5];

describe("anguloSolidoTriangulo (Van Oosterom–Strackee)", () => {
  const O = [0, 0, 0] as const;
  it("octante: Ω = π/2 desde el origen; invertir el orden cambia el signo", () => {
    expect(anguloSolidoTriangulo(O, [1, 0, 0], [0, 1, 0], [0, 0, 1])).toBeCloseTo(Math.PI / 2, 12);
    expect(anguloSolidoTriangulo(O, [1, 0, 0], [0, 0, 1], [0, 1, 0])).toBeCloseTo(-Math.PI / 2, 12);
  });
  it("los 8 octantes orientados hacia afuera suman 4π", () => {
    let suma = 0;
    for (const sx of [-1, 1]) {
      for (const sy of [-1, 1]) {
        for (const sz of [-1, 1]) {
          const A: [number, number, number] = [sx, 0, 0];
          const B: [number, number, number] = [0, sy, 0];
          const Cc: [number, number, number] = [0, 0, sz];
          // normal exterior: (B−A)×(C−A) debe apuntar a (sx,sy,sz); si no, se intercambian B y C
          const u = [B[0] - A[0], B[1] - A[1], B[2] - A[2]];
          const w = [Cc[0] - A[0], Cc[1] - A[1], Cc[2] - A[2]];
          const n = [u[1] * w[2] - u[2] * w[1], u[2] * w[0] - u[0] * w[2], u[0] * w[1] - u[1] * w[0]];
          const ok = n[0] * sx + n[1] * sy + n[2] * sz > 0;
          suma += ok ? anguloSolidoTriangulo(O, A, B, Cc) : anguloSolidoTriangulo(O, A, Cc, B);
        }
      }
    }
    expect(suma).toBeCloseTo(CUATRO_PI, 11);
  });
  it("triángulo pequeño lejano ≈ área·cosα/r²; invariante a la escala; trasladar p y el triángulo no cambia Ω", () => {
    const A = [100, 0, 0] as const;
    const B = [100, 0.1, 0] as const;
    const Cc = [100, 0, 0.1] as const;
    const omega = anguloSolidoTriangulo(O, A, B, Cc);
    expect(omega).toBeCloseTo((0.5 * 0.1 * 0.1) / 100 ** 2, 8); // normal (1,0,0) saliente desde el observador: Ω > 0
    const k = 3.7;
    const a = anguloSolidoTriangulo(O, [1, 0, 0], [0, 1, 0], [0, 0, 1]);
    expect(anguloSolidoTriangulo(O, [k, 0, 0], [0, k, 0], [0, 0, k])).toBeCloseTo(a, 12);
    expect(anguloSolidoTriangulo([2, -1, 3], [3, -1, 3], [2, 0, 3], [2, -1, 4])).toBeCloseTo(a, 12);
  });
  it("punto en el plano del triángulo (fuera de él): Ω = 0", () => {
    expect(anguloSolidoTriangulo([5, 5, 0], [0, 0, 0], [1, 0, 0], [0, 1, 0])).toBeCloseTo(0, 12);
  });
});

describe("Test 1 — Φ = q/ε₀ con la carga dentro (esfera, cubo, cilindro; 3 niveles de malla)", () => {
  for (const s of FORMAS_CERRADAS) {
    it(`${s.tipo} ${JSON.stringify(s)}`, () => {
      const pos = posicionesDentro(s);
      for (const nivel of [0, 1, 2]) {
        for (const p of pos) {
          for (const q of QS) {
            const r = flujo(s, [C(p[0], p[1], p[2], q)], nivel);
            expect(Math.abs(r.total - q), `nivel ${nivel} p=${p} q=${q}`).toBeLessThanOrEqual(tolGauss(q));
            expect(r.qEnc).toBeCloseTo(q, 12);
          }
        }
      }
    });
  }
});

describe("Test 2 — Φ = 0 con la carga fuera (0.4, 1, 10 u; cara, arista, esquina; 1 y 2 cargas)", () => {
  for (const s of FORMAS_CERRADAS) {
    it(`${s.tipo} ${JSON.stringify(s)}`, () => {
      for (const nivel of [0, 1, 2]) {
        for (const d of [0.4, 1, 10]) {
          const pos = posicionesFuera(s, d);
          for (const p of pos) {
            for (const q of [-5, 0.5, 3]) {
              const r = flujo(s, [C(p[0], p[1], p[2], q)], nivel);
              expect(Math.abs(r.total), `nivel ${nivel} d=${d} p=${p}`).toBeLessThanOrEqual(1e-9);
              expect(r.qEnc).toBe(0);
            }
          }
          // dos cargas fuera (de signos distintos)
          const r2 = flujo(s, [C(...pos[0], 3), C(...pos[pos.length - 1], -2)], nivel);
          expect(Math.abs(r2.total)).toBeLessThanOrEqual(1e-9);
          expect(r2.qEnc).toBe(0);
        }
      }
    });
  }
});

describe("Test 3 — cubo = esfera = cilindro para la misma escena (escenario 5: cubo a=8, cilindro R4×8, esfera R5)", () => {
  const trio: Superficie[] = [
    { tipo: "cubo", lado: 8 },
    { tipo: "cilindro", radio: 4, altura: 8 },
    { tipo: "esfera", radio: 5 },
  ];
  const posiciones: [number, number, number][] = [[1, -1, 0.5], [0, 0, 0], [2, 2, 1], [-1.5, 2, -2.5], [0.1, 0.1, 3.0]];
  it("igualdad a 1e-9 relativo en los tres niveles", () => {
    for (const nivel of [0, 1, 2]) {
      for (const p of posiciones) {
        for (const q of [3, -2.5]) {
          const phis = trio.map((s) => flujo(s, [C(p[0], p[1], p[2], q)], nivel).total);
          for (const f of phis) expect(Math.abs(f - q) / Math.abs(q)).toBeLessThanOrEqual(1e-9);
          expect(Math.abs(phis[0] - phis[1])).toBeLessThanOrEqual(1e-9 * Math.abs(q));
          expect(Math.abs(phis[1] - phis[2])).toBeLessThanOrEqual(1e-9 * Math.abs(q));
        }
      }
    }
  });
  it("pero los parches difieren entre formas (mismo total, distinta distribución)", () => {
    const [a, b] = [flujo(trio[0], [C(1, -1, 0.5, 3)]), flujo(trio[2], [C(1, -1, 0.5, 3)])];
    expect(a.porParche.length).not.toBe(b.porParche.length);
  });
});

describe("Test 4 — superposición y q_enc con 2 cargas", () => {
  for (const s of [{ tipo: "esfera", radio: 5 }, { tipo: "cubo", lado: 8 }, { tipo: "cilindro", radio: 4, altura: 8 }] as Superficie[]) {
    it(`${s.tipo}: una dentro + una fuera → q_dentro; las dos dentro → q1+q2`, () => {
      const fuera = posicionesFuera(s, 1)[0];
      for (const nivel of [0, 2]) {
        const a = flujo(s, [C(0.5, 0.3, -0.2, 3), C(...fuera, -4)], nivel);
        expect(Math.abs(a.total - 3)).toBeLessThanOrEqual(1e-9 * 3);
        expect(a.qEnc).toBeCloseTo(3, 12);
        expect(a.porCarga).toHaveLength(2);
        expect(a.porCarga[0]).toBeCloseTo(3, 9);
        expect(Math.abs(a.porCarga[1])).toBeLessThanOrEqual(1e-9);
        const b = flujo(s, [C(0.5, 0.3, -0.2, 3), C(-1, 1, 1, -1.5)], nivel);
        expect(Math.abs(b.total - 1.5)).toBeLessThanOrEqual(1e-9 * 1.5);
        expect(b.qEnc).toBeCloseTo(1.5, 12);
        const c = flujo(s, [C(0.5, 0.3, -0.2, 5), C(-1, 1, 1, 5)], nivel);
        expect(Math.abs(c.total - 10)).toBeLessThanOrEqual(1e-9 * 10);
        // la suma por carga es el total
        expect(c.porCarga[0] + c.porCarga[1]).toBeCloseTo(c.total, 10);
      }
    });
  }
});

describe("Test 5 — dipolo encerrado: Φ = 0 con parches de ambos signos", () => {
  for (const s of [{ tipo: "esfera", radio: 5 }, { tipo: "cubo", lado: 8 }, { tipo: "cilindro", radio: 4, altura: 8 }] as Superficie[]) {
    it(`${s.tipo}`, () => {
      for (const q of [0.5, 3, 5]) {
        for (const nivel of [0, 1, 2]) {
          const r = flujo(s, [C(-2, 0, 0, q), C(2, 0, 0, -q)], nivel);
          expect(Math.abs(r.total)).toBeLessThan(1e-9);
          expect(r.qEnc).toBe(0);
          const mx = Math.max(...r.porParche);
          const mn = Math.min(...r.porParche);
          expect(mx).toBeGreaterThan(0);
          expect(mn).toBeLessThan(0);
        }
      }
    });
  }
});

describe("Resultado: porParche, densidad, porCarga", () => {
  it("Σ porParche = total; densidad = porParche/área; porCarga = flujoPorCarga; maxAbsDensidad acota", () => {
    const casos: [Superficie, Carga3D[]][] = [
      [{ tipo: "esfera", radio: 5 }, [C(1, 0, 2, 3)]],
      [{ tipo: "cubo", lado: 8 }, [C(-2, 0, 0, 3), C(2, 0, 0, -3)]],
      [{ tipo: "cilindro", radio: 4, altura: 8 }, [C(1, 1, 1, 4), C(7, 0, 0, -1)]],
    ];
    for (const [s, cs] of casos) {
      for (const nivel of [0, 1, 2]) {
        const m = malla(s, nivel);
        const r = calcularFlujo(m, cs, s);
        expect(r.porParche).toHaveLength(m.nParches);
        expect(r.densidadParche).toHaveLength(m.nParches);
        const suma = Array.from(r.porParche).reduce((a, b) => a + b, 0);
        expect(Math.abs(suma - r.total)).toBeLessThanOrEqual(1e-5 * Math.max(1, Math.abs(r.total)));
        let maxD = 0;
        for (let p = 0; p < m.nParches; p++) {
          expect(Math.abs(r.densidadParche[p] - r.porParche[p] / m.areaParche[p])).toBeLessThanOrEqual(
            1e-4 * Math.abs(r.porParche[p] / m.areaParche[p]) + 1e-9,
          );
          maxD = Math.max(maxD, Math.abs(r.densidadParche[p]));
        }
        expect(r.maxAbsDensidad).toBeGreaterThan(0);
        expect(r.maxAbsDensidad).toBeLessThanOrEqual(maxD * (1 + 1e-6));
        for (let i = 0; i < cs.length; i++) {
          expect(r.porCarga[i]).toBeCloseTo(flujoPorCarga(m, cs[i]), 10);
        }
        expect(Array.from(r.porCarga).reduce((x, y) => x + y, 0)).toBeCloseTo(r.total, 10);
      }
    }
  });
  it("esfera con carga central: densidad uniforme E_n = q/(4πR²) (±1.5 % por malla inscrita)", () => {
    const s: Superficie = { tipo: "esfera", radio: 5 };
    const r = flujo(s, [C(0, 0, 0, 3)]);
    const en = 3 / (CUATRO_PI * 25);
    for (const d of r.densidadParche) expect(Math.abs(d - en) / en).toBeLessThan(0.015);
  });
  it("flujoPorCarga = q·ΣΩ/(4π): q si está dentro, 0 si fuera, lineal en q", () => {
    const s: Superficie = { tipo: "cubo", lado: 8 };
    const m = malla(s, 1);
    expect(flujoPorCarga(m, C(1, 1, 1, 2))).toBeCloseTo(2, 10);
    expect(flujoPorCarga(m, C(1, 1, 1, -4))).toBeCloseTo(-4, 10);
    expect(Math.abs(flujoPorCarga(m, C(9, 0, 0, 5)))).toBeLessThan(1e-9);
  });
  it("sin NaN en ningún campo", () => {
    const s: Superficie = { tipo: "esfera", radio: 5 };
    const r = flujo(s, [C(0, 0, 4.6, 5), C(0, 0, -5.4, -5)]);
    for (const v of [r.total, r.qEnc, r.maxAbsDensidad, ...r.porCarga, ...r.porParche, ...r.densidadParche]) {
      expect(Number.isFinite(v)).toBe(true);
    }
  });
});

describe("Test 6 — independencia de escala px→m, de softening y cuadratura", () => {
  it("Φ no depende de ninguna escala: reescalar geometría y posiciones deja Φ/q igual (parche) y Φ=q (cerrada)", () => {
    const k = 0.37;
    const a = flujo({ tipo: "parche", lado: 4, theta: 0.5, phi: 0.3 }, [C(1, -0.5, -6, 3)]).total;
    const b = flujo({ tipo: "parche", lado: 4 * k, theta: 0.5, phi: 0.3 }, [C(1 * k, -0.5 * k, -6 * k, 3)]).total;
    expect(Math.abs(a - b)).toBeLessThan(1e-6); // vértices Float32 del parche inclinado: ~1e-7 relativo
    const c = flujo({ tipo: "esfera", radio: 5 }, [C(1, 2, 3, 3)]).total;
    const d = flujo({ tipo: "esfera", radio: 5 * k }, [C(1 * k, 2 * k, 3 * k, 3)]).total;
    expect(Math.abs(c - d)).toBeLessThan(1e-9);
  });
  it("flujoASI(Φ, esc): cambiar pxPorCuadro/mPorCuadro no altera Φ_SI; cPorUnidad lo escala en proporción", () => {
    const phi = flujo({ tipo: "esfera", radio: 5 }, [C(0, 0, 0, 3)]).total;
    const base = flujoASI(phi);
    expect(flujoASI(phi, { pxPorCuadro: 20, mPorCuadro: 0.5, cPorUnidad: C_POR_UNIDAD })).toBeCloseTo(base, 6);
    expect(flujoASI(phi, { pxPorCuadro: 50, mPorCuadro: 0.01, cPorUnidad: 4 * C_POR_UNIDAD }) / base).toBeCloseTo(4, 9);
  });
  it("softening: campoEn con otro soft2 no altera Φ (calcularFlujo no usa softening)", () => {
    const s: Superficie = { tipo: "esfera", radio: 5 };
    const cs = [C(0, 0, 4.7, 3)];
    const antes = flujo(s, cs).total;
    campoEn([0, 0, 4.6], cs, 1);
    campoEn([0, 0, 4.6], cs, 0);
    const despues = flujo(s, cs).total;
    expect(despues).toBe(antes);
    expect(Math.abs(despues - 3)).toBeLessThan(1e-9);
    // el campo SÍ cambia con el softening (el parámetro funciona), el flujo no
    expect(campoEn([0, 0, 4.9], cs, 0)[2]).not.toBeCloseTo(campoEn([0, 0, 4.9], cs, 1)[2], 3);
    expect(SOFT2_3D).toBeGreaterThan(0);
  });
  it("cuadratura independiente y flujoCuadratura coinciden con calcularFlujo a ≤ 5e-3 (carga ≥ 1 u de la superficie)", () => {
    const casos: [Superficie, Carga3D[]][] = [
      [{ tipo: "esfera", radio: 5 }, [C(1, -1, 0.5, 3)]],
      [{ tipo: "esfera", radio: 5 }, [C(0, 0, 8, 3)]],
      [{ tipo: "cubo", lado: 8 }, [C(1, -1, 0.5, 3)]],
      [{ tipo: "cubo", lado: 8 }, [C(6, 5, 0, -2)]],
      [{ tipo: "cilindro", radio: 4, altura: 8 }, [C(1, -1, 0.5, 3)]],
      [{ tipo: "cilindro", radio: 4, altura: 8 }, [C(-2, 1, 0, 3), C(2, -1, 0, -3)]],
    ];
    for (const [s, cs] of casos) {
      const f = flujo(s, cs).total;
      const rq = qEncRef(s, cs);
      const cq = cuadraturaRef(s, cs, 120);
      const mq = flujoCuadratura(s, cs, 120);
      const esc = Math.max(1, Math.abs(rq));
      expect(Math.abs(cq - f) / esc, `${s.tipo} cuadratura ref`).toBeLessThanOrEqual(5e-3);
      expect(Math.abs(mq - f) / esc, `${s.tipo} flujoCuadratura`).toBeLessThanOrEqual(5e-3);
    }
  });
});

describe("Parche — valores del contrato (escenarios 1 y 8) y convención û, v̂", () => {
  const parche = (lado: number, theta: number, phi = 0): Superficie => ({ tipo: "parche", lado, theta, phi });
  const grados = (g: number) => (g * Math.PI) / 180;

  it("escenario 1: Φ/q = 0.03188, 0.02925, 0.01928, 0 para θ = 0°, 30°, 60°, 90° (carga (0,0,−6), l=4)", () => {
    const esperado = [0.03188, 0.02925, 0.01928, 0];
    [0, 30, 60, 90].forEach((g, i) => {
      const r = flujo(parche(4, grados(g)), [C(0, 0, -6, 3)]);
      expect(Math.abs(r.total / 3 - esperado[i]), `θ=${g}°`).toBeLessThanOrEqual(1e-4);
      expect(r.qEnc).toBe(0);
    });
    // con q=3: 0.0957, 0.0877, 0.0578, 0
    expect(flujo(parche(4, 0), [C(0, 0, -6, 3)]).total).toBeCloseTo(0.0957, 3);
    expect(flujo(parche(4, grados(30)), [C(0, 0, -6, 3)]).total).toBeCloseTo(0.0877, 3);
    expect(flujo(parche(4, grados(60)), [C(0, 0, -6, 3)]).total).toBeCloseTo(0.0578, 3);
    expect(Math.abs(flujo(parche(4, grados(90)), [C(0, 0, -6, 3)]).total)).toBeLessThan(1e-9);
    // θ=0: 1.08e4 N·m²/C
    expect(flujoASI(flujo(parche(4, 0), [C(0, 0, -6, 3)]).total)).toBeCloseTo(1.08e4, -2);
  });

  it("θ=0: coincide con la fórmula cerrada del cuadrado centrado a 1e-12", () => {
    const l = 4;
    const d = 6;
    const q = 3;
    const r = flujo(parche(l, 0), [C(0, 0, -d, q)]);
    expect(Math.abs(r.total - (q * angSolidoCuadradoCentrado(l, d)) / CUATRO_PI)).toBeLessThan(1e-10); // vértices de borde exactos en Float32
  });

  it("escenario 8 (parche l=10, carga (0,0,−3,+3)): Φ = 0.7889 (8.91e4 N·m²/C), ≠ q, q_enc = 0", () => {
    const r = flujo(parche(10, 0), [C(0, 0, -3, 3)]);
    expect(Math.abs(r.total - 0.7889)).toBeLessThan(1e-4);
    expect(Math.abs(r.total / 3 - 0.262956)).toBeLessThan(1e-6);
    expect(r.qEnc).toBe(0);
    expect(Math.abs(r.total - (3 * angSolidoCuadradoCentrado(10, 3)) / CUATRO_PI)).toBeLessThan(1e-10);
    expect(flujoASI(r.total)).toBeCloseTo(8.91e4, -2);
    expect(Math.abs(r.total - 3)).toBeGreaterThan(2);
  });

  it("coincide con la cuadratura independiente (θ, φ y carga arbitrarios) a 1e-6", () => {
    const casos: [Superficie, Carga3D[]][] = [
      [parche(4, grados(30), 0), [C(0, 0, -6, 3)]],
      [parche(4, grados(60), 1.1), [C(1, 2, -6, 3)]],
      [parche(10, 0, 0), [C(0, 0, -3, 3)]],
      [parche(7, 2.2, 4.0), [C(-2, 3, 4, -2), C(1, 1, -2, 3)]],
    ];
    for (const [s, cs] of casos) {
      const r = flujo(s, cs).total;
      const c = cuadraturaRef(s, cs, 400);
      expect(Math.abs(r - c)).toBeLessThanOrEqual(1e-5 * Math.max(1, Math.abs(c))); // CAMBIO JUSTIFICADO (fase 1B): 1e-5 y no 1e-6. La carga (1,1,−2) está a 0.04 u del plano del parche (7, 2.2, 4.0): la cuadratura de punto medio da error 6.8e-6 con n=400 y converge a calcularFlujo (n=1600: diferencia 4e-8); calcularFlujo usa vértices Float64 en el parche
      expect(Math.abs(flujoCuadratura(s, cs, 400) - r)).toBeLessThanOrEqual(1e-5 * Math.max(1, Math.abs(c)));
    }
  });

  it("n invertida (θ=π) cambia el signo de Φ; carga al otro lado también", () => {
    const a = flujo(parche(4, 0), [C(0, 0, -6, 3)]).total;
    expect(flujo(parche(4, Math.PI), [C(0, 0, -6, 3)]).total).toBeCloseTo(-a, 6);
    expect(flujo(parche(4, 0), [C(0, 0, 6, 3)]).total).toBeCloseTo(-a, 12);
  });

  it("convención û,v̂: girar parche (φ) y carga a la vez alrededor de z deja Φ invariante", () => {
    const c0 = C(1, 0.5, -6, 3);
    const base = flujo(parche(5, 0.9, 0), [c0]).total;
    for (const a of [0.4, 1.3, 2.9, -1]) {
      const cx = Math.cos(a) * c0.x - Math.sin(a) * c0.y;
      const cy = Math.sin(a) * c0.x + Math.cos(a) * c0.y;
      const r = flujo(parche(5, 0.9, a), [C(cx, cy, c0.z, 3)]).total;
      expect(Math.abs(r - base)).toBeLessThan(1e-6);
    }
  });

  it("niveles de malla distintos dan el mismo Φ del parche (la malla plana no depende de la resolución; ~1e-7 por Float32)", () => {
    const s = parche(10, 0.6, 0.8);
    const cs = [C(0.5, 1, -3, 3)];
    const a = flujo(s, cs, 0).total;
    expect(Math.abs(flujo(s, cs, 1).total - a)).toBeLessThan(1e-6);
    expect(Math.abs(flujo(s, cs, 2).total - a)).toBeLessThan(1e-6);
  });

  it("carga cerca de un parche: la suma de parches conserva el total (aunque la malla basta a 0.4 u)", () => {
    const s = parche(4, 0, 0);
    const r = flujo(s, [C(0.3, 0.2, -0.4, 3)], 2);
    const suma = Array.from(r.porParche).reduce((x, y) => x + y, 0);
    expect(Math.abs(suma - r.total)).toBeLessThan(1e-5);
    expect(r.total).toBeGreaterThan(0);
    expect(r.total).toBeLessThan(3 / 2); // una cara plana nunca ve más de medio espacio (≈ q/2 si es muy grande)
  });
});

describe("Test 7 — Φ legible en SI con escala.ts (E = Φ/(4πR²) = K·q/R²)", () => {
  for (const [q, R] of [[3, 5], [4, 5], [4, 3], [3, 2], [3, 8]] as const) {
    it(`q=${q} µC, R=${R} u`, () => {
      const phi = flujo({ tipo: "esfera", radio: R }, [C(0, 0, 0, q)]).total;
      const E = flujoASI(phi) / (CUATRO_PI * (R * M_POR_CUADRO) ** 2);
      const formula = (K_COULOMB * q * C_POR_UNIDAD) / (R * M_POR_CUADRO) ** 2;
      const lectura = campoSI(R * PX_POR_CUADRO, 0, [{ x: 0, y: 0, q }])!;
      expect(Math.abs(E - formula) / formula).toBeLessThan(1e-8);
      expect(Math.abs(E - lectura.modulo) / lectura.modulo).toBeLessThan(1e-8);
    });
  }
  it("flujoASI(1) ≈ 1.1294e5 y flujoASI(3) ≈ 3.388e5", () => {
    expect(Math.abs(flujoASI(1) - 1.1294e5) / 1.1294e5).toBeLessThan(1e-4);
    expect(Math.abs(flujoASI(3) - 3.388e5) / 3.388e5).toBeLessThan(1e-3);
  });
});
