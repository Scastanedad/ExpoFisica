/**
 * Degradación de calidad medida (E2.3 §8, punto 3). Tres niveles con el mismo
 * dibujo pero menos cálculo:
 *
 *   alta   celda 10 px,   presupuesto 200 líneas, paso 6 px
 *   media  celda 12.5 px, presupuesto 120 líneas, paso 8 px
 *   baja   celda 25 px,   presupuesto  60 líneas, paso 10 px  (mínimo 4 líneas por carga)
 *
 * Se mide, en cada reconstrucción de la capa, (a) su coste en JS (cálculo +
 * comandos de dibujo, ms) y (b) el intervalo hasta el frame siguiente: el raster
 * del canvas es diferido (en el hilo del compositor o de la GPU) y no aparece en
 * (a), pero sí retrasa el frame siguiente. Se baja un nivel si la media de las
 * últimas 30 reconstrucciones supera 14 ms de JS (spec) o si el frame siguiente
 * tarda más de max(20 ms, 1.3 × periodo de refresco) de media (< 50 fps). Para
 * subir hacen falta 60 reconstrucciones seguidas por debajo de 7 ms y sin frames
 * perdidos (histéresis). Si tras subir hay que volver a bajar enseguida, la
 * ventana para volver a subir se duplica (evita oscilar entre dos niveles).
 * Función pura, sin DOM: el reloj lo pone quien la llama.
 */

export interface NivelCalidad {
  nombre: "alta" | "media" | "baja";
  /** Paso de la malla de potencial (px). */
  celda: number;
  /** Presupuesto total de líneas de campo (`repartirLineas`). */
  presupuesto: number;
  /** Longitud de arco por paso RK2 (px). */
  paso: number;
}

export const NIVELES_CALIDAD: readonly NivelCalidad[] = [
  { nombre: "alta", celda: 10, presupuesto: 200, paso: 6 },
  { nombre: "media", celda: 12.5, presupuesto: 120, paso: 8 },
  { nombre: "baja", celda: 25, presupuesto: 60, paso: 10 },
];

/** Tiempo medio (ms) por encima del cual se baja de nivel. */
export const UMBRAL_BAJAR_MS = 14;
/** Tiempo (ms) por debajo del cual una reconstrucción cuenta para subir. */
export const UMBRAL_SUBIR_MS = 7;
/** Por debajo de 50 fps (frame siguiente > 20 ms) también se baja. */
export const UMBRAL_PERIODO_MS = 20;
export const VENTANA_BAJAR = 30;
export const VENTANA_SUBIR = 60;
const VENTANA_SUBIR_MAX = 960;
/** Si se baja antes de tantas reconstrucciones tras haber subido, se duplica la ventana de subida. */
const REBOTE_MAX = 300;
/** Periodo de refresco supuesto mientras no se han observado frames suficientes. */
const PERIODO_INICIAL_MS = 1000 / 60;
const FRAMES_PARA_PERIODO = 30;
const FRAMES_HISTORIA = 90;

export interface GestorCalidad {
  nivel(): NivelCalidad;
  indice(): number;
  /** Cada frame (haya o no reconstrucción): ms desde el frame anterior. Estima el periodo de refresco. */
  observarFrame(intervaloMs: number): void;
  /** Periodo de refresco estimado (mínimo de los últimos intervalos), ms. */
  periodoRefresco(): number;
  /**
   * Registra una reconstrucción: coste en JS (ms) y, si ya se conoce, el
   * intervalo hasta el frame siguiente. Devuelve true si cambió el nivel.
   */
  registrar(msJs: number, periodoFrameMs?: number): boolean;
}

export function crearGestorCalidad(inicial = 0): GestorCalidad {
  let idx = Math.min(NIVELES_CALIDAD.length - 1, Math.max(0, inicial));
  let muestrasJs: number[] = [];
  let muestrasPeriodo: number[] = [];
  let seguidasRapidas = 0;
  let ventanaSubir = VENTANA_SUBIR;
  let desdeSubida = Infinity;
  const frames: number[] = [];

  const periodoRefresco = () => (frames.length < FRAMES_PARA_PERIODO ? PERIODO_INICIAL_MS : Math.min(...frames));
  const media = (a: number[]) => a.reduce((x, y) => x + y, 0) / a.length;

  const cambiarA = (nuevo: number) => {
    idx = nuevo;
    muestrasJs = [];
    muestrasPeriodo = [];
    seguidasRapidas = 0;
  };

  return {
    nivel: () => NIVELES_CALIDAD[idx],
    indice: () => idx,
    periodoRefresco,
    observarFrame(intervaloMs) {
      frames.push(intervaloMs);
      if (frames.length > FRAMES_HISTORIA) frames.shift();
    },
    registrar(msJs, periodoFrameMs) {
      desdeSubida++;
      const T = periodoRefresco();
      muestrasJs.push(msJs);
      if (muestrasJs.length > VENTANA_BAJAR) muestrasJs.shift();
      if (periodoFrameMs !== undefined) {
        muestrasPeriodo.push(periodoFrameMs);
        if (muestrasPeriodo.length > VENTANA_BAJAR) muestrasPeriodo.shift();
      }
      const sinFramePerdido = periodoFrameMs === undefined || periodoFrameMs <= 1.15 * T + 2;
      seguidasRapidas = msJs < UMBRAL_SUBIR_MS && sinFramePerdido ? seguidasRapidas + 1 : 0;

      if (idx < NIVELES_CALIDAD.length - 1) {
        const jsLento = muestrasJs.length >= VENTANA_BAJAR && media(muestrasJs) > UMBRAL_BAJAR_MS;
        const frameLento =
          muestrasPeriodo.length >= VENTANA_BAJAR &&
          media(muestrasPeriodo) > Math.max(UMBRAL_PERIODO_MS, 1.3 * T);
        if (jsLento || frameLento) {
          if (desdeSubida < REBOTE_MAX) ventanaSubir = Math.min(VENTANA_SUBIR_MAX, ventanaSubir * 2);
          cambiarA(idx + 1);
          return true;
        }
      }
      if (seguidasRapidas >= ventanaSubir && idx > 0) {
        desdeSubida = 0;
        cambiarA(idx - 1);
        return true;
      }
      return false;
    },
  };
}
