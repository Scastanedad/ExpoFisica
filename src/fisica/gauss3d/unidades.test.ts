/**
 * README de pruebas — unidades.ts (contrato §1 "Paso a SI", test obligatorio 6 y 7).
 * Constantes derivadas a mano de escala.ts: 4π·K·1e-6 = 112 940.9 N·m²/C por µC/ε₀.
 * Φ_SI solo depende de cPorUnidad (no de pxPorCuadro ni mPorCuadro). El enlace con campoSI de escala.ts
 * (campo de Coulomb en 2D, ley independiente) demuestra E = Φ/(4πR²) en unidades reales.
 */
import { describe, expect, it } from "vitest";
import {
  C_POR_UNIDAD,
  ESCALA,
  K_COULOMB,
  M_POR_CUADRO,
  PX_POR_CUADRO,
  campoSI,
  formatSI,
  type ConfigEscala,
} from "../escala";
import { FLUJO_UNIDAD_SI, campoSI3D, flujoASI, formatFlujoSI, formatPhi, uAMetros } from "./unidades";

const rel = (a: number, b: number) => Math.abs(a - b) / Math.abs(b);

describe("unidades gauss3d", () => {
  it("FLUJO_UNIDAD_SI = 4π·K·C_POR_UNIDAD ≈ 112 940.9", () => {
    expect(rel(FLUJO_UNIDAD_SI, 4 * Math.PI * K_COULOMB * C_POR_UNIDAD)).toBeLessThan(1e-14);
    expect(rel(FLUJO_UNIDAD_SI, 1.1294e5)).toBeLessThan(1e-4);
  });

  it("flujoASI: 1 → 1.1294e5; 3 → 3.388e5; lineal y con signo", () => {
    expect(rel(flujoASI(1), 1.1294e5)).toBeLessThan(1e-4);
    expect(rel(flujoASI(3), 3.388e5)).toBeLessThan(1e-3);
    expect(flujoASI(0)).toBe(0);
    expect(flujoASI(-2)).toBeCloseTo(-2 * flujoASI(1), 6);
  });

  it("flujoASI solo depende de cPorUnidad (no de pxPorCuadro/mPorCuadro)", () => {
    const base = flujoASI(3);
    const e1: ConfigEscala = { ...ESCALA, pxPorCuadro: 17, mPorCuadro: 0.5 };
    const e2: ConfigEscala = { ...ESCALA, pxPorCuadro: 200 };
    expect(flujoASI(3, e1)).toBe(base);
    expect(flujoASI(3, e2)).toBe(base);
    const e3: ConfigEscala = { ...ESCALA, cPorUnidad: 2e-6 };
    expect(rel(flujoASI(3, e3), 2 * base)).toBeLessThan(1e-14);
    expect(rel(flujoASI(3, { ...ESCALA, cPorUnidad: 1e-9 }), base * 1e-3)).toBeLessThan(1e-14);
  });

  it("campoSI3D(q, rU) = K·q·C/(r·M_POR_CUADRO)² con los números del escenario 4 y 9", () => {
    const esperado = (q: number, r: number) => (K_COULOMB * q * C_POR_UNIDAD) / (r * M_POR_CUADRO) ** 2;
    for (const [q, r] of [[3, 2], [3, 5], [3, 8], [4, 5], [4, 3]] as const) {
      expect(rel(campoSI3D(q, r), esperado(q, r))).toBeLessThan(1e-14);
    }
    // valores redondeados de la tabla §5
    expect(rel(campoSI3D(3, 2), 6.74e7)).toBeLessThan(2e-3);
    expect(rel(campoSI3D(3, 5), 1.08e7)).toBeLessThan(5e-3);
    expect(rel(campoSI3D(3, 8), 4.21e6)).toBeLessThan(2e-3);
    expect(rel(campoSI3D(4, 5), 1.44e7)).toBeLessThan(3e-3);
    expect(rel(campoSI3D(4, 3), 3.99e7)).toBeLessThan(3e-3);
    // decae 1/r²
    expect(rel(campoSI3D(3, 10), campoSI3D(3, 5) / 4)).toBeLessThan(1e-14);
  });

  it("uAMetros: 1 u = M_POR_CUADRO (1 cm)", () => {
    expect(uAMetros(1)).toBeCloseTo(M_POR_CUADRO, 15);
    expect(uAMetros(5)).toBeCloseTo(0.05, 15);
    expect(uAMetros(0)).toBe(0);
  });

  it("Φ legible en SI (test 6/7): Φ_esfera/(4π R²) = K·q/R² = campoSI de escala.ts", () => {
    for (const [q, R] of [[3, 5], [4, 5], [4, 3], [3, 2], [3, 8]] as const) {
      // Φ de la esfera = q (convención ε₀=1) — cálculo independiente de la malla
      const E_gauss = flujoASI(q) / (4 * Math.PI * (R * M_POR_CUADRO) ** 2);
      const E_formula = (K_COULOMB * q * C_POR_UNIDAD) / (R * M_POR_CUADRO) ** 2;
      const lectura = campoSI(R * PX_POR_CUADRO, 0, [{ x: 0, y: 0, q }]);
      expect(lectura).not.toBeNull();
      expect(rel(E_gauss, E_formula)).toBeLessThan(1e-14);
      expect(rel(E_gauss, lectura!.modulo)).toBeLessThan(1e-14);
      expect(rel(campoSI3D(q, R), lectura!.modulo)).toBeLessThan(1e-14);
    }
  });

  it("formatFlujoSI usa formatSI con unidad N·m²/C", () => {
    expect(formatFlujoSI(3)).toBe(formatSI(flujoASI(3), "N·m²/C"));
    expect(formatFlujoSI(3)).toContain("N·m²/C");
    expect(formatFlujoSI(3)).toContain("339"); // 3.39e5 = 339 k
    expect(formatFlujoSI(-3)).toContain("−"); // U+2212 como el resto de la app
  });

  it("formatPhi: «Φ = 3.00 µC/ε₀»", () => {
    expect(formatPhi(3)).toBe("Φ = 3.00 µC/ε₀");
    expect(formatPhi(0)).toContain("0.00");
    expect(formatPhi(0.7889)).toContain("0.79");
    expect(formatPhi(-1.5)).toMatch(/[−-]1\.50/);
  });
});
