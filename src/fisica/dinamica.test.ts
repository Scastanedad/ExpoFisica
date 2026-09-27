/**
 * Tests de la física dinámica (E2.2 A1-A9, E2.5 E1-E9 y P3-P4, E2.1 C16-C20).
 * Funciones puras en Node. Ayudantes: `mulberry32` (RNG con semilla),
 * `escenario` (colocación inicial + cargas), `avanzarReloj` (ticks de 1/120 s de
 * reloj con `planificarSubpasos` + `pasoVerlet`) y `desplMedio`.
 */
import { describe, expect, it } from "vitest";
import { K_VISUAL, SOFTENING2, campoEn } from "./coulomb";
import { energiaSimAJ, formatSI } from "./escala";
import {
  DILATACION_DINAMICA,
  DT_SUB,
  MAX_SUBPASOS_POR_TICK,
  UMBRAL_DERIVA,
  agarrarCarga,
  agregarCarga,
  aplicarCambioCarga,
  calcularFuerzas,
  colocarInicial,
  crearSistema,
  derivaNormalizada,
  energias,
  evaluarAviso,
  inicializarSistema,
  intervenir,
  moverCarga,
  pasoAvance,
  pasoVerlet,
  planificarSubpasos,
  quitarCarga,
  soltarCarga,
  soltarConVelocidadPuntero,
  subdivisionesPaso,
  valorEnergiaMostrable,
  type OpcionesColocacion,
  type Punto,
  type SistemaDinamico,
} from "./dinamica";

// ---------- Ayudantes ----------

