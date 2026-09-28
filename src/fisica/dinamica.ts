/**
 * Física de la estación dinámica (especificaciones E2.2, E2.5 y E2.1 §5),
 * como funciones PURAS sobre un `SistemaDinamico` (sin DOM ni `postMessage`).
 * El Web Worker (`worker/motorFisico.worker.ts`) solo conserva el estado, los
 * mensajes y el reloj; todo lo que se calcula vive aquí para poder probarlo en
 * Node bajo Vitest.
 *
 * Modelo: fuerza de Coulomb entre todas las cargas con softening (la MISMA ley
 * y constantes que `campoEn`), integrada con velocity Verlet (KDK) y paso fijo
 * `DT_SUB` de tiempo de SIMULACIÓN. La "dilatación temporal" `DILATACION_DINAMICA`
 * (σ = 8) solo decide cuántos sub-pasos se ejecutan por segundo de reloj: la
 * precisión no depende del deslizador de velocidad ni de σ. `K_VISUAL`
 * y `SOFTENING2` no cambian.
 *
 * Las paredes son un artificio del simulador: reflexión ESPECULAR con
 * corrección de impulso (E2.2 §2.1), que conserva la energía (el `clamp` del
 * motor anterior la degradaba: el aviso del 8 % saltaba en minutos).
 *
 * Toda acción del visitante (mover, agarrar, soltar, agregar, quitar, cambiar q)
 * pasa por `intervenir`: invalida las fuerzas cacheadas (FSAL), acumula el
 * trabajo externo y recalibra la energía de referencia.
 */
import { K_VISUAL, SOFTENING2 } from "./coulomb";
import { normalizarCarga } from "./carga";
import { RADIO_CARGA_PX } from "./escala";
import { velocidadPunteroASim } from "./empujon";

// ---- Constantes ----

/** σ: segundos de simulación por segundo de reloj a velocidad 1×. */
export const DILATACION_DINAMICA = 8;
/** Paso de integración, en segundos de SIMULACIÓN (constante). */
export const DT_SUB = 1 / 120;
/** Recorte del tiempo real por tick (pestañas dormidas, pausas del navegador). */
export const MAX_DT_REAL_S = 0.05;
export const MAX_SUBPASOS_POR_TICK = 200;
/** Rango del deslizador de velocidad (defensa en el Worker). */
export const VELOCIDAD_MIN = 0.25;
export const VELOCIDAD_MAX = 3;

export const SEPARACION_INICIAL_PX = 60; // dMin
export const MARGEN_INICIAL_PX = 60;
/** dMax: cada carga nueva nace con una vecina a ≤ 250 px (decisión del usuario). */
export const VECINO_MAX_INICIAL_PX = 250;
export const INTENTOS_COLOCACION = 500;

/** Deriva normalizada que dispara el aviso (8 %) y a la que se rearma (4 %). */
export const UMBRAL_DERIVA = 0.08;
export const UMBRAL_REARME_DERIVA = 0.04;
/** |E| < 0.5 % de K + Σ|U| se muestra como "≈ 0 J". */
export const UMBRAL_E_CERO = 5e-3;
/** K y U solo eliminan ruido numérico. */
export const UMBRAL_RUIDO = 1e-9;

// ---- Estado ----

export interface Punto {
  x: number;
  y: number;
}

export interface SistemaDinamico {
  ancho: number;
  alto: number;
  /** Constante de la ley de fuerza (K_VISUAL), softening² y radio de las paredes (parametrizables para tests). */
  k: number;
  soft2: number;
  radio: number;
  ids: string[];
  x: number[];
  y: number[];
  vx: number[];
  vy: number[];
  q: number[];
  masa: number[];
  /** Carga sujetada por el puntero: no se integra, pero sigue ejerciendo fuerza. */
  anclada: boolean[];
  /** Fuerza sobre cada carga en las posiciones ACTUALES (FSAL: se reutiliza entre pasos). */
  fx: number[];
  fy: number[];
  /** false tras cualquier mutación externa: el siguiente paso recalcula las fuerzas. */
  fuerzasValidas: boolean;
  /** Referencia de deriva; se recalibra en cada intervención. */
  energiaInicial: number;
  /** Σ ΔE de las intervenciones del visitante. */
  trabajoExterno: number;
  /** Número de intervenciones (para mostrar la fila "Energía que tú aportaste"). */
  intervenciones: number;
}

