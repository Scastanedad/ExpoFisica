/**
 * Consistencia «lo dibujado = lo calculado»: se dibuja cada escenario en un contexto que graba las órdenes y se
 * comprueba que los parches pintados, los signos, las cargas y los lotes de trazos corresponden a la física.
 */
import { describe, expect, it } from "vitest";
import { ESCENARIOS } from "../../fisica/gauss3d/escenarios";
import { crearCtxGrabador } from "./ctxFalso3d";
import { construirAristas, N_BANDAS_FLUJO, UMBRAL_NEUTRO, bandasDeParches } from "./geometria";
import { crearMotorGauss3D, type EntradaMotor } from "./motor";
import { generarMalla } from "../../fisica/gauss3d/mallas";
import { calcularFlujo } from "../../fisica/gauss3d/flujo";
import { NIVELES_GAUSS3D } from "../../fisica/gauss3d/constantes";
import type { Superficie } from "../../fisica/gauss3d/tipos";

const ROJO = "rgba(220, 38, 38";
const AZUL = "rgba(37, 99, 235";
const NEUTRO = "rgba(148, 163, 184";

function entrada(id: number, over: Partial<EntradaMotor> = {}): EntradaMotor {
  const d = ESCENARIOS[id - 1];
  return {
    escenario: { superficie: d.superficie, cargas: d.cargas, calidad: 1 },
    camara: { azimut: d.vista.azimut, inclinacion: d.vista.inclinacion, zoom: 1 },
    ancho: 970,
    alto: 547,
    dpr: 1,
    mostrar: { lineas: true, flujo: true, campo: id === 4 || id === 7 || id === 9 },
    opacidad: 1,
    unidad: 1,
    ...over,
  };
}

