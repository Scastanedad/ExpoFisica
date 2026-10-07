/**
 * README de pruebas — rayos.ts (contrato §3, test obligatorio 10).
 * Referencias independientes (referencia.ts): muestreo denso + bisección sobre un predicado dentro/fuera escrito a mano,
 * valores analíticos (esfera, slabs, cuerpo+tapas del cilindro, plano del parche) y Möller–Trumbore contra la malla para
 * `ocultoPorSuperficie`. Supuestos documentados:
 *  - parche: `tEntrada === tSalida` = t del plano si el punto cae en el cuadrado y t ≥ 0; si no, null;
 *  - con `tMax` < tEntrada → null; con `tMax` > tSalida el resultado es el mismo que sin límite (el caso intermedio no se prueba);
 *  - tangente (esfera/cilindro): null o intervalo de longitud ≈ 0;
 *  - `ocultoPorSuperficie` frente a la malla de nivel alta: se tolera ≤ 1 % de discrepancia en rayos casi rasantes (sagita de la malla).
 */
import { describe, expect, it } from "vitest";
import { NIVELES_GAUSS3D } from "./constantes";
import { generarMalla } from "./mallas";
import { ocultoPorSuperficie, rayoSuperficie, segmentoCruzaSuperficie } from "./rayos";
import type { Superficie } from "./tipos";
import { dentroRef, distSignoRef, ejesParche, prng, rayoMuestreoRef, rayoTriangulo, type V3 } from "./referencia";

const CERRADAS: Superficie[] = [
  { tipo: "esfera", radio: 5 },
  { tipo: "cubo", lado: 8 },
  { tipo: "cilindro", radio: 4, altura: 8 },
];

function dirAleatoria(rnd: () => number): V3 {
  const z = rnd() * 2 - 1;
  const f = rnd() * 2 * Math.PI;
  const r = Math.sqrt(1 - z * z);
  const k = 0.4 + rnd() * 2.6; // d no normalizado
  return [k * r * Math.cos(f), k * r * Math.sin(f), k * z];
}

