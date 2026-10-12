import { describe, expect, it } from "vitest";
import { A_DEFECTO, D_DEFECTO, EPSILON_0, KAPPA_AIRE, V_DEFECTO } from "./constantes";
import { CATALOGO } from "./dielectricos";
import { c0, calcularEstado, cambiarModo, kappaEfectiva, sincronizar } from "./modelo";
import type { Parametros } from "./tipos";

const base = (extra: Partial<Parametros> = {}): Parametros =>
  sincronizar({
    modo: "conectado",
    A: A_DEFECTO,
    d: D_DEFECTO,
    materialId: "aire",
    f: 0,
    V: V_DEFECTO,
    Q: 0,
    ...extra,
  });

const casi = (a: number, b: number, tol = 1e-9) => expect(Math.abs(a - b) / Math.abs(b)).toBeLessThan(tol);
const MATERIALES = CATALOGO.filter((m) => m.id !== "aire");

describe("modelo del capacitor de placas", () => {
  it("valores de arranque: C = 88,6 pF, Q = 8,86 nC, E = 100 kV/m, U = 443 nJ", () => {
    const e = calcularEstado(base());
    casi(e.C, EPSILON_0 * 0.01 * KAPPA_AIRE * 1000);
    expect(e.C * 1e12).toBeCloseTo(88.6, 1);
    expect(e.Q * 1e9).toBeCloseTo(8.86, 2);
    expect(e.E).toBeCloseTo(1e5, 6);
    expect(e.U * 1e9).toBeCloseTo(443, 0);
  });

  it("C ∝ A/d", () => {
    const e1 = calcularEstado(base());
    casi(calcularEstado(base({ A: 2 * A_DEFECTO })).C, 2 * e1.C);
    casi(calcularEstado(base({ d: 2 * D_DEFECTO })).C, e1.C / 2);
    casi(calcularEstado(base({ A: 3 * A_DEFECTO, d: 3 * D_DEFECTO })).C, e1.C);
    casi(c0(A_DEFECTO, D_DEFECTO) * KAPPA_AIRE, e1.C);
  });

  it("f = 0 da κ_aire·C₀ y f = 100 % da κ·C₀; C crece con f", () => {
    for (const m of MATERIALES) {
      const e0 = calcularEstado(base({ materialId: m.id, f: 0 }));
      const e1 = calcularEstado(base({ materialId: m.id, f: 1 }));
      casi(e0.C, KAPPA_AIRE * c0(A_DEFECTO, D_DEFECTO));
      casi(e1.C, m.kappa * c0(A_DEFECTO, D_DEFECTO));
      let prev = e0.C;
      for (const f of [0.2, 0.4, 0.6, 0.8, 1]) {
        const C = calcularEstado(base({ materialId: m.id, f })).C;
        expect(C).toBeGreaterThan(prev);
        prev = C;
      }
    }
  });

  it("dos capacitores en paralelo: C(f) = (1−f)·C_aire + f·C_diel", () => {
    const m = CATALOGO.find((x) => x.id === "pyrex")!;
    const f = 0.37;
    const C = calcularEstado(base({ materialId: m.id, f })).C;
    casi(C, (1 - f) * KAPPA_AIRE * c0(A_DEFECTO, D_DEFECTO) + f * m.kappa * c0(A_DEFECTO, D_DEFECTO));
    casi(kappaEfectiva(m.kappa, f), (1 - f) * KAPPA_AIRE + f * m.kappa);
  });

  it("conectado: al meter el dieléctrico C, Q y U suben ×κ; V y E no cambian", () => {
    for (const m of MATERIALES) {
      const a = calcularEstado(base({ materialId: m.id, f: 0 }));
      const b = calcularEstado(base({ materialId: m.id, f: 1 }));
      const k = m.kappa / KAPPA_AIRE;
      casi(b.C / a.C, k);
      casi(b.Q / a.Q, k);
      casi(b.U / a.U, k);
      casi(b.V, a.V);
      casi(b.E, a.E);
    }
  });

  it("aislado: al meter el dieléctrico C sube ×κ; V, E y U bajan ÷κ; Q no cambia", () => {
    for (const m of MATERIALES) {
      const p = cambiarModo(base({ materialId: m.id, f: 0 }), "aislado");
      const a = calcularEstado(p);
      const b = calcularEstado({ ...p, f: 1 });
      const k = m.kappa / KAPPA_AIRE;
      casi(b.C / a.C, k);
      casi(a.V / b.V, k);
      casi(a.E / b.E, k);
      casi(a.U / b.U, k);
      casi(b.Q, a.Q, 1e-12);
    }
  });

  it("u·volumen = U en ambas zonas, todo f y ambos modos", () => {
    for (const modo of ["conectado", "aislado"] as const) {
      for (const m of MATERIALES) {
        for (const f of [0, 0.25, 0.5, 1]) {
          const p = cambiarModo(base({ materialId: m.id, f: 0 }), modo);
          const q = { ...p, f };
          const e = calcularEstado(q);
          const vol = q.A * q.d;
          casi(e.uAire * (1 - f) * vol + e.uDiel * f * vol, e.U);
        }
      }
    }
  });

  it("u = ½κε₀E² y las cargas: σ_libre = κε₀E, σ_b = σ(1 − 1/κ)", () => {
    const m = CATALOGO.find((x) => x.id === "pyrex")!;
    const e = calcularEstado(base({ materialId: m.id, f: 1 }));
    casi(e.uDiel, 0.5 * m.kappa * EPSILON_0 * e.E * e.E);
    casi(e.sigmaLibre, m.kappa * EPSILON_0 * e.E);
    casi(e.sigmaLigada, e.sigmaLibre * (1 - 1 / m.kappa));
    casi(e.E, e.sigmaLibre / (m.kappa * EPSILON_0));
  });

  it("E = V/d y U = ½CV² = Q²/2C = ½QV", () => {
    const e = calcularEstado(base({ materialId: "papel", f: 1, V: 400 }));
    casi(e.E, 400 / D_DEFECTO);
    casi(e.U, 0.5 * e.C * e.V * e.V);
    casi(e.U, (e.Q * e.Q) / (2 * e.C));
    casi(e.U, 0.5 * e.Q * e.V);
  });

  it("continuidad al cambiar de modo (ida y vuelta): no saltan Q, V, E ni U", () => {
    const p = base({ materialId: "mylar", f: 0.6, V: 250 });
    const a = calcularEstado(p);
    const aislado = cambiarModo(p, "aislado");
    const b = calcularEstado(aislado);
    casi(b.Q, a.Q);
    casi(b.V, a.V);
    casi(b.E, a.E);
    casi(b.U, a.U);
    const vuelta = calcularEstado(cambiarModo(aislado, "conectado"));
    casi(vuelta.Q, a.Q);
    casi(vuelta.V, a.V);
    casi(vuelta.U, a.U);
  });

  it("el problema clásico: cargar, desconectar y meter vidrio baja V ÷κ y U ÷κ", () => {
    const pAire = base({ V: 300 });
    const aislado = cambiarModo(pAire, "aislado");
    const antes = calcularEstado(aislado);
    const despues = calcularEstado({ ...aislado, materialId: "pyrex", f: 1 });
    casi(despues.Q, antes.Q, 1e-12);
    casi(antes.V / despues.V, 5.6 / KAPPA_AIRE);
    casi(antes.U / despues.U, 5.6 / KAPPA_AIRE);
  });

  it("fuerza de inserción: F = ½V²·dC/dx, constante en f con batería y nula con la lámina dentro", () => {
    const m = CATALOGO.find((x) => x.id === "teflon")!;
    const p = base({ materialId: m.id, f: 0.3, V: 500 });
    const L = Math.sqrt(p.A);
    const df = 1e-4;
    const dCdx = (calcularEstado({ ...p, f: p.f + df }).C - calcularEstado({ ...p, f: p.f - df }).C) / (2 * df * L);
    casi(calcularEstado(p).F, 0.5 * 500 * 500 * dCdx, 1e-6);
    casi(calcularEstado({ ...p, f: 0.8 }).F, calcularEstado(p).F);
    expect(calcularEstado({ ...p, f: 1 }).F).toBe(0);
    expect(calcularEstado(base({ V: 500 })).F).toBe(0);
  });
});
