import { describe, expect, it } from "vitest";
import { campoEn, type PuntoCarga } from "./coulomb";
import { repartirLineas } from "./carga";
import { RADIO_CARGA_PX } from "./escala";
import {
  PASO_LINEA,
  R_ABS,
  R_SEED,
  avanzar,
  crearCampo,
  integrarPasos,
  trazarLineasCampo,
  type LineaCampo,
} from "./lineasCampo";

/** Generador pseudoaleatorio determinista (mulberry32). */
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

const dist = (a: PuntoCarga, x: number, y: number) => Math.hypot(x - a.x, y - a.y);

function primerPunto(l: LineaCampo): [number, number] {
  return [l.puntos[0], l.puntos[1]];
}
function ultimoPunto(l: LineaCampo): [number, number] {
  const n = l.puntos.length;
  return [l.puntos[n - 2], l.puntos[n - 1]];
}

/** Sector (de N) de la carga `c` que apunta hacia (x, y). */
function sectorHacia(c: PuntoCarga, x: number, y: number, N: number): number {
  const alfa = Math.atan2(y - c.y, x - c.x);
  return ((Math.round(alfa / ((2 * Math.PI) / N)) % N) + N) % N;
}

describe("T-buf — crearCampo da exactamente campoEn", () => {
  const cargas: PuntoCarga[] = [
    { x: 120, y: 90, q: 1 },
    { x: 400, y: 300, q: -2 },
    { x: 250, y: 420, q: 1.5 },
  ];
  for (const soft2 of [0, 1, 100]) {
    it(`soft2 = ${soft2}: 100 puntos idénticos a 1e-12 relativo`, () => {
      const azar = aleatorio(7);
      const campo = crearCampo(cargas, soft2);
      const out = new Float64Array(2);
      for (let i = 0; i < 100; i++) {
        const x = azar() * 700;
        const y = azar() * 500;
        const [ex, ey] = campoEn(x, y, cargas, soft2);
        campo(x, y, out);
        const escala = Math.hypot(ex, ey);
        expect(Math.abs(out[0] - ex)).toBeLessThanOrEqual(1e-12 * escala);
        expect(Math.abs(out[1] - ey)).toBeLessThanOrEqual(1e-12 * escala);
      }
    });
  }
  it("por defecto usa SOFTENING2_ESTATICO (= 1), no el 100 de la dinámica", () => {
    const out = new Float64Array(2);
    crearCampo(cargas)(30, 40, out);
    const [ex, ey] = campoEn(30, 40, cargas, 1);
    expect(out[0]).toBe(ex);
    expect(out[1]).toBe(ey);
  });
});

