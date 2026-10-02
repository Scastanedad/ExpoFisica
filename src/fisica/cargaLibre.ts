/**
 * Física del objeto "Carga puntual" de la Estación 03 (renombrada "Campo
 * continuo"): UNA sola carga puntual libre con masa que se TRASLADA (nunca
 * gira: no hay varilla, es un punto) bajo el campo externo activo (placas
 * uniformes o una carga fuente puntual -- las mismas fuentes que ya modela
 * `campoEscena.ts`, extraído de `dipolo.ts`). Es el segundo "objeto en el
 * campo" de la estación, independiente del dipolo: con los MISMOS
 * `ParametrosCargaLibre` (mismo `modoCampo`, `externoSim`/`cargaFuente`), su
 * trayectoria no depende en absoluto del estado del dipolo -- no ejerce ni
 * recibe fuerza de él, la misma simplificación deliberada que ya existe entre
 * la fuente puntual y el dipolo (spec E5.1 §1: como mucho 3 cargas puntuales
 * interactúan a la vez, nunca 4).
 *
 * Integrador: Velocity Verlet (KDK) para la traslación, EL MISMO esquema de
 * tres líneas (medio-kick, drift, medio-kick) que usa `dipolo.ts#pasoDipolo`
 * para su centro de masa -- se duplica aquí a propósito (ver la nota de estilo
 * en el encabezado de `dipolo.ts` y en el prompt de la fase: "claridad de
 * física sobre DRY estructural") en vez de forzar una abstracción compartida
 * entre dos cuerpos de forma distinta (un cuerpo rígido de 2 cargas con
 * rotación vs. un punto sin rotación).
 *
 * Sub-pasos adaptativos: a diferencia de `dipolo.ts#subpasosDipolo` (que usa
 * la frecuencia de rotación, inexistente aquí), el criterio es puramente
 * traslacional: acotar el DESPLAZAMIENTO esperado por sub-paso a una fracción
 * del radio de una carga puntual (`RADIO_CARGA_PX`), para que un solo sub-paso
 * nunca "salte" por encima de la zona de exclusión de la fuente o penetre de
 * golpe una pared (ver `subpasosCargaLibre`).
 */
import { K_VISUAL, SOFTENING2, type PuntoCarga } from "./coulomb";
import { potencialEn } from "./coulomb";
import { potencialUniformeSim } from "./campoExterno";
import { reflejarEje } from "./dinamica";
import { ESCALA, RADIO_CARGA_PX, factoresSim, unidadesACoulomb, type ConfigEscala } from "./escala";
import { aplicarZonaExclusion, camposActivos, campoTotalEnPunto, type ModoCampoEscena } from "./campoEscena";

// ---- Constantes calibradas ----

/**
 * Masa traslacional, unidades de simulación: `1`, el MISMO convenio que
 * "Cargas en movimiento" (`dinamica.ts`, masa 1 por defecto) y `MASA_DIPOLO`.
 * La "cámara lenta" NO se consigue con una masa ficticia sino, igual que en la
 * estación 02, con un factor de tiempo (`DILATACION_CARGA_LIBRE`) y un
 * deslizador de velocidad: ver abajo.
 */
export const MASA_CARGA_LIBRE = 1;

/**
 * σ: segundos de SIMULACIÓN por segundo de reloj a velocidad 1× (mismo papel
 * que `DILATACION_DINAMICA = 8` de `dinamica.ts`). El canvas integra
 * `dt_reloj · σ · velocidad` segundos de simulación por frame.
 *
 * Por qué 22 y no 8: en modo "uniforme" el campo en unidades de simulación es
 * débil (`E_sim` ≈ 0.007–0.07 en el rango 30–300 kV, ver `campoUniformeASim`).
 * Con σ = 8, a 50 kV y q = 1 µC (valores iniciales) la carga tardaría ~17 s en
 * recorrer 100 px. Con σ = 22 (≈ √500, equivalente a la masa visual 0.002 de
 * la primera versión, ya revisada en pantalla):
 *
 *   - Uniforme, 50 kV, q = 1, 1×: 100 px en ≈ 6 s (≈ 2 s a 3×).
 *   - Uniforme, 300 kV, q = 5, 1×: 250 px en ≈ 1.7 s.
 *   - Puntual (fuente 5 µC, q = 5) soltada en contacto, 1×: ≈ 2000 px/s en
 *     pantalla (≈ 500 px/s a 0.25×). Física correcta, decisión confirmada.
 *
 * Dilatar el tiempo por σ equivale EXACTAMENTE a dividir la masa por σ² (la
 * trayectoria es la misma; ver el test "dilatación ≡ masa/σ²"), pero deja la
 * masa y la energía cinética en el mismo convenio que el resto de la app.
 */
