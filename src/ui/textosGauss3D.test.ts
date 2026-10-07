import { describe, expect, it } from "vitest";
import { textoConteo, textoEscenario, type CargaTexto, type EntradaTexto } from "./textosGauss3D";

const dentro = (q: number, centrada = false): CargaTexto => ({ q, dentro: true, centrada });
const fuera = (q: number): CargaTexto => ({ q, dentro: false, centrada: false });

function ent(escenario: number, over: Partial<EntradaTexto> = {}): EntradaTexto {
  return { escenario, forma: "esfera", tamano: 5, thetaDeg: 0, cargas: [dentro(3, true)], phi: 3, ...over };
}
const todo = (t: ReturnType<typeof textoEscenario>) => `${t.mirar} ${t.pasa} ${t.porque}`;

/** Frases que serían falsas en cualquier estado. */
const PROHIBIDAS = [/bloque/i, /=\s*q\s*[·*]\s*20/i, /q\/2/];

describe("textoEscenario", () => {
  it("los 9 escenarios, en sus estados iniciales, tienen las tres partes y ninguna frase prohibida", () => {
    const estados: EntradaTexto[] = [
      ent(1, { forma: "parche", tamano: 4, cargas: [fuera(5)], phi: 0.1594 }),
      ent(2),
      ent(3, { cargas: [dentro(3)] }),
      ent(4),
      ent(5, { forma: "cubo", tamano: 8, cargas: [dentro(3)] }),
      ent(6, { cargas: [fuera(3)], phi: 0 }),
      ent(7, { cargas: [dentro(3), dentro(-3)], phi: 0 }),
      ent(8, { forma: "parche", tamano: 10, cargas: [fuera(3)], phi: 0.7889 }),
      ent(9, { cargas: [dentro(4, true)], phi: 4 }),
    ];
    estados.forEach((e, i) => {
      const t = textoEscenario(e);
      expect(t.titulo.length).toBeGreaterThan(3);
      expect(t.mirar.length).toBeGreaterThan(10);
      expect(t.pasa.length).toBeGreaterThan(10);
      expect(t.porque.length).toBeGreaterThan(10);
      for (const r of PROHIBIDAS) expect(todo(t), `esc ${i + 1}`).not.toMatch(r);
    });
  });

  it("cambia al arrastrar la carga: dentro, fuera y de nuevo dentro", () => {
    const a = textoEscenario(ent(3, { cargas: [dentro(3)] }));
    const b = textoEscenario(ent(3, { cargas: [fuera(3)], phi: 0 }));
    expect(a.pasa).toContain("Φ = 3,00 µC/ε₀");
    expect(a.pasa).toContain("+3 µC");
    expect(b.pasa).toContain("Φ = 0.");
    expect(b.pasa).toContain("está fuera");
    expect(a.pasa).not.toBe(b.pasa);
    expect(a.porque).not.toBe(b.porque);
    expect(textoEscenario(ent(3, { cargas: [dentro(3)] }))).toEqual(a);
  });

  it("el signo de la carga encerrada cambia la frase y el valor de Φ", () => {
    const pos = textoEscenario(ent(2, { cargas: [dentro(2)] }));
    const neg = textoEscenario(ent(2, { cargas: [dentro(-2)], phi: -2 }));
    expect(pos.pasa).toContain("Φ = 2,00 µC/ε₀");
    expect(pos.pasa).toContain("sale");
    expect(neg.pasa).toContain("Φ = −2,00 µC/ε₀");
    expect(neg.pasa).toContain("entra");
  });

  it("carga fuera: flujo local pero neto cero, y la carga de fuera no cambia Φ con otra dentro", () => {
    const f = textoEscenario(ent(2, { cargas: [fuera(3)], phi: 0 }));
    expect(f.pasa).toContain("Φ = 0");
    expect(f.porque).toMatch(/entra.*sale|sale.*entra/);
    const mixto = textoEscenario(ent(2, { cargas: [dentro(3), fuera(-2)], phi: 3 }));
    expect(mixto.pasa).toContain("Φ = 3,00 µC/ε₀");
    expect(mixto.pasa).toContain("La carga de fuera no cambia el Φ total");
  });

  it("Φ = q_enc/ε₀ solo se afirma para superficies cerradas; el parche avisa de que no encierra carga", () => {
    for (const n of [1, 8]) {
      const t = textoEscenario(ent(n, { forma: "parche", tamano: 4, cargas: [fuera(5)], phi: 0.16 }));
      expect(t.pasa).toContain("no encierra carga");
      expect(t.pasa).toContain("no es q/ε₀");
      expect(t.porque).not.toMatch(/Φ = q_enc\/ε₀\./);
    }
    // con un parche en un escenario cerrado no se cuenta la lección cerrada
    const p = textoEscenario(ent(2, { forma: "parche", cargas: [fuera(3)], phi: 0.5 }));
    expect(p.pasa).toContain("no encierra carga");
    // y viceversa: cerrada en el escenario 1 deja de hablar del parche
    const c = textoEscenario(ent(1, { forma: "cubo" }));
    expect(c.mirar).not.toMatch(/parche/i);
  });

  it("parche: el signo de Φ cambia la frase y Φ≈0 no afirma ausencia de campo", () => {
    const pos = textoEscenario(ent(1, { forma: "parche", cargas: [fuera(5)], phi: 0.16 }));
    const neg = textoEscenario(ent(1, { forma: "parche", cargas: [fuera(5)], phi: -0.16 }));
    const cero = textoEscenario(ent(1, { forma: "parche", cargas: [fuera(5)], phi: 0 }));
    expect(pos.pasa).toContain("en el sentido de su normal");
    expect(neg.pasa).toContain("en sentido contrario a su normal");
    expect(cero.pasa).toMatch(/Φ ≈ 0/);
    expect(cero.pasa).not.toMatch(/no hay campo/i);
  });

  it("escenario 5: Φ no depende de la forma", () => {
    for (const forma of ["esfera", "cubo", "cilindro"] as const) {
      const t = textoEscenario(ent(5, { forma, cargas: [dentro(3)] }));
      expect(t.pasa).toContain("Φ = 3,00 µC/ε₀");
      expect(t.pasa).toContain(forma === "esfera" ? "la esfera" : forma === "cubo" ? "el cubo" : "el cilindro");
      expect(t.porque).toContain("no de la forma");
    }
  });

  it("escenario 4: E en la superficie solo con una carga centrada en la esfera; el tamaño cambia el campo, no Φ", () => {
    const t = textoEscenario(ent(4, { tamano: 2 }));
    expect(t.pasa).toMatch(/67,4 MN\/C/); // 6,74×10⁷ N/C
    const t8 = textoEscenario(ent(4, { tamano: 8 }));
    expect(t.pasa).toContain("Φ = 3,00 µC/ε₀");
    expect(t8.pasa).toContain("Φ = 3,00 µC/ε₀");
    expect(t8.pasa).toMatch(/4,21 MN\/C/);
    expect(t8.pasa).not.toBe(t.pasa);
    const descentrada = textoEscenario(ent(4, { cargas: [dentro(3, false)] }));
    expect(descentrada.pasa).not.toMatch(/campo en la superficie vale/);
    expect(descentrada.porque).not.toMatch(/1\/R²/);
  });

  it("escenario 6: cruzar cambia Φ de golpe, según el lado", () => {
    expect(textoEscenario(ent(6, { cargas: [fuera(3)], phi: 0 })).porque).toContain("de 0 a q/ε₀");
    expect(textoEscenario(ent(6, { cargas: [dentro(3)] })).porque).toContain("cambia de golpe a 0");
  });

  it("escenario 7: dipolo encerrado: Φ = 0 sin decir que no hay campo; con una sola carga dentro no se llama dipolo", () => {
    const d = textoEscenario(ent(7, { cargas: [dentro(3), dentro(-3)], phi: 0 }));
    expect(d.pasa).toContain("+3 µC");
    expect(d.pasa).toContain("−3 µC");
    expect(d.pasa).toContain("Φ = 0");
    expect(d.porque).toContain("Φ = 0 no significa campo cero");
    const u = textoEscenario(ent(7, { cargas: [dentro(3), fuera(-3)], phi: 3 }));
    expect(u.pasa).toContain("Φ = 3,00 µC/ε₀");
    expect(u.pasa).not.toContain("suman 0");
  });

  it("escenario 9: E = Φ/(4πR²) con el valor de k·q/R² (14,4 MN/C para 4 µC a 5 cm); sin simetría solo el valor medio", () => {
    const t = textoEscenario(ent(9, { cargas: [dentro(4, true)], phi: 4 }));
    expect(t.pasa).toContain("E = Φ/(4πR²)");
    expect(t.pasa).toMatch(/14,4 MN\/C/);
    expect(t.pasa).toContain("5 cm");
    expect(t.porque).toContain("simetría");
    const d = textoEscenario(ent(9, { cargas: [dentro(4, false)], phi: 4 }));
    expect(d.pasa).toContain("valor medio");
    expect(d.pasa).not.toContain("E = Φ/(4πR²) =");
    const c = textoEscenario(ent(9, { forma: "cubo", cargas: [dentro(4, true)] }));
    expect(c.pasa).not.toContain("E = Φ/(4πR²)");
    expect(c.porque).toContain("simetría");
  });

  it("la superficie es imaginaria: no frena el campo", () => {
    expect(textoEscenario(ent(2)).mirar).toContain("imaginaria");
  });
});

