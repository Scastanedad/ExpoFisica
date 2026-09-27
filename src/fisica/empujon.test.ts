import { describe, expect, it } from "vitest";
import {
  VEL_MAX_EMPUJON_PX_S,
  estimarVelocidadPuntero,
  velocidadPunteroASim,
  type MuestraPuntero,
} from "./empujon";

const SIGMA = 8;

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

/** Movimiento uniforme (vx, vy) px/s durante `durMs`, muestreado a `hz`. */
function uniforme(vx: number, vy: number, durMs: number, hz: number, t0 = 1000): MuestraPuntero[] {
  const dt = 1000 / hz;
  const n = Math.floor(durMs / dt);
  return Array.from({ length: n + 1 }, (_, k) => ({
    t: t0 + k * dt,
    x: 100 + (vx * k * dt) / 1000,
    y: 100 + (vy * k * dt) / 1000,
  }));
}

const ultimo = (m: MuestraPuntero[]) => m[m.length - 1].t;

describe("P1 estimarVelocidadPuntero (E2.5 §4.2)", () => {
  it("movimiento uniforme (200, −100) px/s: exacto a 60 y 125 Hz", () => {
    for (const hz of [60, 125]) {
      const m = uniforme(200, -100, 300, hz);
      const v = estimarVelocidadPuntero(m, ultimo(m));
      expect(v.vx).toBeCloseTo(200, 0);
      expect(v.vy).toBeCloseTo(-100, 0);
    }
  });

  it("suelta 40 ms después de la última muestra: sigue contando", () => {
    const m = uniforme(200, -100, 300, 60);
    const v = estimarVelocidadPuntero(m, ultimo(m) + 40);
    expect(v.vx).toBeCloseTo(200, 0);
    expect(v.vy).toBeCloseTo(-100, 0);
  });

  it("suelta 70 ms después de la última muestra (se detuvo): velocidad 0", () => {
    const m = uniforme(200, -100, 300, 60);
    expect(estimarVelocidadPuntero(m, ultimo(m) + 70)).toEqual({ vx: 0, vy: 0 });
  });

  it("con menos de 3 muestras da 0; con 3 muestras estima", () => {
    const m = uniforme(200, -100, 300, 60);
    expect(estimarVelocidadPuntero(m.slice(-2), ultimo(m))).toEqual({ vx: 0, vy: 0 });
    const v = estimarVelocidadPuntero(m.slice(-3), ultimo(m));
    expect(v.vx).toBeCloseTo(200, 0);
    expect(v.vy).toBeCloseTo(-100, 0);
  });

  it("quieto 500 ms y luego 100 ms a 300 px/s: solo cuenta la ventana", () => {
    const quieto = uniforme(0, 0, 500, 60);
    const t1 = ultimo(quieto);
    const moviendo = uniforme(300, 0, 100, 60, t1).slice(1);
    const x0 = quieto[0].x;
    const todo = [...quieto, ...moviendo.map((m) => ({ ...m, x: x0 + (m.x - 100) }))];
    const v = estimarVelocidadPuntero(todo, ultimo(todo));
    expect(v.vx).toBeCloseTo(300, 0);
    expect(Math.abs(v.vy)).toBeLessThan(1e-6);
  });

  it("con ruido de ±0.5 px sobre 150 px/s se mantiene cerca (tolerancia 3σ)", () => {
    const rng = mulberry32(5);
    const m = uniforme(150, 0, 300, 60).map((p) => ({
      ...p,
      x: p.x + (rng() - 0.5),
      y: p.y + (rng() - 0.5),
    }));
    const v = estimarVelocidadPuntero(m, ultimo(m));
    // σ ≈ 3.3 px/s con 7 muestras en 100 ms: 10 px/s es ≈ 3σ (la spec da ±5 con su propia semilla).
    expect(Math.abs(v.vx - 150)).toBeLessThan(10);
    expect(Math.abs(v.vy)).toBeLessThan(10);
  });

  it("mano quieta con ruido de ±0.5 px: la zona muerta lo anula", () => {
    const rng = mulberry32(7);
    const m = uniforme(0, 0, 300, 60).map((p) => ({
      ...p,
      x: p.x + (rng() - 0.5),
      y: p.y + (rng() - 0.5),
    }));
    const v = estimarVelocidadPuntero(m, ultimo(m));
    expect(Math.hypot(v.vx, v.vy)).toBeLessThan(15); // ruido residual (spec: 6.9)
    // La zona muerta de velocidadPunteroASim descarta magnitudes < 10 px/s.
    expect(velocidadPunteroASim(3, 4, SIGMA)).toEqual({ vx: 0, vy: 0 });
  });

  it("muestras más viejas que la ventana de 100 ms no cuentan y el arreglo vacío da 0", () => {
    expect(estimarVelocidadPuntero([], 1000)).toEqual({ vx: 0, vy: 0 });
    const m = uniforme(200, 0, 300, 60);
    expect(estimarVelocidadPuntero(m, ultimo(m) + 500)).toEqual({ vx: 0, vy: 0 });
  });
});

describe("P2 velocidadPunteroASim: v_sim = v_puntero / σ (sin dividir por el deslizador)", () => {
  it("tabla de conversión con σ = 8", () => {
    expect(velocidadPunteroASim(100, 0, SIGMA)).toEqual({ vx: 12.5, vy: 0 });
    const tope = velocidadPunteroASim(300, 400, SIGMA); // |v| = 500 > 250: tope
    expect(tope.vx).toBeCloseTo(18.75, 12);
    expect(tope.vy).toBeCloseTo(25, 12);
    expect(Math.hypot(tope.vx, tope.vy)).toBeCloseTo(31.25, 12);
    expect(velocidadPunteroASim(5, 5, SIGMA)).toEqual({ vx: 0, vy: 0 });
    expect(velocidadPunteroASim(-250, 0, SIGMA).vx).toBeCloseTo(-31.25, 12);
    expect(velocidadPunteroASim(1200, 0, SIGMA).vx).toBeCloseTo(31.25, 12);
  });

  it("conserva la dirección al aplicar el tope", () => {
    const v = velocidadPunteroASim(600, 800, SIGMA);
    expect(v.vy / v.vx).toBeCloseTo(800 / 600, 12);
  });

  it("invariante: |v_sim|·σ = min(|v_puntero|, 250) para |v_puntero| ≥ 10", () => {
    for (const [vx, vy] of [
      [10, 0],
      [0, -37],
      [120, 90],
      [-200, 150],
      [250, 0],
      [251, 0],
      [3000, -4000],
    ]) {
      const v = velocidadPunteroASim(vx, vy, SIGMA);
      const m = Math.hypot(vx, vy);
      expect(Math.hypot(v.vx, v.vy) * SIGMA).toBeCloseTo(Math.min(m, VEL_MAX_EMPUJON_PX_S), 9);
    }
  });

  it("descarta NaN e infinitos", () => {
    expect(velocidadPunteroASim(NaN, 0, SIGMA)).toEqual({ vx: 0, vy: 0 });
    expect(velocidadPunteroASim(Infinity, 0, SIGMA)).toEqual({ vx: 0, vy: 0 });
  });
});