export function crearSistema(
  ancho: number,
  alto: number,
  opciones: { k?: number; soft2?: number; radio?: number } = {},
): SistemaDinamico {
  return {
    ancho,
    alto,
    k: opciones.k ?? K_VISUAL,
    soft2: opciones.soft2 ?? SOFTENING2,
    radio: opciones.radio ?? RADIO_CARGA_PX,
    ids: [],
    x: [],
    y: [],
    vx: [],
    vy: [],
    q: [],
    masa: [],
    anclada: [],
    fx: [],
    fy: [],
    fuerzasValidas: false,
    energiaInicial: 0,
    trabajoExterno: 0,
    intervenciones: 0,
  };
}

// ---- Fuerzas e integración ----

/**
 * F_i = Σ_j K q_i q_j (r_i − r_j) / (r² + ε²)^{3/2}. Rellena `fx`/`fy` (3ª ley
 * por par: suma +f a i y −f a j) y marca `fuerzasValidas`. Sin asignaciones
 * salvo cuando cambia el número de cargas.
 */
export function calcularFuerzas(s: SistemaDinamico): void {
  const n = s.x.length;
  if (s.fx.length !== n) {
    s.fx = new Array<number>(n).fill(0);
    s.fy = new Array<number>(n).fill(0);
  } else {
    s.fx.fill(0);
    s.fy.fill(0);
  }
  const { x, y, q, fx, fy, k, soft2 } = s;
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const dx = x[i] - x[j];
      const dy = y[i] - y[j];
      const r2 = dx * dx + dy * dy + soft2;
      const factor = (k * q[i] * q[j]) / (r2 * Math.sqrt(r2));
      fx[i] += factor * dx;
      fy[i] += factor * dy;
      fx[j] -= factor * dx;
      fy[j] -= factor * dy;
    }
  }
  s.fuerzasValidas = true;
}

/**
 * Reflexión especular de un eje contra las paredes [lo, hi], con corrección de
 * impulso `Δv = a₁·dt·(1 − 2f)` (f = fracción del paso hasta el contacto): lleva
 * el error del rebote de O(dt) a O(dt²). Devuelve [pos', vel'] si cruzó la pared.
 */
export function reflejarEje(
  pos: number,
  pos0: number,
  vel: number,
  a1: number,
  dt: number,
  lo: number,
  hi: number,
): [number, number] | null {
  const pared = pos < lo ? lo : pos > hi ? hi : null;
  if (pared === null) return null;
  const d0 = Math.abs(pos0 - pared); // distancia a la pared antes del drift
  const exceso = Math.abs(pos - pared); // penetración tras el drift
  const f = d0 + exceso > 0 ? Math.min(1, d0 / (d0 + exceso)) : 0.5;
  return [2 * pared - pos, -vel + a1 * dt * (1 - 2 * f)];
}

/**
 * Un paso de velocity Verlet (kick-drift-kick) con FSAL y paredes. Las cargas
 * ancladas ni se mueven ni cambian de velocidad (pero ejercen fuerza). Si
 * `!fuerzasValidas`, recalcula las fuerzas primero.
 */
export function pasoVerlet(s: SistemaDinamico, dt: number): void {
  const n = s.x.length;
  if (n === 0) return;
  if (!s.fuerzasValidas) calcularFuerzas(s);
  const lo = s.radio;
  const hx = s.ancho - s.radio;
  const hy = s.alto - s.radio;
  for (let i = 0; i < n; i++) {
    if (s.anclada[i]) continue;
    const ax = s.fx[i] / s.masa[i]; // a₁ (inicio del paso)
    const ay = s.fy[i] / s.masa[i];
    const x0 = s.x[i];
    const y0 = s.y[i];
    s.vx[i] += (ax * dt) / 2; // kick
    s.vy[i] += (ay * dt) / 2;
    s.x[i] += s.vx[i] * dt; // drift
    s.y[i] += s.vy[i] * dt;
    const rx = reflejarEje(s.x[i], x0, s.vx[i], ax, dt, lo, hx);
    if (rx) {
      s.x[i] = rx[0];
      s.vx[i] = rx[1];
    }
    const ry = reflejarEje(s.y[i], y0, s.vy[i], ay, dt, lo, hy);
    if (ry) {
      s.y[i] = ry[0];
      s.vy[i] = ry[1];
    }
  }
  calcularFuerzas(s); // FSAL: queda válida para el paso siguiente
  for (let i = 0; i < n; i++) {
    if (s.anclada[i]) continue;
    s.vx[i] += ((s.fx[i] / s.masa[i]) * dt) / 2; // kick
    s.vy[i] += ((s.fy[i] / s.masa[i]) * dt) / 2;
  }
}