describe("rayoSuperficie — casos analíticos", () => {
  it("esfera R=5: eje; origen dentro (tEntrada<0); d no normalizado escala t", () => {
    const s: Superficie = { tipo: "esfera", radio: 5 };
    const r = rayoSuperficie(s, [-10, 0, 0], [1, 0, 0])!;
    expect(r.tEntrada).toBeCloseTo(5, 12);
    expect(r.tSalida).toBeCloseTo(15, 12);
    const r2 = rayoSuperficie(s, [-10, 0, 0], [2, 0, 0])!;
    expect(r2.tEntrada).toBeCloseTo(2.5, 12);
    expect(r2.tSalida).toBeCloseTo(7.5, 12);
    const d = rayoSuperficie(s, [0, 0, 0], [0, 0, 2])!;
    expect(d.tEntrada).toBeCloseTo(-2.5, 12);
    expect(d.tSalida).toBeCloseTo(2.5, 12);
  });
  it("esfera: falla (null) y rayo que se aleja (superficie a la espalda)", () => {
    const s: Superficie = { tipo: "esfera", radio: 5 };
    expect(rayoSuperficie(s, [-10, 6, 0], [1, 0, 0])).toBeNull();
    expect(rayoSuperficie(s, [10, 0, 0], [1, 0, 0])).toBeNull();
  });
  it("tangente: null o intervalo degenerado (esfera y cilindro)", () => {
    for (const [s, o, d] of [
      [{ tipo: "esfera", radio: 5 }, [-10, 5, 0], [1, 0, 0]],
      [{ tipo: "cilindro", radio: 4, altura: 8 }, [-10, 4, 0], [1, 0, 0]],
    ] as const) {
      const r = rayoSuperficie(s, o, d);
      if (r !== null) expect(r.tSalida - r.tEntrada).toBeLessThan(1e-6);
    }
  });
  it("cubo a=8: slabs, rayo diagonal y d escalado", () => {
    const s: Superficie = { tipo: "cubo", lado: 8 };
    const r = rayoSuperficie(s, [-10, 0, 0], [1, 0, 0])!;
    expect(r.tEntrada).toBeCloseTo(6, 12);
    expect(r.tSalida).toBeCloseTo(14, 12);
    const r2 = rayoSuperficie(s, [-10, 0, 0], [2, 0, 0])!;
    expect(r2.tEntrada).toBeCloseTo(3, 12);
    expect(r2.tSalida).toBeCloseTo(7, 12);
    // diagonal: de (-8,-8,-8) a lo largo de (1,1,1): entra en la esquina t=4, sale en t=12
    const dg = rayoSuperficie(s, [-8, -8, -8], [1, 1, 1])!;
    expect(dg.tEntrada).toBeCloseTo(4, 12);
    expect(dg.tSalida).toBeCloseTo(12, 12);
    expect(rayoSuperficie(s, [-10, 4.5, 0], [1, 0, 0])).toBeNull();
    expect(rayoSuperficie(s, [0, 0, 0], [0, 1, 0])!.tEntrada).toBeCloseTo(-4, 12);
  });
  it("cilindro R=4 h=8: cuerpo, tapas, cuerpo→tapa", () => {
    const s: Superficie = { tipo: "cilindro", radio: 4, altura: 8 };
    const cuerpo = rayoSuperficie(s, [-10, 0, 0], [1, 0, 0])!;
    expect(cuerpo.tEntrada).toBeCloseTo(6, 12);
    expect(cuerpo.tSalida).toBeCloseTo(14, 12);
    const tapas = rayoSuperficie(s, [1, 0, -10], [0, 0, 1])!;
    expect(tapas.tEntrada).toBeCloseTo(6, 12);
    expect(tapas.tSalida).toBeCloseTo(14, 12);
    // entra por el cuerpo en x=-4 (t=2, z=1) y sale por la tapa z=4 (t=8, x=2, ρ=2<4)
    const mixto = rayoSuperficie(s, [-6, 0, 0], [1, 0, 0.5])!;
    expect(mixto.tEntrada).toBeCloseTo(2, 12);
    expect(mixto.tSalida).toBeCloseTo(8, 12);
    expect(rayoSuperficie(s, [0, 0, 6], [1, 0, 0])).toBeNull(); // por encima de la tapa
    expect(rayoSuperficie(s, [0, 0, 0], [0, 0, 1])!.tEntrada).toBeCloseTo(-4, 12);
  });
  it("tMax: antes de tEntrada → null; mayor que tSalida → igual que sin límite", () => {
    const s: Superficie = { tipo: "esfera", radio: 5 };
    expect(rayoSuperficie(s, [-10, 0, 0], [1, 0, 0], 4)).toBeNull();
    const a = rayoSuperficie(s, [-10, 0, 0], [1, 0, 0], 100)!;
    const b = rayoSuperficie(s, [-10, 0, 0], [1, 0, 0])!;
    expect(a.tEntrada).toBeCloseTo(b.tEntrada, 12);
    expect(a.tSalida).toBeCloseTo(b.tSalida, 12);
  });
  it("parche: plano + extensión del cuadrado (θ=0 y n=+x)", () => {
    const p0: Superficie = { tipo: "parche", lado: 4, theta: 0, phi: 0 };
    const h = rayoSuperficie(p0, [0, 0, -5], [0, 0, 1])!;
    expect(h.tEntrada).toBeCloseTo(5, 12);
    expect(h.tSalida).toBeCloseTo(5, 12);
    expect(rayoSuperficie(p0, [3, 0, -5], [0, 0, 1])).toBeNull(); // fuera del cuadrado
    expect(rayoSuperficie(p0, [0, 0, 5], [0, 0, 1])).toBeNull(); // plano a la espalda
    expect(rayoSuperficie(p0, [0, 0, 1], [1, 0, 0])).toBeNull(); // paralelo al plano
    const px: Superficie = { tipo: "parche", lado: 4, theta: Math.PI / 2, phi: 0 }; // n=+x, û=(0,0,-1), v̂=(0,1,0)
    const a = rayoSuperficie(px, [-5, 1, 1.5], [1, 0, 0])!;
    expect(a.tEntrada).toBeCloseTo(5, 12);
    expect(rayoSuperficie(px, [-5, 1, 2.5], [1, 0, 0])).toBeNull();
    expect(rayoSuperficie(px, [-5, 2.5, 0], [1, 0, 0])).toBeNull();
  });
});

