import { describe, expect, test } from "vitest";
import { campoEn, K_VISUAL, type PuntoCarga } from "./coulomb";
import type { OrientacionPlacas } from "./campoExterno";
import { factoresSim } from "./escala";
import {
  COLUMNAS,
  DT_SUB,
  ESPACIADO_PX,
  FILAS,
  GAMMA_ARRASTRE,
  K_EFF_CONDUCTOR,
  K_RESORTE_AISLANTE,
  MASA_ELECTRON,
  MEDIDOR_SEMILADO_PX,
  N_POR_MATERIAL,
  OMEGA0_CONDUCTOR,
  Q_PARTICULA_MATERIAL,
  SEMIALTO_PARED_PX,
  SEMIANCHO_PARED_PX,
  SOFTENING2_MATERIALES,
  SUBPASOS_MAX,
  VOLTAJE_MAX_KV,
  VOLTAJE_MIN_KV,
  VOLTAJE_PASO_KV,
  ZETA_CONDUCTOR,
  avanzarParche,
  campoExternoMateriales,
  campoInterior,
  clonarParche,
  crearParche,
  crearParcheEnReposo,
  desplazamientoMedio,
  energiaParche,
  medirKEff,
  pasoParche,
  razonInterior,
  type ParcheMaterial,
  type TipoMaterial,
} from "./materiales";

const BLOQUE_S = SUBPASOS_MAX * DT_SUB;

/** Avanza `segundos` de simulación en bloques del tamaño máximo por frame. */
function correr(p: ParcheMaterial, e0: readonly [number, number], segundos: number): void {
  const n = Math.round(segundos / BLOQUE_S);
  for (let i = 0; i < n; i++) avanzarParche(p, e0, BLOQUE_S);
}

function asentado(tipo: TipoMaterial, e0: readonly [number, number], segundos = 8): ParcheMaterial {
  const p = crearParcheEnReposo(tipo);
  correr(p, e0, segundos);
  return p;
}

const ORIENTACIONES: OrientacionPlacas[] = ["vertical", "horizontal"];
const POLARIDADES: Array<1 | -1> = [1, -1];
const VOLTAJES_KV = [VOLTAJE_MIN_KV, 100, VOLTAJE_MAX_KV];

function combinaciones(): Array<{ ori: OrientacionPlacas; pol: 1 | -1; u: number }> {
  const out: Array<{ ori: OrientacionPlacas; pol: 1 | -1; u: number }> = [];
  for (const ori of ORIENTACIONES) for (const pol of POLARIDADES) for (const u of VOLTAJES_KV) out.push({ ori, pol, u });
  return out;
}

describe("materiales: geometría, neutralidad y campo externo", () => {
  test("140 átomos por material en una red de 14 x 10 con 3 px de separación", () => {
    const p = crearParche("conductor");
    expect(N_POR_MATERIAL).toBe(140);
    expect(COLUMNAS * FILAS).toBe(140);
    expect(p.n).toBe(140);
    expect(p.ionX[1] - p.ionX[0]).toBeCloseTo(ESPACIADO_PX, 12);
    expect(p.ionY[COLUMNAS] - p.ionY[0]).toBeCloseTo(ESPACIADO_PX, 12);
    // centrada en el origen
    const mediaX = p.ionX.reduce((a, b) => a + b, 0) / p.n;
    const mediaY = p.ionY.reduce((a, b) => a + b, 0) / p.n;
    expect(Math.abs(mediaX)).toBeLessThan(1e-12);
    expect(Math.abs(mediaY)).toBeLessThan(1e-12);
  });

  test("E0 = U/d en unidades de simulación: 100 kV entre placas a 10 cm = 1 MN/C", () => {
    const e = campoExternoMateriales("vertical", 1, 100);
    const enSI = e[1] * factoresSim(K_VISUAL).campo;
    expect(enSI).toBeCloseTo(1e6, -1);
    expect(e[0]).toBe(0);
    // horizontal y polaridad invertida
    expect(campoExternoMateriales("horizontal", -1, 100)[0]).toBeCloseTo(-e[1], 12);
    // no depende de la orientación (separación fija)
    expect(campoExternoMateriales("horizontal", 1, 250)[0]).toBeCloseTo(campoExternoMateriales("vertical", 1, 250)[1], 12);
    // lineal en U
    expect(campoExternoMateriales("vertical", 1, 200)[1]).toBeCloseTo(2 * e[1], 12);
  });

  test("el medidor usa la misma ley que campoEn (mismo softening): promedio sobre la región central", () => {
    const p = crearParche("conductor", 0.6, 11);
    const cargas: PuntoCarga[] = [];
    for (let i = 0; i < p.n; i++) {
      cargas.push({ x: p.ionX[i], y: p.ionY[i], q: Q_PARTICULA_MATERIAL });
      cargas.push({ x: p.x[i], y: p.y[i], q: -Q_PARTICULA_MATERIAL });
    }
    const e0: [number, number] = [0.004, -0.011];
    let sx = 0;
    let sy = 0;
    const m = 8;
    for (let a = 0; a < m; a++) {
      for (let b = 0; b < m; b++) {
        const px = ((a + 0.5) / m - 0.5) * 2 * MEDIDOR_SEMILADO_PX;
        const py = ((b + 0.5) / m - 0.5) * 2 * MEDIDOR_SEMILADO_PX;
        const [ex, ey] = campoEn(px, py, cargas, SOFTENING2_MATERIALES);
        sx += ex;
        sy += ey;
      }
    }
    const [ix, iy] = campoInterior(p, e0);
    expect(ix).toBeCloseTo(e0[0] + sx / (m * m), 10);
    expect(iy).toBeCloseTo(e0[1] + sy / (m * m), 10);
  });
});

