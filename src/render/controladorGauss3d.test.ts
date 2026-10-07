import { beforeEach, describe, expect, it } from "vitest";
import { useGauss3dStore } from "../store/gauss3dStore";
import { CALIDAD_GRUESA, MS_REFINAR, crearControladorGauss3D, type ControladorGauss3D } from "./controladorGauss3d";
import { crearCtxGrabador } from "./gauss3d/ctxFalso3d";
import { crearMotorGauss3D, type EntradaMotor, type MotorGauss3D } from "./gauss3d/motor";

interface Banco {
  c: ControladorGauss3D;
  entradas: EntradaMotor[];
  dibujos: () => number;
  cuadro: () => void;
  temporizadores: Array<{ cb: () => void; ms: number }>;
  lecturas: () => number;
  reloj: { t: number };
}

function crear(): Banco {
  const real = crearMotorGauss3D();
  const entradas: EntradaMotor[] = [];
  let dib = 0;
  let lect = 0;
  const motor: MotorGauss3D = {
    ...real,
    actualizar: (e) => {
      entradas.push(e);
      return real.actualizar(e);
    },
    dibujar: (ctx, e) => {
      dib++;
      real.dibujar(ctx, e);
    },
  };
  let pendiente: (() => void) | null = null;
  const temporizadores: Banco["temporizadores"] = [];
  const reloj = { t: 0 };
  const st = useGauss3dStore;
  const c = crearControladorGauss3D({
    motor,
    leerUI: () => st.getState(),
    corregirZ: (id, z) => st.getState().corregirZ(id, z),
    seleccionar: (i) => st.getState().seleccionar(i),
    publicarLectura: () => {
      lect++;
    },
    publicarAzimutDeg: (g) => st.getState().setAzimutDeg(g),
    pedirCuadro: (cb) => {
      pendiente = cb;
      return 1;
    },
    cancelarCuadro: () => {
      pendiente = null;
    },
    fijarTemporizador: (cb, ms) => temporizadores.push({ cb, ms }),
    cancelarTemporizador: (id) => {
      temporizadores[id - 1] = { cb: () => {}, ms: 0 };
    },
    ahora: () => reloj.t,
  });
  c.fijarLienzo(crearCtxGrabador(), 800, 600, 1);
  return {
    c,
    entradas,
    dibujos: () => dib,
    cuadro: () => {
      const cb = pendiente;
      pendiente = null;
      cb?.();
    },
    temporizadores,
    lecturas: () => lect,
    reloj,
  };
}

describe("controlador Gauss 3D", () => {
  beforeEach(() => useGauss3dStore.getState().aplicarEscenario(2));

  it("primer cuadro: dibuja y publica la lectura", () => {
    const b = crear();
    b.cuadro();
    expect(b.dibujos()).toBe(1);
    expect(b.lecturas()).toBe(1);
    expect(b.c.posicion(0)).toEqual({ x: 0, y: 0 });
  });

  it("sin cambios no hay dibujo nuevo", () => {
    const b = crear();
    b.cuadro();
    b.c.solicitar();
    b.cuadro();
    expect(b.dibujos()).toBe(1);
  });

  it("varios eventos dentro de un cuadro = un solo recálculo", () => {
    const b = crear();
    b.cuadro();
    const antes = b.entradas.length;
    for (let i = 0; i < 20; i++) {
      b.c.fijarXY(0, 1 + i * 0.1, 0);
      b.c.solicitar();
    }
    b.cuadro();
    expect(b.entradas.length - antes).toBe(1);
  });

  it("durante el arrastre usa calidad gruesa y al soltar vuelve a la vigente", () => {
    const b = crear();
    b.cuadro();
    const p = b.c.motor().pasadas();
    const x = p.qx[0];
    const y = p.qy[0];
    expect(b.c.punteroAbajo(x, y)).toBe("carga");
    b.c.punteroMueve(x + 30, y + 10);
    b.cuadro();
    expect(b.entradas[b.entradas.length - 1].escenario.calidad).toBe(CALIDAD_GRUESA);
    expect(b.c.posicion(0)!.x).not.toBe(0);
    b.c.punteroArriba();
    b.cuadro();
    const ult = b.entradas[b.entradas.length - 1].escenario.calidad;
    expect(ult).toBe(b.c.motor().calidad());
    expect(ult).toBeLessThan(CALIDAD_GRUESA);
  });

  it("un deslizador pasa a grueso y se refina tras MS_REFINAR sin eventos", () => {
    const b = crear();
    b.cuadro();
    const baja = useGauss3dStore.subscribe((n, p) => b.c.alCambiarUI(n, p));
    useGauss3dStore.getState().setTamano(6);
    baja();
    b.cuadro();
    expect(b.entradas[b.entradas.length - 1].escenario.calidad).toBe(CALIDAD_GRUESA);
    b.temporizadores.find((t) => t.ms === MS_REFINAR)!.cb();
    b.cuadro();
    expect(b.entradas[b.entradas.length - 1].escenario.calidad).toBe(0);
  });

  it("arrastrar el vacío gira la vista y publica el azimut al soltar", () => {
    const b = crear();
    b.cuadro();
    expect(b.c.punteroAbajo(5, 5)).toBe("vista");
    b.c.punteroMueve(105, 5);
    b.cuadro();
    b.c.punteroArriba();
    expect(useGauss3dStore.getState().azimutDeg).not.toBe(35);
  });

  it("la zona de exclusión impide poner la carga sobre la superficie", () => {
    const b = crear();
    b.cuadro();
    b.c.fijarXY(0, 5, 0);
    b.cuadro();
    const p = b.c.posicion(0)!;
    expect(Math.abs(p.x - 5)).toBeGreaterThanOrEqual(0.4 - 1e-9);
  });

  it("un paso de z que cae en la franja cruza la superficie (escenario 6)", () => {
    const b = crear();
    useGauss3dStore.getState().aplicarEscenario(6);
    b.cuadro();
    const st = useGauss3dStore.getState();
    for (let z = 8; z >= 3; z -= 0.5) {
      st.setZ(z);
      b.cuadro();
    }
    expect(useGauss3dStore.getState().cargas[0].z).toBeLessThan(4.7);
  });

  it("flechas del teclado mueven la carga seleccionada 1 cuadro", () => {
    const b = crear();
    b.cuadro();
    expect(b.c.tecla("ArrowUp", false)).toBe(true);
    expect(b.c.tecla("x", false)).toBe(false);
    b.cuadro();
    const p = b.c.posicion(0)!;
    expect(Math.hypot(p.x, p.y)).toBeCloseTo(1, 5);
  });

  it("publica la lectura como mucho cada 100 ms durante un arrastre", () => {
    const b = crear();
    b.cuadro();
    const base = b.lecturas();
    const p = b.c.motor().pasadas();
    b.c.punteroAbajo(p.qx[0], p.qy[0]);
    for (let i = 1; i <= 5; i++) {
      b.reloj.t += 16;
      b.c.fijarXY(0, i * 0.5, 0);
      b.cuadro();
    }
    expect(b.lecturas() - base).toBeLessThanOrEqual(1);
    b.c.punteroArriba();
    b.cuadro();
    expect(b.lecturas() - base).toBeGreaterThanOrEqual(1);
  });
});