export const DILATACION_CARGA_LIBRE = 22;

/** Tope de sub-pasos por paso lógico (mismo espíritu que `SUBPASOS_MAX_DIPOLO`/`SUBDIVISIONES_MAX`). */
export const SUBPASOS_MAX_CARGA_LIBRE = 400;

/**
 * Desplazamiento máximo tolerado por sub-paso, como fracción de
 * `RADIO_CARGA_PX`: con 0.5 (medio radio), un sub-paso nunca puede cruzar de
 * lado a lado la zona de exclusión (`distMin = 2·RADIO_CARGA_PX`, ver abajo)
 * ni penetrar una pared sin que `reflejarEje` la detecte en ese mismo
 * sub-paso.
 */
export const FRACCION_DESPLAZAMIENTO_MAX = 0.5;

/**
 * Distancia mínima a la carga fuente (zona de exclusión, modo "puntual") POR
 * DEFECTO: `2·RADIO_CARGA_PX` -- a diferencia del dipolo (`RADIO_CARGA_PX +
 * d/2`, el radio de la fuente más el brazo de la varilla), aquí NO hay
 * varilla: son dos cargas puntuales, "en contacto" cuando sus dos discos se
 * tocan. El canvas pasa `distMinFuente` con la suma de los radios REALMENTE
 * dibujados (crecen con |q| hasta 20 px), para que el contacto de la
 * simulación coincida con el que se ve (revisión física: con 5 µC los discos
 * se solapaban 12 px antes de "tocarse").
 */
export const DIST_MIN_EXCLUSION_CARGA_LIBRE = 2 * RADIO_CARGA_PX;

// ---- Estado ----

export interface EstadoCargaLibre {
  /** px lógicos. */
  x: number;
  y: number;
  /** px por segundo de simulación. */
  vx: number;
  vy: number;
}

export function estadoInicialCargaLibre(x: number, y: number, vx = 0, vy = 0): EstadoCargaLibre {
  return { x, y, vx, vy };
}

// ---- Parámetros de un paso ----

export interface ParametrosCargaLibre {
  /** Carga (unidades de simulación, con signo; rango esperado [±Q_MIN, ±Q_MAX] de `carga.ts`). */
  q: number;
  /** Masa traslacional (unidades de simulación, > 0). */
  masa: number;
  modoCampo: ModoCampoEscena;
  /** Campo externo uniforme, unidades de simulación (solo se usa si `modoCampo === "uniforme"`). */
  externoSim: readonly [number, number] | null;
  /** Carga puntual fuente, arrastrable (solo se usa si `modoCampo === "puntual"`). */
  cargaFuente: PuntoCarga | null;
  soft2?: number;
  /** Distancia centro-centro de contacto con la fuente (por defecto `DIST_MIN_EXCLUSION_CARGA_LIBRE`). */
  distMinFuente?: number;
  /**
   * Punto donde V = 0 en modo "uniforme" (el potencial de placas solo está
   * definido salvo una constante). El canvas pasa un punto de la placa
   * NEGATIVA: así `V` va de 0 (placa −) al voltaje del control (placa +) y
   * `U = qV` se lee directamente contra ese control. Por defecto (0, 0).
   * No afecta a la dinámica (solo a la lectura de U).
   */
  origenPotencial?: { x: number; y: number };
}

/** Límites rectangulares del canvas para el rebote elástico (paredes). */
export interface LimitesCargaLibre {
  ancho: number;
  alto: number;
  /** Radio de la carga dibujada (por defecto `RADIO_CARGA_PX`): distancia mínima del CENTRO a cada borde. */
  radio?: number;
  /**
   * Distancia mínima del centro a cada borde, si difiere por lado (p. ej. en
   * modo "uniforme" las placas dibujadas ocupan los dos bordes de un eje:
   * radio + grosor de placa ahí, para que la carga rebote contra la cara de la
   * placa y no "dentro" de ella). Si se da, reemplaza a `radio` en las paredes.
   */
  margenes?: { izquierda: number; derecha: number; arriba: number; abajo: number };
}

// ---- Fuerza ----

/** `F = qE` con el campo total (fuente activa + externo si aplica), unidades de simulación. */
export function fuerzaSobreCargaLibre(estado: EstadoCargaLibre, params: ParametrosCargaLibre): [number, number] {
  const { cargasFuente, externoSim } = camposActivos(params);
  const [ex, ey] = campoTotalEnPunto(estado.x, estado.y, cargasFuente, externoSim, params.soft2 ?? SOFTENING2);
  return [params.q * ex, params.q * ey];
}

