/**
 * Capa en caché de la escena (cuadrícula + campo), E2.3 §8. Cada canvas crea la
 * suya: un canvas offscreen del mismo tamaño donde se dibuja la cuadrícula y el
 * modo de vista (vectores, líneas de campo o equipotenciales + líneas) y que
 * cada frame se copia con un solo `drawImage`. Las cargas, la leyenda y el
 * anillo de selección se pintan encima en cada frame (ver dibujarEscena.ts).
 *
 * Recalcular solo cuando algo cambió (firma = posiciones y magnitudes de las
 * cargas, tamaño, modo, calidad, escala CSS y unidad de la etiqueta): en la
 * estación estática, en reposo, el coste es ≈ 0. Con `intervaloMinMs` (estación
 * dinámica, 33 ms ≈ 30 Hz) los cambios de POSICIÓN se recalculan como mucho a
 * esa frecuencia y se reutiliza la capa el resto de frames; los cambios de
 * estructura (modo, magnitud, altas/bajas, tamaño, calidad) reconstruyen ya.
 *
 * Degradación medida (calidadCampo.ts): cada reconstrucción de líneas o
 * equipotenciales registra su tiempo (cálculo + dibujo); si la media supera
 * 14 ms se baja un nivel (celda, presupuesto y paso mayores). El nivel vigente se
 * publica en `canvas.dataset.calidad` (diagnóstico, sin React).
 *
 * Nada de esto pasa por el estado de React: la capa vive en un estado interno de
 * cada canvas y las posiciones se leen de los refs / del Worker.
 */
import type { PuntoCarga } from "../fisica/coulomb";
import { colocarRotulos, curvasEquipotenciales, type CurvasNivel, type Rotulo } from "../fisica/equipotenciales";
import { trazarLineasCampo, type LineaCampo } from "../fisica/lineasCampo";
import type { ModoVista, UnidadCarga } from "../types/simulacion";
import { crearGestorCalidad } from "./calidadCampo";
import { rectsEtiquetasCarga } from "./dibujarCargas";
import { dibujarCuadricula } from "./dibujarCuadricula";
import { alturaRotulo, dibujarEquipotenciales, dibujarRotulos, fuenteRotulo } from "./dibujarEquipotenciales";
import { dibujarLineasCampo } from "./dibujarLineasCampo";
import { dibujarVectores } from "./dibujarVectores";
import { crearFirma } from "./firmaCapa";

export interface EntradaCapa {
  puntos: PuntoCarga[];
  modoVista: ModoVista;
  ancho: number;
  alto: number;
  escalaCss: number;
  unidadCarga: UnidadCarga;
  /**
   * Factor total (escalaCss * devicePixelRatio acotado, ver hooks/useEscalaCss.ts) al que se
   * dibuja el bitmap offscreen de esta capa, para que la cuadrícula, las equipotenciales y las
   * líneas de campo se vean tan nítidas como las cargas (dibujadas directo en el ctx principal,
   * ya a esa misma resolución). Por defecto 1 (bitmap a resolución lógica, comportamiento previo).
   */
  resolucion?: number;
}

export interface OpcionesCapa {
  /** Tiempo mínimo entre reconstrucciones cuando solo cambian las posiciones (ms). 0 = sin límite. */
  intervaloMinMs?: number;
}

export interface EstadisticasCapa {
  reconstrucciones: number;
  calidad: string;
  /** Último tiempo de cálculo (física: malla, curvas, líneas, rótulos), ms. */
  calculoMs: number;
  /** Último tiempo de dibujo en el canvas offscreen (comandos), ms. */
  dibujoMs: number;
}

export interface CapaCampo {
  /** Reconstruye la capa si hace falta y la copia en `ctx` (cuadrícula + campo). */
  pintar(ctx: CanvasRenderingContext2D, entrada: EntradaCapa): void;
  estadisticas(): EstadisticasCapa;
}

/** Intervalos mayores (pestaña oculta, pausa del navegador) no son medidas de rendimiento. */
const INTERVALO_MAX_MEDIBLE_MS = 250;

/** Fuerza reconstruir en cada frame (diagnóstico de rendimiento con `?debug&sincache`). */
const SIN_CACHE =
  typeof window !== "undefined" &&
  new URLSearchParams(window.location.search).has("debug") &&
  new URLSearchParams(window.location.search).has("sincache");