describe("materiales: calibración (receta E5.2 §4.3)", () => {
  test("k_eff medida coincide con la constante documentada, en régimen lineal", () => {
    const p = crearParche("conductor");
    for (const delta of [0.01, 0.05, 0.2]) {
      const k = medirKEff(p, delta, [0, 1]);
      expect(Math.abs(k - K_EFF_CONDUCTOR) / K_EFF_CONDUCTOR).toBeLessThan(0.02);
    }
    // A lo largo de la red larga (campo horizontal) la rigidez colectiva es menor (forma del parche).
    const kx = medirKEff(p, 0.05, [1, 0]);
    expect(kx).toBeLessThan(K_EFF_CONDUCTOR);
    expect(kx / Q_PARTICULA_MATERIAL ** 2).toBeGreaterThan(74);
    expect(kx / Q_PARTICULA_MATERIAL ** 2).toBeLessThan(80);
  });

  test("masa y arrastre siguen la receta: m = k_eff/ω0² y γ = ζ·2·m·ω0", () => {
    expect(MASA_ELECTRON * OMEGA0_CONDUCTOR ** 2).toBeCloseTo(K_EFF_CONDUCTOR, 18);
    expect(GAMMA_ARRASTRE).toBeCloseTo(ZETA_CONDUCTOR * 2 * MASA_ELECTRON * OMEGA0_CONDUCTOR, 18);
    // periodo entre 1 y 3 s
    const periodo = (2 * Math.PI) / OMEGA0_CONDUCTOR;
    expect(periodo).toBeGreaterThan(1);
    expect(periodo).toBeLessThan(3);
    // el paso de integración resuelve la frecuencia más rápida (la del aislante, el resorte más rígido)
    const omegaAislante = Math.sqrt(K_RESORTE_AISLANTE / MASA_ELECTRON);
    expect(omegaAislante * DT_SUB).toBeLessThan(0.2);
  });

  test("el desplazamiento de equilibrio del conductor a campo débil es Q·E0/k_dep, con k_dep ≈ 0.85·k_eff (Q·E0/k_eff es cota inferior, +30 % como máximo)", () => {
    // k_eff = k_dep (campo de la carga de superficie, que sí apantalla) + k_red (retención residual
    // de la red, que no). En equilibrio E_int ≈ 0: Q·E0 = k_dep·δ, luego δ ≥ Q·E0/k_eff.
    const e0 = campoExternoMateriales("vertical", 1, VOLTAJE_MIN_KV);
    const p = asentado("conductor", e0);
    const previsto = (Q_PARTICULA_MATERIAL * Math.hypot(e0[0], e0[1])) / K_EFF_CONDUCTOR;
    const medido = desplazamientoMedio(p, e0);
    expect(medido).toBeGreaterThan(previsto);
    expect(medido).toBeLessThan(1.3 * previsto);
  });
});

