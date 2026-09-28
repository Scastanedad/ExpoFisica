import { describe, expect, test } from "vitest";
import { campoEn, type PuntoCarga } from "./coulomb";
import {
  energiaMecanicaDipoloSim,
  estadoInicialDipolo,
  fuerzaYTorqueDipolo,
  momentoDipolarSim,
  pasoAvanceDipolo,
  type ParametrosDipolo,
} from "./dipolo";

function anguloVector(x: number, y: number): number {
  return Math.atan2(y, x);
}

describe("dipolo: campo uniforme (D1, D2, D8)", () => {
  const externoSim: readonly [number, number] = [0.02, -0.015];

  test("D1: fuerza neta nula en campo uniforme, cualquier ángulo y d", () => {
    for (const theta of [0, 0.3, Math.PI / 2, 2.1, Math.PI, 4.5, 2 * Math.PI - 0.1]) {
      for (const d of [10, 30, 60, 100]) {
        const estado = estadoInicialDipolo(300, 250, theta);
        const ft = fuerzaYTorqueDipolo(estado, 2, d, [], externoSim);
        expect(Math.hypot(ft.fx, ft.fy)).toBeLessThan(1e-12);
      }
    }
  });

  test("D2: torque exacto τ = p×E0 = p|E0|sin(θ_E0 - θ)", () => {
    const e0Mag = Math.hypot(externoSim[0], externoSim[1]);
    const thetaE0 = anguloVector(externoSim[0], externoSim[1]);
    for (const theta of [0, 0.3, Math.PI / 2, 2.1, Math.PI, 4.5]) {
      for (const d of [10, 50, 100]) {
        for (const q of [0.5, 3, 5]) {
          const estado = estadoInicialDipolo(300, 250, theta);
          const ft = fuerzaYTorqueDipolo(estado, q, d, [], externoSim);
          const p = q * d;
          const esperado = p * e0Mag * Math.sin(thetaE0 - theta);
          expect(Math.abs(ft.torque - esperado)).toBeLessThan(1e-9);
        }
      }
    }
  });

  test("D8: F+ = -F- exacto en campo uniforme", () => {
    const estado = estadoInicialDipolo(300, 250, 0.7);
    const ft = fuerzaYTorqueDipolo(estado, 2, 50, [], externoSim);
    expect(ft.fMasX).toBeCloseTo(-ft.fMenosX, 12);
    expect(ft.fMasY).toBeCloseTo(-ft.fMenosY, 12);
  });

  test("D8 (continuación): F+ y F- NO son opuestas en general con una carga puntual", () => {
    const fuente: PuntoCarga = { x: 300, y: 100, q: 5 };
    const estado = estadoInicialDipolo(300, 300, 0.7);
    const ft = fuerzaYTorqueDipolo(estado, 2, 50, [fuente], null);
    const sumaX = ft.fMasX + ft.fMenosX;
    const sumaY = ft.fMasY + ft.fMenosY;
    expect(Math.hypot(sumaX, sumaY)).toBeGreaterThan(1e-6);
  });
});

describe("dipolo: conservación de energía (D3, D4)", () => {
  test("D3: sin amortiguar, deriva relativa de energía ≤ 0.5% en 60s (~6 periodos)", () => {
    const params: ParametrosDipolo = {
      q: 1,
      d: 50,
      modoCampo: "uniforme",
      externoSim: [0, 0.02],
      cargaFuente: null,
      zeta: 0,
    };
    let estado = estadoInicialDipolo(350, 250, 1.3);
    const e0 = energiaMecanicaDipoloSim(estado, params);
    const dt = 1 / 60;
    let t = 0;
    while (t < 60) {
      estado = pasoAvanceDipolo(estado, params, dt);
      t += dt;
    }
    const e1 = energiaMecanicaDipoloSim(estado, params);
    const escala = Math.max(1e-9, Math.abs(e0));
    const deriva = Math.abs(e1 - e0) / escala;
    expect(deriva).toBeLessThan(0.005);
  });

  test("D4: con amortiguamiento (ζ=0.3), la energía nunca aumenta", () => {
    const params: ParametrosDipolo = {
      q: 1,
      d: 50,
      modoCampo: "uniforme",
      externoSim: [0, 0.02],
      cargaFuente: null,
      zeta: 0.3,
    };
    let estado = estadoInicialDipolo(350, 250, 1.3);
    let anterior = energiaMecanicaDipoloSim(estado, params);
    const dt = 1 / 60;
    for (let i = 0; i < 600; i++) {
      estado = pasoAvanceDipolo(estado, params, dt);
      const actual = energiaMecanicaDipoloSim(estado, params);
      expect(actual).toBeLessThanOrEqual(anterior + 1e-6);
      anterior = actual;
    }
  });
});

