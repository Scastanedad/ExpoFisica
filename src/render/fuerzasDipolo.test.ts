import { describe, expect, test } from "vitest";
import type { ParametrosDipolo } from "../fisica/dipolo";
import { estadoInicialDipolo } from "../fisica/dipolo";
import { fuerzaYTorqueDipolo } from "../fisica/dipolo";
import { fuerzaParSI, factoresSim } from "../fisica/escala";
import { K_VISUAL } from "../fisica/coulomb";
import { fuerzasDipoloParaDibujar } from "./fuerzasDipolo";

const base: ParametrosDipolo = {
  q: 1,
  d: 50,
  modoCampo: "uniforme",
  externoSim: [0, 0.02],
  cargaFuente: null,
  zeta: 0,
};

describe("fuerzasDipoloParaDibujar", () => {
  test("campo uniforme: las dos fuerzas son iguales y opuestas (par de fuerzas)", () => {
    const { fuerzas } = fuerzasDipoloParaDibujar(estadoInicialDipolo(350, 250, 0.7), base);
    expect(fuerzas[0].modulo).toBeGreaterThan(0);
    expect(fuerzas[0].fx + fuerzas[1].fx).toBeCloseTo(0, 12);
    expect(fuerzas[0].fy + fuerzas[1].fy).toBeCloseTo(0, 12);
    expect(fuerzas[0].modulo).toBeCloseTo(fuerzas[1].modulo, 12);
  });

  test("convención de lectura: campo hacia abajo en pantalla empuja a +q hacia abajo (fy < 0, y arriba)", () => {
    // externoSim = [0, +0.02] en coordenadas de canvas (y abajo) = campo hacia abajo en pantalla.
    const { fuerzas } = fuerzasDipoloParaDibujar(estadoInicialDipolo(350, 250, 0), base);
    expect(fuerzas[0].fy).toBeLessThan(0); // +q: en el sentido del campo (abajo)
    expect(fuerzas[1].fy).toBeGreaterThan(0); // −q: en contra del campo (arriba)
  });

  test("puntos: +q y −q simétricos respecto al centro, con cargas +q y −q", () => {
    const { puntos } = fuerzasDipoloParaDibujar(estadoInicialDipolo(350, 250, 0), base);
    expect(puntos[0].q).toBe(1);
    expect(puntos[1].q).toBe(-1);
    expect(puntos[0].x).toBeCloseTo(375, 9);
    expect(puntos[1].x).toBeCloseTo(325, 9);
    expect(puntos[0].y).toBeCloseTo(250, 9);
  });

  test("carga puntual: no son opuestas y el extremo más cercano a la fuente siente más fuerza", () => {
    // Fuente +5 arriba; el dipolo apunta hacia abajo (+q lejos, −q cerca de la fuente).
    const params: ParametrosDipolo = {
      ...base,
      modoCampo: "puntual",
      externoSim: null,
      cargaFuente: { x: 300, y: 100, q: 5 },
    };
    const { fuerzas } = fuerzasDipoloParaDibujar(estadoInicialDipolo(300, 300, Math.PI / 2), params);
    expect(fuerzas[1].modulo).toBeGreaterThan(fuerzas[0].modulo);
    expect(fuerzas[1].fy).toBeGreaterThan(0); // −q es atraído hacia la fuente (arriba)
    expect(fuerzas[0].fy).toBeLessThan(0); // +q es repelido (abajo)
    // Sin campo externo: solo cuenta la fuente, y la suma es una atracción neta hacia ella.
    expect(fuerzas[0].fy + fuerzas[1].fy).toBeGreaterThan(0);
  });

  test("magnitud en N coherente con la ley de Coulomb exacta (diferencia solo por el suavizado)", () => {
    const params: ParametrosDipolo = {
      ...base,
      modoCampo: "puntual",
      externoSim: null,
      cargaFuente: { x: 300, y: 100, q: 5 },
    };
    // −q a 175 px de la fuente: el suavizado (100 px²) cambia |F| menos de 1 %.
    const { fuerzas } = fuerzasDipoloParaDibujar(estadoInicialDipolo(300, 300, Math.PI / 2), params);
    const exacta = Math.abs(fuerzaParSI(1, 5, 175));
    expect(Math.abs(fuerzas[1].modulo - exacta) / exacta).toBeLessThan(0.02);
  });

  test("modo uniforme ignora la carga fuente; modo puntual ignora el campo externo (misma lógica que pasoDipolo)", () => {
    const estado = estadoInicialDipolo(350, 250, 0.7);
    const fuente = { x: 300, y: 100, q: 5 };
    const a = fuerzasDipoloParaDibujar(estado, { ...base, cargaFuente: fuente });
    const b = fuerzasDipoloParaDibujar(estado, base);
    expect(a.fuerzas).toEqual(b.fuerzas);
    const c = fuerzasDipoloParaDibujar(estado, { ...base, modoCampo: "puntual", cargaFuente: fuente });
    const d = fuerzasDipoloParaDibujar(estado, { ...base, modoCampo: "puntual", externoSim: [0, 5], cargaFuente: fuente });
    expect(c.fuerzas).toEqual(d.fuerzas);
  });

  test("coincide con fuerzaYTorqueDipolo x factor N/u.sim (con inversión de eje y)", () => {
    const estado = estadoInicialDipolo(300, 300, 1.1);
    const params: ParametrosDipolo = { ...base, modoCampo: "puntual", externoSim: null, cargaFuente: { x: 300, y: 100, q: -3 } };
    const ft = fuerzaYTorqueDipolo(estado, params.q, params.d, [params.cargaFuente!], null, params.soft2);
    const f = factoresSim(K_VISUAL).fuerza;
    const { fuerzas } = fuerzasDipoloParaDibujar(estado, params);
    expect(fuerzas[0].fx).toBeCloseTo(ft.fMasX * f, 12);
    expect(fuerzas[0].fy).toBeCloseTo(-ft.fMasY * f, 12);
    expect(fuerzas[1].fx).toBeCloseTo(ft.fMenosX * f, 12);
    expect(fuerzas[1].fy).toBeCloseTo(-ft.fMenosY * f, 12);
  });
});