describe("T-c — convergencia de RK2 frente a Euler", () => {
  const soft2 = 0;
  const cargas: PuntoCarga[] = [
    { x: -100, y: 0, q: 1 },
    { x: 100, y: 0, q: -1 },
  ];
  const campo = crearCampo(cargas, soft2);
  const x0 = -100 + 20 * Math.cos(1);
  const y0 = 20 * Math.sin(1);
  /** Invariante analítico de las líneas de fuerza de dos cargas puntuales: ψ = Σ qᵢ (x − xᵢ)/rᵢ. */
  const psi = (x: number, y: number) =>
    cargas.reduce((s, c) => s + (c.q * (x - c.x)) / Math.hypot(x - c.x, y - c.y), 0);
  const error = (h: number, metodo: "euler" | "rk2") => {
    const [x, y] = integrarPasos(campo, x0, y0, h, Math.round(120 / h), 1, metodo);
    return Math.abs(psi(x, y) - psi(x0, y0));
  };

  it("RK2: el error cae ≈ 4× al partir el paso; Euler ≈ 2×", () => {
    const rk = [12, 6, 3].map((h) => error(h, "rk2"));
    const eu = [12, 6, 3].map((h) => error(h, "euler"));
    for (const r of [rk[0] / rk[1], rk[1] / rk[2]]) {
      expect(r).toBeGreaterThanOrEqual(3.3);
      expect(r).toBeLessThanOrEqual(4.4);
    }
    for (const r of [eu[0] / eu[1], eu[1] / eu[2]]) {
      expect(r).toBeGreaterThanOrEqual(1.7);
      expect(r).toBeLessThanOrEqual(2.3);
    }
  });

  it("posición final de RK2 (h = 6) a menos de 0.25 px de una referencia RK4 con h = 0.05", () => {
    const h = 0.05;
    const n = Math.round(120 / h);
    let x = x0;
    let y = y0;
    const k = [new Float64Array(2), new Float64Array(2), new Float64Array(2), new Float64Array(2)];
    const u = (px: number, py: number, out: Float64Array) => {
      campo(px, py, out);
      const m = Math.hypot(out[0], out[1]);
      out[0] /= m;
      out[1] /= m;
    };
    for (let i = 0; i < n; i++) {
      u(x, y, k[0]);
      u(x + 0.5 * h * k[0][0], y + 0.5 * h * k[0][1], k[1]);
      u(x + 0.5 * h * k[1][0], y + 0.5 * h * k[1][1], k[2]);
      u(x + h * k[2][0], y + h * k[2][1], k[3]);
      x += (h / 6) * (k[0][0] + 2 * k[1][0] + 2 * k[2][0] + k[3][0]);
      y += (h / 6) * (k[0][1] + 2 * k[1][1] + 2 * k[2][1] + k[3][1]);
    }
    const [xr, yr] = integrarPasos(campo, x0, y0, 6, 20, 1, "rk2");
    expect(Math.hypot(xr - x, yr - y)).toBeLessThan(0.25);
  });

  it("sanidad: la línea de una carga aislada es exactamente radial con ambos métodos", () => {
    const sola = crearCampo([{ x: 0, y: 0, q: 1 }], soft2);
    for (const metodo of ["euler", "rk2"] as const) {
      const [x, y] = integrarPasos(sola, 20 * Math.cos(0.7), 20 * Math.sin(0.7), 6, 50, 1, metodo);
      expect(Math.abs(Math.atan2(y, x) - 0.7)).toBeLessThan(1e-12);
    }
  });

  it("avanzar mueve exactamente h de longitud de arco con Euler y sentido inverso con dir = -1", () => {
    const out = new Float64Array(2);
    const sola = crearCampo([{ x: 0, y: 0, q: 1 }], soft2);
    avanzar(sola, 100, 0, 6, 1, "euler", out);
    expect(out[0]).toBeCloseTo(106, 12);
    avanzar(sola, 100, 0, 6, -1, "euler", out);
    expect(out[0]).toBeCloseTo(94, 12);
  });

  it("avanzar no se mueve si el campo es nulo (sin cargas)", () => {
    const out = new Float64Array(2);
    avanzar(crearCampo([]), 10, 20, 6, 1, "rk2", out);
    expect([out[0], out[1]]).toEqual([10, 20]);
  });
});

describe("T-c-dip — invariante de Gauss en dominio ilimitado", () => {
  it("dipolo inclinado 17°: las 10 líneas de la positiva terminan en la negativa", () => {
    const ang = (17 * Math.PI) / 180;
    const cx = 5000;
    const cy = 5000;
    const d = 100;
    const cargas: PuntoCarga[] = [
      { x: cx - d * Math.cos(ang), y: cy - d * Math.sin(ang), q: 1 },
      { x: cx + d * Math.cos(ang), y: cy + d * Math.sin(ang), q: -1 },
    ];
    const lineas = trazarLineasCampo(cargas, 10000, 10000, { longitudMax: 20000, eMin: 1e-12 }).filter(
      (l) => l.sentido === 1,
    );
    expect(lineas).toHaveLength(10);
    for (const l of lineas) {
      expect(l.fin).toBe("carga");
      expect(l.destino).toBe(1);
    }
  });
});