function esFinito(e: EstadoCargaLibre): boolean {
  return Number.isFinite(e.x) && Number.isFinite(e.y) && Number.isFinite(e.vx) && Number.isFinite(e.vy);
}

// ---- Sub-pasos adaptativos ----

/**
 * `k` tal que el desplazamiento esperado en un sub-paso (cota superior
 * `|v|·h + ½|a|·h²`, movimiento uniformemente acelerado) no exceda
 * `FRACCION_DESPLAZAMIENTO_MAX · RADIO_CARGA_PX`. A diferencia de
 * `subpasosDipolo` (criterio `ω·h`, rotacional), este es puramente
 * traslacional: la cantidad relevante para no "saltarse" la zona de
 * exclusión o un rebote de pared es cuánto se mueve el punto, no una
 * frecuencia.
 */
export function subpasosCargaLibre(
  estado: EstadoCargaLibre,
  params: ParametrosCargaLibre,
  dtLogico: number,
  radio: number = RADIO_CARGA_PX,
): number {
  const [fx, fy] = fuerzaSobreCargaLibre(estado, params);
  const M = params.masa > 0 ? params.masa : 1;
  const aMag = Math.hypot(fx, fy) / M;
  const vMag = Math.hypot(estado.vx, estado.vy);
  const desplazamiento = vMag * dtLogico + 0.5 * aMag * dtLogico * dtLogico;
  const limite = FRACCION_DESPLAZAMIENTO_MAX * radio;
  const k = limite > 0 && desplazamiento > 0 ? Math.ceil(desplazamiento / limite) : 1;
  return Math.min(SUBPASOS_MAX_CARGA_LIBRE, Math.max(1, k));
}

// ---- Integración ----

/**
 * Un sub-paso de tamaño `h`: Velocity Verlet (KDK) para la traslación --
 * medio-kick con la fuerza inicial, drift, rebote elástico en las paredes
 * (`dinamica.ts#reflejarEje`, reutilizada, no duplicada: reflexión especular
 * con corrección de impulso O(dt²)), zona de exclusión frente a la fuente
 * puntual si aplica, y el segundo medio-kick con la fuerza en la posición ya
 * corregida (mismo patrón que `dipolo.ts#pasoDipolo` para su traslación).
 */
export function pasoCargaLibre(
  estado: EstadoCargaLibre,
  params: ParametrosCargaLibre,
  h: number,
  limites: LimitesCargaLibre,
): EstadoCargaLibre {
  const M = params.masa > 0 ? params.masa : 1;
  const radio = limites.radio ?? RADIO_CARGA_PX;

  // Traslación: kick-drift (mitad del kick con la fuerza inicial). Mismo
  // esquema que la traslación de `dipolo.ts#pasoDipolo` (ver cabecera).
  const [fx0, fy0] = fuerzaSobreCargaLibre(estado, params);
  let vx = estado.vx + (fx0 / M) * (h / 2);
  let vy = estado.vy + (fy0 / M) * (h / 2);
  const x0 = estado.x;
  const y0 = estado.y;
  let x = estado.x + vx * h;
  let y = estado.y + vy * h;

  // Rebote elástico en los cuatro bordes del canvas.
  const m = limites.margenes ?? { izquierda: radio, derecha: radio, arriba: radio, abajo: radio };
  const hx = limites.ancho - m.derecha;
  const hy = limites.alto - m.abajo;
  const ax0 = fx0 / M;
  const ay0 = fy0 / M;
  const rx = reflejarEje(x, x0, vx, ax0, h, m.izquierda, hx);
  if (rx) {
    x = rx[0];
    vx = rx[1];
  }
  const ry = reflejarEje(y, y0, vy, ay0, h, m.arriba, hy);
  if (ry) {
    y = ry[0];
    vy = ry[1];
  }

  // Zona de exclusión cerca de la fuente puntual (modo "puntual").
  let intermedio: EstadoCargaLibre = { x, y, vx, vy };
  if (params.modoCampo === "puntual" && params.cargaFuente) {
    const r = aplicarZonaExclusion(intermedio.x, intermedio.y, intermedio.vx, intermedio.vy, params.cargaFuente, params.distMinFuente ?? DIST_MIN_EXCLUSION_CARGA_LIBRE);
    // La exclusión puede empujar fuera de las paredes (fuente pegada a un borde): se reaplica el límite.
    intermedio = {
      x: Math.min(hx, Math.max(m.izquierda, r.x)),
      y: Math.min(hy, Math.max(m.arriba, r.y)),
      vx: r.vx,
      vy: r.vy,
    };
  }

  // Segundo half-kick de traslación, con la fuerza en la posición corregida.
  const [fx1, fy1] = fuerzaSobreCargaLibre(intermedio, params);
  vx = intermedio.vx + (fx1 / M) * (h / 2);
  vy = intermedio.vy + (fy1 / M) * (h / 2);

  return { x: intermedio.x, y: intermedio.y, vx, vy };
}

