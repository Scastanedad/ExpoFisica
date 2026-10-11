import { describe, expect, it } from "vitest";
import { I_CERO, PRESETS_E6, sumaTerminos, type Bloque, type Resultado } from "../../fisica/circuitos";
import { distribuirCircuito, type GeometriaCircuito } from "./distribucion";
import { estadoDC } from "./estado";
import { ESPACIADO_PARTICULAS, avanzarParticulas, corrientesTramos, crearParticulas, velocidadesTramos, vMaxLogico } from "./particulas";
import { leerSonda, tramoVecino } from "./sonda";
import { anuncioSonda, textoCorriente, textoSonda, textoVoltaje } from "./textos";

const preset = (id: string) => PRESETS_E6.find((p) => p.id === id)!.arbol as Bloque;
const rect = { ancho: 960, alto: 540 };
const mA = 1e-3;

function montar(id: string, E = 12) {
  const arbol = preset(id);
  const geom = distribuirCircuito(arbol, "R", rect);
  return { geom, ...estadoDC(arbol, E) };
}

const ids = (g: GeometriaCircuito, prefijo: string) => g.tramos.filter((t) => t.id.startsWith(prefijo));

describe("sonda en cables", () => {
  it("serie: todo tramo del lazo lleva la misma corriente a favor de la flecha", () => {
    const { geom, net, r } = montar("serie3");
    for (const t of geom.tramos) {
      expect(sumaTerminos(r, t.terminos), t.id).toBeCloseTo(2 * mA, 12);
    }
    const riel = leerSonda(geom, net, r, { tramo: "riel-sup", t: 0.5 });
    expect(riel?.v).toBeCloseTo(12, 9);
    expect(riel?.i).toBeCloseTo(2 * mA, 12);
    expect(riel?.sobreCuerpo).toBe(false);
  });

  it("el potencial de cada tramo es el del nodo: un cable ideal no pierde voltaje", () => {
    const { geom, net, r } = montar("serie3");
    const a = leerSonda(geom, net, r, { tramo: "R1:a", t: 0 })!;
    const b = leerSonda(geom, net, r, { tramo: "R1:b", t: 1 })!;
    expect(a.v).toBeCloseTo(12, 9);
    expect(b.v).toBeCloseTo(12 - 2, 9); // R1 = 1 kΩ con 2 mA
    expect(leerSonda(geom, net, r, { tramo: "riel-inf", t: 0.3 })!.v).toBeCloseTo(0, 9);
  });

  it("sobre el cuerpo del resistor: V lineal entre terminales, I del elemento", () => {
    const { geom, net, r } = montar("serie3");
    const ini = leerSonda(geom, net, r, { tramo: "R3:cuerpo", t: 0 })!;
    const mitad = leerSonda(geom, net, r, { tramo: "R3:cuerpo", t: 0.5 })!;
    const fin = leerSonda(geom, net, r, { tramo: "R3:cuerpo", t: 1 })!;
    expect(ini.sobreCuerpo).toBe(true);
    expect(ini.v).toBeCloseTo(6, 9);
    expect(mitad.v).toBeCloseTo(3, 9);
    expect(fin.v).toBeCloseTo(0, 9);
    expect(mitad.i).toBeCloseTo(2 * mA, 12);
  });

  it("paralelo: las barras llevan el acumulado KCL y la corriente final es 0", () => {
    const { geom, r } = montar("paralelo3");
    // Ramas 6, 6 y 3 mA (R1, R2, R3 de arriba abajo); la entrada cae a la altura de la rama central.
    const izq = ids(geom, "p0:bi");
    expect(izq.length).toBeGreaterThan(0);
    const corr = izq.map((t) => sumaTerminos(r, t.terminos));
    // Tramo superior: 6 mA hacia arriba (negativo = contra el sentido hacia abajo). Inferior: 3 mA hacia abajo.
    expect(corr[0]).toBeCloseTo(-6 * mA, 12);
    expect(corr[1]).toBeCloseTo(3 * mA, 12);
    const der = ids(geom, "p0:bd").map((t) => sumaTerminos(r, t.terminos));
    expect(der[0]).toBeCloseTo(6 * mA, 12);
    expect(der[1]).toBeCloseTo(-3 * mA, 12);
    // Cierre de KCL: la corriente que entra por la barra izquierda se reparte entera en las ramas.
    const entra = sumaTerminos(r, geom.tramos.find((t) => t.id === "p0:entra")!.terminos);
    expect(entra).toBeCloseTo(15 * mA, 12);
    expect(entra - 6 * mA - 6 * mA - 3 * mA).toBeCloseTo(0, 12);
  });

  it("paralelo: cada rama lleva su corriente y todas tienen el mismo voltaje", () => {
    const { geom, net, r } = montar("paralelo3");
    const esperado = { R1: 6 * mA, R2: 6 * mA, R3: 3 * mA };
    for (const [id, i] of Object.entries(esperado)) {
      const l = leerSonda(geom, net, r, { tramo: `${id}:a`, t: 0.5 })!;
      expect(l.i).toBeCloseTo(i, 12);
      expect(l.v).toBeCloseTo(12, 9);
    }
  });

  it("escalera: corrientes por tramo coinciden con la tabla de la spec", () => {
    const { geom, r } = montar("escalera");
    const esperado: Record<string, number> = { R1: 6, R2: 3, R3: 3, R4: 1.5, R5: 1.5 };
    for (const [id, i] of Object.entries(esperado)) {
      const t = geom.tramos.find((x) => x.id === `${id}:cuerpo`)!;
      expect(sumaTerminos(r, t.terminos)).toBeCloseTo(i * mA, 12);
    }
  });

  it("serie+paralelo: en el par 2‖2 cada mitad de la barra lleva 3 mA hacia su rama", () => {
    const { geom, r } = montar("serieParalelo");
    const izq = ids(geom, "p0:bi").map((t) => sumaTerminos(r, t.terminos));
    const der = ids(geom, "p0:bd").map((t) => sumaTerminos(r, t.terminos));
    expect(izq).toHaveLength(2);
    expect(izq[0]).toBeCloseTo(-3 * mA, 12); // sube a R1
    expect(izq[1]).toBeCloseTo(3 * mA, 12); // baja a R2
    expect(der[0]).toBeCloseTo(3 * mA, 12); // R1 desemboca y baja hacia la salida
    expect(der[1]).toBeCloseTo(-3 * mA, 12); // R2 desemboca y sube hacia la salida
    const sale = geom.tramos.find((t) => t.id === "p0:sale")!;
    expect(sumaTerminos(r, sale.terminos)).toBeCloseTo(6 * mA, 12);
  });

  it("devuelve null con un tramo inexistente", () => {
    const { geom, net, r } = montar("serie3");
    expect(leerSonda(geom, net, r, { tramo: "no-existe", t: 0 })).toBeNull();
  });
});

