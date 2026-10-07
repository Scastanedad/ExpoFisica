/**
 * README de pruebas — referencia.ts (autocomprobación de las referencias independientes usadas por los demás tests).
 * Esta suite SÍ puede pasar antes de que exista gauss3d/: no importa código de producción. Verifica que la cuadratura
 * de punto medio reproduce Gauss (Φ = q dentro, 0 fuera) y los valores del parche del contrato (revisión §9).
 */
import { describe, expect, it } from "vitest";
import type { Superficie } from "./tipos";
import {
  angSolidoCuadradoCentrado,
  cuadraturaRef,
  dentroRef,
  prng,
  rayoMuestreoRef,
  rayoTriangulo,
  rLimiteDe,
} from "./referencia";

const q = (x: number, y: number, z: number, qq: number) => ({ x, y, z, q: qq });

describe("referencia: cuadratura de punto medio", () => {
  it("cerradas: Φ = q dentro (≤ 5e-3 con n=120) y 0 fuera", () => {
    const sups: Superficie[] = [
      { tipo: "esfera", radio: 5 },
      { tipo: "cubo", lado: 8 },
      { tipo: "cilindro", radio: 4, altura: 8 },
    ];
    for (const s of sups) {
      expect(Math.abs(cuadraturaRef(s, [q(1, -1, 0.5, 3)], 120) - 3)).toBeLessThan(5e-3 * 3);
      expect(Math.abs(cuadraturaRef(s, [q(9, 1, 0.5, 3)], 120))).toBeLessThan(5e-3);
    }
  });
  it("parche: valores del contrato (Φ/q = 0.031884, 0.029250, 0.019278, 0; escenario 8: 0.262956)", () => {
    const p = (lado: number, theta: number): Superficie => ({ tipo: "parche", lado, theta, phi: 0 });
    const esp = [0.031884, 0.02925, 0.019278, 0];
    [0, 30, 60, 90].forEach((g, i) => {
      const v = cuadraturaRef(p(4, (g * Math.PI) / 180), [q(0, 0, -6, 1)], 400);
      expect(Math.abs(v - esp[i])).toBeLessThan(1e-5);
    });
    expect(Math.abs(cuadraturaRef(p(10, 0), [q(0, 0, -3, 1)], 400) - 0.262956)).toBeLessThan(1e-5);
  });
  it("fórmula del cuadrado centrado: 4·asin(a²/(a²+d²))/4π", () => {
    expect(angSolidoCuadradoCentrado(4, 6) / (4 * Math.PI)).toBeCloseTo(0.031884, 6);
    expect(angSolidoCuadradoCentrado(10, 3) / (4 * Math.PI)).toBeCloseTo(0.262956, 6);
  });
});

describe("referencia: rayos y utilidades", () => {
  it("rayoMuestreoRef reproduce la cuerda de la esfera", () => {
    const s: Superficie = { tipo: "esfera", radio: 5 };
    const r = rayoMuestreoRef(s, [-10, 0, 0], [1, 0, 0], -50.0013, 49.9987, 20000)!;
    expect(r.tEntrada).toBeCloseTo(5, 9);
    expect(r.tSalida).toBeCloseTo(15, 9);
    const dentro = rayoMuestreoRef(s, [0, 0, 0], [0, 0, 2], -50.0013, 49.9987, 20000)!;
    expect(dentro.tEntrada).toBeCloseTo(-2.5, 9);
    expect(dentro.tSalida).toBeCloseTo(2.5, 9);
    expect(rayoMuestreoRef(s, [-10, 6, 0], [1, 0, 0], -50.0013, 49.9987, 20000)).toBeNull();
  });
  it("Möller–Trumbore: impacto y fallo", () => {
    const t = rayoTriangulo([0.2, 0.2, -1], [0, 0, 1], [0, 0, 0], [1, 0, 0], [0, 1, 0]);
    expect(t).toBeCloseTo(1, 12);
    expect(rayoTriangulo([2, 2, -1], [0, 0, 1], [0, 0, 0], [1, 0, 0], [0, 1, 0])).toBeNull();
  });
  it("dentroRef, rLimiteDe y prng determinista", () => {
    expect(dentroRef({ tipo: "cubo", lado: 8 }, [3.9, 0, 0])).toBe(true);
    expect(dentroRef({ tipo: "cubo", lado: 8 }, [4.1, 0, 0])).toBe(false);
    expect(rLimiteDe({ tipo: "cubo", lado: 16 }, [q(0, 0, 0, 1)])).toBeCloseTo(41.569, 2);
    expect(rLimiteDe({ tipo: "esfera", radio: 2 }, [q(12, 12, 10, 1)])).toBeCloseTo(6 + Math.hypot(12, 12, 10), 12);
    const a = prng(5);
    const b = prng(5);
    expect([a(), a(), a()]).toEqual([b(), b(), b()]);
  });
});
