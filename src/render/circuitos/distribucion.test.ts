import { describe, expect, it } from "vitest";
import { contarHojas, e, paralelo, serie, type Bloque } from "../../fisica/circuitos";
import { PRESETS_E6, PRESETS_E7 } from "../../fisica/circuitos";
import {
  distribuirCircuito,
  puntoEnTramo,
  tramoCercano,
  type Caja,
  type GeometriaCircuito,
} from "./distribucion";

const R = (n: number) => e(`R${n}`, 1000);
const hojas = (n: number) => Array.from({ length: n }, (_, k) => R(k + 1));

/** Árboles de 1 a 6 elementos: serie, paralelo y mezclas. */
const ARBOLES: [string, Bloque][] = [
  ["1", R(1)],
  ["s2", serie(...hojas(2))],
  ["p2", paralelo(...hojas(2))],
  ["s3", serie(...hojas(3))],
  ["p3", paralelo(...hojas(3))],
  ["s4", serie(...hojas(4))],
  ["p4", paralelo(...hojas(4))],
  ["sp4", serie(paralelo(R(1), R(2)), paralelo(R(3), R(4)))],
  ["s5", serie(...hojas(5))],
  ["p5", paralelo(...hojas(5))],
  ["s6", serie(...hojas(6))],
  ["p6", paralelo(...hojas(6))],
  ["ps6", paralelo(serie(R(1), R(2), R(3)), serie(R(4), R(5), R(6)))],
  ["sp6", serie(paralelo(R(1), R(2), R(3)), paralelo(R(4), R(5), R(6)))],
  ["ps6b", paralelo(serie(R(1), R(2)), serie(R(3), R(4)), serie(R(5), R(6)))],
  ...PRESETS_E6.filter((p) => p.arbol).map((p): [string, Bloque] => [`e6:${p.id}`, p.arbol as Bloque]),
  ...PRESETS_E7.map((p): [string, Bloque] => [`e7:${p.id}`, p.arbol]),
];

const TAMANOS: [string, number, number][] = [
  ["sala 1920x1080", 1920, 1080],
  ["lienzo 960x540", 960, 540],
  ["tablet 1024x768", 1024, 768],
  ["tablet vertical 768x1024", 768, 1024],
  ["lienzo vertical 480x640", 480, 640],
  ["móvil 360x640", 360, 640],
  ["móvil horizontal 640x360", 640, 360],
];

const EPS = 1e-6;
const dentro = (c: Caja, w: number, h: number) =>
  c.x >= -EPS && c.y >= -EPS && c.x + c.w <= w + EPS && c.y + c.h <= h + EPS;
const solapa = (a: Caja, b: Caja) =>
  a.x < b.x + b.w - EPS && b.x < a.x + a.w - EPS && a.y < b.y + b.h - EPS && b.y < a.y + a.h - EPS;
const dentroDe = (a: Caja, c: Caja) =>
  a.x >= c.x - EPS && a.y >= c.y - EPS && a.x + a.w <= c.x + c.w + EPS && a.y + a.h <= c.y + c.h + EPS;

function revisar(g: GeometriaCircuito, nHojas: number, conRc: boolean) {
  expect(g.elementos).toHaveLength(nHojas + (conRc ? 1 : 0));
  expect(new Set(g.elementos.map((x) => x.id)).size).toBe(g.elementos.length);
  expect(new Set(g.tramos.map((x) => x.id)).size).toBe(g.tramos.length);

  const cajas: [string, Caja][] = [];
  for (const el of g.elementos) {
    expect(dentro(el.celda, g.ancho, g.alto), `${el.id} celda dentro`).toBe(true);
    expect(dentroDe(el.cuerpo, el.celda), `${el.id} cuerpo en celda`).toBe(true);
    expect(dentroDe(el.nombre, el.celda), `${el.id} nombre en celda`).toBe(true);
    expect(dentroDe(el.lectura, el.celda), `${el.id} lectura en celda`).toBe(true);
    expect(solapa(el.nombre, el.cuerpo)).toBe(false);
    expect(solapa(el.lectura, el.cuerpo)).toBe(false);
    expect(solapa(el.nombre, el.lectura)).toBe(false);
    cajas.push([el.id, el.celda]);
  }
  cajas.push(["batería", g.bateria.caja]);
  if (g.banda) cajas.push(["banda", g.banda]);
  for (let a = 0; a < cajas.length; a++) {
    for (let b = a + 1; b < cajas.length; b++) {
      expect(solapa(cajas[a][1], cajas[b][1]), `${cajas[a][0]} con ${cajas[b][0]}`).toBe(false);
    }
  }
  expect(dentro(g.bateria.caja, g.ancho, g.alto)).toBe(true);
  expect(dentro(g.caja, g.ancho, g.alto)).toBe(true);
  for (const t of g.tramos) {
    for (let k = 0; k < t.puntos.length; k += 2) {
      expect(t.puntos[k]).toBeGreaterThanOrEqual(-EPS);
      expect(t.puntos[k]).toBeLessThanOrEqual(g.ancho + EPS);
      expect(t.puntos[k + 1]).toBeGreaterThanOrEqual(-EPS);
      expect(t.puntos[k + 1]).toBeLessThanOrEqual(g.alto + EPS);
    }
  }
  // Ningún cable (salvo los de su propio elemento) atraviesa el cuerpo ni el rótulo de un elemento.
  for (const el of g.elementos) {
    for (const t of g.tramos) {
      if (t.elemento === el.id) continue;
      for (let k = 0; k + 3 < t.puntos.length; k += 2) {
        const seg: Caja = {
          x: Math.min(t.puntos[k], t.puntos[k + 2]),
          y: Math.min(t.puntos[k + 1], t.puntos[k + 3]),
          w: Math.abs(t.puntos[k + 2] - t.puntos[k]),
          h: Math.abs(t.puntos[k + 3] - t.puntos[k + 1]),
        };
        expect(solapa(seg, el.cuerpo), `${t.id} cruza el cuerpo de ${el.id}`).toBe(false);
        expect(solapa(seg, el.nombre), `${t.id} cruza el nombre de ${el.id}`).toBe(false);
        expect(solapa(seg, el.lectura), `${t.id} cruza la lectura de ${el.id}`).toBe(false);
      }
    }
  }
}

