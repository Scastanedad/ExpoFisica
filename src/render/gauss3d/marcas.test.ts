/**
 * Marcadores de cruce línea–superficie: relleno = sale, anillo = entra, con punta orientada según E; sin depender
 * del color, dentro de las 4 pasadas y ligados al toggle de líneas.
 */
import { describe, expect, it } from "vitest";
import { campoEn } from "../../fisica/gauss3d/campo3d";
import { crearSuperficie, distanciaConSigno, normalParche } from "../../fisica/gauss3d/superficies";
import type { Carga3D, Superficie, Vec3 } from "../../fisica/gauss3d/tipos";
import { ESCENARIOS } from "../../fisica/gauss3d/escenarios";
import { proyectarPunto } from "./camara";
import { RADIO_MARCA } from "./dibujarGauss3D";
import { crearCtxGrabador } from "./ctxFalso3d";
import { crearMotorGauss3D, type EntradaMotor } from "./motor";
import { PASADA_DELANTE, PASADA_DETRAS } from "./pasadas";

function entrada(id: number, over: Partial<EntradaMotor> = {}): EntradaMotor {
  const d = ESCENARIOS[id - 1];
  return {
    escenario: { superficie: d.superficie, cargas: d.cargas, calidad: 0 },
    camara: { azimut: d.vista.azimut, inclinacion: d.vista.inclinacion, zoom: 1 },
    ancho: 970,
    alto: 547,
    dpr: 1,
    mostrar: { lineas: true, flujo: true, campo: false },
    opacidad: 1,
    unidad: 1,
    ...over,
  };
}

describe("marcadores de cruce", () => {
  it("carga única dentro: todos los cruces SALEN y hay un marcador por cruce", () => {
    const motor = crearMotorGauss3D();
    motor.actualizar(entrada(2));
    const g = motor.geometria()!;
    const M = motor.pasadas().marcas;
    expect(g.cruces.salen).toBe(60);
    expect(M.n).toBe(g.cruces.n);
    for (let i = 0; i < M.n; i++) expect(M.sentido[i]).toBe(1);
  });

  it("dipolo: los marcadores de salen y entran coinciden con los cruces y son tantos como de los otros", () => {
    const motor = crearMotorGauss3D();
    motor.actualizar(entrada(7));
    const g = motor.geometria()!;
    const M = motor.pasadas().marcas;
    let s = 0;
    let e = 0;
    for (let i = 0; i < M.n; i++) { if (M.sentido[i] > 0) s++; else e++; }
    expect(s).toBe(g.cruces.salen);
    expect(e).toBe(g.cruces.entran);
    expect(s).toBeGreaterThan(5);
    expect(s).toBe(e);
  });

  it("cada marcador está en las pasadas 2 o 4 y su punta es unitaria y sigue el sentido de E (radial en carga centrada)", () => {
    const motor = crearMotorGauss3D();
    const e = entrada(2);
    motor.actualizar(e);
    const g = motor.geometria()!;
    const p = motor.pasadas();
    const cam = motor.camara();
    const M = p.marcas;
    const t = new Float32Array(8);
    let delante = 0;
    let detras = 0;
    for (let i = 0; i < M.n; i++) {
      expect([PASADA_DETRAS, PASADA_DELANTE]).toContain(M.pasada[i]);
      if (M.pasada[i] === PASADA_DELANTE) delante++;
      else detras++;
      const l = Math.hypot(M.dx[i], M.dy[i]);
      if (l === 0) continue;
      expect(l).toBeCloseTo(1, 4);
      const x = g.cruces.posicion[3 * i];
      const y = g.cruces.posicion[3 * i + 1];
      const z = g.cruces.posicion[3 * i + 2];
      const r = Math.hypot(x, y, z);
      proyectarPunto(cam, x, y, z, t, 0);
      proyectarPunto(cam, x + (x / r) * 0.4, y + (y / r) * 0.4, z + (z / r) * 0.4, t, 4);
      const ux = t[4] - t[0];
      const uy = t[5] - t[1];
      const lu = Math.hypot(ux, uy);
      if (lu < 1) continue; // radial casi hacia el ojo: sin dirección fiable en pantalla
      expect((M.dx[i] * ux + M.dy[i] * uy) / lu).toBeGreaterThan(0.9);
    }
    expect(delante).toBeGreaterThan(5);
    expect(detras).toBeGreaterThan(5);
  });

  it("ligados al toggle de líneas: sin líneas no hay marcadores ni se dibujan", () => {
    const motor = crearMotorGauss3D();
    const e = entrada(2, { mostrar: { lineas: false, flujo: true, campo: false } });
    motor.actualizar(e);
    expect(motor.pasadas().marcas.n).toBe(0);
    const ctx = crearCtxGrabador();
    motor.dibujar(ctx, e);
    expect(ctx.discos.filter((d) => Math.abs(d.r - RADIO_MARCA) < 1e-6)).toHaveLength(0);
  });

  it("dibujo: sale = disco relleno claro; entra = anillo (fondo oscuro + trazo azul); las dos con punta rellena", () => {
    const motor = crearMotorGauss3D();
    const e = entrada(7);
    motor.actualizar(e);
    const ctx = crearCtxGrabador();
    motor.dibujar(ctx, e);
    const M = motor.pasadas().marcas;
    const discos = ctx.discos.filter((d) => Math.abs(d.r - RADIO_MARCA) < 1e-6);
    expect(discos).toHaveLength(M.n);
    expect(ctx.anomalias).toEqual([]);
    const rellenoSale = ctx.rellenos.filter((r) => r.estilo === "rgb(248, 113, 113)");
    const rellenoEntra = ctx.rellenos.filter((r) => r.estilo === "rgb(96, 165, 250)");
    // relleno rojo claro: discos (sin cerrar) + puntas (cerradas); el anillo azul no se rellena, solo se traza
    expect(rellenoSale.length).toBeGreaterThanOrEqual(2);
    expect(rellenoEntra.length).toBeGreaterThanOrEqual(1);
    expect(ctx.trazos.some((t) => t.estilo === "rgb(96, 165, 250)")).toBe(true);
    let conPunta = 0;
    for (let i = 0; i < M.n; i++) if (M.dx[i] !== 0 || M.dy[i] !== 0) conPunta++;
    const puntas = [...rellenoSale, ...rellenoEntra].reduce((s, r) => s + r.cerrados, 0);
    expect(puntas).toBe(conPunta);
    // el disco de «entra» se rellena con el fondo oscuro (hueco), nunca con el color claro
    expect(ctx.rellenos.some((r) => r.estilo.startsWith("rgba(5, 7, 13") && r.subtrayectos > 0)).toBe(true);
  });

  it("parche (escenario 8): marcadores con la normal del parche, sin fallos de dibujo", () => {
    const motor = crearMotorGauss3D();
    const e = entrada(8);
    motor.actualizar(e);
    const g = motor.geometria()!;
    const ctx = crearCtxGrabador();
    motor.dibujar(ctx, e);
    expect(motor.pasadas().marcas.n).toBe(g.cruces.n);
    expect(ctx.anomalias).toEqual([]);
  });
});

