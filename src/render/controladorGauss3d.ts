/**
 * Controlador de la estación Ley de Gauss (sin DOM ni React: lo que toca el navegador entra por `DepsControlador`).
 *
 * Reparto del estado (contrato §4 y nota del plan):
 *  - Zustand (`store/gauss3dStore.ts`): solo UI (q y z de cada carga, tamaño, forma, escenario, interruptores, vista).
 *  - Aquí, en variables (no en React): x, y de cada carga, el azimut mientras se arrastra la vista y el estado del
 *    gesto del puntero.
 *
 * Cada evento (puntero, tecla, cambio del store) solo MARCA `sucio` y pide un cuadro; el cuadro recalcula UNA vez
 * (1 recálculo por cuadro como máximo) y `motor.actualizar` decide si hay que dibujar (firma «igual» = no se dibuja).
 * Durante un gesto continuo (arrastre de carga, deslizadores, teclas) la geometría se calcula con calidad gruesa
 * (nivel 2); al soltarlo, o tras `MS_REFINAR` sin eventos, se vuelve a la calidad vigente del gestor.
 * La lectura de Φ se publica como mucho cada `MS_LECTURA` (≤ 10 Hz).
 */
import { DIST_MIN_CARGAS, RANGOS } from "../fisica/gauss3d/constantes";
import { ajustarCargaFueraDeSuperficie, ajustarDistanciaCargas } from "../fisica/gauss3d/superficies";
import type { Carga3D } from "../fisica/gauss3d/tipos";
import { cm } from "../ui/anunciosGauss3D";
import { normalizarAzimutDeg, superficieDeUI, type EstadoUIGauss3D, type LecturaGauss } from "../store/gauss3dStore";
import type { Ctx3D } from "./gauss3d/ctx3d";
import { radioCarga3D } from "./gauss3d/dibujarGauss3D";
import { cargaBajoPuntero, direccionTeclado, puntoEnPlano } from "./gauss3d/interaccion";
import { crearMotorGauss3D, type EntradaMotor, type MotorGauss3D } from "./gauss3d/motor";

/** Sin eventos durante este tiempo, el gesto continuo se da por terminado y se refina. */
export const MS_REFINAR = 150;
/** Intervalo mínimo entre dos publicaciones de la lectura (≤ 10 Hz). */
export const MS_LECTURA = 100;
/** Radianes de azimut por píxel de arrastre horizontal en el lienzo. */
export const RAD_POR_PX = 0.01;
/** Paso del teclado: 1 cuadro; con Mayús, 5. */
export const PASO_TECLADO_U = 1;
export const PASO_TECLADO_MAYUS_U = 5;
/** Calidad gruesa durante los gestos continuos (índice de `NIVELES_GAUSS3D`). */
export const CALIDAD_GRUESA = 2;

export interface DepsControlador {
  /** Motor de dibujo; por defecto el real. Los tests pueden pasar uno que cuente llamadas. */
  motor?: MotorGauss3D;
  leerUI: () => EstadoUIGauss3D;
  corregirZ: (id: number, z: number) => void;
  seleccionar: (indice: number) => void;
  publicarLectura: (l: LecturaGauss) => void;
  publicarAzimutDeg: (g: number) => void;
  /** Texto para la región viva (movimiento con teclado o numéricos). */
  anunciar?: (texto: string) => void;
  pedirCuadro: (cb: () => void) => number;
  cancelarCuadro: (id: number) => void;
  fijarTemporizador: (cb: () => void, ms: number) => number;
  cancelarTemporizador: (id: number) => void;
  ahora: () => number;
}

