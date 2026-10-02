/**
 * Física de la Estación 03 (Campo continuo; dipolo, especificación E5.1). Cuerpo rígido de
 * DOS cargas puntuales EXACTAS (+q y −q separadas una distancia fija `d`),
 * NUNCA la fórmula de libro de texto del dipolo puntual (`τ = p×E`,
 * `F = (p·∇)E`): esas fórmulas solo se usan como verificación del límite
 * `d → 0` (ver el test D6). Cada extremo siente el campo total (cargas fuente
 * + campo externo uniforme de `campoExterno.ts`) evaluado con la MISMA
 * `campoEn` que el resto de la app -- ninguna física nueva, solo el modelo de
 * cuerpo rígido alrededor de ella.
 *
 * Decisión de arquitectura (documentada, no una omisión): a diferencia de
 * "Cargas en movimiento" (N cargas, O(N²), Web Worker con arrays planos), esta
 * estación integra UN solo cuerpo rígido (como mucho 3 cargas puntuales: ±q
 * del dipolo y, en modo "puntual", una carga fuente) -- el costo por sub-paso
 * es O(1), trivial para el hilo principal. Un Worker aquí solo añadiría
 * latencia de mensajería para las interacciones en vivo (arrastrar la carga
 * fuente, rotar el dipolo) sin ningún beneficio de paralelismo, así que las
 * POSICIONES siguen la misma regla arquitectónica (nunca pasan por estado de
 * React) pero viven en un `ref` dentro de `render/CanvasCampoContinuo.tsx`, con su
 * propio `requestAnimationFrame`, igual que la estación estática.
 *
 * Integrador (spec §3.3): Velocity Verlet (KDK) para traslación SIEMPRE
 * (F_neta = 0 exacto en campo uniforme, así que la traslación no se excita
 * ahí; en campo de una carga puntual es la traslación libre que produce la
 * atracción, spec §4 -- no se amortigua nunca). Para la ROTACIÓN: Verlet KDK
 * cuando `zeta = 0` (conserva energía, demo principal en campo uniforme) o
 * Euler semi-implícito cuando `zeta > 0` (recomendado en campo de una carga
 * puntual, si no el dipolo nunca se asienta). Sub-pasos adaptativos basados en
 * la frecuencia natural rotacional ACTUAL (depende del campo local, que
 * cambia si el dipolo se traslada), no en |q| (a diferencia de
 * `dinamica.ts#subdivisionesPaso`).
 */
import { K_VISUAL, SOFTENING2, type PuntoCarga } from "./coulomb";
import { ESCALA, RADIO_CARGA_PX, energiaParSI, factoresSim, pxAMetros, unidadesACoulomb, type ConfigEscala } from "./escala";
import {
  aplicarZonaExclusion,
  camposActivos,
  campoTotalEnPunto,
  type ModoCampoEscena,
} from "./campoEscena";

// `camposActivos`/`campoTotalEnPunto` son genéricos (E5.1 -> extraídos a
// `campoEscena.ts` para reutilizarlos en la Estación 03 "Campo continuo",
// carga libre): se reexportan tal cual para que `fuerzasDipolo.ts` y
// `dipolo.test.ts` sigan importándolos desde aquí sin cambios.
export { camposActivos, campoTotalEnPunto } from "./campoEscena";

// ---- Constantes calibradas (E5.1 §3.2, medidas con un prototipo en Node) ----

/** Masa traslacional (misma convención que las cargas de "Cargas en movimiento": masa 1 = unidad de simulación). */
export const MASA_DIPOLO = 1;
/** Constante de escala visual del momento de inercia, DESACOPLADA de `MASA_DIPOLO` (documentado en la spec, §3.2). */
export const J0_DIPOLO = 1e-4;
/** ζ recomendado (fracción de amortiguamiento crítico): "subamortiguado suave", verificado sin overshoot destructivo. */
export const ZETA_RECOMENDADO = 0.3;

/** Rango de controles de la separación `d` (px), verificado en la spec (§3.2, tabla de periodos). */
export const D_MIN_PX = 30;
export const D_MAX_PX = 100;
export const D_PASO_PX = 10;

