import { describe, expect, it } from "vitest";
import {
  KAPPA_AIRE,
  ajustar,
  calcularEstado,
  cambiarModo,
  excede,
  sincronizar,
  type Parametros,
} from "../../fisica/capacitorPlacas";
import { ESCENARIOS } from "./escenarios";
import {
  porcentaje,
  quienLimita,
  razonCapacitancia,
  textoBloqueo,
  textoEstado,
  textoFuerza,
  textoRigidez,
  textoTrabajo,
} from "./textosCapacitor";

const base = (extra: Partial<Parametros> = {}): Parametros =>
  sincronizar({ modo: "conectado", A: 100e-4, d: 1e-3, materialId: "aire", f: 0, V: 100, Q: 0, ...extra });

describe("textos de la estación 08", () => {
  it("porcentaje legible", () => {
    expect(porcentaje(0)).toBe("0 %");
    expect(porcentaje(0.0004)).toBe("< 0,1 %");
    expect(porcentaje(0.033)).toBe("3,3 %");
    expect(porcentaje(0.85)).toBe("85 %");
    expect(porcentaje(1)).toBe("100 %");
  });

  it("el texto de estado cambia con el modo y con el dieléctrico", () => {
    const aire = base();
    const conVidrio = base({ materialId: "pyrex", f: 1 });
    const t1 = textoEstado(aire, calcularEstado(aire));
    const t2 = textoEstado(conVidrio, calcularEstado(conVidrio));
    const aisl = cambiarModo(conVidrio, "aislado");
    const t3 = textoEstado(aisl, calcularEstado(aisl));
    expect(t1).toContain("Con aire");
    expect(t2).toContain("La batería mantiene V");
    expect(t2).toContain("×5,6");
    expect(t3).toContain("Aislado: la carga no cambia");
    expect(t3).toContain("÷5,6");
    expect(new Set([t1, t2, t3]).size).toBe(3);
  });

  it("material elegido pero fuera: invita a meterlo", () => {
    const p = base({ materialId: "teflon", f: 0 });
    expect(textoEstado(p, calcularEstado(p))).toContain("aún está fuera");
  });

  it("razonCapacitancia vale κ con el hueco lleno y 1 sin lámina", () => {
    expect(razonCapacitancia(base({ materialId: "pyrex", f: 1 }))).toBeCloseTo(5.6 / KAPPA_AIRE, 9);
    expect(razonCapacitancia(base())).toBeCloseTo(1, 12);
  });

  it("textoRigidez: margen amplio, aviso al 85 % y límite", () => {
    const ok = base({ V: 100 });
    expect(textoRigidez(ok, calcularEstado(ok)).nivel).toBe("ok");
    const aviso = base({ V: 2550 });
    const r = textoRigidez(aviso, calcularEstado(aviso));
    expect(r.nivel).toBe("aviso");
    expect(r.texto).toContain("Estás al 85 % de la rigidez del aire");
    const lim = ajustar(base(), { V: 4000 }).p;
    expect(textoRigidez(lim, calcularEstado(lim)).nivel).toBe("limite");
  });

  it("con inserción parcial el límite es el del aire y se dice", () => {
    const p = base({ materialId: "teflon", f: 0.5 });
    expect(quienLimita(p).id).toBe("aire");
    expect(textoRigidez(p, calcularEstado(p)).texto).toContain("La zona con aire rompe antes");
    expect(quienLimita(base({ materialId: "teflon", f: 1 })).id).toBe("teflon");
  });

  it("textoBloqueo describe cada motivo", () => {
    const p = base({ V: 1000 });
    const r = ajustar(p, { d: 1e-4 });
    expect(r.bloqueado).toBeDefined();
    expect(textoBloqueo(r.bloqueado!, r.p, calcularEstado(r.p))).toContain("separación mínima");
    const ais = cambiarModo(base({ materialId: "pyrex", f: 1, V: 5000 }), "aislado");
    const rf = ajustar(ais, { f: 0 });
    expect(textoBloqueo(rf.bloqueado!, rf.p, calcularEstado(rf.p))).toContain("no puedes sacar más el dieléctrico");
    const rm = ajustar(ais, { materialId: "aire" });
    expect(textoBloqueo(rm.bloqueado!, rm.p, calcularEstado(rm.p))).toContain("No se puede cambiar de material");
  });

  it("textoTrabajo distingue conectado y aislado", () => {
    const con = textoTrabajo(base());
    const aisl = textoTrabajo(cambiarModo(base(), "aislado"));
    expect(con).toContain("la batería recibe");
    expect(aisl).toContain("la energía sube");
    expect(aisl).toContain("Q fija");
  });

  it("textoTrabajo no describe un movimiento imposible", () => {
    // Aislado a 3 kV con d = 4 mm: separar al doble daría 6 kV, por encima del tope de la sala.
    const aislado = cambiarModo(base({ d: 4e-3, V: 3000 }), "aislado");
    expect(textoTrabajo(aislado)).toContain("Más lejos ya no se puede");
    // Un caso normal sí describe el movimiento.
    expect(textoTrabajo(cambiarModo(base(), "aislado"))).toContain("la energía sube");
  });

  it("textoFuerza solo con lámina que pueda entrar", () => {
    expect(textoFuerza(calcularEstado(base()))).toBeNull();
    expect(textoFuerza(calcularEstado(base({ materialId: "pyrex", f: 0.5 })))).toContain("F = ");
    expect(textoFuerza(calcularEstado(base({ materialId: "pyrex", f: 1 })))).toBeNull();
  });
});

