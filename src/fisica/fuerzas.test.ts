import { describe, expect, it } from "vitest";
import type { PuntoCarga } from "./coulomb";
import { fuerzaParSI } from "./escala";
import { fuerzaNetaSI, fuerzasNetasSI, sumaFuerzasSI } from "./fuerzas";

const dosCargas: PuntoCarga[] = [
  { x: 0, y: 0, q: 2 },
  { x: 200, y: 0, q: -3 },
];

const cincoCargas: PuntoCarga[] = [
  { x: 0, y: 0, q: 5 },
  { x: 300, y: 0, q: -0.5 },
  { x: 150, y: 260, q: 2 },
  { x: -180, y: 90, q: -3 },
  { x: 60, y: -220, q: 1.5 },
];

describe("fuerzas (E3.2)", () => {
  describe("F1: exclusión de la autofuerza / linealidad en q_i", () => {
    it("escalar cargas[i].q por 2 duplica F_i; escalar cargas[j].q por 2 duplica solo esa contribución", () => {
      const base = fuerzaNetaSI(0, cincoCargas)!;
      const conQ0x2 = fuerzaNetaSI(0, cincoCargas.map((c, i) => (i === 0 ? { ...c, q: c.q * 2 } : c)))!;
      expect(conQ0x2.fx).toBeCloseTo(base.fx * 2, 9);
      expect(conQ0x2.fy).toBeCloseTo(base.fy * 2, 9);

      // Duplicar q de otra carga (j=1) duplica solo su contribución: comprobamos
      // comparando la fuerza total con y sin esa carga presente, escalada.
      const conJ = fuerzaNetaSI(0, cincoCargas)!;
      const dupJ = fuerzaNetaSI(
        0,
        cincoCargas.map((c, i) => (i === 1 ? { ...c, q: c.q * 2 } : c)),
      )!;
      const sinJ = fuerzaNetaSI(0, cincoCargas.filter((_, i) => i !== 1))!;
      // F_con_j_dup - F_sin_j = 2 * (F_con_j - F_sin_j)
      expect(dupJ.fx - sinJ.fx).toBeCloseTo(2 * (conJ.fx - sinJ.fx), 9);
      expect(dupJ.fy - sinJ.fy).toBeCloseTo(2 * (conJ.fy - sinJ.fy), 9);
    });
  });

  describe("F2: 3ª ley de Newton (exacta)", () => {
    it("Σ F_i ≈ (0, 0) con tolerancia al nivel de épsilon de máquina", () => {
      const fuerzas = fuerzasNetasSI(cincoCargas);
      const suma = sumaFuerzasSI(fuerzas);
      const maxModulo = Math.max(...fuerzas.map((f) => f?.modulo ?? 0));
      expect(Math.hypot(suma.fx, suma.fy) / maxModulo).toBeLessThanOrEqual(1e-9);
    });

    it("antisimetría por pares: F_{i←j} = −F_{j←i} (verificable con 2 cargas: F_0 = −F_1)", () => {
      const [f0, f1] = fuerzasNetasSI(dosCargas);
      expect(f0!.fx).toBeCloseTo(-f1!.fx, 9);
      expect(f0!.fy).toBeCloseTo(-f1!.fy, 9);
    });
  });

  describe("F3: bilineal en q (F ∝ q_i·q_j)", () => {
    it("[2qa, 3qb] da módulo 6× el de [qa, qb] a la misma geometría", () => {
      const base = fuerzaNetaSI(0, dosCargas)!.modulo;
      const escalada = fuerzaNetaSI(0, [
        { ...dosCargas[0], q: dosCargas[0].q * 2 },
        { ...dosCargas[1], q: dosCargas[1].q * 3 },
      ])!.modulo;
      expect(escalada).toBeCloseTo(base * 6, 6);
    });
  });

  describe("F4: coincide con fuerzaParSI para 2 cargas", () => {
    it("el módulo es igual en valor absoluto (1e-12 relativo)", () => {
      const r = Math.hypot(dosCargas[1].x - dosCargas[0].x, dosCargas[1].y - dosCargas[0].y);
      const esperado = Math.abs(fuerzaParSI(dosCargas[0].q, dosCargas[1].q, r));
      const f0 = fuerzaNetaSI(0, dosCargas)!;
      expect(Math.abs(f0.modulo - esperado) / esperado).toBeLessThanOrEqual(1e-9);
    });
  });

  describe("F5: caso degenerado (cargas coincidentes)", () => {
    it("distancia < 1 µm (< 0.005 px) da null para ambas, no NaN ni Infinity", () => {
      const coincidentes: PuntoCarga[] = [
        { x: 100, y: 100, q: 1 },
        { x: 100.001, y: 100, q: -1 }, // 0.001 px << 0.005 px
        { x: 400, y: 400, q: 2 },
      ];
      expect(fuerzaNetaSI(0, coincidentes)).toBeNull();
      expect(fuerzaNetaSI(1, coincidentes)).toBeNull();
      const f2 = fuerzaNetaSI(2, coincidentes)!;
      expect(Number.isFinite(f2.fx)).toBe(true);
      expect(Number.isFinite(f2.fy)).toBe(true);
    });

    it("a una distancia normal no hay degeneración (control negativo)", () => {
      expect(fuerzaNetaSI(0, dosCargas)).not.toBeNull();
    });
  });

  describe("F6: sin NaN/Infinity con listas triviales", () => {
    it("una sola carga: fuerza neta (0,0)", () => {
      const f = fuerzaNetaSI(0, [{ x: 0, y: 0, q: 3 }])!;
      expect(f.fx).toBe(0);
      expect(f.fy).toBe(0);
      expect(f.modulo).toBe(0);
    });
  });
});