describe("materiales: C1 apantallamiento comparativo", () => {
  test("C1: |E_int|conductor / E0 < 0.9 y menor que en el aislante, para todo el rango, orientación y polaridad", () => {
    for (const { ori, pol, u } of combinaciones()) {
      const e0 = campoExternoMateriales(ori, pol, u);
      const c = asentado("conductor", e0);
      const a = asentado("aislante", e0);
      const rc = razonInterior(c, e0);
      const ra = razonInterior(a, e0);
      expect(rc, `${ori} ${pol} ${u} kV`).toBeLessThan(0.9);
      expect(rc, `${ori} ${pol} ${u} kV`).toBeLessThan(ra);
      // el texto de la página dice "prácticamente cero (menos del 2 %)": esta guarda lo mantiene cierto
      expect(rc, `${ori} ${pol} ${u} kV`).toBeLessThan(0.02);
      // y con margen claro: el aislante apantalla poco, pero no nada
      // (el texto de la página cita "entre el 80 % y el 90 %": esta guarda lo mantiene cierto)
      expect(ra, `${ori} ${pol} ${u} kV`).toBeGreaterThan(0.75);
      expect(ra, `${ori} ${pol} ${u} kV`).toBeLessThan(0.95);
    }
  });

  test("mismo resultado con polaridad invertida (simetría de reflexión del enrejado)", () => {
    const e0a = campoExternoMateriales("vertical", 1, 100);
    const e0b = campoExternoMateriales("vertical", -1, 100);
    const ca = asentado("conductor", e0a, 6);
    const cb = asentado("conductor", e0b, 6);
    expect(Math.abs(razonInterior(ca, e0a) - razonInterior(cb, e0b))).toBeLessThan(0.01);
    expect(desplazamientoMedio(ca, e0a)).toBeCloseTo(desplazamientoMedio(cb, e0b), 2);
  });

  test("los electrones se corren HACIA la placa positiva (contra el campo)", () => {
    // Polaridad 1 vertical: E0 apunta hacia abajo (y crece), los electrones suben (y decrece).
    const e0 = campoExternoMateriales("vertical", 1, 100);
    for (const tipo of ["conductor", "aislante"] as const) {
      const p = asentado(tipo, e0, 6);
      let dy = 0;
      for (let i = 0; i < p.n; i++) dy += p.y[i] - p.ionY[i];
      expect(dy / p.n, tipo).toBeLessThan(0);
      expect(desplazamientoMedio(p, e0), tipo).toBeGreaterThan(0);
    }
  });
});

describe("materiales: aislante (C2, C3)", () => {
  test("C2: el desplazamiento de equilibrio es lineal en E0 (0.1 %) en todo el rango de voltaje", () => {
    const esperadoPorE0 = Q_PARTICULA_MATERIAL / K_RESORTE_AISLANTE;
    for (let u = VOLTAJE_MIN_KV; u <= VOLTAJE_MAX_KV; u += VOLTAJE_PASO_KV) {
      const e0 = campoExternoMateriales("vertical", 1, u);
      const p = asentado("aislante", e0, 6);
      const mag = Math.hypot(e0[0], e0[1]);
      const delta = desplazamientoMedio(p, e0);
      expect(Math.abs(delta / mag - esperadoPorE0) / esperadoPorE0, `${u} kV`).toBeLessThan(1e-3);
      // todos los electrones se corren igual (osciladores independientes)
      for (let i = 0; i < p.n; i += 17) {
        const di = (p.y[i] - p.ionY[i]) * -1;
        expect(Math.abs(di - delta) / delta).toBeLessThan(1e-3);
      }
    }
  });

  test("C3: ningún electrón del aislante se aleja de su equilibrio más que su desplazamiento inicial, en 60 s", () => {
    for (const { ori, pol, u } of combinaciones()) {
      const e0 = campoExternoMateriales(ori, pol, u);
      const p = crearParcheEnReposo("aislante");
      const mag = Math.hypot(e0[0], e0[1]);
      const dEq = (Q_PARTICULA_MATERIAL * mag) / K_RESORTE_AISLANTE;
      const eqX = (i: number) => p.ionX[i] - (Q_PARTICULA_MATERIAL * e0[0]) / K_RESORTE_AISLANTE;
      const eqY = (i: number) => p.ionY[i] - (Q_PARTICULA_MATERIAL * e0[1]) / K_RESORTE_AISLANTE;
      let maxDist = 0;
      const bloques = Math.round(60 / BLOQUE_S);
      for (let b = 0; b < bloques; b++) {
        avanzarParche(p, e0, BLOQUE_S);
        if (b % 5 === 0) {
          for (let i = 0; i < p.n; i++) maxDist = Math.max(maxDist, Math.hypot(p.x[i] - eqX(i), p.y[i] - eqY(i)));
        }
      }
      expect(maxDist, `${ori} ${pol} ${u} kV`).toBeLessThan(1.05 * dEq);
      let final = 0;
      for (let i = 0; i < p.n; i++) final = Math.max(final, Math.hypot(p.x[i] - eqX(i), p.y[i] - eqY(i)));
      expect(final / dEq, `${ori} ${pol} ${u} kV`).toBeLessThan(1e-6);
    }
  });

  test("C3 (conductor): los electrones libres nunca salen del material ni se vuelven no finitos en 60 s", () => {
    for (const { ori, pol, u } of [
      { ori: "vertical" as const, pol: 1 as const, u: VOLTAJE_MAX_KV },
      { ori: "horizontal" as const, pol: -1 as const, u: VOLTAJE_MAX_KV },
    ]) {
      const e0 = campoExternoMateriales(ori, pol, u);
      const p = crearParcheEnReposo("conductor");
      for (let b = 0; b < Math.round(60 / BLOQUE_S); b++) {
        avanzarParche(p, e0, BLOQUE_S);
        if (b % 20 === 0) {
          for (let i = 0; i < p.n; i++) {
            expect(Number.isFinite(p.x[i]) && Number.isFinite(p.y[i])).toBe(true);
            expect(Math.abs(p.x[i])).toBeLessThanOrEqual(SEMIANCHO_PARED_PX + 1e-9);
            expect(Math.abs(p.y[i])).toBeLessThanOrEqual(SEMIALTO_PARED_PX + 1e-9);
          }
        }
      }
    }
  });
});

