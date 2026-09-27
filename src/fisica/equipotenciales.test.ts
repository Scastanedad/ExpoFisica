import { describe, expect, it } from "vitest";
import { campoEn, potencialEn, type PuntoCarga } from "./coulomb";
import { RADIO_CARGA_PX, SOFTENING2_ESTATICO, formatSI } from "./escala";
import {
  CELDA_POTENCIAL,
  DELTA_V_SI,
  colocarRotulos,
  curvasEquipotenciales,
  deltaVSim,
  mallaPotencial,
  segmentosNivel,
  type CurvasNivel,
  type Rect,
} from "./equipotenciales";
import { trazarLineasCampo } from "./lineasCampo";

const DIPOLO: PuntoCarga[] = [
  { x: 250, y: 250, q: 1 },
  { x: 450, y: 250, q: -1 },
];
const TRES: PuntoCarga[] = [
  { x: 220, y: 200, q: 1 },
  { x: 470, y: 260, q: -1 },
  { x: 350, y: 380, q: 0.5 },
];

const segmentos = (cargas: PuntoCarga[], celda: number) =>
  segmentosNivel(mallaPotencial(cargas, 700, 500, celda), cargas);

describe("T-niv — niveles fijos en volts SI", () => {
  it("ΔV = 200 kV = 22.25 unidades de simulación y no depende de las cargas", () => {
    expect(DELTA_V_SI).toBe(2e5);
    expect(Math.abs(deltaVSim() - 22.253) / 22.253).toBeLessThan(1e-3);
    const a = curvasEquipotenciales([{ x: 350, y: 250, q: 1 }], 700, 500);
    const b = curvasEquipotenciales([{ x: 100, y: 100, q: -3 }, { x: 500, y: 300, q: 2 }], 700, 500);
    expect(a.pasoV).toBe(DELTA_V_SI);
    expect(b.pasoV).toBe(a.pasoV);
    for (const nivel of b.niveles) expect(nivel.valorV).toBe(nivel.n * DELTA_V_SI);
  });

  for (const [celda, tol] of [
    [10, 0.08],
    [5, 0.04],
  ] as const) {
    it(`los puntos medios de los segmentos del nivel n cumplen |V − n·ΔV| ≤ ${tol}·ΔV (celda ${celda})`, () => {
      const dv = deltaVSim();
      const segs = segmentos(DIPOLO, celda);
      expect(segs.length).toBeGreaterThan(100);
      let peor = 0;
      for (const s of segs) {
        const v = potencialEn((s.x1 + s.x2) / 2, (s.y1 + s.y2) / 2, DIPOLO, SOFTENING2_ESTATICO);
        peor = Math.max(peor, Math.abs(v - s.n * dv) / dv);
      }
      expect(peor).toBeLessThanOrEqual(tol);
    });
  }

  /** Radios (distancia al centro) de los puntos medios de los segmentos del nivel n. */
  function radiosNivel(q: number, n: number, celda = 10): number[] {
    const cargas: PuntoCarga[] = [{ x: 350, y: 250, q }];
    return segmentos(cargas, celda)
      .filter((s) => s.n === n)
      .map((s) => Math.hypot((s.x1 + s.x2) / 2 - 350, (s.y1 + s.y2) / 2 - 250));
  }

  it("proporcionalidad con q: los anillos n = 2…5 de una carga de 1 µC tienen radio 224.7/n (± 0.6 px)", () => {
    for (const n of [2, 3, 4, 5]) {
      const radios = radiosNivel(1, n);
      expect(radios.length).toBeGreaterThan(8);
      for (const r of radios) expect(Math.abs(r - 224.7 / n)).toBeLessThanOrEqual(0.6);
    }
  });

  it("r(2q) = 2·r(q) para el mismo índice de anillo (± 0.6 px)", () => {
    for (const n of [3, 4, 5]) {
      const r1 = radiosNivel(1, n);
      const r2 = radiosNivel(2, n);
      const media = (a: number[]) => a.reduce((s, x) => s + x, 0) / a.length;
      expect(Math.abs(media(r2) - 2 * media(r1))).toBeLessThanOrEqual(0.6);
    }
  });

  it("número de anillos visibles para q = 0.5, 1 y 5: 5, 7 y 14 (± 1)", () => {
    const anillos = (q: number) =>
      curvasEquipotenciales([{ x: 350, y: 250, q }], 700, 500).niveles.filter((n) => n.n > 0).length;
    expect(Math.abs(anillos(0.5) - 5)).toBeLessThanOrEqual(1);
    expect(Math.abs(anillos(1) - 7)).toBeLessThanOrEqual(1);
    expect(Math.abs(anillos(5) - 14)).toBeLessThanOrEqual(1);
  });

  it("simetría: el dipolo tiene tantos segmentos en +n como en −n y existe el nivel 0", () => {
    const cuenta = new Map<number, number>();
    for (const s of segmentos(DIPOLO, 10)) cuenta.set(s.n, (cuenta.get(s.n) ?? 0) + 1);
    expect(cuenta.has(0)).toBe(true);
    for (const [n, c] of cuenta) if (n >= 1) expect(cuenta.get(-n)).toBe(c);
  });

  it("con solo cargas positivas no existe el nivel 0; con solo negativas tampoco", () => {
    const solo = (q: number) =>
      curvasEquipotenciales(
        [{ x: 250, y: 250, q }, { x: 450, y: 250, q }],
        700,
        500,
      ).niveles.map((n) => n.n);
    expect(solo(1)).not.toContain(0);
    expect(solo(-1)).not.toContain(0);
    expect(Math.min(...solo(1))).toBeGreaterThan(0);
    expect(Math.max(...solo(-1))).toBeLessThan(0);
  });

  const ESCENAS: Array<[string, PuntoCarga[]]> = [
    ["dipolo", DIPOLO],
    ["tres cargas", TRES],
    ["dos positivas (silla)", [{ x: 250, y: 250, q: 1 }, { x: 450, y: 250, q: 1 }]],
  ];
  for (const [nombre, cargas] of ESCENAS) {
    it(`${nombre}: ninguna cadena entra en el disco de una carga y el espaciado ≥ 3 px`, () => {
      const dv = deltaVSim();
      const curvas = curvasEquipotenciales(cargas, 700, 500);
      let puntos = 0;
      for (const nivel of curvas.niveles) {
        for (const c of nivel.cadenas) {
          for (let i = 0; i < c.puntos.length; i += 2) {
            puntos++;
            for (const q of cargas) {
              expect(Math.hypot(c.puntos[i] - q.x, c.puntos[i + 1] - q.y)).toBeGreaterThanOrEqual(
                RADIO_CARGA_PX,
              );
            }
          }
        }
      }
      expect(puntos).toBeGreaterThan(200);
      for (const s of segmentos(cargas, 10)) {
        const mx = (s.x1 + s.x2) / 2;
        const my = (s.y1 + s.y2) / 2;
        const [ex, ey] = campoEn(mx, my, cargas, SOFTENING2_ESTATICO);
        expect(dv / Math.hypot(ex, ey)).toBeGreaterThanOrEqual(3);
      }
    });

    it(`${nombre}: cadenas sin extremos colgantes en el interior y sin cruces entre segmentos del mismo nivel`, () => {
      const curvas = curvasEquipotenciales(cargas, 700, 500);
      const limite = 10 * Math.ceil(700 / 10); // borde de la malla (700) y (500)
      for (const nivel of curvas.niveles) {
        for (const c of nivel.cadenas) {
          if (c.cerrada) continue;
          const p = c.puntos;
          for (const [x, y] of [
            [p[0], p[1]],
            [p[p.length - 2], p[p.length - 1]],
          ]) {
            const enBorde = x < 1e-3 || y < 1e-3 || x > limite - 1e-3 || y > 500 - 1e-3;
            const cercaDeCarga = cargas.some((q) => Math.hypot(x - q.x, y - q.y) < 90);
            expect(enBorde || cercaDeCarga).toBe(true);
          }
        }
      }
      // Sin cruces propios en el mismo nivel.
      const porNivel = new Map<number, ReturnType<typeof segmentos>>();
      for (const s of segmentos(cargas, 10)) {
        const l = porNivel.get(s.n) ?? [];
        l.push(s);
        porNivel.set(s.n, l);
      }
      for (const lista of porNivel.values()) {
        for (let a = 0; a < lista.length; a++) {
          for (let b = a + 1; b < lista.length; b++) {
            expect(cruceInterior(lista[a], lista[b])).toBe(false);
          }
        }
      }
    });
  }

  it("las cadenas cubren todos los segmentos (misma longitud total) y una carga aislada da bucles cerrados", () => {
    const cargas: PuntoCarga[] = [{ x: 350, y: 250, q: 1 }];
    const segs = segmentos(cargas, 10);
    const curvas = curvasEquipotenciales(cargas, 700, 500);
    const longSegs = segs.reduce((s, x) => s + Math.hypot(x.x2 - x.x1, x.y2 - x.y1), 0);
    let longCadenas = 0;
    for (const nivel of curvas.niveles) {
      for (const c of nivel.cadenas) {
        const n = c.puntos.length / 2;
        for (let i = 1; i < n; i++) {
          longCadenas += Math.hypot(c.puntos[2 * i] - c.puntos[2 * i - 2], c.puntos[2 * i + 1] - c.puntos[2 * i - 1]);
        }
        if (c.cerrada) longCadenas += Math.hypot(c.puntos[0] - c.puntos[2 * n - 2], c.puntos[1] - c.puntos[2 * n - 1]);
      }
    }
    expect(Math.abs(longCadenas - longSegs) / longSegs).toBeLessThan(1e-4);
    const anillo = curvas.niveles.find((n) => n.n === 4);
    expect(anillo?.cadenas).toHaveLength(1);
    expect(anillo?.cadenas[0].cerrada).toBe(true);
  });
});