function mulberry32(semilla: number) {
  let a = semilla >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function escenario(qs: number[], semilla: number, opc: OpcionesColocacion = {}): SistemaDinamico {
  const s = crearSistema(700, 500);
  inicializarSistema(
    s,
    qs.map((q, i) => ({ id: `d-${i}`, q, masa: 1 })),
    { rng: mulberry32(semilla), ...opc },
  );
  return s;
}

const acumuladores = new WeakMap<SistemaDinamico, number>();

/** `segundos`·120 ticks de 1/120 s de reloj: planificarSubpasos + pasoAvance (el paso del motor real). `alTick` se llama tras cada tick. */
function avanzarReloj(s: SistemaDinamico, segundos: number, velocidad: number, alTick?: () => void) {
  const ticks = Math.round(segundos * 120);
  let acum = acumuladores.get(s) ?? 0;
  for (let t = 0; t < ticks; t++) {
    const plan = planificarSubpasos(acum, 1 / 120, velocidad);
    acum = plan.acum;
    for (let k = 0; k < plan.n; k++) pasoAvance(s, DT_SUB);
    alTick?.();
  }
  acumuladores.set(s, acum);
}

function desplMedio(s: SistemaDinamico, inicial: Punto[]): number {
  let suma = 0;
  for (let i = 0; i < inicial.length; i++) suma += Math.hypot(s.x[i] - inicial[i].x, s.y[i] - inicial[i].y);
  return suma / inicial.length;
}

const posiciones = (s: SistemaDinamico): Punto[] => s.x.map((x, i) => ({ x, y: s.y[i] }));

function percentil(valores: number[], p: number): number {
  const v = [...valores].sort((a, b) => a - b);
  return v[Math.min(v.length - 1, Math.floor(p * (v.length - 1) + 1e-9))];
}

const mediana = (v: number[]) => percentil(v, 0.5);

/** Máxima deriva normalizada observada tras cada tick durante `segundos`. */
function derivaMax(s: SistemaDinamico, segundos: number, velocidad: number): number {
  let max = 0;
  avanzarReloj(s, segundos, velocidad, () => {
    max = Math.max(max, derivaNormalizada(s));
  });
  return max;
}

/** Sistema en una caja enorme (sin paredes) con cargas en `pos` (relativas a un origen lejano de las paredes). */
function cajaAbierta(qs: number[], pos: Punto[], v?: Punto[]): SistemaDinamico {
  const s = crearSistema(1e6, 1e6);
  inicializarSistema(
    s,
    qs.map((q, i) => ({ id: `d-${i}`, q, masa: 1 })),
    { rng: mulberry32(1) },
  );
  colocar(s, pos.map((p) => ({ x: p.x + 5e5, y: p.y + 5e5 })), v);
  return s;
}

/** Fija posiciones (y velocidades) y recalibra la referencia de energía. */
function colocar(s: SistemaDinamico, pos: Punto[], v?: Punto[]) {
  pos.forEach((p, i) => {
    s.x[i] = p.x;
    s.y[i] = p.y;
    s.vx[i] = v?.[i]?.x ?? 0;
    s.vy[i] = v?.[i]?.y ?? 0;
  });
  s.fuerzasValidas = false;
  s.energiaInicial = energias(s).total;
  s.trabajoExterno = 0;
  s.intervenciones = 0;
}

/** Rejilla de referencia REJ (E2.5 §7), en reposo, masa 1. */
function rejilla(): SistemaDinamico {
  const s = crearSistema(700, 500);
  inicializarSistema(
    s,
    [
      { id: "d-0", q: 1, masa: 1 },
      { id: "d-1", q: 1, masa: 1 },
      { id: "d-2", q: -1, masa: 1 },
      { id: "d-3", q: -1, masa: 1 },
    ],
    { rng: mulberry32(1) },
  );
  colocar(s, [
    { x: 250, y: 200 },
    { x: 450, y: 200 },
    { x: 250, y: 300 },
    { x: 450, y: 300 },
  ]);
  return s;
}

/** V en el sitio de `i` por las demás cargas (sim, suavizado), para calcular ΔE a mano. */
function potencialEnCarga(s: SistemaDinamico, i: number): number {
  let v = 0;
  for (let j = 0; j < s.x.length; j++) {
    if (j === i) continue;
    v += (K_VISUAL * s.q[j]) / Math.sqrt((s.x[i] - s.x[j]) ** 2 + (s.y[i] - s.y[j]) ** 2 + SOFTENING2);
  }
  return v;
}

/** Copia profunda del estado observable, para comprobar "estado idéntico". */
const instantanea = (s: SistemaDinamico) => JSON.stringify(s);

// ---------- A1-A3: repulsión visible ----------

describe("A1/A2 repulsión visible a los 3 s (×1, 50 semillas)", () => {
  function desplazamientos(qs: number[], opc: OpcionesColocacion) {
    return Array.from({ length: 50 }, (_, k) => {
      const s = escenario(qs, k + 1, opc);
      const ini = posiciones(s);
      avanzarReloj(s, 3, 1);
      return desplMedio(s, ini);
    });
  }

  it("A1: 4 cargas +1 con dMax = 250", () => {
    const d = desplazamientos([1, 1, 1, 1], {});
    expect(mediana(d)).toBeGreaterThanOrEqual(65);
    expect(percentil(d, 0.1)).toBeGreaterThanOrEqual(45);
    expect(Math.min(...d)).toBeGreaterThanOrEqual(30);
  });

  it("A1-b: base aprobada (dMax = Infinity)", () => {
    const d = desplazamientos([1, 1, 1, 1], { dMax: Infinity });
    expect(mediana(d)).toBeGreaterThanOrEqual(55);
    expect(percentil(d, 0.1)).toBeGreaterThanOrEqual(30);
  });

  it("A1-c: escenario de la app (+,+,−,−)", () => {
    const d = desplazamientos([1, 1, -1, -1], {});
    expect(mediana(d)).toBeGreaterThanOrEqual(60);
    expect(percentil(d, 0.1)).toBeGreaterThanOrEqual(30);
  });

  it("A2: 2 cargas +1 con dMax = 250", () => {
    const d = desplazamientos([1, 1], {});
    expect(mediana(d)).toBeGreaterThanOrEqual(40);
    expect(percentil(d, 0.1)).toBeGreaterThanOrEqual(15);
    expect(Math.min(...d)).toBeGreaterThanOrEqual(15);
  });

  it("A2-b: 2 cargas con dMax = Infinity (documenta la limitación)", () => {
    const d = desplazamientos([1, 1], { dMax: Infinity });
    expect(mediana(d)).toBeGreaterThanOrEqual(12);
    expect(percentil(d, 0.1)).toBeGreaterThanOrEqual(5);
  });
});

describe("A3 par determinista", () => {
  function separacionTrasTresSegundos(x1: number, x2: number, velocidad: number): number {
    const s = crearSistema(700, 500);
    agregarCarga(s, "a", 1, 1, { posicion: { x: x1, y: 250 } });
    agregarCarga(s, "b", 1, 1, { posicion: { x: x2, y: 250 } });
    avanzarReloj(s, 3, velocidad);
    return Math.hypot(s.x[0] - s.x[1], s.y[0] - s.y[1]) - (x2 - x1);
  }

  it("100 px a 1×: la separación crece entre 170 y 195 px", () => {
    const d = separacionTrasTresSegundos(300, 400, 1);
    expect(d).toBeGreaterThanOrEqual(170);
    expect(d).toBeLessThanOrEqual(195);
  });

  it("200 px a 1×: entre 55 y 75 px", () => {
    const d = separacionTrasTresSegundos(250, 450, 1);
    expect(d).toBeGreaterThanOrEqual(55);
    expect(d).toBeLessThanOrEqual(75);
  });

  it("100 px a 0.25×: entre 14 y 20 px (cámara lenta útil)", () => {
    const d = separacionTrasTresSegundos(300, 400, 0.25);
    expect(d).toBeGreaterThanOrEqual(14);
    expect(d).toBeLessThanOrEqual(20);
  });

  it("100 px a 3×: entre 340 y 380 px", () => {
    const d = separacionTrasTresSegundos(300, 400, 3);
    expect(d).toBeGreaterThanOrEqual(340);
    expect(d).toBeLessThanOrEqual(380);
  });
});

// ---------- A4: conservación de la energía ----------

describe("A4 deriva de energía (métrica normalizada por K + Σ|U|)", () => {
  it("A4a: 4 cargas iguales, 1×, 30 s, semillas 1..20: ≤ 0.1 %", () => {
    let max = 0;
    for (let k = 1; k <= 20; k++) max = Math.max(max, derivaMax(escenario([1, 1, 1, 1], k), 30, 1));
    expect(max).toBeLessThanOrEqual(0.001);
  });

  it("A4b: signos mixtos +,+,−,− a 1× (≤ 0.1 %) y a 3× (≤ 0.5 %), 30 s, semillas 1..20", () => {
    let max1 = 0;
    let max3 = 0;
    for (let k = 1; k <= 20; k++) {
      max1 = Math.max(max1, derivaMax(escenario([1, 1, -1, -1], k), 30, 1));
      max3 = Math.max(max3, derivaMax(escenario([1, 1, -1, -1], k), 30, 3));
    }
    expect(max1).toBeLessThanOrEqual(0.001);
    expect(max3).toBeLessThanOrEqual(0.005);
    expect(Math.max(max1, max3)).toBeLessThan(UMBRAL_DERIVA);
  });

  it("A4b: 10 cargas (5+/5−) a 3×, 20 s, semillas 1..10: ≤ 0.5 %", () => {
    const qs = [1, 1, 1, 1, 1, -1, -1, -1, -1, -1];
    let max = 0;
    for (let k = 1; k <= 10; k++) max = Math.max(max, derivaMax(escenario(qs, k), 20, 3));
    expect(max).toBeLessThanOrEqual(0.005);
  });

  it("A4b: 30 cargas (15+/15−) a 3×, 10 s, semillas 1..3: ≤ 0.5 %", () => {
    const qs = [...new Array<number>(15).fill(1), ...new Array<number>(15).fill(-1)];
    let max = 0;
    for (let k = 1; k <= 3; k++) max = Math.max(max, derivaMax(escenario(qs, k), 10, 3));
    expect(max).toBeLessThanOrEqual(0.005);
  });

  it("A4b: sesión larga +,+,−,− a 3×, 300 s, semillas 1..3: ≤ 0.5 %", () => {
    let max = 0;
    for (let k = 1; k <= 3; k++) max = Math.max(max, derivaMax(escenario([1, 1, -1, -1], k), 300, 3));
    expect(max).toBeLessThanOrEqual(0.005);
  });

  it("C18: cargas de magnitud 5 con un cambio de carga intermedio: la contabilidad E − E₀ − W_ext es coherente", () => {
    // Umbral de la spec E2.1 C18 (≤ 1 %) a ×1 y a ×3, con el paso del motor real (pasoAvance).
    for (const velocidad of [1, 3]) {
      for (let k = 1; k <= 3; k++) {
        const s = escenario([5, 5, -5, -5], k);
        const e0 = s.energiaInicial;
        let max = derivaMax(s, 10, velocidad);
        expect(aplicarCambioCarga(s, "d-0", 2.5)).toBe(true);
        max = Math.max(max, derivaMax(s, 20, velocidad));
        const e = energias(s);
        expect(max).toBeLessThanOrEqual(0.01);
        expect(Math.abs(e.total - e0 - s.trabajoExterno) / e.escala).toBeLessThanOrEqual(0.01);
      }
    }
  });

  /** Deriva normalizada máxima de [q, q, −q, −q] durante `tSim` s de simulación con la función de paso dada. */
  function derivaSesion(q: number, semilla: number, tSim: number, paso: (s: SistemaDinamico) => void, ancho = 700): number {
    const s = escenario([q, q, -q, -q], semilla);
    s.ancho = ancho;
    s.alto = ancho === 700 ? 500 : ancho;
    s.fuerzasValidas = false;
    s.energiaInicial = energias(s).total;
    let max = 0;
    const pasos = Math.round(tSim / DT_SUB);
    for (let i = 1; i <= pasos; i++) {
      paso(s);
      if (i % 20 === 0) max = Math.max(max, derivaNormalizada(s));
    }
    return max;
  }

  it("con |q| = 5 la deriva es de las PAREDES, no del núcleo: sin paredes es ≤ 0.3 %; con paredes y pasoVerlet crudo, > 3 %; con pasoAvance, ≤ 1 %", () => {
    // Medido (8 semillas, 3600 s de simulación = 7.5 min a ×1): sin paredes 0.09 % (máx 0.12 %); con paredes y
    // pasoVerlet(DT_SUB) mediana 15.9 % (máx 35 %); con pasoAvance mediana 0.04 % (máx 0.10 %). La reflexión con
    // corrección de impulso es O(dt²) por rebote, pero con fuerzas de ~10³ unidades (par +/− pegado a una pared) se acumula.
    for (const semilla of [1, 2]) {
      const sinParedes = derivaSesion(5, semilla, 3600, (s) => pasoVerlet(s, DT_SUB), 1e5);
      const crudo = derivaSesion(5, semilla, 3600, (s) => pasoVerlet(s, DT_SUB));
      const motor = derivaSesion(5, semilla, 3600, (s) => pasoAvance(s, DT_SUB));
      expect(sinParedes).toBeLessThanOrEqual(0.003);
      expect(crudo).toBeGreaterThan(0.03);
      expect(motor).toBeLessThanOrEqual(0.01);
    }
  });

  it("subdivisionesPaso: 1 hasta 1.5 µC, 2 con 2–3, 3 con 3.5–4.5 y 4 con 5", () => {
    const con = (q: number) => {
      const s = escenario([q, -0.5], 1);
      return subdivisionesPaso(s);
    };
    expect([0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5].map(con)).toEqual([1, 1, 1, 2, 2, 2, 3, 3, 3, 4]);
    expect(subdivisionesPaso(crearSistema(700, 500))).toBe(1); // sin cargas
  });

  it("pasoAvance con una sola carga y sin fuerzas equivale a pasoVerlet y no rebota de más", () => {
    // Sin otras cargas la fuerza es 0: el paso subdividido cerca de la pared debe dar el mismo resultado exacto.
    const a = crearSistema(700, 500);
    const b = crearSistema(700, 500);
    for (const s of [a, b]) {
      agregarCarga(s, "a", 1, 1, { posicion: { x: 30, y: 250 } });
      s.vx[0] = -37;
      s.vy[0] = 11;
      s.fuerzasValidas = false;
    }
    for (let i = 0; i < 3000; i++) {
      pasoAvance(a, DT_SUB);
      pasoVerlet(b, DT_SUB);
    }
    expect(Math.abs(a.x[0] - b.x[0])).toBeLessThan(1e-9);
    expect(Math.abs(a.y[0] - b.y[0])).toBeLessThan(1e-9);
    expect(Math.hypot(a.vx[0], a.vy[0])).toBeCloseTo(Math.hypot(37, 11), 9);
  });

  it("A4c: los rebotes conservan la energía (dipolo contra la pared, regresión de §2.1)", () => {
    function dipolo(): SistemaDinamico {
      const s = crearSistema(700, 500);
      agregarCarga(s, "a", 1, 1, { posicion: { x: 60, y: 250 } });
      agregarCarga(s, "b", -1, 1, { posicion: { x: 80, y: 250 } });
      s.vx[0] = -30;
      s.vx[1] = -30;
      s.fuerzasValidas = false;
      s.energiaInicial = energias(s).total;
      return s;
    }
    const s = dipolo();
    let max = 0;
    for (let i = 0; i < 4000; i++) {
      pasoVerlet(s, DT_SUB);
      max = Math.max(max, derivaNormalizada(s));
    }
    expect(max).toBeLessThanOrEqual(0.001);

    // El `clamp` del motor anterior (x = r; vx = |vx|) inyecta O(dt) por rebote: aquí se demuestra que el test discrimina.
    const c = dipolo();
    let maxClamp = 0;
    for (let i = 0; i < 4000; i++) {
      pasoConClamp(c, DT_SUB);
      maxClamp = Math.max(maxClamp, derivaNormalizada(c));
    }
    expect(maxClamp).toBeGreaterThan(5 * max);
    expect(maxClamp).toBeGreaterThan(0.001);
  });

  it("los rebotes devuelven la carga al recuadro y dan la vuelta a la velocidad", () => {
    const s = crearSistema(700, 500);
    agregarCarga(s, "a", 1, 1, { posicion: { x: 20, y: 250 } });
    s.vx[0] = -50;
    s.fuerzasValidas = false;
    for (let i = 0; i < 200; i++) pasoVerlet(s, DT_SUB);
    expect(s.x[0]).toBeGreaterThanOrEqual(s.radio);
    expect(s.vx[0]).toBeGreaterThan(0);
    expect(Math.abs(s.vx[0])).toBeCloseTo(50, 6); // sin otras cargas: rebote elástico exacto
  });
});

/** Integrador anterior (Worker previo): rebote por `clamp`. Solo para la regresión de A4c. */
function pasoConClamp(s: SistemaDinamico, dt: number) {
  const n = s.x.length;
  calcularFuerzas(s);
  for (let i = 0; i < n; i++) {
    s.vx[i] += (s.fx[i] / s.masa[i]) * (dt / 2);
    s.vy[i] += (s.fy[i] / s.masa[i]) * (dt / 2);
  }
  for (let i = 0; i < n; i++) {
    s.x[i] += s.vx[i] * dt;
    s.y[i] += s.vy[i] * dt;
    const r = s.radio;
    if (s.x[i] < r) {
      s.x[i] = r;
      s.vx[i] = Math.abs(s.vx[i]);
    } else if (s.x[i] > s.ancho - r) {
      s.x[i] = s.ancho - r;
      s.vx[i] = -Math.abs(s.vx[i]);
    }
    if (s.y[i] < r) {
      s.y[i] = r;
      s.vy[i] = Math.abs(s.vy[i]);
    } else if (s.y[i] > s.alto - r) {
      s.y[i] = s.alto - r;
      s.vy[i] = -Math.abs(s.vy[i]);
    }
  }
  calcularFuerzas(s);
  for (let i = 0; i < n; i++) {
    s.vx[i] += (s.fx[i] / s.masa[i]) * (dt / 2);
    s.vy[i] += (s.fy[i] / s.masa[i]) * (dt / 2);
  }
}

// ---------- A5: invariantes ----------

describe("A5 invariantes de la dinámica (caja de 10⁶ px, sin paredes)", () => {
  const QS = [5, -0.5, 2, -3, 1.5];
  const POS: Punto[] = [
    { x: 0, y: 0 },
    { x: 90, y: 20 },
    { x: 40, y: 110 },
    { x: -60, y: 70 },
    { x: 130, y: -50 },
  ];

  it("3ª ley: ‖ΣF‖/max‖F_i‖ ≤ 1e-12 en cada paso y momento total ≤ 1e-9", () => {
    const s = cajaAbierta(QS, POS);
    let peor = 0;
    for (let i = 0; i < 500; i++) {
      pasoVerlet(s, DT_SUB);
      let sx = 0;
      let sy = 0;
      let maxF = 0;
      for (let j = 0; j < QS.length; j++) {
        sx += s.fx[j];
        sy += s.fy[j];
        maxF = Math.max(maxF, Math.hypot(s.fx[j], s.fy[j]));
      }
      peor = Math.max(peor, Math.hypot(sx, sy) / maxF);
    }
    expect(peor).toBeLessThanOrEqual(1e-12);
    let px = 0;
    let py = 0;
    for (let j = 0; j < QS.length; j++) {
      px += s.masa[j] * s.vx[j];
      py += s.masa[j] * s.vy[j];
    }
    expect(Math.hypot(px, py)).toBeLessThanOrEqual(1e-9);
  });

  it("conservación de K + U en 5000 pasos: ≤ 1e-3", () => {
    const casos: Array<[number[], Punto[]]> = [
      [[1, 1], [{ x: 0, y: 0 }, { x: 100, y: 0 }]],
      [[1, -1], [{ x: 0, y: 0 }, { x: 150, y: 20 }]],
      [
        [1, 1, -1, -1],
        [{ x: 0, y: 0 }, { x: 200, y: 0 }, { x: 0, y: 100 }, { x: 200, y: 100 }],
      ],
      [
        [1, 1, 1, 1],
        [{ x: 0, y: 0 }, { x: 200, y: 0 }, { x: 0, y: 100 }, { x: 200, y: 100 }],
      ],
    ];
    for (const [qs, pos] of casos) {
      const s = cajaAbierta(qs, pos);
      let max = 0;
      for (let i = 0; i < 5000; i++) {
        pasoVerlet(s, DT_SUB);
        max = Math.max(max, derivaNormalizada(s));
      }
      expect(max).toBeLessThanOrEqual(1e-3);
    }
  });

  it("F = −∇U por diferencias centrales (h = 1e-4), error relativo ≤ 1e-6", () => {
    const qs = [5, -0.5, 2];
    const pos: Punto[] = [
      { x: 10, y: 20 },
      { x: 60, y: -15 },
      { x: -25, y: 55 },
    ];
    const s = cajaAbierta(qs, pos.map((p) => ({ x: p.x - 5e5, y: p.y - 5e5 })));
    calcularFuerzas(s);
    const h = 1e-4;
    for (let i = 0; i < qs.length; i++) {
      for (const eje of ["x", "y"] as const) {
        const arr = eje === "x" ? s.x : s.y;
        const f = eje === "x" ? s.fx[i] : s.fy[i];
        const x0 = arr[i];
        arr[i] = x0 + h;
        const up = energias(s).potencial;
        arr[i] = x0 - h;
        const um = energias(s).potencial;
        arr[i] = x0;
        const numerica = -(up - um) / (2 * h);
        expect(Math.abs(numerica - f) / Math.abs(f)).toBeLessThanOrEqual(1e-6);
      }
    }
  });

  it("coherencia con coulomb.ts: F_i = q_i · campoEn(x_i, y_i, otras)", () => {
    const s = cajaAbierta(QS, POS);
    calcularFuerzas(s);
    for (let i = 0; i < QS.length; i++) {
      const otras = QS.map((q, j) => ({ x: s.x[j], y: s.y[j], q })).filter((_, j) => j !== i);
      const [ex, ey] = campoEn(s.x[i], s.y[i], otras);
      expect(s.fx[i]).toBeCloseTo(QS[i] * ex, 8);
      expect(s.fy[i]).toBeCloseTo(QS[i] * ey, 8);
      expect(Math.abs(s.fx[i] - QS[i] * ex)).toBeLessThanOrEqual(1e-12 * Math.max(1, Math.abs(s.fx[i])));
    }
  });

  it("FSAL: recalcular las fuerzas en cada paso da las mismas posiciones", () => {
    const a = cajaAbierta(QS, POS);
    const b = cajaAbierta(QS, POS);
    for (let i = 0; i < 2000; i++) {
      pasoVerlet(a, DT_SUB);
      b.fuerzasValidas = false;
      pasoVerlet(b, DT_SUB);
    }
    for (let j = 0; j < QS.length; j++) {
      expect(Math.abs(a.x[j] - b.x[j])).toBeLessThanOrEqual(1e-12);
      expect(Math.abs(a.y[j] - b.y[j])).toBeLessThanOrEqual(1e-12);
    }
  });
});

// ---------- A6: dilatación equivalente ----------

describe("verificación independiente del integrador (RK4 de referencia)", () => {
  // RK4 escrito aquí, sin usar dinamica.ts: aceleraciones de Coulomb con softening, masa 1.
  function rk4(pos: number[][], vel: number[][], q: number[], t: number, dt: number) {
    const n = q.length;
    const acel = (p: number[][]) =>
      p.map((pi, i) => {
        let ax = 0;
        let ay = 0;
        for (let j = 0; j < n; j++) {
          if (j === i) continue;
          const dx = pi[0] - p[j][0];
          const dy = pi[1] - p[j][1];
          const r2 = dx * dx + dy * dy + SOFTENING2;
          const f = (K_VISUAL * q[i] * q[j]) / (r2 * Math.sqrt(r2));
          ax += f * dx;
          ay += f * dy;
        }
        return [ax, ay];
      });
    let p = pos.map((v) => [...v]);
    let v = vel.map((w) => [...w]);
    const pasos = Math.round(t / dt);
    const suma = (a: number[][], b: number[][], h: number) => a.map((ai, i) => [ai[0] + h * b[i][0], ai[1] + h * b[i][1]]);
    for (let k = 0; k < pasos; k++) {
      const k1p = v, k1v = acel(p);
      const p2 = suma(p, k1p, dt / 2), v2 = suma(v, k1v, dt / 2);
      const k2p = v2, k2v = acel(p2);
      const p3 = suma(p, k2p, dt / 2), v3 = suma(v, k2v, dt / 2);
      const k3p = v3, k3v = acel(p3);
      const p4 = suma(p, k3p, dt), v4 = suma(v, k3v, dt);
      const k4p = v4, k4v = acel(p4);
      p = p.map((pi, i) => [
        pi[0] + (dt / 6) * (k1p[i][0] + 2 * k2p[i][0] + 2 * k3p[i][0] + k4p[i][0]),
        pi[1] + (dt / 6) * (k1p[i][1] + 2 * k2p[i][1] + 2 * k3p[i][1] + k4p[i][1]),
      ]);
      v = v.map((vi, i) => [
        vi[0] + (dt / 6) * (k1v[i][0] + 2 * k2v[i][0] + 2 * k3v[i][0] + k4v[i][0]),
        vi[1] + (dt / 6) * (k1v[i][1] + 2 * k2v[i][1] + 2 * k3v[i][1] + k4v[i][1]),
      ]);
    }
    return { p, v };
  }

  it("pasoVerlet reproduce la trayectoria de un RK4 fino (4 cargas +,+,−,−, 6 s de simulación, sin paredes)", () => {
    const pos: Punto[] = [
      { x: 0, y: 0 },
      { x: 90, y: 10 },
      { x: 45, y: 80 },
      { x: -40, y: 60 },
    ];
    const qs = [1, 1, -1, -1];
    const s = cajaAbierta(qs, pos, [{ x: 3, y: -2 }, { x: 0, y: 0 }, { x: -1, y: 4 }, { x: 0, y: 1 }]);
    const p0 = pos.map((p) => [p.x + 5e5, p.y + 5e5]);
    const v0 = [[3, -2], [0, 0], [-1, 4], [0, 1]];
    const pasos = Math.round(6 / DT_SUB);
    for (let i = 0; i < pasos; i++) pasoVerlet(s, DT_SUB);
    const ref = rk4(p0, v0, qs, 6, 1 / 2400);
    for (let i = 0; i < 4; i++) {
      expect(Math.hypot(s.x[i] - ref.p[i][0], s.y[i] - ref.p[i][1])).toBeLessThan(0.02); // px
      expect(Math.hypot(s.vx[i] - ref.v[i][0], s.vy[i] - ref.v[i][1])).toBeLessThan(0.02); // px/s
    }
  });

  it("rebote contra la pared: pasoAvance converge a la referencia del mismo esquema con dt/40 (autoconsistencia, no independiente)", () => {
    // Par +/− a 40 px lanzado contra la pared izquierda; la referencia usa el mismo esquema con dt = 1/4800.
    const s = crearSistema(700, 500);
    agregarCarga(s, "a", 1, 1, { posicion: { x: 60, y: 250 } });
    agregarCarga(s, "b", -1, 1, { posicion: { x: 100, y: 250 } });
    s.vx[0] = -25;
    s.vx[1] = -25;
    s.fuerzasValidas = false;
    let p = [[60, 250], [100, 250]];
    let v = [[-25, 0], [-25, 0]];
    const dt = 1 / 4800;
    const q = [1, -1];
    const acel = (pp: number[][]) =>
      pp.map((pi, i) => {
        const j = 1 - i;
        const dx = pi[0] - pp[j][0];
        const dy = pi[1] - pp[j][1];
        const r2 = dx * dx + dy * dy + SOFTENING2;
        const f = (K_VISUAL * q[i] * q[j]) / (r2 * Math.sqrt(r2));
        return [f * dx, f * dy];
      });
    // Velocity Verlet con dt/40 y reflexión especular con la corrección de impulso: es el integrador del repo
    // a paso finísimo, y sirve de referencia porque su error por rebote es (dt/40)² ≈ 0.
    for (let k = 0; k < Math.round(4 / dt); k++) {
      const a1 = acel(p);
      v = v.map((vi, i) => [vi[0] + (a1[i][0] * dt) / 2, vi[1] + (a1[i][1] * dt) / 2]);
      p = p.map((pi, i) => [pi[0] + v[i][0] * dt, pi[1] + v[i][1] * dt]);
      for (let i = 0; i < 2; i++) {
        if (p[i][0] < 14) {
          const d0 = Math.abs(p[i][0] - v[i][0] * dt - 14);
          const ex = 14 - p[i][0];
          const f = Math.min(1, d0 / (d0 + ex));
          p[i][0] = 28 - p[i][0];
          v[i][0] = -v[i][0] + a1[i][0] * dt * (1 - 2 * f);
        }
      }
      const a2 = acel(p);
      v = v.map((vi, i) => [vi[0] + (a2[i][0] * dt) / 2, vi[1] + (a2[i][1] * dt) / 2]);
    }
    for (let i = 0; i < Math.round(4 / DT_SUB); i++) pasoAvance(s, DT_SUB);
    for (let i = 0; i < 2; i++) {
      expect(Math.hypot(s.x[i] - p[i][0], s.y[i] - p[i][1])).toBeLessThan(0.05);
    }
  });
});

describe("A6 dilatación temporal ≡ K×σ²", () => {
  const QS = [1, 1, -1, -1];
  const POS: Punto[] = [
    { x: 0, y: 0 },
    { x: 90, y: 10 },
    { x: 45, y: 80 },
    { x: -40, y: 60 },
  ];

  function correr(k: number, pasos: number, dt: number): SistemaDinamico {
    const s = crearSistema(1e6, 1e6, { k });
    inicializarSistema(
      s,
      QS.map((q, i) => ({ id: `d-${i}`, q, masa: 1 })),
      { rng: mulberry32(1) },
    );
    colocar(s, POS.map((p) => ({ x: p.x + 1000, y: p.y + 1000 })));
    for (let i = 0; i < pasos; i++) pasoVerlet(s, dt);
    return s;
  }

  it("A6: σ = 8 con 1200 pasos de DT_SUB ≡ k = 64·K con 1200 pasos de DT_SUB/8", () => {
    const sigma = DILATACION_DINAMICA;
    const a = correr(K_VISUAL, 1200, DT_SUB);
    const b = correr(sigma * sigma * K_VISUAL, 1200, DT_SUB / sigma);
    for (let i = 0; i < QS.length; i++) {
      expect(Math.hypot(a.x[i] - b.x[i], a.y[i] - b.y[i])).toBeLessThanOrEqual(1e-9);
      expect(Math.hypot(sigma * a.vx[i] - b.vx[i], sigma * a.vy[i] - b.vy[i])).toBeLessThanOrEqual(1e-9);
    }
  });

  it("A6-b: contra k = 64·K con paso grueso (1/120 s de reloj, 150 pasos) difiere ≤ 0.1 px", () => {
    const a = correr(K_VISUAL, 1200, DT_SUB);
    const c = correr(64 * K_VISUAL, 150, 1 / 120);
    for (let i = 0; i < QS.length; i++) {
      expect(Math.hypot(a.x[i] - c.x[i], a.y[i] - c.y[i])).toBeLessThanOrEqual(0.1);
    }
  });
});

// ---------- A7: reloj ----------

describe("A7 planificarSubpasos (reloj)", () => {
  it("ticks exactos de 1/120 s: 8, 2 y 24 sub-pasos a 1×, 0.25× y 3×", () => {
    for (const [v, n] of [
      [1, 8],
      [0.25, 2],
      [3, 24],
    ]) {
      const r = planificarSubpasos(0, 1 / 120, v);
      expect(r.n).toBe(n);
      expect(r.acum).toBeCloseTo(0, 9);
    }
  });

  it("tick de 15.6 ms a 1×: 14 sub-pasos y el remanente se arrastra", () => {
    const r = planificarSubpasos(0, 0.0156, 1);
    expect(r.n).toBe(14);
    expect(r.acum).toBeCloseTo(0.008133, 5);
    const r2 = planificarSubpasos(0.002, 0.008, 1);
    expect(r2.n).toBe(7);
    expect(r2.acum).toBeCloseTo(0.007667, 5);
  });

  it("10 s de reloj con ticks irregulares (4–24 ms): error < 1 sub-paso", () => {
    const rng = mulberry32(9);
    for (const v of [1, 0.25, 3]) {
      let acum = 0;
      let n = 0;
      let t = 0;
      while (t < 10) {
        const dt = 0.004 + rng() * 0.02;
        const r = planificarSubpasos(acum, dt, v);
        acum = r.acum;
        n += r.n;
        t += dt;
      }
      expect(Math.abs(n * DT_SUB - DILATACION_DINAMICA * v * t)).toBeLessThan(DT_SUB);
    }
  });

  it("recorta pestañas dormidas, ignora dt negativo y limita los sub-pasos", () => {
    expect(planificarSubpasos(0, 2, 3).n).toBe(144); // 0.05 s · 8 · 3 / (1/120)
    expect(planificarSubpasos(0, -1, 1).n).toBe(0);
    const r = planificarSubpasos(0, 2, 3, { maxSub: 100 });
    expect(r.n).toBe(100);
    expect(r.acum).toBe(0);
    expect(MAX_SUBPASOS_POR_TICK).toBe(200);
  });

  it("los sub-pasos por segundo no dependen de la frecuencia del timer (~960/s a 1×)", () => {
    for (const dtTick of [0.004, 0.008, 0.0156, 0.033]) {
      let acum = 0;
      let n = 0;
      const ticks = Math.round(10 / dtTick);
      for (let i = 0; i < ticks; i++) {
        const r = planificarSubpasos(acum, dtTick, 1);
        acum = r.acum;
        n += r.n;
      }
      expect(n / (ticks * dtTick)).toBeGreaterThan(960 * 0.99);
      expect(n / (ticks * dtTick)).toBeLessThan(960 * 1.01);
    }
  });
});

// ---------- A8: colocación inicial ----------

describe("A8 colocarInicial", () => {
  const minPar = (p: Punto[]) => {
    let m = Infinity;
    for (let i = 0; i < p.length; i++) for (let j = i + 1; j < p.length; j++) m = Math.min(m, Math.hypot(p[i].x - p[j].x, p[i].y - p[j].y));
    return m;
  };

  it("n ∈ {2, 4, 10, 30}, 200 semillas: separación ≥ 60, dentro de márgenes y vecina ≤ 250", () => {
    for (const n of [2, 4, 10, 30]) {
      for (let semilla = 1; semilla <= 200; semilla++) {
        const p = colocarInicial(n, 700, 500, [], { rng: mulberry32(semilla) });
        expect(p).toHaveLength(n);
        expect(minPar(p)).toBeGreaterThanOrEqual(60 - 1e-9);
        for (let k = 0; k < n; k++) {
          expect(p[k].x).toBeGreaterThanOrEqual(60);
          expect(p[k].x).toBeLessThanOrEqual(640);
          expect(p[k].y).toBeGreaterThanOrEqual(60);
          expect(p[k].y).toBeLessThanOrEqual(440);
          if (k > 0) {
            let d = Infinity;
            for (let j = 0; j < k; j++) d = Math.min(d, Math.hypot(p[k].x - p[j].x, p[k].y - p[j].y));
            expect(d).toBeLessThanOrEqual(250);
          }
        }
      }
    }
  });

  it("con 4 existentes en las esquinas: la nueva queda entre 60 y 250 px de la más cercana", () => {
    const esquinas: Punto[] = [
      { x: 60, y: 60 },
      { x: 640, y: 60 },
      { x: 60, y: 440 },
      { x: 640, y: 440 },
    ];
    for (let semilla = 1; semilla <= 200; semilla++) {
      const [p] = colocarInicial(1, 700, 500, esquinas, { rng: mulberry32(semilla) });
      const d = Math.min(...esquinas.map((e) => Math.hypot(p.x - e.x, p.y - e.y)));
      expect(d).toBeGreaterThanOrEqual(60 - 1e-9);
      expect(d).toBeLessThanOrEqual(250);
    }
  });

  it("es determinista y dMax = Infinity solo impone dMin", () => {
    const a = colocarInicial(6, 700, 500, [], { rng: mulberry32(3) });
    const b = colocarInicial(6, 700, 500, [], { rng: mulberry32(3) });
    expect(a).toEqual(b);
    for (let semilla = 1; semilla <= 100; semilla++) {
      const p = colocarInicial(2, 700, 500, [], { rng: mulberry32(semilla), dMax: Infinity });
      expect(minPar(p)).toBeGreaterThanOrEqual(60 - 1e-9);
    }
  });

  it("canvas saturado (96 puntos de rejilla): no se cuelga y devuelve una posición dentro de márgenes", () => {
    const rejilla96: Punto[] = [];
    for (let j = 0; j < 8; j++) for (let i = 0; i < 12; i++) rejilla96.push({ x: 60 + 52 * i, y: 60 + 52 * j });
    const [p] = colocarInicial(1, 700, 500, rejilla96, { rng: mulberry32(1) });
    expect(p.x).toBeGreaterThanOrEqual(60);
    expect(p.x).toBeLessThanOrEqual(640);
    expect(p.y).toBeGreaterThanOrEqual(60);
    expect(p.y).toBeLessThanOrEqual(440);
    const d = Math.min(...rejilla96.map((e) => Math.hypot(p.x - e.x, p.y - e.y)));
    expect(d).toBeGreaterThan(20); // el respaldo elige la mejor candidata, no una superpuesta
  });

  it("A9: la colocación de 30 cargas es rápida", () => {
    const t0 = performance.now();
    for (let semilla = 1; semilla <= 50; semilla++) colocarInicial(30, 700, 500, [], { rng: mulberry32(semilla) });
    expect(performance.now() - t0).toBeLessThan(2000);
  });
});

// ---------- E1: energías ----------

describe("E1 energías exactas", () => {
  it("par +1/+1 en reposo a 100 px: K = 0, U = 5000/√10100, escala = U", () => {
    const s = cajaAbierta([1, 1], [{ x: 0, y: 0 }, { x: 100, y: 0 }]);
    const e = energias(s);
    expect(e.cinetica).toBe(0);
    expect(e.potencial).toBeCloseTo(49.75186, 4);
    expect(e.escala).toBeCloseTo(e.potencial, 12);
    expect(energiaSimAJ(e.potencial, K_VISUAL)).toBeCloseTo(0.44715, 4);
  });

  it("K de una carga con m = 1 y v = (3, 4) es 12.5; con m = 2, 25", () => {
    const s = crearSistema(700, 500);
    agregarCarga(s, "a", 1, 1, { posicion: { x: 300, y: 250 } });
    s.vx[0] = 3;
    s.vy[0] = 4;
    expect(energias(s).cinetica).toBeCloseTo(12.5, 12);
    const t = crearSistema(700, 500);
    agregarCarga(t, "a", 1, 2, { posicion: { x: 300, y: 250 } });
    t.vx[0] = 3;
    t.vy[0] = 4;
    expect(energias(t).cinetica).toBeCloseTo(25, 12);
  });

  it("rejilla REJ: U = −94.2428…, K = 0, E = U, escala = 194.12", () => {
    const e = energias(rejilla());
    expect(e.cinetica).toBe(0);
    expect(e.potencial).toBeCloseTo(-94.2428, 3);
    expect(e.total).toBe(e.potencial);
    expect(e.escala).toBeCloseTo(194.12, 2);
  });
});

// ---------- E4-E6: deriva, intervenir, ancla ----------

describe("E4 derivaNormalizada", () => {
  it("(a) es 0 justo después de intervenir", () => {
    const s = escenario([1, 1, -1, -1], 4);
    avanzarReloj(s, 2, 1);
    intervenir(s, () => {
      s.x[0] += 30;
    });
    expect(derivaNormalizada(s)).toBeLessThanOrEqual(1e-12);
  });

  it("(b) 4 cargas +,+,−,−, 30 s a 3×, semillas 1..10: ≤ 0.5 % con paredes", () => {
    let max = 0;
    for (let k = 1; k <= 10; k++) max = Math.max(max, derivaMax(escenario([1, 1, -1, -1], k), 30, 3));
    expect(max).toBeLessThanOrEqual(0.005);
  });

  it("(c) regresión E₀ ≈ 0: la métrica normalizada es estable y la antigua explota", () => {
    const u = 5000 / Math.sqrt(100 ** 2 + 100);
    const v = Math.sqrt(49.75186); // K = |U|: E₀ ≈ 0
    expect(u).toBeCloseTo(49.75186, 4);
    const s = cajaAbierta([1, -1], [{ x: 0, y: 0 }, { x: 100, y: 0 }], [{ x: 0, y: v }, { x: 0, y: -v }]);
    const e0 = energias(s).total;
    expect(Math.abs(e0)).toBeLessThan(1e-4);
    let maxNorm = 0;
    let maxAntigua = 0;
    for (let i = 0; i < 5000; i++) {
      pasoVerlet(s, DT_SUB);
      maxNorm = Math.max(maxNorm, derivaNormalizada(s));
      maxAntigua = Math.max(maxAntigua, Math.abs(energias(s).total - e0) / Math.abs(e0));
    }
    expect(maxNorm).toBeLessThanOrEqual(1e-3);
    expect(maxAntigua).toBeGreaterThan(1); // documenta el defecto de |E − E₀|/|E₀|
  });

  it("(d) sin cargas o con una sola en reposo: 0 y sin NaN", () => {
    const vacio = crearSistema(700, 500);
    expect(derivaNormalizada(vacio)).toBe(0);
    const una = crearSistema(700, 500);
    agregarCarga(una, "a", 1, 1, { posicion: { x: 300, y: 250 } });
    expect(derivaNormalizada(una)).toBe(0);
    expect(Number.isNaN(derivaNormalizada(una))).toBe(false);
  });
});

describe("E5 intervenir y trabajo externo (sobre REJ)", () => {
  it("mover una carga con velocidad: ΔE = ΔU − K (la velocidad se anula)", () => {
    const s = rejilla();
    s.vx[0] = 5; // K₀ = 12.5
    const k0 = energias(s).cinetica;
    expect(k0).toBeCloseTo(12.5, 12);
    const w0 = s.trabajoExterno;
    expect(moverCarga(s, "d-0", 350, 250)).toBe(true);
    expect(s.x[0]).toBe(350);
    expect(s.y[0]).toBe(250);
    expect(s.vx[0]).toBe(0);
    expect(s.trabajoExterno - w0).toBeCloseTo(2.577863 - k0, 5);
    expect(derivaNormalizada(s)).toBe(0);
    expect(s.fuerzasValidas).toBe(false);
  });

  it("mover d-0 desde el reposo: ΔE = +2.577863 (±1e-6)", () => {
    const s = rejilla();
    moverCarga(s, "d-0", 350, 250);
    expect(s.trabajoExterno).toBeCloseTo(2.577863, 5);
    expect(derivaNormalizada(s)).toBe(0);
  });

  it("agregar +2 en (350, 150): ΔE = +67.40441 (±1e-5) = 2·V", () => {
    const s = rejilla();
    expect(agregarCarga(s, "nueva", 2, 1, { posicion: { x: 350, y: 150 } })).toBe(true);
    expect(s.trabajoExterno).toBeCloseTo(67.40441, 4);
    expect(s.trabajoExterno).toBeCloseTo(2 * potencialEnCarga(s, 4), 9);
    expect(s.fuerzasValidas).toBe(false);
  });

  it("quitar d-3: ΔE = +47.121404 (±1e-6)", () => {
    const s = rejilla();
    expect(quitarCarga(s, "d-3")).toBe(true);
    expect(s.trabajoExterno).toBeCloseTo(47.121404, 5);
    expect(s.ids).toEqual(["d-0", "d-1", "d-2"]);
    expect(quitarCarga(s, "no-existe")).toBe(false);
  });

  it("soltar d-1 con v_sim = (3, 4): ΔE = +12.5 exacto y posición inalterada", () => {
    const s = rejilla();
    agarrarCarga(s, "d-1");
    const w0 = s.trabajoExterno;
    expect(soltarCarga(s, "d-1", 3, 4)).toBe(true);
    expect(s.trabajoExterno - w0).toBeCloseTo(12.5, 12);
    expect(s.x[1]).toBe(450);
    expect(s.y[1]).toBe(200);
    expect(s.anclada[1]).toBe(false);
  });

  it("C16: cambiar d-0 de 1 a 3: ΔE = −94.2428, posiciones/velocidades/masas idénticas, deriva 0", () => {
    const s = rejilla();
    const antes = { x: [...s.x], y: [...s.y], vx: [...s.vx], vy: [...s.vy], masa: [...s.masa] };
    const v0 = potencialEnCarga(s, 0);
    const eAntes = energias(s).total;
    expect(aplicarCambioCarga(s, "d-0", 3)).toBe(true);
    expect(s.q[0]).toBe(3);
    const dE = energias(s).total - eAntes;
    expect(Math.abs(dE - 2 * v0) / Math.abs(2 * v0)).toBeLessThan(1e-9);
    expect(dE).toBeCloseTo(-94.2428, 3);
    expect(s.trabajoExterno).toBeCloseTo(dE, 12);
    expect({ x: s.x, y: s.y, vx: s.vx, vy: s.vy, masa: s.masa }).toEqual(antes);
    expect(derivaNormalizada(s)).toBe(0);
  });

  it("C17: q = 0, NaN, signo opuesto o id inexistente no modifican nada; 7 → 5 y 1.3 → 1.5", () => {
    const s = rejilla();
    const antes = instantanea(s);
    expect(aplicarCambioCarga(s, "d-0", 0)).toBe(false);
    expect(aplicarCambioCarga(s, "d-0", NaN)).toBe(false);
    expect(aplicarCambioCarga(s, "d-0", -1)).toBe(false);
    expect(aplicarCambioCarga(s, "d-2", 1)).toBe(false);
    expect(aplicarCambioCarga(s, "nadie", 2)).toBe(false);
    expect(instantanea(s)).toBe(antes);
    expect(aplicarCambioCarga(s, "d-0", 7)).toBe(true);
    expect(s.q[0]).toBe(5);
    expect(aplicarCambioCarga(s, "d-1", 1.3)).toBe(true);
    expect(s.q[1]).toBe(1.5);
  });

  it("C19: masa fija = 1 y la fuerza sobre la carga cambia por q'/q en el paso siguiente", () => {
    const s = rejilla();
    calcularFuerzas(s);
    const f1 = Math.hypot(s.fx[0], s.fy[0]);
    aplicarCambioCarga(s, "d-0", 3);
    calcularFuerzas(s);
    const f2 = Math.hypot(s.fx[0], s.fy[0]);
    expect(f2 / f1).toBeCloseTo(3, 12);
    expect(s.masa).toEqual([1, 1, 1, 1]);
  });

  it("todo mutador invalida las fuerzas cacheadas (FSAL)", () => {
    const mutadores: Array<(s: SistemaDinamico) => void> = [
      (s) => moverCarga(s, "d-0", 300, 250),
      (s) => agarrarCarga(s, "d-0"),
      (s) => soltarCarga(s, "d-0", 1, 1),
      (s) => aplicarCambioCarga(s, "d-0", 2),
      (s) => agregarCarga(s, "x", 1, 1, { posicion: { x: 100, y: 100 } }),
      (s) => quitarCarga(s, "d-0"),
    ];
    for (const mutar of mutadores) {
      const s = rejilla();
      calcularFuerzas(s);
      expect(s.fuerzasValidas).toBe(true);
      mutar(s);
      expect(s.fuerzasValidas).toBe(false);
    }
  });

  it("el error de un paso sin invalidar es del orden de 1e-5 px (por qué hace falta)", () => {
    const a = crearSistema(1e6, 1e6);
    agregarCarga(a, "a", 1, 1, { posicion: { x: 5e5, y: 5e5 } });
    agregarCarga(a, "b", -1, 1, { posicion: { x: 5e5 + 100, y: 5e5 } });
    calcularFuerzas(a);
    a.q[1] = -3; // cambio SIN pasar por intervenir: la fuerza cacheada es la vieja
    const b = structuredClone(a);
    b.fuerzasValidas = false;
    pasoVerlet(a, DT_SUB);
    pasoVerlet(b, DT_SUB);
    expect(Math.abs(a.x[1] - b.x[1])).toBeGreaterThan(1e-6);
    expect(Math.abs(a.vx[1] - b.vx[1])).toBeGreaterThan(1e-4);
  });

  it("agregar rechaza q = 0 / NaN e ids repetidos; normaliza q", () => {
    const s = rejilla();
    expect(agregarCarga(s, "z", 0)).toBe(false);
    expect(agregarCarga(s, "z", NaN)).toBe(false);
    expect(agregarCarga(s, "d-0", 1)).toBe(false);
    expect(s.ids).toHaveLength(4);
    expect(agregarCarga(s, "z", 9, 1, { rng: mulberry32(2) })).toBe(true);
    expect(s.q[4]).toBe(5);
  });
});

describe("E6 carga anclada", () => {
  it("no se mueve ni cambia v, sigue ejerciendo fuerza y el resto conserva la energía", () => {
    const s = cajaAbierta(
      [1, 1, -1, -1],
      [
        { x: 0, y: 0 },
        { x: 200, y: 0 },
        { x: 0, y: 100 },
        { x: 200, y: 100 },
      ],
    );
    agarrarCarga(s, "d-0");
    expect(s.anclada[0]).toBe(true);
    expect(s.vx[0]).toBe(0);
    const x0 = s.x[0];
    const y0 = s.y[0];
    // El resto acelera por la fuerza de la anclada (si no ejerciera fuerza, d-1 no se movería).
    const e = s.energiaInicial;
    let sx = 0;
    let sy = 0;
    let max = 0;
    for (let i = 0; i < 5000; i++) {
      pasoVerlet(s, DT_SUB);
      max = Math.max(max, derivaNormalizada(s));
    }
    for (let j = 0; j < 4; j++) {
      sx += s.fx[j];
      sy += s.fy[j];
    }
    expect(s.x[0]).toBe(x0);
    expect(s.y[0]).toBe(y0);
    expect(s.vx[0]).toBe(0);
    expect(s.vy[0]).toBe(0);
    expect(Math.hypot(sx, sy)).toBeLessThanOrEqual(1e-9);
    expect(max).toBeLessThanOrEqual(1e-3);
    expect(s.x[1]).not.toBe(200 + 5e5);
    expect(Number.isFinite(e)).toBe(true);
  });

  it("sostenida sin moverla, no se va aunque haya otras cerca", () => {
    const s = escenario([1, 1, -1, -1], 2);
    const ini = { x: s.x[1], y: s.y[1] };
    agarrarCarga(s, "d-1");
    avanzarReloj(s, 3, 1);
    expect(s.x[1]).toBe(ini.x);
    expect(s.y[1]).toBe(ini.y);
  });
});

// ---------- E7: sesión con todas las intervenciones ----------

describe("E7 sesión con todas las intervenciones", () => {
  it("|E − E₀ − W_ext|/escala ≤ 1e-3 y la deriva normalizada ≤ 1e-3 (semillas 1..3)", () => {
    for (let semilla = 1; semilla <= 3; semilla++) {
      const s = escenario([1, 1, -1, -1], semilla);
      const e0 = s.energiaInicial;
      avanzarReloj(s, 3, 1);
      moverCarga(s, "d-0", 350, 250);
      avanzarReloj(s, 3, 1);
      // Arrastre de d-1 con el puntero: agarrar, 30 muestras de (5, 3) px cada 1/60 s y soltar a (180, −90) px/s.
      agarrarCarga(s, "d-1");
      let px = s.x[1];
      let py = s.y[1];
      for (let i = 0; i < 30; i++) {
        px = Math.min(680, px + 5);
        py = Math.min(480, py + 3);
        moverCarga(s, "d-1", px, py);
        avanzarReloj(s, 1 / 60, 1);
      }
      soltarConVelocidadPuntero(s, "d-1", 180, -90);
      avanzarReloj(s, 3, 1);
      agregarCarga(s, "extra", 2, 1, { rng: mulberry32(100 + semilla) });
      avanzarReloj(s, 3, 1);
      aplicarCambioCarga(s, "d-0", 3);
      avanzarReloj(s, 3, 1);
      quitarCarga(s, "d-3");
      avanzarReloj(s, 3, 3);
      const e = energias(s);
      expect(Math.abs(e.total - e0 - s.trabajoExterno) / e.escala).toBeLessThanOrEqual(1e-3);
      expect(derivaNormalizada(s)).toBeLessThanOrEqual(1e-3);
    }
  });
});

// ---------- E8-E9: visualización y aviso ----------

describe("E8 visualización", () => {
  it("valorEnergiaMostrable anula el ruido y lo que está por debajo del umbral", () => {
    expect(valorEnergiaMostrable(1e-12, 100, 1e-9)).toBe(0);
    expect(valorEnergiaMostrable(5, 1000, 5e-3)).toBe(0);
    expect(valorEnergiaMostrable(6, 1000, 5e-3)).toBe(6);
  });

  it("los julios se escriben con formatSI", () => {
    expect(formatSI(energiaSimAJ(-94.2428, K_VISUAL), "J")).toBe("−847 mJ");
    expect(formatSI(energiaSimAJ(2.55, K_VISUAL), "J")).toBe("22.9 mJ");
  });
});

describe("E9 aviso de deriva con histéresis", () => {
  it("dispara una vez por episodio: índices 2 y 6", () => {
    const derivas = [0.02, 0.05, 0.09, 0.1, 0.06, 0.03, 0.09];
    let estado = { armado: true };
    const disparos: number[] = [];
    derivas.forEach((d, i) => {
      const r = evaluarAviso(estado, d);
      estado = { armado: r.armado };
      if (r.disparar) disparos.push(i);
    });
    expect(disparos).toEqual([2, 6]);
  });

  it("una intervención rearma (el llamador pone armado = true)", () => {
    let estado = { armado: true };
    let r = evaluarAviso(estado, 0.1);
    expect(r.disparar).toBe(true);
    estado = { armado: r.armado };
    r = evaluarAviso(estado, 0.1);
    expect(r.disparar).toBe(false);
    estado = { armado: true }; // intervención
    expect(evaluarAviso(estado, 0.1).disparar).toBe(true);
  });
});

// ---------- P3-P4: empujón en el motor ----------

describe("P3 soltar con la velocidad del puntero (v_sim = v_p/σ, sin dividir por el deslizador)", () => {
  it("|v_sim| = min(|v_p|, 250)/σ, energía de referencia recalibrada y W_ext = ½ m |v|²", () => {
    for (const [vx, vy] of [
      [100, 0],
      [300, 400],
      [1200, 0],
      [-120, 90],
    ]) {
      const s = rejilla();
      agarrarCarga(s, "d-1");
      const w0 = s.trabajoExterno;
      soltarConVelocidadPuntero(s, "d-1", vx, vy);
      const v = Math.hypot(s.vx[1], s.vy[1]);
      expect(v).toBeCloseTo(Math.min(Math.hypot(vx, vy), 250) / DILATACION_DINAMICA, 9);
      expect(s.trabajoExterno - w0).toBeCloseTo(0.5 * v * v, 9);
      expect(derivaNormalizada(s)).toBe(0);
      expect(s.anclada[1]).toBe(false);
    }
  });

  it("la zona muerta suelta en reposo", () => {
    const s = rejilla();
    agarrarCarga(s, "d-1");
    soltarConVelocidadPuntero(s, "d-1", 3, 4);
    expect(s.vx[1]).toBe(0);
    expect(s.vy[1]).toBe(0);
  });
});

describe("P4 lanzamiento contra otra carga del mismo signo", () => {
  function distanciaMinima(vSim: number): { min: number; deriva: number } {
    const s = cajaAbierta([1, 1], [{ x: 0, y: 0 }, { x: 300, y: 0 }], [{ x: vSim, y: 0 }, { x: 0, y: 0 }]);
    let min = Infinity;
    let deriva = 0;
    for (let i = 0; i < 6000; i++) {
      pasoVerlet(s, DT_SUB);
      min = Math.min(min, Math.hypot(s.x[0] - s.x[1], s.y[0] - s.y[1]));
      deriva = Math.max(deriva, derivaNormalizada(s));
    }
    return { min, deriva };
  }

  it("empujón máximo a 1× (31.25 px/s de simulación): se detiene a ≈ 16.4 px", () => {
    const r = distanciaMinima(31.25);
    expect(Math.abs(r.min - 16.4)).toBeLessThanOrEqual(1);
    expect(r.deriva).toBeLessThanOrEqual(1e-3);
  });

  it("con v_sim = 10.4167 (empujón a 3× en la spec anterior): ≈ 113.8 px", () => {
    const r = distanciaMinima(10.4167);
    expect(Math.abs(r.min - 113.8)).toBeLessThanOrEqual(2);
    expect(r.deriva).toBeLessThanOrEqual(1e-3);
  });
});

// ---------- C20 ----------

describe("C20 magnitud pequeña sigue siendo visible", () => {
  it("4 cargas de 0.5 µC en el rectángulo de 200×100 px: ≥ 28 px de desplazamiento medio a los 3 s", () => {
    const s = crearSistema(700, 500);
    const pos = [
      { x: 250, y: 200 },
      { x: 450, y: 200 },
      { x: 250, y: 300 },
      { x: 450, y: 300 },
    ];
    pos.forEach((p, i) => agregarCarga(s, `d-${i}`, 0.5, 1, { posicion: p }));
    avanzarReloj(s, 3, 1);
    expect(desplMedio(s, pos)).toBeGreaterThanOrEqual(28);
  });
});

// ---------- A9 ----------

describe("A9 coste", () => {
  it("30 cargas: un sub-paso cuesta unos pocos µs (30 s a 3× en < 10 s de CPU)", () => {
    const qs = [...new Array<number>(15).fill(1), ...new Array<number>(15).fill(-1)];
    const s = escenario(qs, 1);
    const t0 = performance.now();
    avanzarReloj(s, 30, 3);
    expect(performance.now() - t0).toBeLessThan(10_000);
  });
});