// ---- Paso "de trabajo": sub-pasos adaptativos (revisión física de la Fase 2) ----

/**
 * Cargas por sub-división: `k = ceil(|q|máx / Q_POR_SUBDIVISION)` sub-pasos de
 * `DT_SUB/k` por paso lógico (k = 1 hasta 1.5 µC; 2 con 2–3; 3 con 3.5–4.5; 4 con 5).
 * Mantiene ω·dt ≲ 0.035 con ω² = 2K·q²/ε³ (masa 1), el régimen donde las
 * paredes no acumulan deriva apreciable (ver `pasoAvance`).
 */
export const Q_POR_SUBDIVISION = 1.5;
export const SUBDIVISIONES_MAX = 4;
/** Sub-pasos extra (dt/m) de un paso en el que alguna carga va a tocar una pared. */
export const SUBDIVISIONES_PARED = 8;

/** Número de sub-pasos por paso lógico según la mayor |q| de la escena (1..SUBDIVISIONES_MAX). */
export function subdivisionesPaso(s: SistemaDinamico): number {
  let qMax = 0;
  for (let i = 0; i < s.q.length; i++) qMax = Math.max(qMax, Math.abs(s.q[i]));
  return Math.min(SUBDIVISIONES_MAX, Math.max(1, Math.ceil(qMax / Q_POR_SUBDIVISION - 1e-9)));
}

/**
 * ¿Alguna carga libre puede tocar una pared en este paso? Margen generoso:
 * el doble del desplazamiento máximo esperable (|v| + |a|·dt)·dt.
 */
function cercaDePared(s: SistemaDinamico, dt: number): boolean {
  if (!s.fuerzasValidas) calcularFuerzas(s);
  const xmax = s.ancho - s.radio;
  const ymax = s.alto - s.radio;
  for (let i = 0; i < s.x.length; i++) {
    if (s.anclada[i]) continue;
    const mx = 2 * (Math.abs(s.vx[i]) + (Math.abs(s.fx[i]) / s.masa[i]) * dt) * dt;
    const my = 2 * (Math.abs(s.vy[i]) + (Math.abs(s.fy[i]) / s.masa[i]) * dt) * dt;
    if (s.x[i] - mx < s.radio || s.x[i] + mx > xmax || s.y[i] - my < s.radio || s.y[i] + my > ymax) return true;
  }
  return false;
}

/**
 * Un paso lógico de `dt` segundos de simulación para el motor real. Envuelve a
 * `pasoVerlet` con dos refinamientos que NO cambian el reloj (el Worker sigue
 * contando pasos de `DT_SUB`):
 *
 * 1. Paredes: si alguna carga va a tocar una pared, el paso se hace en
 *    `SUBDIVISIONES_PARED` sub-pasos. La reflexión con corrección de impulso es
 *    exacta a O(dt²) por rebote, pero con fuerzas grandes (par +/− pegado a una
 *    pared, |q| alto) ese O(dt²) se acumula: medido con [q, q, −q, −q], 3600 s
 *    de simulación, q = 5, la deriva normalizada mediana baja de 15.9 % a 2.6 %
 *    (y sin paredes la misma escena deriva solo 0.09 %: la causa son los rebotes,
 *    no el núcleo suavizado).
 * 2. Carga grande: `subdivisionesPaso(s)` sub-pasos por paso (k = 4 con 5 µC),
 *    que dejan la deriva con paredes en ~0.04 % (q = 5, misma medida).
 *
 * Las funciones de las estaciones y del Worker usan ESTA función; los tests de
 * integrador puro (equivalencia K×σ², FSAL, …) llaman a `pasoVerlet`.
 */
export function pasoAvance(s: SistemaDinamico, dt: number = DT_SUB): void {
  const k = subdivisionesPaso(s);
  const h = dt / k;
  for (let j = 0; j < k; j++) {
    if (cercaDePared(s, h)) {
      for (let m = 0; m < SUBDIVISIONES_PARED; m++) pasoVerlet(s, h / SUBDIVISIONES_PARED);
    } else {
      pasoVerlet(s, h);
    }
  }
}

// ---- Reloj ----

/**
 * Reloj puro: cuántos sub-pasos de `DT_SUB` hay que ejecutar para el tiempo
 * real transcurrido. El acumulador está en segundos de SIMULACIÓN y el paso
 * es fijo: el deslizador cambia el ritmo (σ·velocidad s_sim por s de reloj) y
 * no el tamaño del paso, y el resultado no depende de la frecuencia del timer.
 */