describe("revisión fase 4: el signo y la punta de cada marcador son los de E en el cruce", () => {
  /** Normal exterior (gradiente numérico de la distancia con signo; en el parche, su normal). */
  function normalExterior(sup: Superficie, p: Vec3): Vec3 {
    if (sup.tipo === "parche") return normalParche(sup);
    const h = 1e-4;
    const g = [0, 0, 0];
    for (let k = 0; k < 3; k++) {
      const a = [p[0], p[1], p[2]];
      const b = [p[0], p[1], p[2]];
      a[k] += h;
      b[k] -= h;
      g[k] = (distanciaConSigno(sup, a as unknown as Vec3) - distanciaConSigno(sup, b as unknown as Vec3)) / (2 * h);
    }
    const l = Math.hypot(g[0], g[1], g[2]);
    return [g[0] / l, g[1] / l, g[2] / l];
  }

  const casos: Array<[string, Superficie, Carga3D[]]> = [
    ["esfera, + centrada", crearSuperficie("esfera", { radio: 5 }), [{ x: 0, y: 0, z: 0, q: 3 }]],
    ["esfera, − descentrada", crearSuperficie("esfera", { radio: 5 }), [{ x: 2, y: -1, z: 1, q: -4 }]],
    ["esfera, + fuera", crearSuperficie("esfera", { radio: 5 }), [{ x: 7, y: 0, z: 3, q: 3 }]],
    ["esfera, − fuera", crearSuperficie("esfera", { radio: 5 }), [{ x: -6, y: 2, z: 0, q: -3 }]],
    ["esfera, dipolo", crearSuperficie("esfera", { radio: 5 }), [{ x: -2, y: 0, z: 0, q: 3 }, { x: 2, y: 0, z: 0, q: -3 }]],
    ["esfera, ++ dentro y − fuera", crearSuperficie("esfera", { radio: 5 }), [{ x: 1, y: 0, z: 0, q: 2 }, { x: 8, y: 1, z: 0, q: -3 }]],
    ["cubo, − dentro", crearSuperficie("cubo", { lado: 8 }), [{ x: 1, y: 1, z: 0, q: -3 }]],
    ["cilindro, + dentro y + fuera", crearSuperficie("cilindro", { radio: 4, altura: 8 }), [{ x: 0, y: 1, z: 1, q: 3 }, { x: 8, y: 0, z: 0, q: 2 }]],
    ["parche, + debajo", crearSuperficie("parche", { lado: 8, theta: 0.5, phi: 0.3 }), [{ x: 0, y: 0, z: -3, q: 3 }]],
    ["parche, − encima", crearSuperficie("parche", { lado: 8, theta: 0, phi: 0 }), [{ x: 1, y: 0, z: 3, q: -3 }]],
  ];

  for (const [nombre, superficie, cargas] of casos) {
    for (const calidad of [0, 2] as const) {
      it(`${nombre} (calidad ${calidad}): sale ⇔ E·n > 0 y la punta sigue a E`, () => {
        const motor = crearMotorGauss3D();
        motor.actualizar(entrada(2, { escenario: { superficie, cargas, calidad } }));
        const g = motor.geometria()!;
        const M = motor.pasadas().marcas;
        expect(g.cruces.n).toBeGreaterThan(0);
        const C = g.cruces;
        const t = new Float32Array(8);
        const cam = motor.camara();
        const E = new Float64Array(3);
        let comprobados = 0;
        for (let o = 0; o < C.n; o++) {
          const p: Vec3 = [C.posicion[3 * o], C.posicion[3 * o + 1], C.posicion[3 * o + 2]];
          campoEn(p, cargas, 0, E);
          const n = normalExterior(superficie, p);
          const En = E[0] * n[0] + E[1] * n[1] + E[2] * n[2];
          const modE = Math.hypot(E[0], E[1], E[2]);
          if (Math.abs(En) < 0.05 * modE) continue; // casi tangente: el signo es frágil
          expect(Math.sign(En), `cruce ${o}`).toBe(C.sentido[o]);
          comprobados++;
        }
        expect(comprobados).toBeGreaterThan(0);
        // el marcador i corresponde al cruce i (mientras no se descarte ninguno) y la punta sigue a E en pantalla
        if (M.n === C.n) {
          for (let o = 0; o < C.n; o++) {
            expect(M.sentido[o]).toBe(C.sentido[o]);
            if (M.dx[o] === 0 && M.dy[o] === 0) continue;
            const p: Vec3 = [C.posicion[3 * o], C.posicion[3 * o + 1], C.posicion[3 * o + 2]];
            campoEn(p, cargas, 0, E);
            const m = Math.hypot(E[0], E[1], E[2]);
            proyectarPunto(cam, p[0], p[1], p[2], t, 0);
            proyectarPunto(cam, p[0] + (E[0] / m) * 0.3, p[1] + (E[1] / m) * 0.3, p[2] + (E[2] / m) * 0.3, t, 4);
            const ux = t[4] - t[0];
            const uy = t[5] - t[1];
            const lu = Math.hypot(ux, uy);
            if (lu < 1.5) continue; // E casi hacia el ojo
            expect((M.dx[o] * ux + M.dy[o] * uy) / lu, `punta ${o}`).toBeGreaterThan(0.5);
          }
        }
      });
    }
  }
});

describe("revisión fase 4: las notas «netas = 0» del conteo son identidades en cualquier calidad", () => {
  const formas: Superficie[] = [
    crearSuperficie("esfera", { radio: 5 }),
    crearSuperficie("cubo", { lado: 8 }),
    crearSuperficie("cilindro", { radio: 4, altura: 8 }),
  ];
  for (const sup of formas) {
    for (const calidad of [0, 1, 2] as const) {
      it(`${sup.tipo}, calidad ${calidad}: carga fuera y dipolo ± dentro dan salen = entran`, () => {
        const casos: Carga3D[][] = [
          [{ x: 9, y: 2, z: 1, q: 3 }],
          [{ x: -9, y: 0, z: 2, q: -4 }],
          [{ x: -1.5, y: 0, z: 0, q: 3 }, { x: 1.5, y: 0.5, z: 0, q: -3 }],
        ];
        for (const cargas of casos) {
          const motor = crearMotorGauss3D();
          motor.actualizar(entrada(2, { escenario: { superficie: sup, cargas, calidad } }));
          const l = motor.lectura()!;
          expect(l.salen, `${sup.tipo} ${JSON.stringify(cargas)}`).toBe(l.entran);
        }
      });
    }
  }
});
