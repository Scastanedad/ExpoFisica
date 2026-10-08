import { describe, expect, it } from "vitest";
import type { Fuente } from "../fisica/gauss3d/presets";
import type { TipoSuperficie } from "../fisica/gauss3d/tipos";
import { textoConteo, textoGauss, tituloGauss, type CargaTexto, type EntradaTexto } from "./textosGauss3D";

const dentro = (q: number, centrada = false): CargaTexto => ({ q, dentro: true, centrada });
const fuera = (q: number): CargaTexto => ({ q, dentro: false, centrada: false });
const cruza = (q: number, estaDentro: boolean): CargaTexto => ({ q, dentro: estaDentro, centrada: false, cerca: true });

function ent(over: Partial<EntradaTexto> = {}): EntradaTexto {
  return { forma: "esfera", fuente: "carga", tamano: 5, thetaDeg: 0, cargas: [dentro(3, true)], phi: 3, ...over };
}
const todo = (t: ReturnType<typeof textoGauss>) => `${t.titulo} ${t.mirar} ${t.pasa} ${t.porque}`;

/** Frases que serían falsas en cualquier estado, o que nombran algo que ya no existe en la interfaz. */
const PROHIBIDAS = [/bloque de/i, /=\s*q\s*[·*]\s*20/i, /q\/2/, /escenario/i, /parche/i, /el botón/i, /Avanzado/];

const FORMAS: TipoSuperficie[] = ["esfera", "cubo", "cilindro", "parche"];
const FUENTES: Fuente[] = ["carga", "dipolo"];
type Pos = "dentro" | "fuera" | "cruza" | "una-fuera";

function cargasDe(fuente: Fuente, pos: Pos): CargaTexto[] {
  if (fuente === "carga") {
    return pos === "dentro" ? [dentro(3)] : pos === "cruza" ? [cruza(3, false)] : [fuera(3)];
  }
  if (pos === "dentro") return [dentro(3), dentro(-3)];
  if (pos === "fuera") return [fuera(3), fuera(-3)];
  if (pos === "cruza") return [dentro(3), cruza(-3, false)];
  return [dentro(3), fuera(-3)];
}

describe("textoGauss: título derivado", () => {
  it("«{Figura} con {una carga | un dipolo}» para las 8 combinaciones", () => {
    const esperado: Record<string, string> = {
      "esfera/carga": "Esfera con una carga",
      "esfera/dipolo": "Esfera con un dipolo",
      "cubo/carga": "Cubo con una carga",
      "cubo/dipolo": "Cubo con un dipolo",
      "cilindro/carga": "Cilindro con una carga",
      "cilindro/dipolo": "Cilindro con un dipolo",
      "parche/carga": "Plano con una carga",
      "parche/dipolo": "Plano con un dipolo",
    };
    for (const forma of FORMAS) {
      for (const fuente of FUENTES) {
        const e = ent({ forma, fuente, cargas: cargasDe(fuente, "dentro"), phi: 0.2 });
        expect(textoGauss(e).titulo).toBe(esperado[`${forma}/${fuente}`]);
        expect(tituloGauss(forma, fuente)).toBe(esperado[`${forma}/${fuente}`]);
      }
    }
  });
});

