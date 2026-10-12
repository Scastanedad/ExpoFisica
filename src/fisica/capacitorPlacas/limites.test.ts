import { describe, expect, it } from "vitest";
import { A_DEFECTO, D_DEFECTO, D_MAX, D_MIN, EPSILON_0, KAPPA_AIRE, V_TOPE } from "./constantes";
import { CATALOGO } from "./dielectricos";
import { ajustar, dMinima, excede, qMaxima, vMaxima } from "./limites";
import { calcularEstado, cambiarModo, sincronizar } from "./modelo";
import type { Parametros } from "./tipos";

const base = (extra: Partial<Parametros> = {}): Parametros =>
  sincronizar({ modo: "conectado", A: A_DEFECTO, d: D_DEFECTO, materialId: "aire", f: 0, V: 100, Q: 0, ...extra });

const casi = (a: number, b: number, tol = 1e-9) => expect(Math.abs(a - b) / Math.abs(b)).toBeLessThan(tol);

describe("límites por rigidez: conectado", () => {
  it("d_mín = V/E_máx y con d = d_mín, E/E_máx = 1", () => {
    expect(dMinima(1000, 3e6)).toBeCloseTo(1000 / 3e6, 15);
    const r = ajustar(base({ V: 1000 }), { d: D_MIN });
    expect(r.bloqueado?.tipo).toBe("limita-d");
    casi(r.p.d, 1000 / 3e6);
    const e = calcularEstado(r.p);
    expect(e.ratioRigidez).toBeCloseTo(1, 9);
    expect(excede(r.p)).toBe(false);
  });

  it("editar V se recorta a V_máx = E_lim·d", () => {
    const r = ajustar(base(), { V: 4000 });
    expect(r.bloqueado?.tipo).toBe("limita-V");
    casi(r.p.V, vMaxima(D_DEFECTO, 3e6));
    expect(r.p.V).toBeCloseTo(3000, 6);
  });

  it("V_máx respeta el tope de sala", () => {
    expect(vMaxima(D_MAX, 60e6)).toBe(V_TOPE);
    expect(ajustar(base({ d: D_MAX }), { V: 9999 }).p.V).toBeLessThanOrEqual(V_TOPE);
  });

  it("con inserción parcial manda el aire: el límite es el de 3 MV/m aunque el material aguante más", () => {
    const p = base({ materialId: "teflon", f: 1, d: D_MIN, V: 5000 });
    expect(excede(p)).toBe(false); // 50 MV/m < 60 MV/m con el hueco lleno
    const r = ajustar(p, { f: 0.9 });
    expect(r.bloqueado?.tipo).toBe("sube-d");
    casi(r.p.d, 5000 / 3e6);
    expect(calcularEstado(r.p).ratioRigidez).toBeCloseTo(1, 9);
  });

  it("cambiar a un material de menor rigidez sube d hasta V/E_máx", () => {
    const p = base({ materialId: "teflon", f: 1, d: D_MIN, V: 5000 });
    const r = ajustar(p, { materialId: "mylar" });
    expect(r.bloqueado?.tipo).toBe("sube-d");
    casi(r.p.d, 5000 / 7e6);
    expect(r.p.V).toBe(5000);
  });

  it("meter un dieléctrico con la batería nunca viola la rigidez (E no cambia)", () => {
    for (const m of CATALOGO) {
      const r = ajustar(base({ V: 2900 }), { materialId: m.id, f: 1 });
      expect(r.bloqueado).toBeUndefined();
      expect(excede(r.p)).toBe(false);
    }
  });
});

describe("límites por rigidez: aislado", () => {
  const aislado = (extra: Partial<Parametros> = {}) => cambiarModo(base(extra), "aislado");

  it("E no depende de d; el límite viene de Q_máx = E_lim·ε₀·A·κ_ef", () => {
    const p = aislado({ V: 1000 });
    const e1 = calcularEstado(p).E;
    const e2 = calcularEstado({ ...p, d: 5 * D_DEFECTO }).E;
    casi(e1, e2);
    casi(qMaxima({ A: A_DEFECTO, d: 1e-3, materialId: "aire", f: 0 }), 3e6 * EPSILON_0 * A_DEFECTO * KAPPA_AIRE);
  });

  it("editar Q se recorta en Q_máx", () => {
    const r = ajustar(aislado(), { Q: 1e-6 });
    expect(r.bloqueado?.tipo).toBe("limita-parametro");
    casi(r.p.Q, qMaxima(r.p), 1e-6);
    expect(excede(r.p)).toBe(false);
  });

  it("el tope de tensión limita Q cuando d es grande", () => {
    const r = ajustar(aislado({ d: D_MAX }), { Q: 1e-7 });
    expect(calcularEstado(r.p).V).toBeLessThanOrEqual(V_TOPE * (1 + 1e-9));
    expect(calcularEstado(r.p).V).toBeGreaterThan(V_TOPE * 0.99);
  });

  it("no se puede sacar un dieléctrico que dejaría E > E_máx (Q no se toca)", () => {
    const conVidrio = cambiarModo(base({ materialId: "pyrex", f: 1, V: 5000 }), "aislado");
    const q0 = conVidrio.Q;
    const r = ajustar(conVidrio, { f: 0 });
    expect(r.bloqueado?.tipo).toBe("limita-parametro");
    expect(r.bloqueado?.variable).toBe("f");
    expect(r.p.f).toBeCloseTo(1, 9);
    expect(r.p.Q).toBe(q0);
    expect(excede(r.p)).toBe(false);
  });

  it("no se puede cambiar a un material que no aguanta: se conserva el anterior", () => {
    const conVidrio = cambiarModo(base({ materialId: "pyrex", f: 1, V: 5000 }), "aislado");
    const r = ajustar(conVidrio, { materialId: "aire" });
    expect(r.bloqueado?.tipo).toBe("material-bloqueado");
    expect(r.p.materialId).toBe("pyrex");
    expect(r.p.Q).toBe(conVidrio.Q);
  });

  it("ajustar nunca baja Q en aislado salvo que se edite Q", () => {
    const p = cambiarModo(base({ materialId: "pyrex", f: 1, V: 4000 }), "aislado");
    const pruebas: Partial<Parametros>[] = [{ f: 0 }, { f: 0.5 }, { A: 25e-4 }, { d: D_MAX }, { materialId: "aire" }, { materialId: "teflon" }];
    for (const c of pruebas) expect(ajustar(p, c).p.Q).toBe(p.Q);
  });

  it("acotar rangos: A, d y f fuera de rango se recortan", () => {
    const r = ajustar(base(), { A: 1, d: 0, f: 3 });
    expect(r.p.A).toBeCloseTo(400e-4, 12);
    expect(r.p.d).toBe(D_MIN);
    expect(r.p.f).toBe(1);
  });
});