describe("recorrido de tramos con teclado", () => {
  it("avanza y retrocede dando la vuelta", () => {
    const { geom } = montar("serie3");
    const primero = geom.tramos[0].id;
    const ultimo = geom.tramos[geom.tramos.length - 1].id;
    expect(tramoVecino(geom, null, 1)).toBe(primero);
    expect(tramoVecino(geom, null, -1)).toBe(ultimo);
    expect(tramoVecino(geom, ultimo, 1)).toBe(primero);
    expect(tramoVecino(geom, primero, -1)).toBe(ultimo);
  });
});

describe("partículas", () => {
  it("rapidez lineal en |I| con la misma referencia (criterio 13)", () => {
    const { geom, r, iRef, suelo } = montar("paralelo3");
    const corr = corrientesTramos(geom, r);
    const vel = velocidadesTramos(geom, corr, iRef, suelo);
    const v = (id: string) => vel[geom.tramos.findIndex((t) => t.id === id)];
    expect(v("R1:a") / v("R3:a")).toBeCloseTo(2, 5);
    expect(v("R1:a")).toBeCloseTo(v("R2:a"), 5);
    // La referencia es la mayor corriente del circuito (la de la batería, 15 mA) → rapidez máxima.
    expect(v("riel-sup")).toBeCloseTo(vMaxLogico(geom), 3);
  });

  it("el sentido de la velocidad es el signo de I; |I| < I_CERO detiene", () => {
    const { geom } = montar("serie3");
    const corr = new Float64Array(geom.tramos.length).fill(1 * mA);
    corr[0] = -1 * mA;
    corr[1] = I_CERO / 10;
    const vel = velocidadesTramos(geom, corr, 1 * mA, 0.04);
    expect(vel[0]).toBeLessThan(0);
    expect(vel[1]).toBe(0);
    expect(vel[2]).toBeGreaterThan(0);
  });

  it("E6: una rama con I ≪ I_ref conserva el suelo del 4 %", () => {
    const { geom } = montar("serie3");
    const corr = new Float64Array(geom.tramos.length).fill(1e-6);
    const vel = velocidadesTramos(geom, corr, 1, 0.04);
    expect(vel[0]).toBeCloseTo(0.04 * vMaxLogico(geom), 4);
  });

  it("E7: sin suelo, la rapidez sigue a la exponencial", () => {
    const { geom } = montar("serie3");
    const tau = 0.1;
    const i0 = 12e-3;
    const v = (t: number) => {
      const corr = new Float64Array(geom.tramos.length).fill(i0 * Math.exp(-t / tau));
      return velocidadesTramos(geom, corr, i0, 0)[0];
    };
    expect(v(tau) / v(0)).toBeCloseTo(Math.exp(-1), 6);
    expect(v(3 * tau) / v(0)).toBeCloseTo(Math.exp(-3), 6);
  });

  it("densidad constante: n ≈ longitud/espaciado, y los capacitores no tienen partículas en el cuerpo", () => {
    const arbol = preset("serie3");
    const g = distribuirCircuito(arbol, "C", rect);
    const p = crearParticulas(g);
    g.tramos.forEach((t, k) => {
      if (t.cuerpo === "C") expect(p.cuenta[k]).toBe(0);
      else expect(Math.abs(p.cuenta[k] - t.longitud / ESPACIADO_PARTICULAS)).toBeLessThanOrEqual(0.5 + 1e-9);
    });
    expect(p.n).toBe(p.u.length);
    expect(p.n).toBeGreaterThan(0);
  });

  it("avanzan con el signo de la velocidad, dan la vuelta y se detienen con v = 0", () => {
    const { geom } = montar("serie3");
    const p = crearParticulas(geom);
    const k = geom.tramos.findIndex((t) => t.id === "riel-sup");
    const antes = p.u[p.inicio[k]];
    const vel = new Float32Array(geom.tramos.length);
    vel[k] = 100;
    avanzarParticulas(p, geom, vel, 0.1);
    expect(p.u[p.inicio[k]]).toBeCloseTo((antes + 10) % geom.tramos[k].longitud, 3);
    const quieto = p.u[p.inicio[k]];
    vel[k] = 0;
    avanzarParticulas(p, geom, vel, 1);
    expect(p.u[p.inicio[k]]).toBe(quieto);
    vel[k] = -50;
    avanzarParticulas(p, geom, vel, 100);
    for (let j = 0; j < p.cuenta[k]; j++) {
      const u = p.u[p.inicio[k] + j];
      expect(u).toBeGreaterThanOrEqual(0);
      expect(u).toBeLessThan(geom.tramos[k].longitud + 1e-3);
    }
  });

  it("la vista de electrones invierte el dibujo, no los números", () => {
    const { geom } = montar("serie3");
    const a = crearParticulas(geom);
    const b = crearParticulas(geom);
    const vel = new Float32Array(geom.tramos.length).fill(40);
    avanzarParticulas(a, geom, vel, 0.1, 1);
    avanzarParticulas(b, geom, vel, 0.1, -1);
    const k = geom.tramos.findIndex((t) => t.id === "riel-der");
    const u0 = (0.5 * geom.tramos[k].longitud) / a.cuenta[k];
    expect(a.u[a.inicio[k]]).toBeGreaterThan(u0);
    expect(b.u[b.inicio[k]]).toBeLessThan(u0);
  });
});