describe("materiales: conductor (C4)", () => {
  test("C4: el campo inducido se OPONE al externo, no se suma: |E_int| < |E0| en todo el rango", () => {
    for (const { ori, pol, u } of combinaciones()) {
      const e0 = campoExternoMateriales(ori, pol, u);
      const c = asentado("conductor", e0);
      const [ex, ey] = campoInterior(c, e0);
      const mag0 = Math.hypot(e0[0], e0[1]);
      expect(Math.hypot(ex, ey), `${ori} ${pol} ${u} kV`).toBeLessThan(mag0);
      // Guarda de calibración: queda una fracción mínima del campo externo (apartamiento casi total).
      expect(Math.hypot(ex, ey) / mag0, `${ori} ${pol} ${u} kV`).toBeLessThan(0.02);
      // Con ε = 1.5·s la red es casi lisa: no hay sobre-compensación de la red discreta. Queda un
      // rizado de signo de ±0.5 % (carga de superficie granular); medido: mínimo −0.45 %.
      expect((ex * e0[0] + ey * e0[1]) / (mag0 * mag0), `${ori} ${pol} ${u} kV`).toBeGreaterThan(-0.01);
    }
  });

  test("barrido completo 30-300 kV (paso 10), ambas orientaciones y polaridades: casi cero, sin inversión apreciable ni resbalón de la red", () => {
    // Medido (10 s por punto): máx 1.06 % (vertical) / 1.47 % (horizontal) a 30 kV; <= 0.55 % de
    // 60 kV en adelante; signo mínimo −0.45 %. Sin los saltos ni la inversión que había con ε = s.
    for (const ori of ORIENTACIONES) {
      for (const pol of POLARIDADES) {
        for (let u = VOLTAJE_MIN_KV; u <= VOLTAJE_MAX_KV; u += VOLTAJE_PASO_KV) {
          const e0 = campoExternoMateriales(ori, pol, u);
          const c = crearParcheEnReposo("conductor");
          correr(c, e0, 8);
          const mag0 = Math.hypot(e0[0], e0[1]);
          const [ex, ey] = campoInterior(c, e0);
          const r = Math.hypot(ex, ey) / mag0;
          const rotulo = `${ori} ${pol} ${u} kV`;
          expect(r, rotulo).toBeLessThan(u === VOLTAJE_MIN_KV ? 0.02 : 0.01);
          expect((ex * e0[0] + ey * e0[1]) / (mag0 * mag0), rotulo).toBeGreaterThan(-0.008);
        }
      }
    }
  }, 120000);

  test("sin memoria apreciable: tras 300 kV y volver a 30 kV, o tras invertir la polaridad, el resultado es el mismo salvo < 1 punto porcentual", () => {
    // Medido: 0.58 % frente a 1.06 % (vertical), 1.44 % frente a 1.47 % (horizontal). Con ε = s la
    // diferencia era de 10 a 23 puntos (el mar de electrones "resbalaba" un periodo de la red).
    for (const ori of ORIENTACIONES) {
      const alto = campoExternoMateriales(ori, 1, VOLTAJE_MAX_KV);
      const bajo = campoExternoMateriales(ori, 1, VOLTAJE_MIN_KV);
      const fresco = asentado("conductor", bajo, 10);
      const c = crearParcheEnReposo("conductor");
      correr(c, alto, 8);
      correr(c, bajo, 12);
      expect(Math.abs(razonInterior(c, bajo) - razonInterior(fresco, bajo)), ori).toBeLessThan(0.01);
      expect(razonInterior(c, bajo), ori).toBeLessThan(0.02);
      // polaridad invertida a 300 kV: los electrones cruzan el parche y aun así apantalla
      const d = crearParcheEnReposo("conductor");
      const invertido = campoExternoMateriales(ori, -1, VOLTAJE_MAX_KV);
      correr(d, alto, 8);
      correr(d, invertido, 12);
      expect(razonInterior(d, invertido), ori).toBeLessThan(0.01);
    }
  }, 60000);

  test("el aislante es lineal y sin memoria: la razón no depende del voltaje ni de la historia", () => {
    const e30 = campoExternoMateriales("vertical", 1, VOLTAJE_MIN_KV);
    const e300 = campoExternoMateriales("vertical", 1, VOLTAJE_MAX_KV);
    const fresco = asentado("aislante", e30);
    const a = crearParcheEnReposo("aislante");
    correr(a, e300, 6);
    correr(a, e30, 8);
    expect(razonInterior(a, e30)).toBeCloseTo(razonInterior(fresco, e30), 4);
    expect(razonInterior(asentado("aislante", e300), e300)).toBeCloseTo(razonInterior(fresco, e30), 3);
  });

  test("el campo interior del conductor baja con el tiempo desde 100 % hasta su valor de equilibrio", () => {
    const e0 = campoExternoMateriales("vertical", 1, 100);
    const p = crearParcheEnReposo("conductor");
    expect(razonInterior(p, e0)).toBeCloseTo(1, 3);
    correr(p, e0, 0.5);
    const temprano = razonInterior(p, e0);
    correr(p, e0, 6);
    const tarde = razonInterior(p, e0);
    expect(temprano).toBeLessThan(0.9);
    expect(tarde).toBeLessThan(temprano);
  });
});