describe("rayoSuperficie — contra muestreo denso (rayos aleatorios, d sin normalizar)", () => {
  for (const s of CERRADAS) {
    it(`${s.tipo}: 300 rayos coinciden con la referencia a 1e-6`, () => {
      const rnd = prng(2024);
      let con = 0;
      for (let i = 0; i < 300; i++) {
        const o: V3 = [(rnd() - 0.5) * 40, (rnd() - 0.5) * 40, (rnd() - 0.5) * 40];
        // la mitad de los rayos apuntan al objeto para asegurar impactos
        let d = dirAleatoria(rnd);
        if (i % 2 === 0) {
          const obj: V3 = [(rnd() - 0.5) * 6, (rnd() - 0.5) * 6, (rnd() - 0.5) * 6];
          const k = 0.5 + rnd() * 2;
          const dd = [obj[0] - o[0], obj[1] - o[1], obj[2] - o[2]];
          const nrm = Math.hypot(dd[0], dd[1], dd[2]);
          d = [(k * dd[0]) / nrm, (k * dd[1]) / nrm, (k * dd[2]) / nrm];
        }
        const nd = Math.hypot(d[0], d[1], d[2]);
        const ref = rayoMuestreoRef(s, o, d, -100 / nd, 100 / nd, 40000);
        const r = rayoSuperficie(s, o, d);
        if (ref === null) {
          if (r !== null) expect((r.tSalida - r.tEntrada) * nd).toBeLessThan(0.05); // cuerda minúscula no vista por el muestreo
        } else {
          con++;
          expect(r, `rayo ${i}`).not.toBeNull();
          expect(Math.abs(r!.tEntrada - ref.tEntrada)).toBeLessThan(1e-6);
          expect(Math.abs(r!.tSalida - ref.tSalida)).toBeLessThan(1e-6);
        }
      }
      expect(con).toBeGreaterThan(80); // la prueba realmente ejercita impactos
    });
  }
  it("parche: 400 rayos con orientaciones aleatorias vs intersección analítica con el plano", () => {
    const rnd = prng(99);
    let hits = 0;
    for (let i = 0; i < 400; i++) {
      const s: Superficie = { tipo: "parche", lado: 2 + rnd() * 10, theta: rnd() * Math.PI, phi: rnd() * 6.28 };
      const { u, v, n } = ejesParche(s);
      const o: V3 = [(rnd() - 0.5) * 20, (rnd() - 0.5) * 20, (rnd() - 0.5) * 20];
      const tgt: V3 = [(rnd() - 0.5) * 8, (rnd() - 0.5) * 8, (rnd() - 0.5) * 8];
      const k = 0.5 + rnd() * 2;
      const d: V3 = [(tgt[0] - o[0]) * k, (tgt[1] - o[1]) * k, (tgt[2] - o[2]) * k];
      const dn = d[0] * n[0] + d[1] * n[1] + d[2] * n[2];
      const t = -(o[0] * n[0] + o[1] * n[1] + o[2] * n[2]) / dn;
      const P = [o[0] + t * d[0], o[1] + t * d[1], o[2] + t * d[2]];
      const a = P[0] * u[0] + P[1] * u[1] + P[2] * u[2];
      const b = P[0] * v[0] + P[1] * v[1] + P[2] * v[2];
      const borde = Math.min(Math.abs(Math.abs(a) - s.lado / 2), Math.abs(Math.abs(b) - s.lado / 2));
      if (borde < 1e-6 || Math.abs(t) < 1e-6) continue;
      const golpea = t > 0 && Math.abs(a) < s.lado / 2 && Math.abs(b) < s.lado / 2;
      const r = rayoSuperficie(s, o, d);
      if (golpea) {
        hits++;
        expect(r).not.toBeNull();
        expect(r!.tEntrada).toBeCloseTo(t, 9);
      } else {
        expect(r).toBeNull();
      }
    }
    expect(hits).toBeGreaterThan(20);
  });
});