describe("textoConteo", () => {
  const base = { calidad: "alta", forma: "esfera" as const, nLineas: 60 };
  it("sin líneas no hay conteo", () => {
    expect(textoConteo({ ...base, nLineas: 0, salen: 0, entran: 0, cargas: [dentro(3)] })).toBeNull();
  });

  it("carga única en calidad alta: equivalencia con N líneas/µC solo si coincide", () => {
    const ok = textoConteo({ ...base, salen: 60, entran: 0, cargas: [dentro(3)] })!;
    expect(ok.salen).toBe("salen: 60");
    expect(ok.entran).toBe("entran: 0");
    expect(ok.netas).toBe("netas: 60");
    expect(ok.nota).toContain("3 µC × 20 = 60");
    expect(ok.nota).toContain("convención");
    const raro = textoConteo({ ...base, salen: 59, entran: 0, cargas: [dentro(3)] })!;
    expect(raro.nota).toBeNull();
  });

  it("calidad media/baja (y durante el arrastre): conteos reales y sin rótulo «= q·20»", () => {
    for (const calidad of ["media", "baja"]) {
      const t = textoConteo({ ...base, calidad, salen: 31, entran: 0, cargas: [dentro(5)] })!;
      expect(t.netas).toBe("netas: 31");
      expect(t.nota).toContain("Vista simplificada");
      expect(t.nota).not.toMatch(/× 20|q·20/);
    }
  });

  it("carga fuera: netas = 0 en cualquier calidad (identidad); dipolo: salen = entran", () => {
    const f = textoConteo({ ...base, calidad: "baja", salen: 17, entran: 17, cargas: [fuera(3)] })!;
    expect(f.nota).toContain("Netas = 0");
    const d = textoConteo({ ...base, calidad: "baja", salen: 22, entran: 22, cargas: [dentro(3), dentro(-3)] })!;
    expect(d.nota).toContain("salen tantas líneas como entran");
  });

  it("pares desiguales dentro: no se afirma ninguna equivalencia", () => {
    const t = textoConteo({ ...base, salen: 60, entran: 18, cargas: [dentro(5), dentro(-3)] })!;
    expect(t.netas).toBe("netas: 42");
    expect(t.nota).toBeNull();
  });

  it("parche: ningún conteo se presenta como medida de Φ", () => {
    const t = textoConteo({ ...base, forma: "parche", salen: 3, entran: 0, cargas: [fuera(5)] })!;
    expect(t.nota).toContain("la medida del flujo es Φ");
    expect(t.salen).toContain("a favor de la normal");
  });
});