export function planificarSubpasos(
  acum: number,
  dtRealS: number,
  velocidad: number,
  opc: { sigma?: number; dtSub?: number; maxSub?: number; maxDtRealS?: number } = {},
): { n: number; acum: number } {
  const sigma = opc.sigma ?? DILATACION_DINAMICA;
  const dtSub = opc.dtSub ?? DT_SUB;
  const maxSub = opc.maxSub ?? MAX_SUBPASOS_POR_TICK;
  const maxDt = opc.maxDtRealS ?? MAX_DT_REAL_S;
  const dt = Math.min(Math.max(dtRealS, 0), maxDt); // recorta pestañas dormidas / pausas del navegador
  const total = acum + dt * sigma * velocidad; // s de simulación disponibles
  const n = Math.floor(total / dtSub + 1e-9); // 1e-9: evita 7.9999999 por coma flotante
  if (n > maxSub) return { n: maxSub, acum: 0 }; // sobrecarga: se descarta el remanente
  return { n, acum: Math.max(0, total - n * dtSub) };
}

// ---- Colocación inicial ----

/**
 * Posiciones iniciales: uniformes en [margen, ancho−margen] × [margen, alto−margen],
 * secuenciales (cada carga respeta a las anteriores y a las `existentes`), con
 * separación mínima `dMin` y con una vecina a ≤ `dMax` (la primera de todas no
 * se restringe). Orden de llamadas a `rng` por intento: x, luego y. Si nadie
 * cumple en `intentos` (canvas saturado) devuelve la mejor candidata vista:
 * la mayor separación con vecina ≤ dMax; si ninguna tiene vecina ≤ dMax, la
 * más cercana a ese rango.
 */
export interface OpcionesColocacion {
  margen?: number;
  dMin?: number;
  dMax?: number;
  intentos?: number;
  rng?: () => number;
}

export function colocarInicial(
  n: number,
  ancho: number,
  alto: number,
  existentes: readonly Punto[] = [],
  opc: OpcionesColocacion = {},
): Punto[] {
  const margen = opc.margen ?? MARGEN_INICIAL_PX;
  const dMin = opc.dMin ?? SEPARACION_INICIAL_PX;
  const dMax = opc.dMax ?? VECINO_MAX_INICIAL_PX;
  const intentos = Math.max(1, opc.intentos ?? INTENTOS_COLOCACION);
  const rng = opc.rng ?? Math.random;
  const todas: Punto[] = [...existentes];
  const salida: Punto[] = [];
  for (let k = 0; k < n; k++) {
    let elegida: Punto | null = null;
    // Respaldo: (a) con vecina ≤ dMax y la mayor separación; (b) sin ninguna así, la más cercana a dMax.
    let respaldoEnRango: Punto | null = null;
    let respaldoEnRangoD = -1;
    let respaldoFuera: Punto | null = null;
    let respaldoFueraD = Infinity;
    for (let t = 0; t < intentos; t++) {
      const px = margen + rng() * Math.max(1, ancho - 2 * margen);
      const py = margen + rng() * Math.max(1, alto - 2 * margen);
      const p = { x: px, y: py };
      let d = Infinity;
      for (const o of todas) d = Math.min(d, Math.hypot(p.x - o.x, p.y - o.y));
      if (d >= dMin && (d <= dMax || todas.length === 0)) {
        elegida = p;
        break;
      }
      if (d <= dMax) {
        if (d > respaldoEnRangoD) {
          respaldoEnRango = p;
          respaldoEnRangoD = d;
        }
      } else if (d < respaldoFueraD) {
        respaldoFuera = p;
        respaldoFueraD = d;
      }
    }
    const final = elegida ?? respaldoEnRango ?? respaldoFuera ?? { x: margen, y: margen };
    salida.push(final);
    todas.push(final);
  }
  return salida;
}

// ---- Energía ----

export interface Energias {
  cinetica: number;
  potencial: number;
  total: number;
  /** K + Σ|U_ij|, siempre ≥ 0 (normalizador de la deriva). */
  escala: number;
}

/**
 * K = Σ ½ m |v|² (v en px por s de SIMULACIÓN); U = Σ_{i<j} K q_i q_j /
 * √(r² + ε²), la MISMA U de la que sale la fuerza (`−dU/dr = F`), así que K + U
 * se conserva. En unidades de simulación: a julios con `energiaSimAJ(x, K_VISUAL)`.
 */