export interface ControladorGauss3D {
  fijarLienzo(ctx: Ctx3D | null, ancho: number, alto: number, dpr: number): void;
  /** Marca que hay que recalcular y pide un cuadro (idempotente dentro del mismo cuadro). */
  solicitar(): void;
  /** Entrada continua (deslizador, tecla): calidad gruesa hasta `soltar()` o `MS_REFINAR` sin eventos. */
  interaccion(): void;
  /** Fin del gesto continuo: refina ya. */
  soltar(): void;
  /** Para suscribirse al store: clasifica el cambio (continuo o discreto). */
  alCambiarUI(nuevo: EstadoUIGauss3D, previo: EstadoUIGauss3D): void;
  /** Coordenadas en px CSS del lienzo. Devuelve qué empezó: arrastre de una carga o giro de la vista. */
  punteroAbajo(x: number, y: number): "carga" | "vista";
  punteroMueve(x: number, y: number): void;
  punteroArriba(): void;
  punteroCancelado(): void;
  hayCargaBajo(x: number, y: number): boolean;
  /** Flechas del teclado sobre la carga seleccionada; true si la tecla se usó. */
  tecla(tecla: string, mayus: boolean): boolean;
  /** Posición (x, y) de la carga i, o undefined. */
  posicion(indice: number): { x: number; y: number } | undefined;
  /** Coloca la carga i (numéricos de «Avanzado»); se aplica la zona de exclusión en el cuadro siguiente. */
  fijarXY(indice: number, x: number, y: number): void;
  /** Gira la vista (botones ±15°). */
  girarVistaDeg(delta: number): void;
  motor(): MotorGauss3D;
  destruir(): void;
}

interface EstadoCarga {
  x: number;
  y: number;
  previa: Carga3D | undefined;
}

type Gesto =
  | { tipo: "carga"; indice: number; id: number; offX: number; offY: number }
  | { tipo: "vista"; x0: number; azimut0: number };

const aRad = (g: number) => (g * Math.PI) / 180;
const aDeg = (r: number) => (r * 180) / Math.PI;
const acotar = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