describe("materiales: C5 coste", () => {
  test("C5: fuerzas de ambos materiales, 8 sub-pasos por frame, < 3 ms (mediana, en Node)", () => {
    const e0 = campoExternoMateriales("vertical", 1, 100);
    const c = crearParcheEnReposo("conductor");
    const a = crearParcheEnReposo("aislante");
    for (let i = 0; i < 10; i++) {
      avanzarParche(c, e0, BLOQUE_S);
      avanzarParche(a, e0, BLOQUE_S);
    }
    const tiempos: number[] = [];
    for (let i = 0; i < 40; i++) {
      const t0 = performance.now();
      avanzarParche(c, e0, BLOQUE_S);
      avanzarParche(a, e0, BLOQUE_S);
      tiempos.push(performance.now() - t0);
    }
    tiempos.sort((x, y) => x - y);
    const mediana = tiempos[Math.floor(tiempos.length / 2)];
    expect(mediana).toBeLessThan(3);
  });
});

describe("materiales: C6 la energía no crece con el arrastre activo", () => {
  test.each(["conductor", "aislante"] as const)(
    "C6: %s, energía total no creciente (cinética + potencial + campo externo)",
    (tipo) => {
      const e0 = campoExternoMateriales("vertical", 1, 100);
      const p = crearParcheEnReposo(tipo);
      const e0Energia = energiaParche(p, e0);
      let previa = e0Energia;
      let minima = e0Energia;
      let peorSubida = 0;
      for (let i = 0; i < 6 * 120; i++) {
        pasoParche(p, e0, DT_SUB);
        const e = energiaParche(p, e0);
        peorSubida = Math.max(peorSubida, e - previa);
        minima = Math.min(minima, e);
        previa = e;
      }
      const caida = e0Energia - minima;
      expect(caida).toBeGreaterThan(0);
      // el integrador puede subir a lo sumo un residuo diminuto respecto a lo que la energía baja en total
      expect(peorSubida).toBeLessThan(1e-3 * caida);
      expect(previa).toBeLessThan(e0Energia);
    },
  );
});