describe("lo dibujado = lo calculado", () => {
  for (const def of ESCENARIOS) {
    it(`escenario ${def.id} (${def.nombre}): Φ por parche suma el Φ esperado y el color sigue al signo`, () => {
      const motor = crearMotorGauss3D();
      const e = entrada(def.id);
      motor.actualizar(e);
      const g = motor.geometria()!;
      const f = g.flujo;
      let suma = 0;
      for (let p = 0; p < g.malla.nParches; p++) suma += f.porParche[p];
      const tol = def.superficie.tipo === "parche" ? 1e-3 : 1e-5;
      expect(Math.abs(suma - f.total)).toBeLessThan(1e-4 * Math.max(1, Math.abs(f.total)));
      expect(Math.abs(f.total - def.esperado.phi)).toBeLessThan(tol * Math.max(1, Math.abs(def.esperado.phi)));
      expect(motor.lectura()!.phi).toBe(f.total);

      let rojos = 0;
      let azules = 0;
      let neutros = 0;
      for (let p = 0; p < g.malla.nParches; p++) {
        const b = g.bandaParche[p];
        expect(Math.abs(b)).toBeLessThanOrEqual(N_BANDAS_FLUJO);
        if (b > 0) {
          expect(f.densidadParche[p]).toBeGreaterThan(0);
          rojos++;
        } else if (b < 0) {
          expect(f.densidadParche[p]).toBeLessThan(0);
          azules++;
        } else {
          expect(Math.abs(f.densidadParche[p])).toBeLessThan(UMBRAL_NEUTRO * f.maxAbsDensidad + 1e-9);
          neutros++;
        }
      }
      expect(rojos + azules + neutros).toBe(g.malla.nParches);
      // un parche con más |E_n| nunca tiene una banda menor que otro del mismo signo con menos
      for (let a = 0; a < g.malla.nParches; a += 7) {
        for (let b = 0; b < g.malla.nParches; b += 11) {
          const da = f.densidadParche[a];
          const db = f.densidadParche[b];
          if (da > 0 && db > 0 && da > db) expect(g.bandaParche[a]).toBeGreaterThanOrEqual(g.bandaParche[b]);
          if (da < 0 && db < 0 && da < db) expect(g.bandaParche[a]).toBeLessThanOrEqual(g.bandaParche[b]);
        }
      }

      // los triángulos rellenados en las dos pasadas de caras = todos los de la malla, por color
      const ctx = crearCtxGrabador();
      motor.dibujar(ctx, e);
      const nT = g.malla.triangulos.length / 3;
      let triRojo = 0;
      let triAzul = 0;
      let triNeutro = 0;
      for (const r of ctx.rellenos) {
        if (r.estilo.startsWith(ROJO)) triRojo += r.cerrados;
        else if (r.estilo.startsWith(AZUL)) triAzul += r.cerrados;
        else if (r.estilo.startsWith(NEUTRO)) triNeutro += r.cerrados;
      }
      expect(triRojo + triAzul + triNeutro).toBe(nT);
      let esperadoRojo = 0;
      let esperadoAzul = 0;
      for (let k = 0; k < nT; k++) {
        const b = g.bandaParche[g.malla.parcheDeTriangulo[k]];
        if (b > 0) esperadoRojo++;
        else if (b < 0) esperadoAzul++;
      }
      expect(triRojo).toBe(esperadoRojo);
      expect(triAzul).toBe(esperadoAzul);
      expect(ctx.anomalias).toEqual([]);
    });
  }

  it("cada carga se dibuja una vez, en su posición proyectada, con su etiqueta y signo", () => {
    const motor = crearMotorGauss3D();
    const e = entrada(7);
    motor.actualizar(e);
    const ctx = crearCtxGrabador();
    motor.dibujar(ctx, e);
    const p = motor.pasadas();
    const g = motor.geometria()!;
    expect(ctx.textos.filter((t) => t === "+" || t === "−").sort()).toEqual(["+", "−"]);
    expect(ctx.textos).toContain("+3 µC");
    expect(ctx.textos).toContain("−3 µC");
    for (let i = 0; i < g.cargas.length; i++) {
      const d = ctx.discos.filter((c) => Math.abs(c.x - p.qx[i]) < 1e-3 && Math.abs(c.y - p.qy[i]) < 1e-3);
      expect(d.length).toBe(3); // halo, contorno oscuro y disco (con aro)
    }
  });

  it("las líneas se trazan por lotes: un trazo por (pasada, banda), no por línea", () => {
    const motor = crearMotorGauss3D();
    const e = entrada(7);
    motor.actualizar(e);
    const ctx = crearCtxGrabador();
    motor.dibujar(ctx, e);
    const g = motor.geometria()!;
    expect(g.lineas.n).toBeGreaterThan(40);
    // suelo 2 + aristas ≤ 4 + líneas ≤ 8 + flechas de campo ≤ 6 + caídas ≤ 2 + sombras (2 por carga) + ejes 1
    expect(ctx.trazos.length).toBeLessThan(40);
    expect(ctx.trazos.length).toBeLessThan(g.lineas.n);
    const p = motor.pasadas();
    expect(p.lineas.n).toBeGreaterThan(g.lineas.n); // varios trozos por línea
    expect(ctx.llamadas["moveTo"]).toBeGreaterThan(p.lineas.n);
  });

  it("sin toggle de flujo todas las caras son neutras (el flujo se sigue calculando)", () => {
    const motor = crearMotorGauss3D();
    const e = entrada(7, { mostrar: { lineas: false, flujo: false, campo: false } });
    motor.actualizar(e);
    const ctx = crearCtxGrabador();
    motor.dibujar(ctx, e);
    const nT = motor.geometria()!.malla.triangulos.length / 3;
    let neutro = 0;
    for (const r of ctx.rellenos) {
      if (r.estilo.startsWith(ROJO) || r.estilo.startsWith(AZUL)) expect(r.cerrados).toBe(0);
      if (r.estilo.startsWith(NEUTRO)) neutro += r.cerrados;
    }
    expect(neutro).toBe(nT);
    expect(motor.lectura()!.nLineas).toBe(0);
    expect(Math.abs(motor.lectura()!.phi)).toBeLessThan(1e-9); // dipolo encerrado: Φ = 0
  });

  it("el escenario 1 con q = 5: Φ = 0.1594 (lo que se lee es lo calculado, no un conteo de líneas)", () => {
    const motor = crearMotorGauss3D();
    motor.actualizar(entrada(1));
    expect(motor.lectura()!.phi).toBeCloseTo(5 * 0.031884, 3);
    expect(motor.lectura()!.qEnc).toBe(0);
  });

  it("opacidad y toggle de flujo cambian solo el color: mismos triángulos y mismas posiciones", () => {
    const motor = crearMotorGauss3D();
    const a = entrada(2);
    motor.actualizar(a);
    const ctxA = crearCtxGrabador();
    motor.dibujar(ctxA, a);
    const b = entrada(2, { opacidad: 0.5 });
    expect(motor.actualizar(b)).toBe("camara");
    const ctxB = crearCtxGrabador();
    motor.dibujar(ctxB, b);
    const n = (c: typeof ctxA) => c.rellenos.reduce((s, r) => s + r.cerrados, 0);
    expect(n(ctxB)).toBe(n(ctxA));
    expect(ctxB.rellenos[0].estilo).not.toBe(ctxA.rellenos[0].estilo);
  });
});