describe("T-d — solo cargas negativas", () => {
  for (const [q, n] of [
    [-1, 10],
    [-0.5, 5],
  ] as const) {
    it(`una sola carga de ${q} µC: ${n} líneas hacia atrás que apuntan a la carga`, () => {
      const cargas: PuntoCarga[] = [{ x: 350, y: 250, q }];
      const lineas = trazarLineasCampo(cargas, 700, 500);
      expect(lineas).toHaveLength(n);
      const campo = crearCampo(cargas);
      const E = new Float64Array(2);
      for (const l of lineas) {
        expect(l.sentido).toBe(-1);
        expect(l.fin).toBe("borde");
        expect(l.origen).toBe(0);
        const p = l.puntos;
        for (let i = 0; i < p.length; i++) expect(Number.isFinite(p[i])).toBe(true);
        // El primer punto es el más lejano y el último queda a R_SEED de la carga.
        const [xa, ya] = primerPunto(l);
        const [xb, yb] = ultimoPunto(l);
        expect(dist(cargas[0], xa, ya)).toBeGreaterThan(dist(cargas[0], xb, yb));
        expect(dist(cargas[0], xb, yb)).toBeCloseTo(R_SEED, 4);
        // Sigue +E: cada tramo avanza hacia la carga.
        for (let k = 0; k + 3 < p.length; k += 2) {
          campo(p[k], p[k + 1], E);
          expect((p[k + 2] - p[k]) * E[0] + (p[k + 3] - p[k + 1]) * E[1]).toBeGreaterThan(0);
        }
      }
    });
  }

  it("T-d3: −1 y −2 separadas 300 px: 10 + 20 líneas y ninguna cruza a otra", () => {
    const cargas: PuntoCarga[] = [
      { x: 200, y: 250, q: -1 },
      { x: 500, y: 250, q: -2 },
    ];
    const lineas = trazarLineasCampo(cargas, 700, 500);
    expect(lineas.filter((l) => l.origen === 0)).toHaveLength(10);
    expect(lineas.filter((l) => l.origen === 1)).toHaveLength(20);
    let cruces = 0;
    const tol = 0.05;
    for (let a = 0; a < lineas.length; a++) {
      for (let b = a + 1; b < lineas.length; b++) {
        const pa = lineas[a].puntos;
        const pb = lineas[b].puntos;
        for (let i = 0; i + 3 < pa.length; i += 2) {
          for (let j = 0; j + 3 < pb.length; j += 2) {
            if (cruzan(pa, i, pb, j, tol)) cruces++;
          }
        }
      }
    }
    expect(cruces).toBe(0);
  });
});

/** ¿Los segmentos p[i..i+3] y q[j..j+3] se cruzan con margen `tol` (px) dentro de cada segmento? */
function cruzan(p: Float32Array, i: number, q: Float32Array, j: number, tol: number): boolean {
  const rx = p[i + 2] - p[i];
  const ry = p[i + 3] - p[i + 1];
  const sx = q[j + 2] - q[j];
  const sy = q[j + 3] - q[j + 1];
  const den = rx * sy - ry * sx;
  if (Math.abs(den) < 1e-12) return false;
  const t = ((q[j] - p[i]) * sy - (q[j + 1] - p[i + 1]) * sx) / den;
  const u = ((q[j] - p[i]) * ry - (q[j + 1] - p[i + 1]) * rx) / den;
  const lr = Math.hypot(rx, ry);
  const ls = Math.hypot(sx, sy);
  return t > tol / lr && t < 1 - tol / lr && u > tol / ls && u < 1 - tol / ls;
}