describe("dipolo: campo de una carga puntual (D5, D6, D7)", () => {
  test("D5: alineación y luego atracción monótona hacia mayor |E|", () => {
    const fuente: PuntoCarga = { x: 300, y: 100, q: 5 };
    const params: ParametrosDipolo = {
      q: 1,
      d: 40,
      modoCampo: "puntual",
      externoSim: null,
      cargaFuente: fuente,
      zeta: 0.3,
    };
    let estado = estadoInicialDipolo(fuente.x, fuente.y + 200, 0.2);
    const dt = 1 / 60;
    const distancias: number[] = [];
    let t = 0;
    while (t < 20) {
      estado = pasoAvanceDipolo(estado, params, dt);
      t += dt;
      distancias.push(Math.hypot(estado.cx - fuente.x, estado.cy - fuente.y));
    }
    // Ventana de al menos 15s tras la alineación (spec D5): usa los últimos 15s de los 20s simulados.
    const ventana = distancias.slice(Math.floor((t - 15) / dt));
    for (let i = 1; i < ventana.length; i++) {
      expect(ventana[i]).toBeLessThanOrEqual(ventana[i - 1] + 1e-6);
    }
  });

  test("D7: sin NaN/Infinity en 60s incluso muy cerca de la fuente", () => {
    const fuente: PuntoCarga = { x: 300, y: 250, q: 5 };
    const params: ParametrosDipolo = {
      q: 5,
      d: 100,
      modoCampo: "puntual",
      externoSim: null,
      cargaFuente: fuente,
      zeta: 0.3,
    };
    let estado = estadoInicialDipolo(fuente.x + 5, fuente.y + 5, 0.1);
    const dt = 1 / 60;
    for (let i = 0; i < 3600; i++) {
      estado = pasoAvanceDipolo(estado, params, dt);
      expect(Number.isFinite(estado.cx)).toBe(true);
      expect(Number.isFinite(estado.cy)).toBe(true);
      expect(Number.isFinite(estado.theta)).toBe(true);
      expect(Number.isFinite(estado.omega)).toBe(true);
    }
  });

  test("D6: converge al límite de dipolo puntual (p·∇)E al reducir d", () => {
    const fuente: PuntoCarga = { x: 300, y: 100, q: 5 };
    const q = 1;
    const theta = 1.2;
    const estado = estadoInicialDipolo(300, 300, theta);
    const h = 0.5;
    const errores: number[] = [];
    for (const d of [50, 20, 8, 2, 0.5]) {
      const ft = fuerzaYTorqueDipolo(estado, q, d, [fuente], null);
      const p = momentoDipolarSim(q, d, theta);
      const dExdx = (campoEn(estado.cx + h, estado.cy, [fuente])[0] - campoEn(estado.cx - h, estado.cy, [fuente])[0]) / (2 * h);
      const dEydx = (campoEn(estado.cx + h, estado.cy, [fuente])[1] - campoEn(estado.cx - h, estado.cy, [fuente])[1]) / (2 * h);
      const dExdy = (campoEn(estado.cx, estado.cy + h, [fuente])[0] - campoEn(estado.cx, estado.cy - h, [fuente])[0]) / (2 * h);
      const dEydy = (campoEn(estado.cx, estado.cy + h, [fuente])[1] - campoEn(estado.cx, estado.cy - h, [fuente])[1]) / (2 * h);
      const fxIdeal = p.px * dExdx + p.py * dExdy;
      const fyIdeal = p.px * dEydx + p.py * dEydy;
      const errorAbs = Math.hypot(ft.fx - fxIdeal, ft.fy - fyIdeal);
      const errorRel = errorAbs / Math.max(1e-12, Math.hypot(fxIdeal, fyIdeal));
      errores.push(errorRel);
    }
    for (let i = 1; i < errores.length; i++) {
      expect(errores[i]).toBeLessThan(errores[i - 1]);
    }
    expect(errores[errores.length - 1]).toBeLessThan(0.002);
  });
});