/** Cruces de un segmento por muestreo denso: [{t, sentido}] con +1 = sale (dentro→fuera), −1 = entra. */
function crucesRef(s: Superficie, a: V3, b: V3, pasos = 20000) {
  const en = (t: number) =>
    dentroRef(s, [a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1]), a[2] + t * (b[2] - a[2])]);
  const res: { t: number; sentido: number }[] = [];
  let prev = en(0);
  for (let i = 1; i <= pasos; i++) {
    const t1 = i / pasos;
    const cur = en(t1);
    if (cur !== prev) {
      let lo = (i - 1) / pasos;
      let hi = t1;
      for (let k = 0; k < 60; k++) {
        const m = 0.5 * (lo + hi);
        if (en(m) === prev) lo = m;
        else hi = m;
      }
      res.push({ t: 0.5 * (lo + hi), sentido: prev ? +1 : -1 });
    }
    prev = cur;
  }
  return res;
}

describe("segmentoCruzaSuperficie", () => {
  it("esfera: segmento largo entra y sale (2 cruces, ordenados, sentidos −1/+1)", () => {
    const s: Superficie = { tipo: "esfera", radio: 5 };
    const out = new Float64Array(4);
    const n = segmentoCruzaSuperficie(s, [-10, 0, 0], [10, 0, 0], out);
    expect(n).toBe(2);
    expect(out[0]).toBeCloseTo(0.25, 12);
    expect(out[1]).toBe(-1);
    expect(out[2]).toBeCloseTo(0.75, 12);
    expect(out[3]).toBe(1);
  });
  it("esfera: 0 cruces fuera/dentro; 1 al entrar o salir", () => {
    const s: Superficie = { tipo: "esfera", radio: 5 };
    const out = new Float64Array(4);
    expect(segmentoCruzaSuperficie(s, [7, 0, 0], [8, 3, 0], out)).toBe(0);
    expect(segmentoCruzaSuperficie(s, [-1, 0, 0], [1, 1, 1], out)).toBe(0);
    expect(segmentoCruzaSuperficie(s, [-10, 0, 0], [0, 0, 0], out)).toBe(1);
    expect(out[0]).toBeCloseTo(0.5, 12);
    expect(out[1]).toBe(-1);
    expect(segmentoCruzaSuperficie(s, [0, 0, 0], [0, 10, 0], out)).toBe(1);
    expect(out[0]).toBeCloseTo(0.5, 12);
    expect(out[1]).toBe(1);
  });
  it("segmento que acaba antes de la superficie no cruza", () => {
    const out = new Float64Array(4);
    expect(segmentoCruzaSuperficie({ tipo: "esfera", radio: 5 }, [-10, 0, 0], [-5.1, 0, 0], out)).toBe(0);
  });
  it("parche: cruce con n (+1 a favor de n, −1 en contra), t exacto, 0 fuera del cuadrado o sin cruzar el plano", () => {
    const s: Superficie = { tipo: "parche", lado: 4, theta: 0, phi: 0 };
    const out = new Float64Array(4);
    expect(segmentoCruzaSuperficie(s, [0, 0, -1], [0, 0, 3], out)).toBe(1);
    expect(out[0]).toBeCloseTo(0.25, 12);
    expect(out[1]).toBe(1);
    expect(segmentoCruzaSuperficie(s, [0, 0, 3], [0, 0, -1], out)).toBe(1);
    expect(out[0]).toBeCloseTo(0.75, 12);
    expect(out[1]).toBe(-1);
    expect(segmentoCruzaSuperficie(s, [3, 0, -1], [3, 0, 3], out)).toBe(0);
    expect(segmentoCruzaSuperficie(s, [0, 0, 1], [0, 0, 3], out)).toBe(0);
  });
  for (const s of CERRADAS) {
    it(`${s.tipo}: 300 segmentos aleatorios coinciden con el muestreo denso (n, t, sentido)`, () => {
      const rnd = prng(31);
      const out = new Float64Array(4);
      let con = 0;
      for (let i = 0; i < 300; i++) {
        const a: V3 = [(rnd() - 0.5) * 24, (rnd() - 0.5) * 24, (rnd() - 0.5) * 24];
        const b: V3 = [(rnd() - 0.5) * 24, (rnd() - 0.5) * 24, (rnd() - 0.5) * 24];
        const ref = crucesRef(s, a, b);
        const n = segmentoCruzaSuperficie(s, a, b, out);
        if (n !== ref.length) {
          // solo se admite que el muestreo se pierda una cuerda minúscula
          expect(n).toBeGreaterThan(ref.length);
          continue;
        }
        con += n;
        for (let k = 0; k < n; k++) {
          expect(Math.abs(out[2 * k] - ref[k].t)).toBeLessThan(1e-6);
          expect(out[2 * k + 1]).toBe(ref[k].sentido);
          expect(out[2 * k]).toBeGreaterThanOrEqual(0);
          expect(out[2 * k]).toBeLessThan(1);
        }
      }
      expect(con).toBeGreaterThan(60);
    });
  }
});