export function energias(s: SistemaDinamico): Energias {
  const n = s.x.length;
  let cinetica = 0;
  for (let i = 0; i < n; i++) {
    cinetica += 0.5 * s.masa[i] * (s.vx[i] * s.vx[i] + s.vy[i] * s.vy[i]);
  }
  let potencial = 0;
  let absU = 0;
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const dx = s.x[i] - s.x[j];
      const dy = s.y[i] - s.y[j];
      const u = (s.k * s.q[i] * s.q[j]) / Math.sqrt(dx * dx + dy * dy + s.soft2);
      potencial += u;
      absU += Math.abs(u);
    }
  }
  return { cinetica, potencial, total: cinetica + potencial, escala: cinetica + absU };
}

/**
 * Deriva normalizada `|E − E_ref| / (K + Σ|U|)` en el instante actual. La
 * métrica antigua `|E − E₀|/|E₀|` explotaba con signos mixtos (E₀ ≈ 0).
 */
export function derivaNormalizada(s: SistemaDinamico, energiaRef: number = s.energiaInicial): number {
  const e = energias(s);
  return e.escala < 1e-12 ? 0 : Math.abs(e.total - energiaRef) / e.escala;
}

/**
 * Valor a mostrar de una energía: 0 si |e| ≤ umbralRel·escala (evita "9.98 nJ"
 * por ruido de coma flotante, y −0); si no, `e`.
 */
export function valorEnergiaMostrable(eSim: number, escalaSim: number, umbralRel: number): number {
  return Math.abs(eSim) <= umbralRel * escalaSim ? 0 : eSim;
}

/**
 * Aviso de deriva con histéresis: dispara al superar el 8 %, no vuelve a
 * disparar hasta que la deriva baje del 4 % o el llamador rearme el estado
 * (`armado = true`) tras una intervención.
 */
export function evaluarAviso(
  estado: { armado: boolean },
  deriva: number,
): { armado: boolean; disparar: boolean } {
  const armado = estado.armado || deriva < UMBRAL_REARME_DERIVA;
  if (armado && deriva > UMBRAL_DERIVA) return { armado: false, disparar: true };
  return { armado, disparar: false };
}

// ---- Intervenciones del visitante ----

/**
 * Envuelve toda mutación externa del sistema: invalida las fuerzas cacheadas
 * (FSAL), acumula el trabajo del visitante (ΔK + ΔU) y recalibra la energía de
 * referencia, de modo que la deriva vuelve a 0.
 */
export function intervenir(s: SistemaDinamico, mutar: () => void): void {
  const antes = energias(s).total;
  mutar();
  s.fuerzasValidas = false;
  const despues = energias(s).total;
  s.trabajoExterno += despues - antes;
  s.energiaInicial = despues;
  s.intervenciones += 1;
}

function indiceDe(s: SistemaDinamico, id: string): number {
  return s.ids.indexOf(id);
}

/**
 * Vacía el sistema y coloca las cargas (q normalizada; las inválidas se
 * descartan) con `colocarInicial`. Referencia de energía nueva, W_ext = 0.
 * `opc` son las opciones de `colocarInicial` (rng inyectable para los tests).
 */
export function inicializarSistema(
  s: SistemaDinamico,
  cargas: ReadonlyArray<{ id: string; q: number; masa: number }>,
  opc: OpcionesColocacion = {},
): void {
  s.ids = [];
  s.x = [];
  s.y = [];
  s.vx = [];
  s.vy = [];
  s.q = [];
  s.masa = [];
  s.anclada = [];
  s.fx = [];
  s.fy = [];
  const validas: Array<{ id: string; q: number; masa: number }> = [];
  for (const c of cargas) {
    const q = normalizarCarga(c.q);
    if (q !== null && !validas.some((v) => v.id === c.id)) validas.push({ id: c.id, q, masa: c.masa });
  }
  const posiciones = colocarInicial(validas.length, s.ancho, s.alto, [], opc);
  validas.forEach((c, i) => {
    s.ids.push(c.id);
    s.x.push(posiciones[i].x);
    s.y.push(posiciones[i].y);
    s.vx.push(0);
    s.vy.push(0);
    s.q.push(c.q);
    s.masa.push(c.masa > 0 && Number.isFinite(c.masa) ? c.masa : 1);
    s.anclada.push(false);
  });
  s.fuerzasValidas = false;
  s.energiaInicial = energias(s).total;
  s.trabajoExterno = 0;
  s.intervenciones = 0;
}

