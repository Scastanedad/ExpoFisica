import { describe, expect, it } from "vitest";
import { PRESETS_E6, sumaTerminos } from "../../fisica/circuitos";
import { IDS_PUENTE, distribuirPuente, nodoDeRef, type Caja } from "./distribucion";
import { arbolDePuente, estadoPuente, valoresDePuente } from "./estado";
import { avanzarParticulas, corrientesTramos, crearParticulas, velocidadesTramos } from "./particulas";
import { leerSonda } from "./sonda";

const mA = 1e-3;
const preset = (id: string) => PRESETS_E6.find((p) => p.id === id)!;
const arbolPreset = (id: string) => arbolDePuente(preset(id).puente!);

const TAMANOS: [string, number, number][] = [
  ["sala 1920x1080", 1920, 1080],
  ["lienzo 960x540", 960, 540],
  ["tablet 1024x768", 1024, 768],
  ["tablet vertical 768x1024", 768, 1024],
  ["móvil 390x300", 390, 300],
  ["móvil 360x640", 360, 640],
];

const EPS = 1e-6;
const dentro = (c: Caja, w: number, h: number) =>
  c.x >= -EPS && c.y >= -EPS && c.x + c.w <= w + EPS && c.y + c.h <= h + EPS;
const solapa = (a: Caja, b: Caja) =>
  a.x < b.x + b.w - EPS && b.x < a.x + a.w - EPS && a.y < b.y + b.h - EPS && b.y < a.y + a.h - EPS;
const dentroDe = (a: Caja, c: Caja) =>
  a.x >= c.x - EPS && a.y >= c.y - EPS && a.x + a.w <= c.x + c.w + EPS && a.y + a.h <= c.y + c.h + EPS;

describe("distribuirPuente: geometría", () => {
  it.each(TAMANOS)("cabe y no solapa en %s", (_n, w, h) => {
    const g = distribuirPuente({ ancho: w, alto: h });
    expect(g.elementos.map((x) => x.id)).toEqual(["R1", "R2", "R5", "R3", "R4"]);
    expect(new Set(g.tramos.map((t) => t.id)).size).toBe(g.tramos.length);
    const cajas: Caja[] = [g.bateria.caja];
    for (const el of g.elementos) {
      expect(dentro(el.celda, w, h), `${el.id} dentro`).toBe(true);
      expect(dentroDe(el.cuerpo, el.celda)).toBe(true);
      expect(dentroDe(el.nombre, el.celda)).toBe(true);
      expect(dentroDe(el.lectura, el.celda)).toBe(true);
      expect(solapa(el.nombre, el.lectura)).toBe(false);
      cajas.push(el.celda);
    }
    for (let a = 0; a < cajas.length; a++) {
      for (let b = a + 1; b < cajas.length; b++) expect(solapa(cajas[a], cajas[b]), `cajas ${a}-${b}`).toBe(false);
    }
    for (const t of g.tramos) {
      for (let k = 0; k < t.puntos.length; k += 2) {
        expect(t.puntos[k]).toBeGreaterThanOrEqual(-EPS);
        expect(t.puntos[k]).toBeLessThanOrEqual(w + EPS);
        expect(t.puntos[k + 1]).toBeGreaterThanOrEqual(-EPS);
        expect(t.puntos[k + 1]).toBeLessThanOrEqual(h + EPS);
      }
    }
  });

  it("los cinco resistores tienen a a la izquierda y b a la derecha (orientación de la netlist)", () => {
    const g = distribuirPuente({ ancho: 960, alto: 540 });
    for (const id of IDS_PUENTE) {
      const el = g.elementos.find((x) => x.id === id)!;
      expect(el.xB).toBeGreaterThan(el.xA);
    }
  });

  it("el puente R5 queda entre R2 y R3 en vertical y A está entre R1 y R2", () => {
    const g = distribuirPuente({ ancho: 960, alto: 540 });
    const c = (id: string) => g.elementos.find((x) => x.id === id)!;
    expect(c("R5").yEje).toBeGreaterThan(c("R1").yEje);
    expect(c("R5").yEje).toBeLessThan(c("R3").yEje);
    expect(c("R1").xB).toBeCloseTo(c("R2").xA, 6); // nodo A
    expect(c("R3").xB).toBeCloseTo(c("R2").xA, 6); // R3 termina bajo A; un cable sigue hasta B
    expect(c("R5").xA).toBeCloseTo(c("R2").xA, 6);
    expect(c("R5").xB).toBeCloseTo(c("R4").xA, 6); // el puente baja hasta el nodo B (entrada de R4)
  });
});