/**
 * Rango de voltaje del control de la Estación 03. El módulo `campoExterno.ts`
 * (E5.0) admite 0-300 kV; aquí se recorta el mínimo a 30 kV (decisión del
 * orquestador sobre la duda abierta §8.1 de la spec: con 10 kV el período
 * llega a 18.8 s en el extremo débil del rango, demasiado lento para una
 * demo interactiva -- con 30 kV el techo baja a ~10 s).
 */
export const VOLTAJE_MIN_KV = 30;
export const VOLTAJE_MAX_KV = 300;
export const VOLTAJE_PASO_KV = 10;

/** Tope de sub-pasos por paso lógico (salvaguarda de CPU, igual espíritu que `SUBDIVISIONES_MAX` de dinamica.ts). */
export const SUBPASOS_MAX_DIPOLO = 400;
/** Umbral ω·h objetivo por sub-paso (spec §3.2/D3, el mismo régimen verificado sin deriva apreciable). */
export const UMBRAL_OMEGA_DT = 0.05;

export type ModoCampoDipolo = ModoCampoEscena;

// ---- Estado ----

export interface EstadoDipolo {
  /** Centro de masa, px lógicos. */
  cx: number;
  cy: number;
  /** px por segundo de simulación. */
  vx: number;
  vy: number;
  /** rad, del eje +q respecto a +x (canvas, y hacia abajo). */
  theta: number;
  /** rad por segundo de simulación. */
  omega: number;
}

export function estadoInicialDipolo(cx: number, cy: number, theta = 0.3): EstadoDipolo {
  return { cx, cy, vx: 0, vy: 0, theta, omega: 0 };
}

/** Momento de inercia I(d) = J0·d² (constante de escala visual, no la inercia real de nada). */
export function inerciaDipolo(d: number): number {
  return J0_DIPOLO * d * d;
}

// ---- Parámetros de un paso ----

export interface ParametrosDipolo {
  /** Magnitud de la carga en cada extremo (unidades de carga, > 0). */
  q: number;
  /** Separación entre +q y −q, px. */
  d: number;
  modoCampo: ModoCampoDipolo;
  /** Campo externo uniforme, unidades de simulación (solo se usa si `modoCampo === "uniforme"`). */
  externoSim: readonly [number, number] | null;
  /** Carga puntual fuente, arrastrable (solo se usa si `modoCampo === "puntual"`). */
  cargaFuente: PuntoCarga | null;
  /** Fracción de amortiguamiento crítico angular; 0 = apagado (Verlet KDK conserva energía). */
  zeta: number;
  soft2?: number;
}

// ---- Geometría del cuerpo rígido ----

export interface ExtremosDipolo {
  masX: number;
  masY: number;
  menosX: number;
  menosY: number;
}

/** Posición de +q y −q dado el centro de masa y el ángulo: `r± = r_cm ± (d/2)(cosθ,sinθ)`. */
export function extremosDipolo(estado: EstadoDipolo, d: number): ExtremosDipolo {
  const hx = (d / 2) * Math.cos(estado.theta);
  const hy = (d / 2) * Math.sin(estado.theta);
  return { masX: estado.cx + hx, masY: estado.cy + hy, menosX: estado.cx - hx, menosY: estado.cy - hy };
}

export interface FuerzaTorqueDipolo {
  /** Fuerza neta sobre el centro de masa, unidades de simulación. */
  fx: number;
  fy: number;
  /** Torque respecto al CM, unidades de simulación (px · fuerza_sim). */
  torque: number;
  fMasX: number;
  fMasY: number;
  fMenosX: number;
  fMenosY: number;
}

/**
 * Fuerza y torque EXACTOS del par de cargas reales (spec §2): `F± = ±qE±`,
 * `F_neta = F+ + F-`, `τ = (r+−r_cm)×F+ + (r-−r_cm)×F-` (cruz 2D:
 * `a×b = ax·by − ay·bx`). En campo uniforme, `F_neta = 0` exacto (mismo campo
 * en los dos extremos, sin softening) y el torque coincide exacto con
 * `τ = p×E0`.
 */