/** ¿Se cortan (en el interior de ambos) dos segmentos? Ignora los que comparten un extremo. */
function cruceInterior(
  a: { x1: number; y1: number; x2: number; y2: number },
  b: { x1: number; y1: number; x2: number; y2: number },
): boolean {
  const rx = a.x2 - a.x1;
  const ry = a.y2 - a.y1;
  const sx = b.x2 - b.x1;
  const sy = b.y2 - b.y1;
  const den = rx * sy - ry * sx;
  if (Math.abs(den) < 1e-12) return false;
  const t = ((b.x1 - a.x1) * sy - (b.y1 - a.y1) * sx) / den;
  const u = ((b.x1 - a.x1) * ry - (b.y1 - a.y1) * rx) / den;
  const eps = 1e-6;
  return t > eps && t < 1 - eps && u > eps && u < 1 - eps;
}

describe("T-b — perpendicularidad E ⟂ equipotencial", () => {
  function cosenos(cargas: PuntoCarga[], celda: number): number[] {
    return segmentos(cargas, celda).map((s) => {
      const tx = s.x2 - s.x1;
      const ty = s.y2 - s.y1;
      const [ex, ey] = campoEn((s.x1 + s.x2) / 2, (s.y1 + s.y2) / 2, cargas, SOFTENING2_ESTATICO);
      return Math.abs(tx * ex + ty * ey) / (Math.hypot(tx, ty) * Math.hypot(ex, ey));
    });
  }
  const p95 = (a: number[]) => [...a].sort((x, y) => x - y)[Math.floor(0.95 * (a.length - 1))];
  const media = (a: number[]) => a.reduce((s, x) => s + x, 0) / a.length;

  it("T-b1 (celda 2): |E·t|/(|E||t|) ≤ 0.05 en cada segmento del dipolo", () => {
    const c = cosenos(DIPOLO, 2);
    expect(c.length).toBeGreaterThan(1000);
    expect(Math.max(...c)).toBeLessThanOrEqual(0.05);
  });

  it("T-b1 (celda 10, producción): media ≤ 0.04 y p95 ≤ 0.12", () => {
    const c = cosenos(DIPOLO, CELDA_POTENCIAL);
    expect(media(c)).toBeLessThanOrEqual(0.04);
    expect(p95(c)).toBeLessThanOrEqual(0.12);
  });

  /** Ángulos de cruce entre las líneas de campo de producción y las curvas (celda 5). */
  function crucesLineaCurva(cargas: PuntoCarga[]): number[] {
    const lineas = trazarLineasCampo(cargas, 700, 500);
    const curvas = segmentos(cargas, 5);
    const cos: number[] = [];
    for (const l of lineas) {
      const p = l.puntos;
      for (let i = 0; i + 3 < p.length; i += 2) {
        const rx = p[i + 2] - p[i];
        const ry = p[i + 3] - p[i + 1];
        for (const s of curvas) {
          const sx = s.x2 - s.x1;
          const sy = s.y2 - s.y1;
          const den = rx * sy - ry * sx;
          if (Math.abs(den) < 1e-12) continue;
          const t = ((s.x1 - p[i]) * sy - (s.y1 - p[i + 1]) * sx) / den;
          const u = ((s.x1 - p[i]) * ry - (s.y1 - p[i + 1]) * rx) / den;
          if (t < 0 || t > 1 || u < 0 || u > 1) continue;
          cos.push(Math.abs(rx * sx + ry * sy) / (Math.hypot(rx, ry) * Math.hypot(sx, sy)));
        }
      }
    }
    return cos;
  }

  it("T-b2 (dipolo): ≥ 50 cruces línea-curva y todos entre 84° y 96° (|cos| ≤ 0.10)", () => {
    const c = crucesLineaCurva(DIPOLO);
    expect(c.length).toBeGreaterThanOrEqual(50);
    expect(Math.max(...c)).toBeLessThanOrEqual(0.1);
  });

  it("T-b2 (+1, −1, +0.5): ≥ 50 cruces y |cos| ≤ 0.15", () => {
    const c = crucesLineaCurva(TRES);
    expect(c.length).toBeGreaterThanOrEqual(50);
    expect(Math.max(...c)).toBeLessThanOrEqual(0.15);
  });
});

