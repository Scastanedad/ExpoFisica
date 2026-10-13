import { describe, expect, it } from "vitest";
import { calcularEstado, cambiarModo, dielectricoPorId, sincronizar, type Parametros } from "../../fisica/capacitorPlacas";
import { crearCtxFalso } from "../ctxFalso";
import { dibujarCapacitor, fuenteLogica } from "./dibujarCapacitor";

const base = (extra: Partial<Parametros> = {}): Parametros =>
  sincronizar({ modo: "conectado", A: 100e-4, d: 1e-3, materialId: "aire", f: 0, V: 100, Q: 0, ...extra });

function dibujar(p: Parametros, polarizacion = 0) {
  const ctx = crearCtxFalso();
  dibujarCapacitor(
    ctx,
    { p, estado: calcularEstado(p), material: dielectricoPorId(p.materialId), polarizacion, hover: null },
    { escalaCss: 1 },
  );
  return ctx;
}

describe("dibujarCapacitor", () => {
  it("dibuja sin lanzar en conectado, aislado, con y sin lámina", () => {
    const casos = [
      base(),
      cambiarModo(base(), "aislado"),
      base({ materialId: "pyrex", f: 1 }),
      base({ materialId: "titanato", f: 0.4 }),
    ];
    for (const p of casos) expect(() => dibujar(p, 0.5)).not.toThrow();
  });

  it("sin carga no hay marcas ⊕/⊖", () => {
    const sinV = dibujar(base({ V: 0 }));
    const conV = dibujar(base({ V: 100 }));
    expect(conV.llamadas.arc).toBeGreaterThan(sinV.llamadas.arc ?? 0);
  });

  it("más carga, más marcas", () => {
    const poca = dibujar(base({ V: 10 }));
    const mucha = dibujar(base({ V: 1000, d: 1e-2 }));
    expect(mucha.llamadas.arc).toBeGreaterThan(poca.llamadas.arc);
  });

  it("con lámina se dibujan dipolos (más arcos que con aire)", () => {
    const aire = dibujar(base());
    const vidrio = dibujar(base({ materialId: "pyrex", f: 1 }));
    expect(vidrio.llamadas.arc).toBeGreaterThan(aire.llamadas.arc);
  });

  it("el aviso de rigidez usa ámbar y lo normal usa cian", () => {
    const normal = dibujar(base({ V: 100 }));
    const aviso = dibujar(base({ V: 2900 }));
    expect(normal.estilosTrazo).toContain("#22d3ee");
    expect(normal.estilosTrazo).not.toContain("#fbbf24");
    expect(aviso.estilosTrazo).toContain("#fbbf24");
  });

  it("guarda y restaura el contexto de forma balanceada", () => {
    const c = dibujar(base({ materialId: "mylar", f: 0.5 }));
    expect(c.llamadas.save ?? 0).toBe(c.llamadas.restore ?? 0);
  });

  it("fuenteLogica queda entre 13 y 22 px lógicos y da ≥ 12 px CSS cuando el tope lo permite", () => {
    for (const s of [0.5, 0.75, 1, 1.5]) {
      const f = fuenteLogica(s);
      expect(f).toBeLessThanOrEqual(22);
      expect(f).toBeGreaterThanOrEqual(13);
      if (12 / s <= 22) expect(f * s).toBeGreaterThanOrEqual(12 - 0.5);
    }
  });
});