export function fuerzaYTorqueDipolo(
  estado: EstadoDipolo,
  q: number,
  d: number,
  cargasFuente: readonly PuntoCarga[],
  externoSim: readonly [number, number] | null,
  soft2: number = SOFTENING2,
): FuerzaTorqueDipolo {
  const ext = extremosDipolo(estado, d);
  const [exMas, eyMas] = campoTotalEnPunto(ext.masX, ext.masY, cargasFuente, externoSim, soft2);
  const [exMenos, eyMenos] = campoTotalEnPunto(ext.menosX, ext.menosY, cargasFuente, externoSim, soft2);

  const fMasX = q * exMas;
  const fMasY = q * eyMas;
  const fMenosX = -q * exMenos;
  const fMenosY = -q * eyMenos;

  const fx = fMasX + fMenosX;
  const fy = fMasY + fMenosY;

  const rMasX = ext.masX - estado.cx;
  const rMasY = ext.masY - estado.cy;
  const rMenosX = ext.menosX - estado.cx;
  const rMenosY = ext.menosY - estado.cy;

  const torque = (rMasX * fMasY - rMasY * fMasX) + (rMenosX * fMenosY - rMenosY * fMenosX);

  return { fx, fy, torque, fMasX, fMasY, fMenosX, fMenosY };
}

/** Campo total en el centro de masa (para la frecuencia natural y el coeficiente de amortiguamiento). */
export function campoLocalDipolo(estado: EstadoDipolo, params: ParametrosDipolo): [number, number] {
  const { cargasFuente, externoSim } = camposActivos(params);
  return campoTotalEnPunto(estado.cx, estado.cy, cargasFuente, externoSim, params.soft2);
}

/** ω_natural = √(p|E_local|/I): base de los sub-pasos adaptativos y del amortiguamiento recalculado. */
export function omegaNaturalDipolo(estado: EstadoDipolo, params: ParametrosDipolo): number {
  const I = inerciaDipolo(params.d);
  if (!(I > 0)) return 0;
  const p = params.q * params.d;
  const [ex, ey] = campoLocalDipolo(estado, params);
  return Math.sqrt(Math.max(0, (p * Math.hypot(ex, ey)) / I));
}

/** Momento dipolar `p = qd`, vector `p = qd(cosθ,sinθ)` (de − a +), unidades de simulación. */
export interface MomentoDipolarSim {
  p: number;
  px: number;
  py: number;
}

export function momentoDipolarSim(q: number, d: number, theta: number): MomentoDipolarSim {
  const p = q * d;
  return { p, px: p * Math.cos(theta), py: p * Math.sin(theta) };
}

// ---- Sub-pasos adaptativos ----

export function subpasosDipolo(estado: EstadoDipolo, params: ParametrosDipolo, dtLogico: number): number {
  const wn = omegaNaturalDipolo(estado, params);
  const k = Math.ceil((wn * dtLogico) / UMBRAL_OMEGA_DT);
  return Math.min(SUBPASOS_MAX_DIPOLO, Math.max(1, k));
}

// ---- Zona de exclusión cerca de la carga fuente (spec §4, evita divergencia) ----

/**
 * Cerca del contacto con la carga fuente (`distancia < RADIO_CARGA_PX + d/2`)
 * se detiene la traslación radial hacia adentro, en vez de dejar que la
 * integración diverja (mismo espíritu que las paredes elásticas de "Cargas en
 * movimiento": una simplificación deliberada, no un error a corregir con más
 * precisión numérica). `distMin = RADIO_CARGA_PX + d/2` (radio de la carga
 * fuente + la mitad de la varilla del dipolo, el extremo más cercano posible
 * al contacto). Delegada en `campoEscena.ts#aplicarZonaExclusion` (genérica,
 * trabaja con x/y/vx/vy sueltos en vez de un `EstadoDipolo` concreto).
 */
function aplicarZonaExclusionDipolo(estado: EstadoDipolo, params: ParametrosDipolo): EstadoDipolo {
  if (params.modoCampo !== "puntual" || !params.cargaFuente) return estado;
  const distMin = RADIO_CARGA_PX + params.d / 2;
  const r = aplicarZonaExclusion(estado.cx, estado.cy, estado.vx, estado.vy, params.cargaFuente, distMin);
  return { ...estado, cx: r.x, cy: r.y, vx: r.vx, vy: r.vy };
}