/**
 * Un paso "de trabajo" de `dtLogico` segundos de simulación: se subdivide en
 * `subpasosCargaLibre` sub-pasos de `pasoCargaLibre`. Nunca propaga
 * NaN/Infinity (misma guarda que `dipolo.ts#pasoAvanceDipolo`): si un
 * sub-paso produjera un estado no finito, se descarta y se conserva el
 * último estado válido.
 */
export function pasoAvanceCargaLibre(
  estado: EstadoCargaLibre,
  params: ParametrosCargaLibre,
  dtLogico: number,
  limites: LimitesCargaLibre,
): EstadoCargaLibre {
  if (!(dtLogico > 0)) return estado;
  const radio = limites.radio ?? RADIO_CARGA_PX;
  const k = subpasosCargaLibre(estado, params, dtLogico, radio);
  const h = dtLogico / k;
  let e = estado;
  for (let i = 0; i < k; i++) {
    const siguiente = pasoCargaLibre(e, params, h, limites);
    e = esFinito(siguiente) ? siguiente : e;
  }
  return e;
}

// ---- Lectura para la UI ----

/**
 * Sin rapidez en m/s A PROPÓSITO (revisión física): la simulación va en
 * "cámara lenta" (`DILATACION_CARGA_LIBRE`, más el deslizador), así que una
 * rapidez en m/s no sería la real y, junto a K en julios, implicaría una masa
 * absurda. Las ENERGÍAS sí son SI honestas: `K` es el trabajo `qΔV` hecho por
 * el campo, que no depende de la escala de tiempo ni de la masa.
 */
export interface LecturaCargaLibre {
  /** N. */
  fuerzaNetaN: number;
  /** J: `U = qV` -- potencial de placas (`potencialUniformeSim`, V = 0 en
   * `origenPotencial`) en modo "uniforme", o potencial de la fuente
   * (`potencialEn`, V = 0 en el infinito) en modo "puntual" (nunca ambos:
   * misma regla de `camposActivos`). En modo "puntual" se usa el potencial
   * CON softening, el mismo del que deriva la fuerza que mueve la carga: así
   * K + U se conserva de verdad (con `kqQ/r` exacto habría una "deriva"
   * aparente de hasta ~6 % en el contacto, 28 px).
   */
  energiaJ: number;
  /**
   * J: `K = ½mv²` en unidades de simulación convertida con el MISMO factor de
   * energía que `U` (`factoresSim(K_VISUAL).energia`). Es coherente porque en
   * simulación `F = qE` y `W = F·Δx` usan las mismas unidades que `½mv²`
   * (teorema trabajo-energía dentro de la simulación), así que `K + U` se
   * conserva (salvo en el contacto con la fuente, que frena la parte radial).
   */
  energiaCineticaJ: number;
}

export function calcularLecturaCargaLibre(
  estado: EstadoCargaLibre,
  params: ParametrosCargaLibre,
  esc: ConfigEscala = ESCALA,
): LecturaCargaLibre {
  const { cargasFuente, externoSim } = camposActivos(params);
  const [fx, fy] = fuerzaSobreCargaLibre(estado, params);
  const factores = factoresSim(K_VISUAL, esc);
  const fuerzaNetaN = Math.hypot(fx, fy) * factores.fuerza;

  const vPxS = Math.hypot(estado.vx, estado.vy);

  const vSim =
    params.modoCampo === "uniforme" && externoSim
      ? potencialUniformeSim(estado.x, estado.y, externoSim, params.origenPotencial)
      : potencialEn(estado.x, estado.y, cargasFuente, params.soft2 ?? SOFTENING2);
  const vSI = vSim * factores.potencial;
  const qC = unidadesACoulomb(params.q, esc);
  const energiaJ = qC * vSI;
  const energiaCineticaJ = 0.5 * params.masa * vPxS * vPxS * factores.energia;

  return { fuerzaNetaN, energiaJ, energiaCineticaJ };
}