describe("revisión fase 4 (fisico-revisor)", () => {
  it("E = kq/R²: 3 µC a 5 cm = 10,8 MN/C; 4 µC a 5 cm = 14,4 MN/C", () => {
    const t3 = textoEscenario(ent(9, { cargas: [dentro(3, true)], phi: 3 }));
    expect(t3.pasa).toContain("10,8 MN/C");
    const t4 = textoEscenario(ent(4, { cargas: [dentro(4, true)], phi: 4 }));
    expect(t4.pasa).toContain("14,4 MN/C");
  });

  it("carga negativa: E apunta hacia dentro y la media sin simetría lo dice", () => {
    expect(textoEscenario(ent(9, { cargas: [dentro(-3, true)], phi: -3 })).pasa).toContain("hacia dentro");
    const sin = textoEscenario(ent(9, { cargas: [dentro(-3, false)], phi: -3 }));
    expect(sin.pasa).toContain("valor medio");
    expect(sin.pasa).toContain("hacia dentro");
  });

  it("escenario 7 con cargas del mismo signo: no habla de carga + a la −", () => {
    const t = textoEscenario(ent(7, { cargas: [dentro(3), dentro(2)], phi: 5 }));
    expect(t.mirar).not.toMatch(/carga \+ a la −/);
    expect(t.pasa).not.toMatch(/suman 0/);
  });

  it("escenario 6: con otra carga ya dentro, cruzar cambia Φ en q/ε₀, no «a 0»", () => {
    const t = textoEscenario(ent(6, { cargas: [dentro(3), dentro(2)], phi: 5 }));
    expect(t.porque).not.toContain("a 0");
    expect(t.porque).toContain("q/ε₀");
  });

  it("escenario 3 con cubo: no dice «esfera»; la carga de fuera no cambia el Φ total", () => {
    const t = textoEscenario(ent(3, { forma: "cubo", cargas: [dentro(3), fuera(2)], phi: 3 }));
    expect(t.mirar).not.toMatch(/esfera/);
    expect(t.pasa).toContain("Φ total");
  });

  it("parche: Φ dicho «en neto» y sin cos θ", () => {
    const t = textoEscenario(ent(1, { forma: "parche", cargas: [fuera(3)], phi: 0.5 }));
    expect(t.pasa).toContain("en neto");
    expect(`${t.mirar} ${t.pasa} ${t.porque}`).not.toMatch(/cos/i);
  });

  it("conteo: carga única negativa en alta dice «entran», y la nota de calidad no afirma «menos líneas»", () => {
    const n = textoConteo({ salen: 0, entran: 60, calidad: "alta", forma: "esfera", cargas: [dentro(-3, true)], nLineas: 60 });
    expect(n?.nota).toContain("entran en neto");
    const m = textoConteo({ salen: 40, entran: 0, calidad: "media", forma: "esfera", cargas: [dentro(2, true)], nLineas: 40 });
    expect(m?.nota).toContain("pueden dibujarse menos");
    expect(m?.nota).not.toMatch(/= 40/);
  });
});