function esFinito(e: EstadoDipolo): boolean {
  return (
    Number.isFinite(e.cx) &&
    Number.isFinite(e.cy) &&
    Number.isFinite(e.vx) &&
    Number.isFinite(e.vy) &&
    Number.isFinite(e.theta) &&
    Number.isFinite(e.omega)
  );
}

// ---- Integración ----

/**
 * Un sub-paso de tamaño `h` (spec §3.3): traslación con Velocity Verlet (KDK)
 * SIEMPRE; rotación con Verlet KDK si `zeta === 0`, o Euler semi-implícito
 * (`ω += (τ − bω)/I · h`, un solo paso completo, no partido en dos medios
 * kicks) si `zeta > 0`.
 */
export function pasoDipolo(estado: EstadoDipolo, params: ParametrosDipolo, h: number): EstadoDipolo {
  const { cargasFuente, externoSim } = camposActivos(params);
  const I = inerciaDipolo(params.d);
  const M = MASA_DIPOLO;
  const zeta = params.zeta ?? 0;

  const ft0 = fuerzaYTorqueDipolo(estado, params.q, params.d, cargasFuente, externoSim, params.soft2);

  // Traslación: kick-drift (mitad del kick con la fuerza inicial).
  let vx = estado.vx + (ft0.fx / M) * (h / 2);
  let vy = estado.vy + (ft0.fy / M) * (h / 2);
  const cx = estado.cx + vx * h;
  const cy = estado.cy + vy * h;

  let theta: number;
  let omega: number;
  if (zeta > 0) {
    const wn = omegaNaturalDipolo(estado, params);
    const b = zeta * 2 * I * wn;
    omega = I > 0 ? estado.omega + ((ft0.torque - b * estado.omega) / I) * h : estado.omega;
    theta = estado.theta + omega * h;
  } else {
    omega = I > 0 ? estado.omega + (ft0.torque / I) * (h / 2) : estado.omega;
    theta = estado.theta + omega * h;
  }

  let intermedio: EstadoDipolo = { cx, cy, vx, vy, theta, omega };
  intermedio = aplicarZonaExclusionDipolo(intermedio, params);

  // Segundo half-kick de traslación (y de rotación, solo si zeta === 0: KDK completo).
  const ft1 = fuerzaYTorqueDipolo(intermedio, params.q, params.d, cargasFuente, externoSim, params.soft2);
  vx = intermedio.vx + (ft1.fx / M) * (h / 2);
  vy = intermedio.vy + (ft1.fy / M) * (h / 2);
  if (zeta === 0 && I > 0) {
    omega = intermedio.omega + (ft1.torque / I) * (h / 2);
  } else {
    omega = intermedio.omega;
  }

  return { cx: intermedio.cx, cy: intermedio.cy, vx, vy, theta: intermedio.theta, omega };
}

/**
 * Un paso "de trabajo" de `dtLogico` segundos de simulación: se subdivide en
 * `subpasosDipolo` sub-pasos de `pasoDipolo`. Nunca propaga NaN/Infinity
 * (D7): si un sub-paso produjera un estado no finito (borde extremo de la
 * zona de exclusión, paso de tiempo grande tras una pestaña dormida), se
 * descarta y se conserva el último estado válido.
 */
export function pasoAvanceDipolo(estado: EstadoDipolo, params: ParametrosDipolo, dtLogico: number): EstadoDipolo {
  if (!(dtLogico > 0)) return estado;
  const k = subpasosDipolo(estado, params, dtLogico);
  const h = dtLogico / k;
  let e = estado;
  for (let i = 0; i < k; i++) {
    const siguiente = pasoDipolo(e, params, h);
    e = esFinito(siguiente) ? siguiente : e;
  }
  return e;
}

// ---- Energía ----

/**
 * Energía mecánica en unidades de SIMULACIÓN: `K_rot + K_trans + U`, con
 * `U = −p·E0` (solo tiene sentido si `modoCampo === "uniforme"`; en modo
 * "puntual" esta cantidad NO es la que se conserva -- ver `energiaInteraccionSI`
 * para la lectura correcta en ese modo, spec §5). Sirve para los tests D3/D4
 * (comparación relativa en las mismas unidades, sin necesidad de convertir a SI).
 */