describe("textoGauss: figura × fuente × dentro/fuera/cruzando", () => {
  for (const forma of FORMAS) {
    for (const fuente of FUENTES) {
      for (const pos of ["dentro", "fuera", "cruza", "una-fuera"] as const) {
        if (fuente === "carga" && pos === "una-fuera") continue;
        it(`${forma} · ${fuente} · ${pos}: tres partes, sin frases prohibidas`, () => {
          const t = textoGauss(ent({ forma, fuente, cargas: cargasDe(fuente, pos), phi: forma === "parche" ? 0.19 : 0 }));
          expect(t.mirar.length).toBeGreaterThan(10);
          expect(t.pasa.length).toBeGreaterThan(10);
          expect(t.porque.length).toBeGreaterThan(10);
          for (const r of PROHIBIDAS) expect(todo(t)).not.toMatch(r);
        });
      }
    }
  }

  it("cerradas, una carga: dentro, fuera y cruzando dicen cosas distintas y verdaderas", () => {
    for (const forma of ["esfera", "cubo", "cilindro"] as const) {
      const d = textoGauss(ent({ forma, cargas: [dentro(3)] }));
      const f = textoGauss(ent({ forma, cargas: [fuera(3)], phi: 0 }));
      const c = textoGauss(ent({ forma, cargas: [cruza(3, true)] }));
      const cf = textoGauss(ent({ forma, cargas: [cruza(3, false)], phi: 0 }));
      expect(d.pasa).toContain("Φ = 3,00 µC/ε₀");
      expect(d.pasa).toContain("+3 µC");
      expect(d.pasa).toContain("cualquier forma");
      expect(d.porque).toContain("no de la forma");
      expect(d.mirar).toContain("Arrastra la carga fuera");
      expect(f.pasa).toContain("Φ = 0.");
      expect(f.pasa).toContain("está fuera");
      expect(f.porque).toMatch(/entra.*sale|sale.*entra/);
      expect(f.mirar).toContain("de 0 a q/ε₀");
      expect(c.mirar).toContain("altura z");
      expect(c.porque).toContain("cambia de golpe a 0");
      expect(cf.porque).toContain("de 0 a q/ε₀");
      expect(d.pasa).not.toBe(f.pasa);
    }
  });

  it("el signo de la carga encerrada cambia la frase y el valor de Φ", () => {
    const pos = textoGauss(ent({ cargas: [dentro(2)] }));
    const neg = textoGauss(ent({ cargas: [dentro(-2)], phi: -2 }));
    expect(pos.pasa).toContain("Φ = 2,00 µC/ε₀");
    expect(pos.pasa).toContain("sale");
    expect(neg.pasa).toContain("Φ = −2,00 µC/ε₀");
    expect(neg.pasa).toContain("entra");
  });

  it("cambia al arrastrar la carga: dentro, fuera y de nuevo dentro (determinista)", () => {
    const a = textoGauss(ent({ cargas: [dentro(3)] }));
    const b = textoGauss(ent({ cargas: [fuera(3)], phi: 0 }));
    expect(a).not.toEqual(b);
    expect(textoGauss(ent({ cargas: [dentro(3)] }))).toEqual(a);
  });

  it("dipolo con las dos cargas dentro: «suman 0» y «no significa campo cero» en las tres cerradas", () => {
    for (const forma of ["esfera", "cubo", "cilindro"] as const) {
      const t = textoGauss(ent({ forma, fuente: "dipolo", cargas: [dentro(3), dentro(-3)], phi: 0 }));
      expect(t.pasa).toContain("+3 µC");
      expect(t.pasa).toContain("−3 µC");
      expect(t.pasa).toContain("suman 0");
      expect(t.pasa).toContain("Φ = 0");
      expect(t.porque).toContain("no significa campo cero");
      expect(t.mirar).toContain("Saca una de las cargas");
    }
  });

  it("dipolo con una carga fuera: Φ = ±q/ε₀ y la de fuera no cambia el total", () => {
    for (const forma of ["esfera", "cubo", "cilindro"] as const) {
      const a = textoGauss(ent({ forma, fuente: "dipolo", cargas: [dentro(3), fuera(-3)], phi: 3 }));
      expect(a.pasa).toContain("Φ = 3,00 µC/ε₀");
      expect(a.pasa).toContain("La carga de fuera no cambia el Φ total");
      expect(a.pasa).not.toContain("suman 0");
      expect(a.porque).toContain("Φ = q_enc/ε₀");
      expect(a.mirar).toContain("Devuelve la carga de fuera");
      const b = textoGauss(ent({ forma, fuente: "dipolo", cargas: [fuera(3), dentro(-3)], phi: -3 }));
      expect(b.pasa).toContain("Φ = −3,00 µC/ε₀");
      expect(b.pasa).toContain("entra");
    }
  });

  it("dipolo con las dos fuera: Φ = 0 y se sugiere meter una", () => {
    const t = textoGauss(ent({ fuente: "dipolo", cargas: [fuera(3), fuera(-3)], phi: 0 }));
    expect(t.pasa).toContain("Las cargas están fuera");
    expect(t.mirar).toContain("±q/ε₀");
  });

  it("dipolo cruzando la superficie: el cambio de Φ es en q/ε₀ de esa carga, no «a 0»", () => {
    const t = textoGauss(ent({ fuente: "dipolo", cargas: [dentro(3), cruza(-3, false)], phi: 3 }));
    expect(t.porque).toContain("q/ε₀ (la de esa carga)");
    expect(t.porque).not.toContain("a 0");
    expect(t.mirar).toContain("altura z");
  });

  it("cargas del mismo signo dentro: no habla de carga + a la − ni de «suman 0»", () => {
    const t = textoGauss(ent({ fuente: "dipolo", cargas: [dentro(3), dentro(2)], phi: 5 }));
    expect(t.mirar).not.toMatch(/carga \+ a la −/);
    expect(t.pasa).not.toMatch(/suman 0/);
  });

  it("Esfera con una carga centrada (estado inicial): Gauss como herramienta, E = Φ/(4πR²) = k·q/R²", () => {
    const t = textoGauss(ent({ cargas: [dentro(4, true)], phi: 4 }));
    expect(t.pasa).toContain("E = Φ/(4πR²)");
    expect(t.pasa).toMatch(/14,4 MN\/C/);
    expect(t.pasa).toContain("5 cm");
    expect(t.porque).toContain("simetría");
    expect(t.porque).toContain("1/R²");
    expect(t.mirar).toContain("Agranda la esfera");
    expect(textoGauss(ent({ cargas: [dentro(3, true)] })).pasa).toContain("10,8 MN/C");
  });

  it("el tamaño cambia el campo en la superficie, no Φ", () => {
    const t2 = textoGauss(ent({ tamano: 2 }));
    const t8 = textoGauss(ent({ tamano: 8 }));
    expect(t2.pasa).toMatch(/67,4 MN\/C/);
    expect(t8.pasa).toMatch(/4,21 MN\/C/);
    expect(t2.pasa).toContain("Φ = 3,00 µC/ε₀");
    expect(t8.pasa).toContain("Φ = 3,00 µC/ε₀");
  });

  it("esfera con la carga dentro pero descentrada: solo el valor medio de E, no E en cada punto", () => {
    const d = textoGauss(ent({ cargas: [dentro(4, false)], phi: 4 }));
    expect(d.pasa).toContain("valor medio");
    expect(d.pasa).not.toContain("E = Φ/(4πR²) =");
    expect(d.pasa).not.toMatch(/campo en la superficie vale/);
    expect(d.porque).not.toMatch(/Por simetría/);
    expect(d.porque).toContain("Da igual en qué punto");
    expect(d.mirar).toContain("en el centro");
    expect(textoGauss(ent({ cargas: [dentro(-3, false)], phi: -3 })).pasa).toContain("hacia dentro");
    expect(textoGauss(ent({ cargas: [dentro(-3, true)], phi: -3 })).pasa).toContain("hacia dentro");
  });

  it("cubo y cilindro con la carga centrada: no se muestra E = Φ/(4πR²) (no hay E constante ni normal)", () => {
    for (const forma of ["cubo", "cilindro"] as const) {
      const t = textoGauss(ent({ forma, cargas: [dentro(4, true)], phi: 4 }));
      expect(t.pasa).not.toContain("E = Φ/(4πR²)");
      expect(t.pasa).not.toContain("valor medio");
      expect(t.mirar).not.toMatch(/esfera/);
    }
  });

  it("cubo con una carga dentro y otra fuera: la de fuera no cambia el Φ total y no dice «esfera»", () => {
    const t = textoGauss(ent({ forma: "cubo", fuente: "dipolo", cargas: [dentro(3), fuera(2)], phi: 3 }));
    expect(t.mirar).not.toMatch(/esfera/);
    expect(t.pasa).toContain("Φ total");
  });

  it("la superficie es imaginaria: no frena el campo (carga dentro)", () => {
    expect(textoGauss(ent({ cargas: [dentro(3)] })).porque).toContain("imaginaria");
  });
});