describe("geometría cacheada", () => {
  it("saturación acotada: carga única centrada → todos los parches en la banda máxima; neutro si no hay flujo", () => {
    const sup: Superficie = { tipo: "esfera", radio: 5 };
    const malla = generarMalla(sup, NIVELES_GAUSS3D[1]);
    const f = calcularFlujo(malla, [{ x: 0, y: 0, z: 0, q: 3 }], sup);
    const bandas = bandasDeParches(f, malla.nParches);
    expect(Array.from(bandas).every((b) => b === N_BANDAS_FLUJO)).toBe(true);
    const f0 = calcularFlujo(malla, [{ x: 0, y: 0, z: 9, q: 0 }], sup);
    expect(Array.from(bandasDeParches(f0, malla.nParches)).every((b) => b === 0)).toBe(true);
  });

  it("aristas del cubo: bordes de cada cara + rejilla interior, y los bordes son «duros»", () => {
    const c = NIVELES_GAUSS3D[1].celdasCara;
    const malla = generarMalla({ tipo: "cubo", lado: 8 }, NIVELES_GAUSS3D[1]);
    const A = construirAristas(malla);
    expect(A.n).toBe(6 * 2 * c * (c + 1));
    let duras = 0;
    for (let i = 0; i < A.n; i++) duras += A.dura[i];
    expect(duras).toBe(6 * 4 * c);
  });

  it("aristas de la esfera: ninguna es dura (superficie cerrada y suave) y todas separan parches distintos", () => {
    const malla = generarMalla({ tipo: "esfera", radio: 5 }, NIVELES_GAUSS3D[1]);
    const A = construirAristas(malla);
    expect(A.n).toBeGreaterThan(malla.nParches);
    for (let i = 0; i < A.n; i++) {
      expect(A.dura[i]).toBe(0);
      expect(malla.parcheDeTriangulo[A.tri[2 * i]]).not.toBe(malla.parcheDeTriangulo[A.tri[2 * i + 1]]);
    }
  });
});

describe("motor: qué se recalcula", () => {
  it("la geometría solo se rehace al cambiar cargas/superficie; girar la cámara reutiliza la misma geometría", () => {
    const motor = crearMotorGauss3D();
    const e = entrada(7);
    expect(motor.actualizar(e)).toBe("geometria");
    const g1 = motor.geometria();
    expect(motor.actualizar(e)).toBe("igual");
    expect(motor.actualizar({ ...e, camara: { ...e.camara, azimut: 1.2 } })).toBe("camara");
    expect(motor.geometria()).toBe(g1);
    const movida = { ...e, escenario: { ...e.escenario, cargas: [{ ...ESCENARIOS[6].cargas[0], z: 1 }, ESCENARIOS[6].cargas[1]] } };
    expect(motor.actualizar(movida)).toBe("geometria");
    expect(motor.geometria()).not.toBe(g1);
  });
});