describe("distribuirCircuito: cabida y ausencia de solapes", () => {
  for (const [nombreT, w, h] of TAMANOS) {
    for (const rc of [false, true]) {
      it(`${nombreT}${rc ? " con Rc" : ""}: todos los árboles de 1 a 6 elementos`, () => {
        for (const [, arbol] of ARBOLES) {
          const g = distribuirCircuito(arbol, "R", { ancho: w, alto: h }, { rCarga: rc });
          revisar(g, contarHojas(arbol), rc);
        }
      });
    }
  }
});

describe("distribuirCircuito: tamaño y modo compacto", () => {
  const rect = (w: number, h: number) => ({ ancho: w, alto: h });

  it("el tamaño sale de la cabida: pocos elementos se ven más grandes que seis", () => {
    const uno = distribuirCircuito(R(1), "R", rect(960, 540));
    const seis = distribuirCircuito(serie(...hojas(6)), "R", rect(960, 540));
    expect(uno.s).toBeGreaterThan(seis.s);
  });

  it("es determinista y no depende de la selección", () => {
    const a = distribuirCircuito(PRESETS_E6[4].arbol as Bloque, "R", rect(960, 540));
    const b = distribuirCircuito(PRESETS_E6[4].arbol as Bloque, "R", rect(960, 540));
    expect(a).toEqual(b);
  });

  it("en sala y en el lienzo apaisado los 6 elementos llevan rótulos completos", () => {
    for (const arbol of [serie(...hojas(6)), paralelo(...hojas(6)), PRESETS_E6[4].arbol as Bloque]) {
      expect(distribuirCircuito(arbol, "R", rect(1920, 1080), { fuenteMin: 12 }).compacto).toBe(false);
      expect(distribuirCircuito(arbol, "R", rect(960, 540), { fuenteMin: 9 }).compacto).toBe(false);
    }
  });

  it("en un móvil estrecho con 6 elementos en serie pasa a modo compacto con franja libre", () => {
    const g = distribuirCircuito(serie(...hojas(6)), "R", rect(360, 640), { fuenteMin: 12 });
    expect(g.compacto).toBe(true);
    expect(g.banda).not.toBeNull();
    for (const el of g.elementos) expect(el.celda.y).toBeGreaterThanOrEqual((g.banda as Caja).h - EPS);
  });

  it("un elemento sin compacto no reserva franja", () => {
    const g = distribuirCircuito(R(1), "R", rect(960, 540));
    expect(g.compacto).toBe(false);
    expect(g.banda).toBeNull();
  });

  it("serie = horizontal (mismo eje) y paralelo = apilado (ejes distintos)", () => {
    const s = distribuirCircuito(serie(...hojas(3)), "R", rect(960, 540));
    expect(new Set(s.elementos.map((x) => x.yEje.toFixed(6))).size).toBe(1);
    expect(s.elementos[0].xB).toBeCloseTo(s.elementos[1].xA, 6);
    const p = distribuirCircuito(paralelo(...hojas(3)), "R", rect(960, 540));
    expect(new Set(p.elementos.map((x) => x.yEje.toFixed(3))).size).toBe(3);
    expect(new Set(p.elementos.map((x) => x.celda.x.toFixed(3))).size).toBe(1);
  });

  it("E7: el resistor de carga Rc va primero en la serie", () => {
    const g = distribuirCircuito(PRESETS_E7[0].arbol, "C", rect(960, 540), { rCarga: true });
    expect(g.elementos[0].id).toBe("Rc");
    expect(g.elementos[0].tipo).toBe("R");
    expect(g.elementos.slice(1).every((x) => x.tipo === "C")).toBe(true);
    expect(g.elementos[0].xB).toBeCloseTo(g.elementos[1].xA, 6);
  });
});

describe("consultas de geometría", () => {
  const g = distribuirCircuito(PRESETS_E6[2].arbol as Bloque, "R", { ancho: 960, alto: 540 });

  it("puntoEnTramo recorre el polilínea de extremo a extremo", () => {
    const t = g.tramos.find((x) => x.id === "riel-sup");
    expect(t).toBeDefined();
    const ini = puntoEnTramo(t!, 0);
    expect(ini.x).toBeCloseTo(t!.puntos[0], 6);
    expect(ini.y).toBeCloseTo(t!.puntos[1], 6);
    const fin = puntoEnTramo(t!, t!.longitud);
    expect(fin.x).toBeCloseTo(t!.puntos[t!.puntos.length - 2], 6);
    expect(fin.y).toBeCloseTo(t!.puntos[t!.puntos.length - 1], 6);
  });

  it("tramoCercano encuentra el cable bajo el puntero y respeta el radio", () => {
    const t = g.tramos.find((x) => x.id === "R3:cuerpo")!;
    const c = puntoEnTramo(t, t.longitud / 2);
    const hit = tramoCercano(g, c.x, c.y + 3, 10);
    expect(hit?.tramo.id).toBe("R3:cuerpo");
    expect(hit?.t).toBeCloseTo(0.5, 2);
    expect(tramoCercano(g, -50, -50, 10)).toBeNull();
  });
});