export function crearControladorGauss3D(deps: DepsControlador): ControladorGauss3D {
  const motor = deps.motor ?? crearMotorGauss3D();
  const estados = new Map<number, EstadoCarga>();
  const hit = new Float64Array(2);

  let ctx: Ctx3D | null = null;
  let ancho = 0;
  let alto = 0;
  let dpr = 1;

  let idCuadro = 0;
  let idRefinar = 0;
  let idLectura = 0;
  let forzar = true;
  let continuo = false;
  let gesto: Gesto | null = null;
  let encuadreFijo = 0;
  let azimut = aRad(deps.leerUI().azimutDeg);
  let ultimoAzimutDeg = deps.leerUI().azimutDeg;
  let seleccionDibujada = -1;
  let lecturaPendiente = false;
  let ultimaLectura = -Infinity;

  const interactuando = () => continuo || gesto?.tipo === "carga";

  function cancelarRefinar() {
    if (idRefinar) deps.cancelarTemporizador(idRefinar);
    idRefinar = 0;
  }

  function solicitar() {
    if (idCuadro === 0) {
      idCuadro = deps.pedirCuadro(() => {
        idCuadro = 0;
        tick();
      });
    }
  }

  function interaccion() {
    continuo = true;
    cancelarRefinar();
    idRefinar = deps.fijarTemporizador(() => {
      idRefinar = 0;
      soltar();
    }, MS_REFINAR);
    solicitar();
  }

  function soltar() {
    cancelarRefinar();
    continuo = false;
    solicitar();
  }

  /** Posición inicial de una carga nueva sin x0/y0: a 4 u de la primera (hacia donde quepa). */
  function posicionInicial(indice: number, x0: number | undefined, y0: number | undefined): { x: number; y: number } {
    if (x0 !== undefined && y0 !== undefined) return { x: x0, y: y0 };
    const otra = [...estados.values()][0];
    if (!otra || indice === 0) return { x: 0, y: 0 };
    const x = otra.x + 4 <= RANGOS.carga.x.max ? otra.x + 4 : otra.x - 4;
    return { x, y: otra.y };
  }

  /**
   * Aplica las reglas de colocación (límites del plano, zona de exclusión de la superficie, distancia mínima entre
   * cargas) y devuelve las cargas efectivas. Corrige x, y (en el controlador) y z (en el store) si hizo falta.
   * La carga seleccionada es la que cede ante la otra (es la que se mueve).
   */
  function sincronizar(ui: EstadoUIGauss3D): Carga3D[] {
    const vivos = new Set(ui.cargas.map((c) => c.id));
    for (const id of [...estados.keys()]) if (!vivos.has(id)) estados.delete(id);
    ui.cargas.forEach((c, i) => {
      if (!estados.has(c.id)) {
        const p = posicionInicial(i, c.x0, c.y0);
        estados.set(c.id, { x: p.x, y: p.y, previa: undefined });
      }
    });
    const sup = superficieDeUI(ui.forma, ui.tamano, ui.thetaDeg);
    const salida: Carga3D[] = new Array(ui.cargas.length);
    const orden = ui.cargas.map((_, i) => i).sort((a, b) => Number(a === ui.seleccionada) - Number(b === ui.seleccionada));
    for (const i of orden) {
      const c = ui.cargas[i];
      const est = estados.get(c.id)!;
      let p: Carga3D = {
        x: acotar(est.x, RANGOS.carga.x.min, RANGOS.carga.x.max),
        y: acotar(est.y, RANGOS.carga.y.min, RANGOS.carga.y.max),
        z: acotar(c.z, RANGOS.carga.z.min, RANGOS.carga.z.max),
        q: c.q,
      };
      for (let vuelta = 0; vuelta < 2; vuelta++) {
        for (let k = 0; k < salida.length; k++) {
          if (k !== i && salida[k]) p = ajustarDistanciaCargas(salida[k], p);
        }
        // Un paso de z (teclado del deslizador) que cae en la franja de exclusión debe poder cruzar la superficie:
        // se toma como «lado previo» el que queda más allá en el sentido del movimiento.
        let previa = est.previa;
        if (previa && p.x === previa.x && p.y === previa.y && p.z !== previa.z) {
          previa = { ...p, z: p.z + Math.sign(p.z - previa.z) };
        }
        p = ajustarCargaFueraDeSuperficie(sup, p, previa);
      }
      // la cota del plano puede volver a salirse tras la exclusión (cubo grande): se recorta, la exclusión manda
      est.x = p.x;
      est.y = p.y;
      est.previa = p;
      salida[i] = p;
      if (Math.abs(p.z - c.z) > 1e-9) deps.corregirZ(c.id, p.z);
    }
    return salida;
  }

  function publicar(cargas: readonly Carga3D[]) {
    const l = motor.lectura();
    if (!l) return;
    lecturaPendiente = false;
    ultimaLectura = deps.ahora();
    deps.publicarLectura({
      phi: l.phi,
      qEnc: l.qEnc,
      salen: l.salen,
      entran: l.entran,
      nLineas: l.nLineas,
      tipo: l.tipo,
      calidad: l.calidad,
      cargas: l.cargas,
      xy: cargas.map((c) => [c.x, c.y] as const),
    });
  }

  function tick() {
    if (!ctx || ancho < 2 || alto < 2) return;
    const ui = deps.leerUI();
    if (ui.azimutDeg !== ultimoAzimutDeg) {
      azimut = aRad(ui.azimutDeg);
      ultimoAzimutDeg = ui.azimutDeg;
    }
    const cargas = sincronizar(ui);
    const entrada: EntradaMotor = {
      escenario: {
        superficie: superficieDeUI(ui.forma, ui.tamano, ui.thetaDeg),
        cargas,
        calidad: (interactuando() ? CALIDAD_GRUESA : motor.calidad()) as 0 | 1 | 2,
        // La malla de parches (y el flujo) cuesta ≤ 0,5 ms a calidad alta frente a 4–5 ms de las líneas (medido):
        // durante el gesto se mantiene a la calidad del gestor y solo se bajan líneas, paso y flechas (sin borde escalonado).
        calidadMalla: motor.calidad() as 0 | 1 | 2,
      },
      camara: { azimut, inclinacion: aRad(ui.inclinacionDeg), zoom: ui.zoom },
      ancho,
      alto,
      dpr,
      mostrar: ui.mostrar,
      opacidad: ui.opacidad,
      unidad: Math.min(1.6, Math.max(1, ancho / 900)),
      encuadre: encuadreFijo,
      seleccion: ui.seleccionada,
    };
    const cambio = motor.actualizar(entrada);
    if (ui.seleccionada !== seleccionDibujada) {
      seleccionDibujada = ui.seleccionada;
      forzar = true;
    }
    if (cambio !== "igual" || forzar) {
      forzar = false;
      motor.dibujar(ctx, entrada);
    }
    if (cambio === "geometria") lecturaPendiente = true;
    if (lecturaPendiente) {
      if (!interactuando() || deps.ahora() - ultimaLectura >= MS_LECTURA) publicar(cargas);
      else if (idLectura === 0) {
        idLectura = deps.fijarTemporizador(() => {
          idLectura = 0;
          solicitar();
        }, MS_LECTURA);
      }
    }
  }

  function radiosDisco(): Float64Array {
    const g = motor.geometria();
    const unidad = Math.min(1.6, Math.max(1, ancho / 900));
    const r = new Float64Array(g ? g.cargas.length : 0);
    if (g) for (let i = 0; i < r.length; i++) r[i] = radioCarga3D(g.cargas[i].q, unidad);
    return r;
  }

  function indiceBajo(x: number, y: number): number {
    const p = motor.pasadas();
    if (!motor.geometria()) return -1;
    return cargaBajoPuntero(x, y, p.qx, p.qy, p.qp, p.nCargas, radiosDisco());
  }

  function estadoSeleccionada(): { est: EstadoCarga; i: number } | null {
    const ui = deps.leerUI();
    const c = ui.cargas[ui.seleccionada];
    const est = c && estados.get(c.id);
    return est ? { est, i: ui.seleccionada } : null;
  }

  function textoPosicion(i: number, x: number, y: number): string {
    return `Carga ${i + 1} movida a x = ${cm(x)}, y = ${cm(y)}.`;
  }

  function punteroArriba() {
    const g = gesto;
    gesto = null;
    if (!g) return;
    if (g.tipo === "vista") {
      const deg = normalizarAzimutDeg(aDeg(azimut));
      azimut = aRad(deg);
      ultimoAzimutDeg = deg;
      deps.publicarAzimutDeg(deg);
      return;
    }
    encuadreFijo = 0;
    soltar();
  }

  return {
    fijarLienzo(c, a, h, d) {
      ctx = c;
      ancho = a;
      alto = h;
      dpr = d;
      forzar = true;
      solicitar();
    },
    solicitar,
    interaccion,
    soltar,
    alCambiarUI(nuevo, previo) {
      const cargasCambian = nuevo.cargas !== previo.cargas;
      const relevante =
        cargasCambian ||
        nuevo.forma !== previo.forma ||
        nuevo.tamano !== previo.tamano ||
        nuevo.thetaDeg !== previo.thetaDeg ||
        nuevo.mostrar !== previo.mostrar ||
        nuevo.azimutDeg !== previo.azimutDeg ||
        nuevo.inclinacionDeg !== previo.inclinacionDeg ||
        nuevo.zoom !== previo.zoom ||
        nuevo.opacidad !== previo.opacidad ||
        nuevo.seleccionada !== previo.seleccionada;
      if (!relevante) return; // p. ej. solo cambió la lectura publicada
      // Continuo = deslizadores de tamaño, θ, q o z (misma lista de cargas); lo demás es una acción puntual.
      const continuo =
        nuevo.tamano !== previo.tamano ||
        nuevo.thetaDeg !== previo.thetaDeg ||
        (cargasCambian && nuevo.cargas.length === previo.cargas.length && nuevo.escenarioId === previo.escenarioId && nuevo.fuera === previo.fuera && nuevo.cargas.every((c, i) => c.id === previo.cargas[i].id));
      if (continuo) interaccion();
      else solicitar();
    },

    punteroAbajo(x, y) {
      const i = indiceBajo(x, y);
      if (i >= 0) {
        const ui = deps.leerUI();
        const c = ui.cargas[i];
        const est = estados.get(c.id);
        if (c && est) {
          deps.seleccionar(i);
          let offX = 0;
          let offY = 0;
          if (puntoEnPlano(motor.camara(), x, y, motor.geometria()!.cargas[i].z, hit)) {
            offX = est.x - hit[0];
            offY = est.y - hit[1];
          }
          gesto = { tipo: "carga", indice: i, id: c.id, offX, offY };
          encuadreFijo = motor.geometria()!.rEncuadre;
          cancelarRefinar();
          solicitar();
          return "carga";
        }
      }
      gesto = { tipo: "vista", x0: x, azimut0: azimut };
      return "vista";
    },
    punteroMueve(x, y) {
      if (!gesto) return;
      if (gesto.tipo === "vista") {
        azimut = gesto.azimut0 - (x - gesto.x0) * RAD_POR_PX;
        solicitar();
        return;
      }
      const est = estados.get(gesto.id);
      const g = motor.geometria();
      if (!est || !g) return;
      const z = g.cargas[gesto.indice]?.z ?? 0;
      if (!puntoEnPlano(motor.camara(), x, y, z, hit)) return;
      est.x = acotar(hit[0] + gesto.offX, RANGOS.carga.x.min, RANGOS.carga.x.max);
      est.y = acotar(hit[1] + gesto.offY, RANGOS.carga.y.min, RANGOS.carga.y.max);
      solicitar();
    },
    punteroArriba,
    punteroCancelado: punteroArriba,
    hayCargaBajo: (x, y) => indiceBajo(x, y) >= 0,

    tecla(tecla, mayus) {
      const dir = direccionTeclado(tecla, azimut);
      const s = estadoSeleccionada();
      if (!dir || !s) return false;
      const paso = mayus ? PASO_TECLADO_MAYUS_U : PASO_TECLADO_U;
      s.est.x = acotar(s.est.x + dir[0] * paso, RANGOS.carga.x.min, RANGOS.carga.x.max);
      s.est.y = acotar(s.est.y + dir[1] * paso, RANGOS.carga.y.min, RANGOS.carga.y.max);
      interaccion();
      deps.anunciar?.(textoPosicion(s.i, s.est.x, s.est.y));
      return true;
    },

    posicion(indice) {
      const c = deps.leerUI().cargas[indice];
      const est = c && estados.get(c.id);
      return est ? { x: est.x, y: est.y } : undefined;
    },
    fijarXY(indice, x, y) {
      const c = deps.leerUI().cargas[indice];
      const est = c && estados.get(c.id);
      if (!est || !Number.isFinite(x) || !Number.isFinite(y)) return;
      est.x = acotar(x, RANGOS.carga.x.min, RANGOS.carga.x.max);
      est.y = acotar(y, RANGOS.carga.y.min, RANGOS.carga.y.max);
      solicitar();
    },
    girarVistaDeg(delta) {
      const deg = normalizarAzimutDeg(aDeg(azimut) + delta);
      azimut = aRad(deg);
      ultimoAzimutDeg = deg;
      deps.publicarAzimutDeg(deg);
      solicitar();
    },
    motor: () => motor,
    destruir() {
      if (idCuadro) deps.cancelarCuadro(idCuadro);
      idCuadro = 0;
      cancelarRefinar();
      if (idLectura) deps.cancelarTemporizador(idLectura);
      idLectura = 0;
      ctx = null;
    },
  };
}

/** Distancia mínima entre cargas (reexportada para la UI: texto de ayuda de los numéricos). */
export const DISTANCIA_MIN_CARGAS_U = DIST_MIN_CARGAS;