export function energiaMecanicaDipoloSim(estado: EstadoDipolo, params: ParametrosDipolo): number {
  const I = inerciaDipolo(params.d);
  const kRot = 0.5 * I * estado.omega * estado.omega;
  const kTrans = 0.5 * MASA_DIPOLO * (estado.vx * estado.vx + estado.vy * estado.vy);
  const p = momentoDipolarSim(params.q, params.d, estado.theta);
  const externo = params.modoCampo === "uniforme" && params.externoSim ? params.externoSim : [0, 0];
  const uPot = -(p.px * externo[0] + p.py * externo[1]);
  return kRot + kTrans + uPot;
}

/**
 * Energía de interacción EXACTA de las dos cargas reales con la fuente (modo
 * "puntual", spec §5): suma de `energiaParSI` de cada extremo con la fuente,
 * SI, sin softening -- es la cantidad que de verdad se conserva/disipa para un
 * dipolo de tamaño finito (a diferencia de `−p·E`, que solo es exacto para un
 * dipolo puntual ideal o en campo uniforme).
 */
export function energiaInteraccionSI(
  estado: EstadoDipolo,
  q: number,
  d: number,
  cargasFuente: readonly PuntoCarga[],
  esc: ConfigEscala = ESCALA,
): number {
  const ext = extremosDipolo(estado, d);
  let u = 0;
  for (const c of cargasFuente) {
    const rMas = Math.hypot(ext.masX - c.x, ext.masY - c.y);
    const rMenos = Math.hypot(ext.menosX - c.x, ext.menosY - c.y);
    u += energiaParSI(q, c.q, rMas, esc) + energiaParSI(-q, c.q, rMenos, esc);
  }
  return u;
}

// ---- Lectura para la UI (spec §5) ----

export interface LecturaDipolo {
  /** |p|, C·m. */
  pCm: number;
  /** Ángulo del eje del dipolo (de − a +), grados en [0, 360), convención de canvas (y hacia abajo). */
  anguloDeg: number;
  /** N·m, convención de canvas (signo puede diferir de la intuición "matemática" con y hacia arriba). */
  torqueNm: number;
  /** N, módulo (se espera "≈ 0 N" en campo uniforme). */
  fuerzaNetaN: number;
  /** J: `−p·E0` en modo uniforme; energía de interacción exacta en modo puntual (spec §5, difieren para d finita). */
  energiaJ: number;
  modoEnergia: "uniforme" | "interaccion";
}

export function calcularLecturaDipolo(
  estado: EstadoDipolo,
  params: ParametrosDipolo,
  esc: ConfigEscala = ESCALA,
): LecturaDipolo {
  const { cargasFuente, externoSim } = camposActivos(params);
  const ft = fuerzaYTorqueDipolo(estado, params.q, params.d, cargasFuente, externoSim, params.soft2);
  // torque·ángulo tiene unidades de energía: mismo factor que factoresSim(K_VISUAL).energia (spec §5).
  const factores = factoresSim(K_VISUAL, esc);
  const pCm = unidadesACoulomb(params.q, esc) * pxAMetros(params.d, esc);
  const anguloDeg = (((estado.theta * 180) / Math.PI) % 360 + 360) % 360;
  const torqueNm = ft.torque * factores.energia;
  const fuerzaNetaN = Math.hypot(ft.fx, ft.fy) * factores.fuerza;

  let energiaJ: number;
  let modoEnergia: "uniforme" | "interaccion";
  if (params.modoCampo === "uniforme" && params.externoSim) {
    const p = momentoDipolarSim(params.q, params.d, estado.theta);
    const dot = p.px * params.externoSim[0] + p.py * params.externoSim[1];
    energiaJ = -dot * factores.energia;
    modoEnergia = "uniforme";
  } else {
    energiaJ = energiaInteraccionSI(estado, params.q, params.d, cargasFuente, esc);
    modoEnergia = "interaccion";
  }

  return { pCm, anguloDeg, torqueNm, fuerzaNetaN, energiaJ, modoEnergia };
}