export function crearCapaCampo(opciones: OpcionesCapa = {}): CapaCampo {
  const { intervaloMinMs = 0 } = opciones;
  const firma = crearFirma();
  const gestor = crearGestorCalidad();
  let canvas: HTMLCanvasElement | null = null;
  let lctx: CanvasRenderingContext2D | null = null;
  let ultimaConstruccion = -Infinity;
  let ultimoFrame = -1;
  /** Última reconstrucción a la espera de saber cuánto tardó el frame siguiente. */
  let pendiente: { inicio: number; ms: number } | null = null;
  const estadisticas: EstadisticasCapa = { reconstrucciones: 0, calidad: "alta", calculoMs: 0, dibujoMs: 0 };
  const anchosTexto = new Map<string, number>();

  function asegurarCanvas(ancho: number, alto: number, resolucion: number): CanvasRenderingContext2D | null {
    if (!canvas) {
      canvas = document.createElement("canvas");
      lctx = null;
    }
    const anchoBitmap = Math.round(ancho * resolucion);
    const altoBitmap = Math.round(alto * resolucion);
    if (canvas.width !== anchoBitmap || canvas.height !== altoBitmap) {
      canvas.width = anchoBitmap;
      canvas.height = altoBitmap;
      lctx = null; // el resize resetea la transformación: hay que reaplicar el escalado
    }
    if (!lctx) {
      lctx = canvas.getContext("2d");
      // Los dibujar*.ts de esta capa siguen en coordenadas lógicas (0..ancho, 0..alto);
      // este escalado hace que caigan en el lugar correcto sobre el bitmap de mayor resolución.
      lctx?.setTransform(resolucion, 0, 0, resolucion, 0, 0);
    }
    return lctx;
  }

  function reconstruir(c: CanvasRenderingContext2D, e: EntradaCapa): number {
    const nivel = gestor.nivel();
    const { puntos, ancho, alto, escalaCss, modoVista } = e;
    c.clearRect(0, 0, ancho, alto);

    // 1. Cálculo (física pura).
    const t0 = performance.now();
    let lineas: LineaCampo[] = [];
    let curvas: CurvasNivel | null = null;
    let rotulos: Rotulo[] = [];
    // Medida de texto de los rótulos (cacheada por fuente y cadena: measureText no se llama en cada frame).
    const fuenteR = fuenteRotulo(escalaCss);
    const medir = (texto: string) => {
      const clave = `${fuenteR}|${texto}`;
      let w = anchosTexto.get(clave);
      if (w === undefined) {
        c.save();
        c.font = fuenteR;
        w = c.measureText(texto).width;
        c.restore();
        anchosTexto.set(clave, w);
      }
      return w;
    };
    if (modoVista === "lineas" || modoVista === "equipotenciales") {
      lineas = trazarLineasCampo(puntos, ancho, alto, { paso: nivel.paso, presupuesto: nivel.presupuesto });
    }
    if (modoVista === "equipotenciales") {
      curvas = curvasEquipotenciales(puntos, ancho, alto, { celda: nivel.celda });
      rotulos = colocarRotulos(
        curvas,
        puntos,
        ancho,
        alto,
        medir,
        alturaRotulo(escalaCss),
        rectsEtiquetasCarga(c, puntos, escalaCss, e.unidadCarga, ancho),
      );
    }
    const t1 = performance.now();

    // 2. Dibujo en la capa: cuadrícula -> curvas -> líneas -> rótulos (encima, para leerse).
    dibujarCuadricula(c, ancho, alto, escalaCss);
    if (modoVista === "vectores") {
      dibujarVectores(c, puntos, ancho, alto, escalaCss);
    } else {
      if (curvas) dibujarEquipotenciales(c, curvas, escalaCss);
      dibujarLineasCampo(c, lineas, puntos, escalaCss);
      if (curvas) dibujarRotulos(c, rotulos, medir, escalaCss);
    }
    const t2 = performance.now();

    estadisticas.reconstrucciones++;
    estadisticas.calculoMs = t1 - t0;
    estadisticas.dibujoMs = t2 - t1;
    return t2 - t0;
  }

  return {
    pintar(ctx, e) {
      const ahora = performance.now();
      // Medida de calidad: periodo de refresco y coste de la reconstrucción anterior (JS + frame siguiente).
      if (ultimoFrame >= 0 && ahora - ultimoFrame < INTERVALO_MAX_MEDIBLE_MS) {
        gestor.observarFrame(ahora - ultimoFrame);
      }
      if (pendiente) {
        const periodo = ahora - pendiente.inicio;
        if (periodo < INTERVALO_MAX_MEDIBLE_MS) gestor.registrar(pendiente.ms, periodo);
        pendiente = null;
      }
      ultimoFrame = ahora;

      const resolucion = e.resolucion ?? 1;
      const datos = {
        puntos: e.puntos,
        ancho: e.ancho,
        alto: e.alto,
        escalaCss: e.escalaCss,
        modo: e.modoVista,
        calidad: gestor.indice(),
        unidad: e.unidadCarga,
        resolucion,
      };
      const cambio = firma.comparar(datos);
      const debe =
        SIN_CACHE ||
        cambio === "estructura" ||
        (cambio === "posiciones" && ahora - ultimaConstruccion >= intervaloMinMs);
      const c = asegurarCanvas(e.ancho, e.alto, resolucion);
      if (!c || !canvas) return;
      if (debe) {
        const ms = reconstruir(c, e);
        if (e.modoVista !== "vectores") pendiente = { inicio: ahora, ms };
        firma.guardar(datos);
        ultimaConstruccion = ahora;
        estadisticas.calidad = gestor.nivel().nombre;
        if (ctx.canvas.dataset.calidad !== estadisticas.calidad) ctx.canvas.dataset.calidad = estadisticas.calidad;
      }
      // 4 argumentos: el destino se especifica en tamaño LÓGICO (ancho x alto). El `ctx`
      // principal ya está escalado (ver hooks/useEscalaCss.ts) y el bitmap offscreen está a
      // `resolucion` px de dispositivo por unidad lógica -- con la forma de 2 argumentos
      // (tamaño natural del bitmap) el escalado se aplicaría dos veces.
      ctx.drawImage(canvas, 0, 0, e.ancho, e.alto);
    },
    estadisticas: () => ({ ...estadisticas }),
  };
}
