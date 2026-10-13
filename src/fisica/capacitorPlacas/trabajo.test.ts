import { describe, expect, it } from "vitest";
import { A_DEFECTO, D_DEFECTO } from "./constantes";
import { calcularEstado, cambiarModo, sincronizar } from "./modelo";
import { trabajoSeparar } from "./trabajo";
import type { Parametros } from "./tipos";

const base = (extra: Partial<Parametros> = {}): Parametros =>
  sincronizar({ modo: "conectado", A: A_DEFECTO, d: D_DEFECTO, materialId: "aire", f: 0, V: 100, Q: 0, ...extra });

describe("trabajo al separar las placas", () => {
  it("aislado: U sube y el trabajo externo es ΔU (U ∝ d)", () => {
    const p = cambiarModo(base({ V: 500 }), "aislado");
    const t = trabajoSeparar(p, 3 * D_DEFECTO);
    const U0 = calcularEstado(p).U;
    expect(t.dQ).toBeCloseTo(0, 20);
    expect(t.wBateria).toBe(0);
    expect(t.dU / U0).toBeCloseTo(2, 9);
    expect(t.wExterno).toBeCloseTo(t.dU, 20);
    expect(t.wExterno).toBeGreaterThan(0);
  });

  it("conectado: U baja, la batería recibe carga y recibe 2|ΔU|; tú haces |ΔU|", () => {
    const p = base({ V: 500 });
    const t = trabajoSeparar(p, 2 * D_DEFECTO);
    expect(t.dU).toBeLessThan(0);
    expect(t.dQ).toBeLessThan(0);
    expect(t.wBateria / t.dU).toBeCloseTo(2, 9);
    expect(t.wExterno / -t.dU).toBeCloseTo(1, 9);
    expect(t.wExterno + t.wBateria).toBeCloseTo(t.dU, 20);
    // Coincide con −½V²ΔC
    const e0 = calcularEstado(p);
    const e1 = calcularEstado({ ...p, d: 2 * D_DEFECTO });
    expect(t.wExterno).toBeCloseTo(-0.5 * 500 * 500 * (e1.C - e0.C), 20);
  });
});