describe("ocultoPorSuperficie", () => {
  it("casos analíticos: esfera R=5, ojo (0,0,30)", () => {
    const s: Superficie = { tipo: "esfera", radio: 5 };
    const ojo: V3 = [0, 0, 30];
    expect(ocultoPorSuperficie(s, ojo, [0, 0, 8])).toBe(false); // entre el ojo y la esfera
    expect(ocultoPorSuperficie(s, ojo, [10, 0, 0])).toBe(false); // al lado
    expect(ocultoPorSuperficie(s, ojo, [0, 0, -8])).toBe(true); // detrás
    expect(ocultoPorSuperficie(s, ojo, [0, 0, -3])).toBe(true); // dentro, tras la cara delantera
    expect(ocultoPorSuperficie(s, ojo, [0, 0, 3])).toBe(true); // dentro: la cara delantera está antes
    expect(ocultoPorSuperficie(s, ojo, [0, 0, 5.2])).toBe(false);
  });
  it("casos analíticos: parche en z=0, ojo (0,0,10)", () => {
    const s: Superficie = { tipo: "parche", lado: 4, theta: 0, phi: 0 };
    const ojo: V3 = [0, 0, 10];
    expect(ocultoPorSuperficie(s, ojo, [0, 0, -3])).toBe(true);
    expect(ocultoPorSuperficie(s, ojo, [0, 0, 3])).toBe(false);
    expect(ocultoPorSuperficie(s, ojo, [5, 0, -3])).toBe(false); // el rayo pasa fuera del cuadrado
  });
  for (const s of [...CERRADAS, { tipo: "parche", lado: 6, theta: 0.7, phi: 0.4 } as Superficie]) {
    it(`${s.tipo}: coherente con rayo–triángulo sobre la malla (≤1 % de discrepancias)`, () => {
      const malla = generarMalla(s, NIVELES_GAUSS3D[0]);
      const V = malla.vertices;
      const T = malla.triangulos;
      const rnd = prng(5);
      let total = 0;
      let mal = 0;
      for (let i = 0; i < 2000; i++) {
        const f = rnd() * 6.28;
        const g = Math.acos(rnd() * 2 - 1);
        const ojo: V3 = [40 * Math.sin(g) * Math.cos(f), 40 * Math.sin(g) * Math.sin(f), 40 * Math.cos(g)];
        const p: V3 = [(rnd() - 0.5) * 20, (rnd() - 0.5) * 20, (rnd() - 0.5) * 20];
        if (s.tipo !== "parche" && Math.abs(distSignoRef(s, p)) < 0.3) continue; // punto sobre la superficie: ambiguo
        const d = [p[0] - ojo[0], p[1] - ojo[1], p[2] - ojo[2]];
        let hit = false;
        let rasante = false;
        for (let k = 0; k < T.length; k += 3) {
          const a = 3 * T[k];
          const b = 3 * T[k + 1];
          const c = 3 * T[k + 2];
          const t = rayoTriangulo(
            ojo,
            d,
            [V[a], V[a + 1], V[a + 2]],
            [V[b], V[b + 1], V[b + 2]],
            [V[c], V[c + 1], V[c + 2]],
          );
          if (t !== null && t > 1e-6 && t < 1 - 1e-6) {
            hit = true;
            break;
          }
          if (t !== null && Math.abs(t - 1) < 1e-3) rasante = true;
        }
        if (rasante && !hit) continue;
        total++;
        if (ocultoPorSuperficie(s, ojo, p) !== hit) mal++;
      }
      expect(total).toBeGreaterThan(500);
      expect(mal / total).toBeLessThanOrEqual(0.01);
    });
  }
});