describe("T-rot — rótulos de nivel", () => {
  // Medida de texto de un monoespaciado de 12 px: ≈ 7.2 px por carácter.
  const anchoTexto = (s: string) => 7.2 * s.length;
  const altura = 12;
  /** Cajas de etiquetas de carga (E2.1): a la derecha del disco. */
  const etiquetas = (cargas: PuntoCarga[]): Rect[] =>
    cargas.map((c) => ({ x: c.x + 24, y: c.y - 8, w: 60, h: 16 }));

  const tocan = (a: Rect, b: Rect, margen = 0) =>
    a.x < b.x + b.w + margen && a.x + a.w + margen > b.x && a.y < b.y + b.h + margen && a.y + a.h + margen > b.y;

  for (const [nombre, cargas] of [
    ["dipolo", DIPOLO],
    ["tres cargas", TRES],
  ] as const) {
    it(`${nombre}: ninguno sale del canvas, solapa a otro, a una etiqueta ni queda a < 30 px de una carga`, () => {
      const curvas: CurvasNivel = curvasEquipotenciales(cargas, 700, 500);
      const evitar = etiquetas(cargas);
      const rotulos = colocarRotulos(curvas, cargas, 700, 500, anchoTexto, altura, evitar);
      expect(rotulos.length).toBeGreaterThan(4);
      const cajas = rotulos.map((r) => {
        const w = anchoTexto(r.texto) + 8;
        const h = altura + 4;
        return { x: r.x - w / 2, y: r.y - h / 2, w, h };
      });
      cajas.forEach((c, i) => {
        expect(c.x).toBeGreaterThanOrEqual(4);
        expect(c.y).toBeGreaterThanOrEqual(4);
        expect(c.x + c.w).toBeLessThanOrEqual(700 - 4);
        expect(c.y + c.h).toBeLessThanOrEqual(500 - 4);
        for (const e of evitar) expect(tocan(c, e)).toBe(false);
        for (const q of cargas) {
          const dx = Math.max(c.x - q.x, 0, q.x - (c.x + c.w));
          const dy = Math.max(c.y - q.y, 0, q.y - (c.y + c.h));
          expect(Math.hypot(dx, dy)).toBeGreaterThanOrEqual(30);
        }
        for (let j = i + 1; j < cajas.length; j++) expect(tocan(c, cajas[j], 4)).toBe(false);
      });
    });

    it(`${nombre}: el texto de cada nivel es formatSI(n·ΔV, "V")`, () => {
      const curvas = curvasEquipotenciales(cargas, 700, 500);
      const rotulos = colocarRotulos(curvas, cargas, 700, 500, anchoTexto, altura);
      for (const r of rotulos) expect(r.texto).toBe(formatSI(r.n * DELTA_V_SI, "V"));
    });
  }

  it("ejemplos de texto: 200 kV, −400 kV, 0 V", () => {
    const curvas = curvasEquipotenciales(DIPOLO, 700, 500);
    const rotulos = colocarRotulos(curvas, DIPOLO, 700, 500, anchoTexto, altura);
    const textos = new Map(rotulos.map((r) => [r.n, r.texto]));
    expect(textos.get(0)).toBe("0 V");
    if (textos.has(1)) expect(textos.get(1)).toBe("200 kV");
    if (textos.has(-2)) expect(textos.get(-2)).toBe("−400 kV");
  });

  it("el nivel 0 tiene prioridad y se rotula", () => {
    const curvas = curvasEquipotenciales(DIPOLO, 700, 500);
    const rotulos = colocarRotulos(curvas, DIPOLO, 700, 500, anchoTexto, altura);
    expect(rotulos.some((r) => r.n === 0)).toBe(true);
  });
});