describe("T-e — número de líneas ∝ |q| (regla de E2.1) y sin duplicados", () => {
  it("T-e1: cada carga usa exactamente repartirLineas(qs)[i] sectores (también con recorte)", () => {
    const cargas: PuntoCarga[] = Array.from({ length: 30 }, (_, i) => ({
      x: 60 + (i % 10) * 64,
      y: 60 + Math.floor(i / 10) * 190,
      q: 1,
    }));
    const esperado = repartirLineas(cargas.map((c) => c.q));
    expect(esperado[0]).toBe(7);
    const lineas = trazarLineasCampo(cargas, 700, 500);
    for (let i = 0; i < cargas.length; i++) {
      expect(lineas.filter((l) => l.origen === i)).toHaveLength(esperado[i]);
    }
  });

  it("T-e1: la opción presupuesto se pasa a repartirLineas", () => {
    const lineas = trazarLineasCampo([{ x: 350, y: 250, q: 5 }], 700, 500, { presupuesto: 20 });
    expect(lineas).toHaveLength(repartirLineas([5], 20)[0]);
    expect(lineas).toHaveLength(20);
  });

  it("T-e2: +1, +2, +4 separadas → 10, 20, 40 líneas (1 : 2 : 4); con negativas igual", () => {
    const pos: PuntoCarga[] = [
      { x: 120, y: 250, q: 1 },
      { x: 350, y: 250, q: 2 },
      { x: 580, y: 250, q: 4 },
    ];
    const neg = pos.map((c) => ({ ...c, q: -c.q }));
    for (const cargas of [pos, neg]) {
      const lineas = trazarLineasCampo(cargas, 700, 500);
      expect([0, 1, 2].map((i) => lineas.filter((l) => l.origen === i).length)).toEqual([10, 20, 40]);
    }
  });

  /** Líneas incidentes en la negativa j: las que llegan de positivas + las sembradas hacia atrás. */
  function incidentes(lineas: LineaCampo[], j: number) {
    const llegan = lineas.filter((l) => l.sentido === 1 && l.fin === "carga" && l.destino === j).length;
    const sembradas = lineas.filter((l) => l.sentido === -1 && l.origen === j).length;
    return { llegan, sembradas, total: llegan + sembradas };
  }

  // Totales medidos con la geometría de este test (horizontal, a 200 px, centrada en el canvas). +1/−1 y
  // +1/−2 coinciden con la tabla de E2.3 §5.3 (15 y 23). En +2/−1 la spec daba 23 (a = 7, d = 3): esa cifra
  // corresponde a una separación de 300 px (ver el test siguiente); a 200 px resulta a = 9, d = 1, total 21.
  // Ambas son físicamente correctas: el invariante es incidentes = a + d = N_j = 10, y a depende de cuántas
  // líneas de la positiva se escapan por el borde antes de llegar (límite de Gauss en el plano: a ≤ 10).
  const casos: Array<{ nombre: string; qs: [number, number]; incidentesEsperadas: number; total: number }> = [
    { nombre: "+1 / −1", qs: [1, -1], incidentesEsperadas: 10, total: 15 },
    { nombre: "+1 / −2", qs: [1, -2], incidentesEsperadas: 20, total: 23 },
    { nombre: "+2 / −1", qs: [2, -1], incidentesEsperadas: 10, total: 21 },
  ];
  for (const caso of casos) {
    it(`T-e3: ${caso.nombre} a 200 px: incidentes en la negativa = max(N, llegadas); sin duplicar`, () => {
      const cargas: PuntoCarga[] = [
        { x: 250, y: 250, q: caso.qs[0] },
        { x: 450, y: 250, q: caso.qs[1] },
      ];
      const lineas = trazarLineasCampo(cargas, 700, 500);
      const inc = incidentes(lineas, 1);
      expect(inc.total).toBe(caso.incidentesEsperadas);
      expect(lineas.length).toBeLessThanOrEqual(200);
      // Las semillas hacia atrás solo ocupan sectores SIN llegadas.
      const N = repartirLineas(cargas.map((c) => c.q))[1];
      const conLlegada = new Set(
        lineas
          .filter((l) => l.sentido === 1 && l.fin === "carga" && l.destino === 1)
          .map((l) => sectorHacia(cargas[1], ...ultimoPunto(l), N)),
      );
      for (const l of lineas.filter((x) => x.sentido === -1 && x.origen === 1)) {
        expect(conLlegada.has(sectorHacia(cargas[1], ...ultimoPunto(l), N))).toBe(false);
      }
      // Total documentado en la especificación (prototipo de física).
      expect(lineas.length).toBe(caso.total);
    });
  }

  it("T-e3: +2 / −1 a 300 px reproduce la tabla de la spec (a = 7, d = 3, total 23); en dominio ilimitado a → 10", () => {
    const cargas: PuntoCarga[] = [
      { x: 200, y: 250, q: 2 },
      { x: 500, y: 250, q: -1 },
    ];
    const lineas = trazarLineasCampo(cargas, 700, 500);
    const inc = incidentes(lineas, 1);
    expect(inc.llegan).toBe(7);
    expect(inc.sembradas).toBe(3);
    expect(lineas.length).toBe(23);
    // Sin borde: las líneas de + dentro del cono de captura (semiángulo 90° para q₁/q₂ = 2) llegan todas a −1.
    // Rotado 17° (para que ninguna semilla caiga justo en la separatriz) llegan exactamente 10 = N.
    const ang = (17 * Math.PI) / 180;
    const c = 5000;
    const gr: PuntoCarga[] = [
      { x: c - 100 * Math.cos(ang), y: c - 100 * Math.sin(ang), q: 2 },
      { x: c + 100 * Math.cos(ang), y: c + 100 * Math.sin(ang), q: -1 },
    ];
    const ilimitado = trazarLineasCampo(gr, 2 * c, 2 * c, { longitudMax: 20000, eMin: 1e-12 });
    const incG = incidentes(ilimitado, 1);
    expect(incG.llegan).toBe(10);
    expect(incG.sembradas).toBe(0);
  });

  it("T-e3: +5 / −0.5 a 300 px: d = 0 y llegan más de 5 (sobre-captura del corte plano, documentada)", () => {
    const cargas: PuntoCarga[] = [
      { x: 200, y: 250, q: 5 },
      { x: 500, y: 250, q: -0.5 },
    ];
    const lineas = trazarLineasCampo(cargas, 700, 500);
    const inc = incidentes(lineas, 1);
    expect(inc.sembradas).toBe(0);
    expect(inc.llegan).toBeGreaterThan(5);
  });

  it("sin cargas no hay líneas; una carga casi nula se ignora", () => {
    expect(trazarLineasCampo([], 700, 500)).toEqual([]);
    expect(trazarLineasCampo([{ x: 100, y: 100, q: 1e-12 }], 700, 500)).toEqual([]);
  });
});