describe("materiales: C7 sin campo externo", () => {
  test("C7: neutralidad exacta: mismo número de iones y de electrones, campo cero en la red recién armada", () => {
    for (const tipo of ["conductor", "aislante"] as const) {
      const p = crearParche(tipo);
      expect(p.ionX.length).toBe(p.x.length);
      const e0: [number, number] = [0, 0];
      const [ex, ey] = campoInterior(p, e0);
      expect(Math.hypot(ex, ey), tipo).toBeLessThan(1e-12);
    }
  });

  test("C7: con E0 = 0 el pre-equilibrado deja E_interior ≈ 0 (< 0.1 % del campo mínimo de la estación)", () => {
    const eMin = Math.hypot(...campoExternoMateriales("vertical", 1, VOLTAJE_MIN_KV));
    for (const tipo of ["conductor", "aislante"] as const) {
      const p = crearParcheEnReposo(tipo);
      const [ex, ey] = campoInterior(p, [0, 0]);
      expect(Math.hypot(ex, ey), tipo).toBeLessThan(1e-3 * eMin);
    }
  });

  test("C7: con E0 = 0 nada se mueve en 10 s, en ninguno de los dos materiales", () => {
    for (const tipo of ["conductor", "aislante"] as const) {
      const p = crearParcheEnReposo(tipo);
      const antes = clonarParche(p);
      correr(p, [0, 0], 10);
      let maxMov = 0;
      for (let i = 0; i < p.n; i++) maxMov = Math.max(maxMov, Math.hypot(p.x[i] - antes.x[i], p.y[i] - antes.y[i]));
      expect(maxMov, tipo).toBeLessThan(1e-4); // reposo pre-equilibrado
      expect(razonInterior(p, [0, 0]), tipo).toBe(0);
    }
  });

  test("C7: vuelve al reposo al quitar el campo (voltaje 0 tras haberlo aplicado)", () => {
    // El conductor tiene electrones casi libres (modos blandos de la red): el campo interior se
    // anula en pocos segundos, pero la última colocación fina tarda decenas (medido con 100 kV
    // vertical: 0.22 px a los 25 s y 0.07 px a los 50 s). El aislante vuelve en < 3 s.
    const e0 = campoExternoMateriales("vertical", 1, 100);
    const eMin = Math.hypot(...campoExternoMateriales("vertical", 1, VOLTAJE_MIN_KV));
    for (const tipo of ["conductor", "aislante"] as const) {
      const p = asentado(tipo, e0, 6);
      expect(Math.abs(desplazamientoMedio(p, e0))).toBeGreaterThan(0.1);
      correr(p, [0, 0], tipo === "conductor" ? 40 : 12);
      let maxDesp = 0;
      for (let i = 0; i < p.n; i++) maxDesp = Math.max(maxDesp, Math.hypot(p.x[i] - p.ionX[i], p.y[i] - p.ionY[i]));
      expect(maxDesp, tipo).toBeLessThan(tipo === "conductor" ? 0.3 : 0.05);
      const [ex, ey] = campoInterior(p, [0, 0]);
      expect(Math.hypot(ex, ey), tipo).toBeLessThan(1e-3 * eMin);
    }
  }, 30000);
});

describe("materiales: estado y pre-equilibrado", () => {
  test("crearParcheEnReposo devuelve copias independientes y deterministas", () => {
    const a = crearParcheEnReposo("conductor");
    const b = crearParcheEnReposo("conductor");
    expect(Array.from(a.x)).toEqual(Array.from(b.x));
    a.x[0] += 5;
    const c = crearParcheEnReposo("conductor");
    expect(c.x[0]).not.toBeCloseTo(a.x[0], 3);
    expect(c.x[0]).toBeCloseTo(b.x[0], 12);
  });

  test("el pre-equilibrado deja a cada electrón sobre su átomo (< 0.01 px)", () => {
    for (const tipo of ["conductor", "aislante"] as const) {
      const p = crearParcheEnReposo(tipo);
      let peor = 0;
      for (let i = 0; i < p.n; i++) peor = Math.max(peor, Math.hypot(p.x[i] - p.ionX[i], p.y[i] - p.ionY[i]));
      expect(peor, tipo).toBeLessThan(0.01);
    }
  });

  test("pasos con dt inválido no producen NaN", () => {
    const p = crearParcheEnReposo("conductor");
    avanzarParche(p, [0.01, 0], 0);
    avanzarParche(p, [0.01, 0], -1);
    avanzarParche(p, [0.01, 0], Number.NaN);
    expect(Number.isFinite(p.x[0])).toBe(true);
  });
});