/**
 * Agrega una carga en reposo (q normalizada; 0/NaN o id repetido se rechazan).
 * Sin `posicion`, la coloca con `colocarInicial` respetando las existentes.
 */
export function agregarCarga(
  s: SistemaDinamico,
  id: string,
  q: number,
  masa = 1,
  opc: { posicion?: Punto; rng?: () => number } = {},
): boolean {
  const qn = normalizarCarga(q);
  if (qn === null || indiceDe(s, id) !== -1) return false;
  const pos =
    opc.posicion ??
    colocarInicial(1, s.ancho, s.alto, s.x.map((x, i) => ({ x, y: s.y[i] })), { rng: opc.rng })[0];
  intervenir(s, () => {
    s.ids.push(id);
    s.x.push(pos.x);
    s.y.push(pos.y);
    s.vx.push(0);
    s.vy.push(0);
    s.q.push(qn);
    s.masa.push(masa > 0 && Number.isFinite(masa) ? masa : 1);
    s.anclada.push(false);
  });
  return true;
}

export function quitarCarga(s: SistemaDinamico, id: string): boolean {
  const i = indiceDe(s, id);
  if (i === -1) return false;
  intervenir(s, () => {
    s.ids.splice(i, 1);
    s.x.splice(i, 1);
    s.y.splice(i, 1);
    s.vx.splice(i, 1);
    s.vy.splice(i, 1);
    s.q.splice(i, 1);
    s.masa.splice(i, 1);
    s.anclada.splice(i, 1);
  });
  return true;
}

/**
 * Coloca la carga en (x, y) con velocidad 0 SIN anclarla (teclado, "tocar el
 * destino"; y cada muestra del arrastre mientras está agarrada).
 */
export function moverCarga(s: SistemaDinamico, id: string, x: number, y: number): boolean {
  const i = indiceDe(s, id);
  if (i === -1 || !Number.isFinite(x) || !Number.isFinite(y)) return false;
  intervenir(s, () => {
    s.x[i] = x;
    s.y[i] = y;
    s.vx[i] = 0;
    s.vy[i] = 0;
  });
  return true;
}

/** El puntero sujeta la carga: queda anclada con v = 0 (sigue empujando a las demás). */
export function agarrarCarga(s: SistemaDinamico, id: string): boolean {
  const i = indiceDe(s, id);
  if (i === -1) return false;
  intervenir(s, () => {
    s.anclada[i] = true;
    s.vx[i] = 0;
    s.vy[i] = 0;
  });
  return true;
}

/** Suelta la carga con velocidad `(vxSim, vySim)` YA en unidades de simulación (px por s de simulación). */
export function soltarCarga(s: SistemaDinamico, id: string, vxSim: number, vySim: number): boolean {
  const i = indiceDe(s, id);
  if (i === -1) return false;
  const vx = Number.isFinite(vxSim) ? vxSim : 0;
  const vy = Number.isFinite(vySim) ? vySim : 0;
  intervenir(s, () => {
    s.anclada[i] = false;
    s.vx[i] = vx;
    s.vy[i] = vy;
  });
  return true;
}

/**
 * Suelta con la velocidad del PUNTERO (px lógicos por s de pantalla, sin tope):
 * aplica zona muerta, tope de 250 px/s y `÷ σ` (sin dividir por el deslizador de
 * velocidad; ver empujon.ts).
 */
export function soltarConVelocidadPuntero(
  s: SistemaDinamico,
  id: string,
  vxPuntero: number,
  vyPuntero: number,
): boolean {
  const v = velocidadPunteroASim(vxPuntero, vyPuntero, DILATACION_DINAMICA);
  return soltarCarga(s, id, v.vx, v.vy);
}

/**
 * Cambia la carga `id` a `q` (E2.1 §5.1). Se ignora (devuelve false y no toca
 * nada) si el id no existe, `normalizarCarga(q)` es null (0/NaN/∞) o el signo
 * cambiaría (el signo no es editable). Corrige fuera de rango o sin cuantizar.
 * No toca posición, velocidad ni masa; el trabajo externo es ΔE = (q' − q)·V_i.
 */
export function aplicarCambioCarga(s: SistemaDinamico, id: string, q: number): boolean {
  const i = indiceDe(s, id);
  if (i === -1) return false;
  const qn = normalizarCarga(q);
  if (qn === null || Math.sign(qn) !== Math.sign(s.q[i])) return false;
  if (qn === s.q[i]) return true; // sin cambio: nada que recalibrar
  intervenir(s, () => {
    s.q[i] = qn;
  });
  return true;
}