describe("escenarios rápidos", () => {
  it("son 5 y todos dan parámetros válidos (sin exceder rigidez ni tensión)", () => {
    expect(ESCENARIOS).toHaveLength(5);
    for (const s of ESCENARIOS) {
      const { p } = s.construir();
      expect(excede(p)).toBe(false);
    }
  });

  it("vidrio con batería: C ×κ, V y E iguales a la referencia", () => {
    const { p, referencia } = ESCENARIOS[0].construir();
    const e = calcularEstado(p);
    expect(e.C / referencia.estado.C).toBeCloseTo(5.6 / KAPPA_AIRE, 9);
    expect(e.V).toBe(referencia.estado.V);
    expect(e.E).toBeCloseTo(referencia.estado.E, 9);
  });

  it("cargar, desconectar y meter vidrio: Q igual y V ÷κ", () => {
    const { p, referencia } = ESCENARIOS[1].construir();
    const e = calcularEstado(p);
    expect(p.modo).toBe("aislado");
    expect(e.Q).toBeCloseTo(referencia.estado.Q, 20);
    expect(referencia.estado.V / e.V).toBeCloseTo(5.6 / KAPPA_AIRE, 9);
  });

  it("separar aislado: E igual y V ×5 con la referencia fijada", () => {
    const { p, referencia } = ESCENARIOS[2].construir();
    const e = calcularEstado(p);
    expect(referencia.fijada).toBe(true);
    expect(e.E).toBeCloseTo(referencia.estado.E, 9);
    expect(e.V / referencia.estado.V).toBeCloseTo(5, 9);
    expect(e.U / referencia.estado.U).toBeCloseTo(5, 9);
  });

  it("cerca de la ruptura del aire: 93 % de la rigidez", () => {
    const e = calcularEstado(ESCENARIOS[3].construir().p);
    expect(e.ratioRigidez).toBeCloseTo(2800 / 3000, 6);
  });

  it("titanato: C ×233 con la misma batería", () => {
    const { p, referencia } = ESCENARIOS[4].construir();
    expect(calcularEstado(p).C / referencia.estado.C).toBeCloseTo(233 / KAPPA_AIRE, 6);
  });
});