describe("T-coh — coherencia dibujo/lecturas (potencial con ε = 1)", () => {
  // Se comprueba en coulomb.test.ts (T-a y T-coh); aquí solo se deja constancia de la celda de producción.
  it("la celda de producción son 10 px (5 celdas por cuadro de 50 px)", () => {
    expect(CELDA_POTENCIAL).toBe(10);
    expect(50 / CELDA_POTENCIAL).toBe(5);
  });
});

describe("filtro de longitud mínima de cadena (revisión física de la Fase 2)", () => {
  function aleatorio(semilla: number): () => number {
    let a = semilla >>> 0;
    return () => {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const treinta = (semilla: number): PuntoCarga[] => {
    const azar = aleatorio(semilla);
    return Array.from({ length: 30 }, (_, i) => ({
      x: 40 + azar() * 620,
      y: 40 + azar() * 420,
      q: (i % 2 ? -1 : 1) * (0.5 + Math.floor(azar() * 10) * 0.5),
    }));
  };
  const longitud = (p: Float32Array, cerrada: boolean) => {
    let l = 0;
    for (let i = 1; i < p.length / 2; i++) l += Math.hypot(p[2 * i] - p[2 * i - 2], p[2 * i + 1] - p[2 * i - 1]);
    if (cerrada) l += Math.hypot(p[0] - p[p.length - 2], p[1] - p[p.length - 1]);
    return l;
  };
  const enBorde = (x: number, y: number) => x < 1e-3 || y < 1e-3 || x > 700 - 1e-3 || y > 500 - 1e-3;

  it("con 30 cargas no queda ninguna cadena de < 20 px salvo las que llegan al borde, y se pierde < 10 % de la longitud", () => {
    for (const semilla of [1, 2, 3]) {
      const cargas = treinta(semilla);
      const con = curvasEquipotenciales(cargas, 700, 500);
      const sin = curvasEquipotenciales(cargas, 700, 500, { longitudMinCadena: 0 });
      const suma = (c: CurvasNivel) =>
        c.niveles.reduce((a, n) => a + n.cadenas.reduce((b, k) => b + longitud(k.puntos, k.cerrada), 0), 0);
      const nCadenas = (c: CurvasNivel) => c.niveles.reduce((a, n) => a + n.cadenas.length, 0);
      expect(nCadenas(con)).toBeLessThan(0.75 * nCadenas(sin)); // medido: ~40 % menos cadenas
      expect(suma(con)).toBeGreaterThan(0.9 * suma(sin)); // medido: se pierde ~7 %
      for (const nivel of con.niveles) {
        for (const c of nivel.cadenas) {
          if (longitud(c.puntos, c.cerrada) >= 20) continue;
          const p = c.puntos;
          expect(c.cerrada).toBe(false);
          expect(enBorde(p[0], p[1]) || enBorde(p[p.length - 2], p[p.length - 1])).toBe(true);
        }
      }
    }
  });

  it("longitudMinCadena = 0 lo desactiva y el dipolo sigue teniendo su nivel 0 y sus anillos", () => {
    const con = curvasEquipotenciales(DIPOLO, 700, 500);
    const sin = curvasEquipotenciales(DIPOLO, 700, 500, { longitudMinCadena: 0 });
    expect(con.niveles.some((n) => n.n === 0)).toBe(true);
    expect(sin.niveles.length).toBeGreaterThanOrEqual(con.niveles.length);
    // Ningún nivel queda vacío.
    for (const n of con.niveles) expect(n.cadenas.length).toBeGreaterThan(0);
  });
});