describe.each(["wheatstoneEq", "wheatstoneDes"])("distribuirPuente: física del dibujo (%s)", (id) => {
  const arbol = arbolPreset(id);
  const geom = distribuirPuente({ ancho: 960, alto: 540 });
  const { net, r } = estadoPuente(arbol, 12);
  const clave = (x: number, y: number) => `${x.toFixed(3)},${y.toFixed(3)}`;

  it("KCL en cada unión de cables: lo que entra es lo que sale", () => {
    const neto = new Map<string, { n: number; suma: number }>();
    for (const t of geom.tramos) {
      const i = sumaTerminos(r, t.terminos);
      const p = t.puntos;
      const fin = clave(p[p.length - 2], p[p.length - 1]);
      const ini = clave(p[0], p[1]);
      const f = neto.get(fin) ?? { n: 0, suma: 0 };
      f.n++;
      f.suma += i;
      neto.set(fin, f);
      const s = neto.get(ini) ?? { n: 0, suma: 0 };
      s.n++;
      s.suma -= i;
      neto.set(ini, s);
    }
    let uniones = 0;
    for (const { n, suma } of neto.values()) {
      if (n < 2) continue; // bornes de la batería
      uniones++;
      expect(Math.abs(suma)).toBeLessThan(1e-12);
    }
    expect(uniones).toBeGreaterThanOrEqual(8);
  });

  it("los tramos que se tocan comparten el potencial del nodo", () => {
    const porPunto = new Map<string, Set<number>>();
    for (const t of geom.tramos) {
      if (t.cuerpo) continue;
      const v = r.v[nodoDeRef(net, t.ref)];
      const p = t.puntos;
      for (const k of [clave(p[0], p[1]), clave(p[p.length - 2], p[p.length - 1])]) {
        const set = porPunto.get(k) ?? new Set<number>();
        set.add(Number(v.toFixed(9)));
        porPunto.set(k, set);
      }
    }
    // El cable de R1 en A y el de R2 en A son el mismo nodo; las uniones con un resistor (a o b) cambian de tramo
    // de cable a cable del MISMO lado, así que ninguna unión mezcla dos potenciales distintos.
    for (const [k, set] of porPunto) expect(set.size, k).toBe(1);
  });

  it("la sonda lee el potencial de A y B y la corriente del puente con signo respecto a la flecha", () => {
    const sA = leerSonda(geom, net, r, { tramo: "cable-A-puente", t: 0.5 })!;
    const sB = leerSonda(geom, net, r, { tramo: "cable-B-puente", t: 0.5 })!;
    const e = preset(id).esperado;
    expect(sA.v).toBeCloseTo(e.vNodos!.A, 3);
    expect(sB.v).toBeCloseTo(e.vNodos!.B, 3);
    expect(sA.i).toBeCloseTo(e.i.R5, 6);
    expect(sB.i).toBeCloseTo(e.i.R5, 6);
    const barraIzq = leerSonda(geom, net, r, { tramo: "barra-izq", t: 0.5 })!;
    expect(barraIzq.i).toBeCloseTo(e.i.R3, 6);
    expect(leerSonda(geom, net, r, { tramo: "riel-sup", t: 0.5 })!.i).toBeCloseTo(e.iBat, 6);
  });
});

describe("estadoPuente", () => {
  it("equilibrado: por R5 no pasa corriente y A = B", () => {
    const { r } = estadoPuente(arbolPreset("wheatstoneEq"), 12);
    expect(Math.abs(r.i.R5)).toBeLessThan(1e-12);
    expect(r.v[2]).toBeCloseTo(r.v[3], 9);
  });

  it("desequilibrado: I(R5) = −0,1540 mA (de B hacia A)", () => {
    const { r } = estadoPuente(arbolPreset("wheatstoneDes"), 12);
    expect(r.i.R5 / mA).toBeCloseTo(-0.154, 3);
  });

  it("con batería real aparece r_int y baja el voltaje de los bornes", () => {
    const sin = estadoPuente(arbolPreset("wheatstoneEq"), 12, 0);
    const con = estadoPuente(arbolPreset("wheatstoneEq"), 12, 2);
    expect(con.net.elementos.some((x) => x.id === "r_int")).toBe(true);
    expect(con.r.v[1]).toBeLessThan(sin.r.v[1]);
    expect(con.r.iBat).toBeLessThan(sin.r.iBat);
  });

  it("valoresDePuente invierte arbolDePuente", () => {
    const v = preset("wheatstoneDes").puente!;
    expect(valoresDePuente(arbolDePuente(v))).toEqual(v);
  });
});

describe("partículas del puente", () => {
  it("equilibrado: las partículas del puente se detienen; desequilibrado: se mueven de B hacia A", () => {
    const g = distribuirPuente({ ancho: 960, alto: 540 });
    const idx = g.tramos.findIndex((t) => t.id === "cable-A-puente");
    const velDe = (id: string) => {
      const { r, iRef, suelo } = estadoPuente(arbolPreset(id), 12);
      const corr = corrientesTramos(g, r);
      return velocidadesTramos(g, corr, iRef, suelo)[idx];
    };
    expect(velDe("wheatstoneEq")).toBe(0);
    // El cable baja de A (arriba) a B: i_ab < 0 significa que la corriente sube de B hacia A.
    expect(velDe("wheatstoneDes")).toBeLessThan(0);

    const p = crearParticulas(g);
    const antes = Array.from(p.u);
    const { r, iRef, suelo } = estadoPuente(arbolPreset("wheatstoneDes"), 12);
    avanzarParticulas(p, g, velocidadesTramos(g, corrientesTramos(g, r), iRef, suelo), 0.1);
    expect(Array.from(p.u)).not.toEqual(antes);
  });
});