describe("criterios de parada y forma de las líneas", () => {
  it("cada línea empieza a R_SEED de su origen, sigue +E y respeta los límites de la spec", () => {
    const cargas: PuntoCarga[] = [
      { x: 250, y: 250, q: 1 },
      { x: 450, y: 250, q: -1 },
    ];
    const lineas = trazarLineasCampo(cargas, 700, 500);
    for (const l of lineas) {
      const p = l.puntos;
      // Punto de siembra (primero si sentido +1; último si −1).
      const [sx, sy] = l.sentido === 1 ? primerPunto(l) : ultimoPunto(l);
      expect(dist(cargas[l.origen], sx, sy)).toBeCloseTo(R_SEED, 4);
      // Longitud acotada por longitudMax.
      expect((p.length / 2 - 1) * PASO_LINEA).toBeLessThanOrEqual(1600 + PASO_LINEA);
      if (l.fin === "carga") {
        const [ex, ey] = l.sentido === 1 ? ultimoPunto(l) : primerPunto(l);
        expect(dist(cargas[l.destino], ex, ey)).toBeLessThan(R_ABS);
        expect(R_ABS).toBe(RADIO_CARGA_PX + 2);
      } else {
        expect(l.destino).toBe(-1);
      }
    }
  });

  it("'nulo': la línea se detiene cuando |E| < eMin (carga de 0.5 µC, eMin = 1 → r ≈ 50 px)", () => {
    const lineas = trazarLineasCampo([{ x: 350, y: 250, q: 0.5 }], 700, 500, { eMin: 1 });
    expect(lineas).toHaveLength(5);
    for (const l of lineas) {
      expect(l.fin).toBe("nulo");
      const [x, y] = primerPunto(l); // sentido +1: el primer punto es la semilla
      const [xf, yf] = ultimoPunto(l);
      expect(Math.hypot(x - 350, y - 250)).toBeCloseTo(R_SEED, 4);
      // E = K·q/r² = 1 → r = √2500 = 50; la línea llega a ~50 px (con el paso de 6 px).
      expect(Math.hypot(xf - 350, yf - 250)).toBeGreaterThan(44);
      expect(Math.hypot(xf - 350, yf - 250)).toBeLessThan(56);
    }
  });

  it("'max': longitudMax acota el número de pasos (ceil(60/6) = 10 pasos → 11 puntos)", () => {
    const lineas = trazarLineasCampo([{ x: 350, y: 250, q: 1 }], 700, 500, { longitudMax: 60 });
    expect(lineas).toHaveLength(10);
    for (const l of lineas) {
      expect(l.fin).toBe("max");
      expect(l.puntos.length / 2).toBe(11);
    }
  });

  it("dos cargas iguales: ninguna línea termina en 'carga' (las líneas de + no llegan a otra +)", () => {
    const cargas: PuntoCarga[] = [
      { x: 250, y: 250, q: 1 },
      { x: 450, y: 250, q: 1 },
    ];
    const lineas = trazarLineasCampo(cargas, 700, 500);
    expect(lineas).toHaveLength(20);
    expect(lineas.filter((l) => l.fin === "carga")).toHaveLength(0);
  });
});