describe("textoGauss: Plano (superficie abierta)", () => {
  const plano = (over: Partial<EntradaTexto> = {}) =>
    textoGauss(ent({ forma: "parche", tamano: 8, cargas: [fuera(3)], phi: 0.5, ...over }));

  it("ninguna cadena afirma q/ε₀ ni q_enc salvo la negación «no es q/ε₀»", () => {
    for (const fuente of FUENTES) {
      for (const phi of [null, 0, 0.19228, -0.16, 0.5]) {
        const t = plano({ fuente, cargas: cargasDe(fuente, "fuera"), phi });
        const sinNegacion = todo(t).replace("aquí Φ no es q/ε₀", "");
        expect(sinNegacion).not.toMatch(/q\/ε₀/);
        expect(sinNegacion).not.toMatch(/q_enc/);
        expect(sinNegacion).not.toMatch(/carga encerrada/i);
        expect(t.pasa).toContain("no encierra carga");
        expect(t.pasa).toContain("no es q/ε₀");
        for (const r of PROHIBIDAS) expect(todo(t)).not.toMatch(r);
      }
    }
  });

  it("«Qué mirar»: θ en el bloque Figura (no en «Avanzado») y sin referencia a escenarios", () => {
    const t = plano();
    expect(t.mirar).toContain("Inclínalo con θ");
    expect(t.mirar).toContain("bloque Figura");
    expect(t.mirar).toContain("Cambia a Esfera, Cubo o Cilindro");
    expect(t.mirar).not.toMatch(/escenario|Avanzado/);
    expect(t.porque).toContain("solo vale para superficies cerradas");
    expect(t.porque).toContain("un plano no encierra nada");
  });

  it("el signo de Φ cambia la frase y Φ≈0 no afirma ausencia de campo", () => {
    const pos = plano({ phi: 0.16 });
    const neg = plano({ phi: -0.16 });
    const cero = plano({ phi: 0 });
    expect(pos.pasa).toContain("en el sentido de su normal");
    expect(neg.pasa).toContain("en sentido contrario a su normal");
    expect(cero.pasa).toMatch(/Φ ≈ 0/);
    expect(cero.pasa).not.toMatch(/no hay campo/i);
    expect(`${pos.mirar} ${pos.pasa} ${pos.porque}`).not.toMatch(/cos/i);
    expect(pos.pasa).toContain("en neto");
  });

  it("Plano con dipolo y Φ ≈ 0: dos flujos opuestos que se compensan, no «cargas que suman 0»", () => {
    const t = plano({ fuente: "dipolo", cargas: cargasDe("dipolo", "fuera"), phi: 0 });
    expect(t.pasa).toContain("flujo de +q y el de −q pueden ser opuestos");
    expect(t.pasa).not.toContain("suman 0");
    expect(t.mirar).toContain("Mueve la carga −q a un lado y otro del plano");
    expect(plano({ fuente: "carga", phi: 0 }).pasa).not.toContain("+q");
  });

  it("ignora `cerca`/`dentro` de las cargas (no hay zona de exclusión ni cruce)", () => {
    expect(plano({ cargas: [cruza(3, true)] })).toEqual(plano({ cargas: [fuera(3)] }));
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

  it("plano: ningún conteo se presenta como medida de Φ", () => {
    const t = textoConteo({ ...base, forma: "parche", salen: 3, entran: 0, cargas: [fuera(5)] })!;
    expect(t.nota).toContain("la medida del flujo es Φ");
    expect(t.salen).toContain("a favor de la normal");
  });

  it("carga única negativa en alta dice «entran», y la nota de calidad no afirma «menos líneas»", () => {
    const n = textoConteo({ salen: 0, entran: 60, calidad: "alta", forma: "esfera", cargas: [dentro(-3, true)], nLineas: 60 });
    expect(n?.nota).toContain("entran en neto");
    const m = textoConteo({ salen: 40, entran: 0, calidad: "media", forma: "esfera", cargas: [dentro(2, true)], nLineas: 40 });
    expect(m?.nota).toContain("pueden dibujarse menos");
    expect(m?.nota).not.toMatch(/= 40/);
  });
});