describe("textos", () => {
  it("formatea con prefijos SI, coma decimal y «≈ 0» bajo el umbral", () => {
    expect(textoVoltaje(6)).toBe("6 V");
    expect(textoCorriente(2.5e-3)).toBe("2,5 mA");
    expect(textoCorriente(-1.5e-3)).toBe("−1,5 mA");
    expect(textoCorriente(I_CERO / 2)).toBe("≈ 0 A");
    expect(textoVoltaje(1e-15)).toBe("0 V");
  });

  it("textos de sonda y anuncio mencionan el borne negativo y el sentido de la flecha", () => {
    const { geom, net, r } = montar("serie3");
    const l = leerSonda(geom, net, r, { tramo: "R2:b", t: 0.5 })!;
    expect(textoSonda(l)).toContain("R2");
    expect(anuncioSonda(l)).toContain("borne negativo");
    expect(anuncioSonda(l)).toContain("a favor");
    const contra: Resultado = { ...r, i: { ...r.i, R2: -2 * mA } };
    expect(anuncioSonda(leerSonda(geom, net, contra, { tramo: "R2:b", t: 0.5 })!)).toContain("en contra");
    const cero: Resultado = { ...r, i: { ...r.i, R2: 0 } };
    expect(anuncioSonda(leerSonda(geom, net, cero, { tramo: "R2:b", t: 0.5 })!)).toContain("no pasa corriente");
  });
});
