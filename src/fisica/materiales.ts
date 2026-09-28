/**
 * Física de la Estación 04 (Conductores y aislantes, especificación E5.2).
 *
 * Dos "parches" microscópicos de 14 x 10 átomos (140 por material) con el MISMO
 * enrejado de iones fijos (+) y el mismo campo externo uniforme (E5.0):
 *
 *  - CONDUCTOR: cada electrón es libre. Siente la ley de Coulomb de TODOS los
 *    iones y de TODOS los demás electrones (O(N²), sin Web Worker: 140 x 140 es
 *    trivial), más el campo externo, más un arrastre viscoso −γv (resistencia
 *    de Drude). Un electrón no pertenece a ningún átomo en particular.
 *  - AISLANTE: cada electrón está atado a SU átomo por un resorte y no
 *    interactúa con nadie más (esa es la diferencia física central, no un
 *    recorte de rendimiento): oscilador armónico amortiguado forzado.
 *
 * DESVIACIONES RESPECTO A LA ESPECIFICACIÓN E5.2 (medidas con la geometría
 * final; revisadas por el fisico-revisor, que pidió la versión ε = 1.5·s):
 *
 *  1. Softening ε = 4.5 px = 1.5·s (`SOFTENING2_MATERIALES = 20.25`), no ε = 1 px.
 *     La spec pedía reutilizar `SOFTENING2_ESTATICO`, pero con ε = 1, s = 3 y el
 *     campo interior PROMEDIADO sobre una región (el valor en un punto
 *     intersticial depende de dónde cae el punto) el "conductor" no apantalla:
 *     |E_int|/E0 ≈ 104 % (ni el 84 % de la spec, que era un punto concreto).
 *     Causa: cada electrón queda atrapado en el pozo de su propio ion (rigidez
 *     K·Q²/ε³) y el material solo se polariza, como un dieléctrico débil.
 *     El apantallamiento residual lo fija el cociente ε/s (cuánto retiene aún
 *     cada átomo a su electrón), NO el número de electrones (medido a 30 kV,
 *     vertical: ε = 1 → 104 %, 2 → 68 %, 3 → 18 %, 4.5 → 1 %, 6 → 0.05 %; con
 *     28 x 20 átomos y ε = 3 sigue en ≈ 25 %). Con ε = 3 = s (versión anterior) el
 *     mar de electrones "resbalaba" sobre la red periódica al desplazarse ≳ s/2:
 *     campo interior no monótono, con inversión de signo (−4.5 % a 180 kV vertical,
 *     −6.6 % a 120 kV horizontal) y memoria (7.9 % en vez de 18.2 % a 30 kV tras 300
 *     kV). Con ε = 1.5·s la corrugación de la red decae como e^(−2π·ε/s) ≈ 1e-4, los
 *     electrones se comportan como casi libres (pseudopotencial muy blando) y esos
 *     artefactos desaparecen. El MISMO ε se usa en TODAS las interacciones
 *     (ion-electrón, electrón-electrón y medidor) para que cada par ion-electrón
 *     coincidente sea exactamente neutro (neutralidad, C7).
 *  2. Medidor promediado sobre la región central de 4 x 4 celdas (malla 8 x 8),
 *     no un punto: ver `campoInterior`.
 *  3. Resorte del aislante `K_RESORTE_AISLANTE = 560·Q²` (ver ahí): el aislante
 *     también se polariza y baja el campo interior a ≈ 80 % (placas verticales)
 *     o ≈ 89 % (horizontales), no a ≈ 100 %: si fuera más rígido sus electrones
 *     dejarían de verse moverse, que es justo lo que la lección debe mostrar.
 *
 * RESULTADOS MEDIDOS (barrido 30 a 300 kV de 10 en 10, ambas orientaciones y
 * polaridades, 10 s de asentamiento por punto):
 *  - Conductor: |E_int|/E0 ≤ 1.06 % (vertical) y ≤ 1.47 % (horizontal) a 30 kV
 *    (el punto más débil: régimen lineal, k_red ≈ 15 % de k_eff); ≤ 0.55 % de 60 kV
 *    en adelante. NO es estrictamente monótono: rizado de ±0.5 % de E0 (carga de
 *    superficie granular) y el signo llega a −0.45 % (campo interior invertido,
 *    ver test "barrido completo"). La página muestra |E|, sin signo. Es "prácticamente
 *    cero", no exactamente cero.
 *  - Aislante: 79.85 % (vertical) y 89.4 % (horizontal), constante en todo el rango
 *    (lineal), κ_eff ≈ 1.25 y 1.12; la diferencia es el factor de desapantallamiento
 *    de la forma del parche.
 *  - Memoria del conductor: tras 300 kV y volver a 30 kV la diferencia es de 0.5
 *    puntos (vertical: 0.58 % frente a 1.06 %) y 0.03 puntos (horizontal); inversión
 *    de polaridad a 300 kV: 0.05 %. Con E0 = 0 el campo interior se anula en pocos
 *    segundos, pero la colocación fina (electrones que quedaron sobre un átomo vecino
 *    tras un corrimiento de más de un periodo) tarda decenas de segundos.
 *
 * LIMITACIONES CONOCIDAS (medidas):
 *  - Lentitud de los modos blandos: con electrones casi libres, el reposo exacto tras
 *    quitar el campo tarda ≈ 50 s (0.07 px de residuo a los 50 s con 100 kV). Por eso
 *    el pre-equilibrado usa 0.1·γ durante 24 s (≈ 160 ms de cálculo en Node, una vez
 *    al cargar).
 *  - Forma del recorte: con placas a los lados (campo a lo largo del lado largo,
 *    14 átomos) el aislante apantalla menos (89 % frente a 80 %) y la k_eff del
 *    conductor es menor (77.2·Q² frente a 109.2·Q²).
 *  - A 300 kV el corrimiento medio (4.4 px vertical, 6.2 px horizontal) supera el
 *    margen de la pared (3 px): los electrones se apilan en una capa superficial
 *    (con cargas difusas pueden solaparse). Es la carga de superficie de un
 *    conductor, pero la capa es más gruesa que un átomo.
 *  - Sin sobreimpulso ni rebote contra las paredes con ζ = 1.2; el campo interior
 *    baja de ≈ 30 a 50 % a los 0.5 s hasta < 2 % a los 2 a 3 s.

 * Unidades y convenciones:
 *  - Coordenadas locales del parche en px lógicos, origen en su centro, y hacia
 *    ABAJO (igual que `campoEn`/`campoExterno.ts`/el canvas).
 *  - La carga por partícula `Q_PARTICULA_MATERIAL` y la masa son constantes de
 *    ESCALA PROPIA de esta estación (mismo espíritu que `K_VISUAL`,
 *    `SOFTENING2`, `J0_DIPOLO`): no son la carga ni la masa reales de un
 *    electrón, ni se concilian con `Q_MIN/Q_MAX` (µC) de las cargas puntuales.
 *  - Sin estado de React: `ParcheMaterial` son arrays tipados planos que viven
 *    en un ref dentro de `render/CanvasMateriales.tsx`.
 *
 * Calibración (receta E5.2 §4.3, repetida con la geometría final s = 3 px,
 * N = 140, ε = 4.5 px, Q = 1.5e-4; mediciones reproducibles en
 * `materiales.test.ts`):
 *  1. k_eff: se desplazan TODOS los electrones una distancia δ (0.01 a 0.5 px,
 *     uniforme, en la dirección del campo) desde su posición de equilibrio y se
 *     mide la fuerza restauradora media por electrón: k_eff = −F_media/δ
 *     (`medirKEff`). Medido: 2.457e-6 = 109.2·Q² (campo vertical) y 1.737e-6 =
 *     77.2·Q² (horizontal); lineal a < 0.4 % hasta δ = 0.5 px. k_eff suma k_dep (el
 *     campo de la carga de superficie, que es el que apantalla) y k_red (retención
 *     residual de la red, que no apantalla, ≈ 15 %): en equilibrio E_int ≈ 0 y
 *     Q·E0 = k_dep·δ, así que el desplazamiento a campo débil es δ = Q·E0/k_dep,
 *     entre 1.0 y 1.3 veces Q·E0/k_eff (medido: 1.17 vertical).
 *  2. Masa: m = k_eff/ω0² con ω0 = 6 rad/s (periodo ≈ 1.05 s: visible, ni
 *     instantáneo ni eterno). Se usa la k_eff del campo vertical (orientación
 *     por defecto); con placas a los lados ω0 baja a ≈ 5.0 rad/s.
 *  3. Arrastre: γ = ζ·2·m·ω0 con ζ = 1.2 (ligeramente sobreamortiguado: el
 *     electrón se asienta sin rebotar contra las paredes; medido: sin sobreimpulso
 *     del corrimiento medio y |E_int|/E0 < 2 % a los 2 a 3 s). Con ζ ≲ 0.5
 *     el mar de electrones rebasa y golpea la pared.
 *  4. Verificado contra la geometría final con el protocolo de E5.2 §4
 *     (asentar y medir |E_int|/E0): pruebas C1 a C7.
 */
import { K_VISUAL } from "./coulomb";
import { campoPlacas, campoUniformeASim, type OrientacionPlacas } from "./campoExterno";

// ---- Geometría (spec E5.2 §0) ----

export const COLUMNAS = 14;
export const FILAS = 10;
/** Partículas por material (iones y electrones, 1 a 1). */
export const N_POR_MATERIAL = COLUMNAS * FILAS;
/** Espaciado de red, px lógicos del parche (spec: s = 3 px). */
export const ESPACIADO_PX = 3;
/**
 * Ancho de difusión de las cargas: ε = 4.5 px = 1.5·s (ver la desviación 1 en la
 * cabecera). Se usa para TODA interacción de esta estación, incluido el medidor.
 */
export const SOFTENING2_MATERIALES = 20.25;
/**
 * Margen entre el último átomo y la "superficie" del material (paredes
 * elásticas que confinan a los electrones libres del conductor).
 */
export const MARGEN_PARED_PX = 3;
export const SEMIANCHO_PARED_PX = ((COLUMNAS - 1) / 2) * ESPACIADO_PX + MARGEN_PARED_PX;
export const SEMIALTO_PARED_PX = ((FILAS - 1) / 2) * ESPACIADO_PX + MARGEN_PARED_PX;

// ---- Carga, masa, arrastre, resorte (calibración, ver cabecera) ----

/**
 * Carga de cada partícula (unidad de simulación PROPIA de esta estación, NO µC).
 * Verificado: en el régimen lineal el cociente |E_int|/E0 no depende de Q (al
 * subir Q la fuerza de red y la del campo externo suben igual); Q solo fija
 * cuánto se desplazan los electrones (δ ∝ 1/Q). Se eligió para que el
 * desplazamiento del conductor sea claramente visible con el parche ampliado
 * (vertical: 0.47 px con 30 kV, 1.6 px con 100 kV, 4.4 px con 300 kV; horizontal
 * 0.74 / 2.4 / 6.2 px; la pared está a 3 px del último átomo, así que a voltajes
 * altos los electrones llegan a la superficie: se acumulan ahí) sin que el
 * aislante quede invisible (0.08 px con 30 kV, 0.27 px con 100 kV, 0.80 px con
 * 300 kV). Con ε = 1.5·s el conductor es lineal en todo el rango de la estación.
 */
export const Q_PARTICULA_MATERIAL = 1.5e-4;
/**
 * k_eff del conductor (receta §4.3, paso 1): fuerza restauradora media por
 * electrón dividida por el desplazamiento uniforme δ (0.01 a 0.2 px, régimen
 * lineal), medida con `medirKEff` sobre el parche en reposo. Medido con el
 * desplazamiento a lo largo de la red corta (campo vertical, orientación por
 * defecto): 2.457e-6 = 109.2·Q². A lo largo de la red larga (campo horizontal)
 * sale 1.737e-6 = 77.2·Q²: la rigidez colectiva depende de la forma del
 * parche (factor de desapantallamiento).
 */
export const K_EFF_CONDUCTOR = 2.457e-6;
/** ω0 = √(k_eff/m) del conductor, rad/s (periodo ≈ 1.05 s). */
export const OMEGA0_CONDUCTOR = 6;
/** Fracción del amortiguamiento crítico del conductor (ligeramente sobreamortiguado). */
export const ZETA_CONDUCTOR = 1.2;
/** Masa del electrón de esta estación (escala propia): m = k_eff/ω0². */
export const MASA_ELECTRON = K_EFF_CONDUCTOR / (OMEGA0_CONDUCTOR * OMEGA0_CONDUCTOR);
/** Arrastre viscoso γ = ζ·2·m·ω0 (resistencia de Drude), igual en ambos materiales. */
export const GAMMA_ARRASTRE = ZETA_CONDUCTOR * 2 * MASA_ELECTRON * OMEGA0_CONDUCTOR;
/**
 * Rigidez del resorte que ata cada electrón del aislante a su átomo: 560·Q².
 * Con ε = 1.5·s el núcleo del medidor cambió y 600·Q² daba 81.2 % / 90.1 %; con
 * 560·Q² el aislante da 79.85 % con placas verticales y 89.4 % con horizontales
 * (razón = 1 − c/k con c_vertical = 112.8·Q², c_horizontal = 59.4·Q²: conserva
 * el "80 % y 90 %" de la página). Se polariza y reduce un poco el campo, mucho
 * menos que el conductor, con un desplazamiento propio δ = Q·E0/k visible
 * (0.27 px con 100 kV). Con la misma masa y arrastre que el conductor su
 * frecuencia natural es ≈ 13.6 rad/s (ζ ≈ 0.53): se asienta en ≈ 1 s con un
 * rebote suave (≈ 14 %).
 */
export const K_RESORTE_AISLANTE = 560 * Q_PARTICULA_MATERIAL * Q_PARTICULA_MATERIAL;

/** Paso de integración interno (s de simulación) y tope de sub-pasos por frame. */
export const DT_SUB = 1 / 120;
export const SUBPASOS_MAX = 8;

// ---- Región y malla del medidor ----

/** Semilado de la región central donde se promedia el campo (4 x 4 celdas). */
export const MEDIDOR_SEMILADO_PX = 2 * ESPACIADO_PX;
const MEDIDOR_PUNTOS = 8;

// ---- Campo externo E0 ----

/**
 * Separación fija de las placas: 500 px equivalen a 10 cm (0.1 m) con la
 * escala de la app, igual que las placas verticales de la Estación 03. Con
 * separación fija, E0 = U/d no depende de la orientación.
 */
export const SEPARACION_PLACAS_M = 0.1;
export const VOLTAJE_MIN_KV = 30;
export const VOLTAJE_MAX_KV = 300;
export const VOLTAJE_PASO_KV = 10;

/** Campo externo en unidades de simulación (convención de canvas, y hacia abajo). */
export function campoExternoMateriales(
  orientacion: OrientacionPlacas,
  polaridad: 1 | -1,
  voltajeKV: number,
): [number, number] {
  return campoUniformeASim(campoPlacas(orientacion, polaridad, voltajeKV * 1000, SEPARACION_PLACAS_M));
}

// ---- Estado ----

export type TipoMaterial = "conductor" | "aislante";

export interface ParcheMaterial {
  tipo: TipoMaterial;
  n: number;
  /** Posiciones de los iones (fijas). */
  ionX: Float64Array;
  ionY: Float64Array;
  /** Electrones: posición, velocidad y fuerza vigente (FSAL). */
  x: Float64Array;
  y: Float64Array;
  vx: Float64Array;
  vy: Float64Array;
  fx: Float64Array;
  fy: Float64Array;
  /** Campo externo con el que se calcularon `fx/fy` (para saber si hay que recalcular). */
  fuerzasParaE0: readonly [number, number] | null;
}

/** Generador pseudoaleatorio determinista (LCG): el pre-equilibrado es reproducible. */
function crearAleatorio(semilla: number): () => number {
  let s = semilla >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/** Enrejado 14 x 10 centrado en el origen; electrones sobre sus iones con un temblor de `temblorPx`. */
export function crearParche(tipo: TipoMaterial, temblorPx = 0, semilla = 3): ParcheMaterial {
  const n = N_POR_MATERIAL;
  const aleatorio = crearAleatorio(semilla);
  const p: ParcheMaterial = {
    tipo,
    n,
    ionX: new Float64Array(n),
    ionY: new Float64Array(n),
    x: new Float64Array(n),
    y: new Float64Array(n),
    vx: new Float64Array(n),
    vy: new Float64Array(n),
    fx: new Float64Array(n),
    fy: new Float64Array(n),
    fuerzasParaE0: null,
  };
  for (let j = 0; j < FILAS; j++) {
    for (let i = 0; i < COLUMNAS; i++) {
      const k = j * COLUMNAS + i;
      p.ionX[k] = (i - (COLUMNAS - 1) / 2) * ESPACIADO_PX;
      p.ionY[k] = (j - (FILAS - 1) / 2) * ESPACIADO_PX;
      p.x[k] = p.ionX[k] + (aleatorio() - 0.5) * 2 * temblorPx;
      p.y[k] = p.ionY[k] + (aleatorio() - 0.5) * 2 * temblorPx;
    }
  }
  return p;
}

// ---- Fuerzas y energía ----

/**
 * Fuerzas sobre los electrones (sin arrastre) para el campo externo `e0` (sim).
 * Conductor: Coulomb con todos los iones y todos los demás electrones.
 * Aislante: resorte hacia el propio ion. Ambos: −Q·E0 (carga del electrón = −Q).
 */
export function calcularFuerzas(p: ParcheMaterial, e0: readonly [number, number]): void {
  const { n, x, y, ionX, ionY, fx, fy } = p;
  const q = Q_PARTICULA_MATERIAL;
  const fe0x = -q * e0[0];
  const fe0y = -q * e0[1];

  if (p.tipo === "aislante") {
    for (let i = 0; i < n; i++) {
      fx[i] = fe0x - K_RESORTE_AISLANTE * (x[i] - ionX[i]);
      fy[i] = fe0y - K_RESORTE_AISLANTE * (y[i] - ionY[i]);
    }
    p.fuerzasParaE0 = e0;
    return;
  }

  const kq2 = K_VISUAL * q * q;
  for (let i = 0; i < n; i++) {
    fx[i] = fe0x;
    fy[i] = fe0y;
  }
  for (let i = 0; i < n; i++) {
    const xi = x[i];
    const yi = y[i];
    let ax = 0;
    let ay = 0;
    // Iones: atracción (fija).
    for (let j = 0; j < n; j++) {
      const dx = xi - ionX[j];
      const dy = yi - ionY[j];
      const r2 = dx * dx + dy * dy + SOFTENING2_MATERIALES;
      const f = kq2 / (r2 * Math.sqrt(r2));
      ax -= f * dx;
      ay -= f * dy;
    }
    // Otros electrones: repulsión, un solo cálculo por par (tercera ley).
    for (let k = i + 1; k < n; k++) {
      const dx = xi - x[k];
      const dy = yi - y[k];
      const r2 = dx * dx + dy * dy + SOFTENING2_MATERIALES;
      const f = kq2 / (r2 * Math.sqrt(r2));
      ax += f * dx;
      ay += f * dy;
      fx[k] -= f * dx;
      fy[k] -= f * dy;
    }
    fx[i] += ax;
    fy[i] += ay;
  }
  p.fuerzasParaE0 = e0;
}

/**
 * Energía total del parche (cinética + potencial de la red o del resorte +
 * energía en el campo externo), unidades de simulación. Para C6: con arrastre
 * activo no crece.
 */
export function energiaParche(p: ParcheMaterial, e0: readonly [number, number]): number {
  const { n, x, y, vx, vy, ionX, ionY } = p;
  const q = Q_PARTICULA_MATERIAL;
  let e = 0;
  for (let i = 0; i < n; i++) {
    e += 0.5 * MASA_ELECTRON * (vx[i] * vx[i] + vy[i] * vy[i]);
    e += q * (e0[0] * x[i] + e0[1] * y[i]); // U = −F·r con F = −Q·E0
  }
  if (p.tipo === "aislante") {
    for (let i = 0; i < n; i++) {
      const dx = x[i] - ionX[i];
      const dy = y[i] - ionY[i];
      e += 0.5 * K_RESORTE_AISLANTE * (dx * dx + dy * dy);
    }
    return e;
  }
  const kq2 = K_VISUAL * q * q;
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      const dx = x[i] - ionX[j];
      const dy = y[i] - ionY[j];
      e -= kq2 / Math.sqrt(dx * dx + dy * dy + SOFTENING2_MATERIALES);
    }
    for (let k = i + 1; k < n; k++) {
      const dx = x[i] - x[k];
      const dy = y[i] - y[k];
      e += kq2 / Math.sqrt(dx * dx + dy * dy + SOFTENING2_MATERIALES);
    }
  }
  return e;
}

// ---- Integración ----

/**
 * Un sub-paso de tamaño `h` (s de simulación). Integrador simétrico
 * (medio arrastre exacto, medio empujón, deriva, fuerza nueva, medio empujón,
 * medio arrastre): Velocity Verlet con arrastre exponencial, de segundo orden.
 * Las paredes son elásticas y solo actúan sobre el conductor (los electrones
 * del aislante están atados por el resorte).
 */
export function pasoParche(
  p: ParcheMaterial,
  e0: readonly [number, number],
  h: number,
  gamma: number = GAMMA_ARRASTRE,
): void {
  const { n, x, y, vx, vy, fx, fy } = p;
  if (!p.fuerzasParaE0 || p.fuerzasParaE0[0] !== e0[0] || p.fuerzasParaE0[1] !== e0[1]) {
    calcularFuerzas(p, e0);
  }
  const mediaArrastre = Math.exp((-gamma / MASA_ELECTRON) * (h / 2));
  const mediaKick = h / (2 * MASA_ELECTRON);
  for (let i = 0; i < n; i++) {
    vx[i] = (vx[i] * mediaArrastre + fx[i] * mediaKick);
    vy[i] = (vy[i] * mediaArrastre + fy[i] * mediaKick);
    x[i] += vx[i] * h;
    y[i] += vy[i] * h;
    if (p.tipo === "conductor") {
      if (x[i] > SEMIANCHO_PARED_PX) {
        x[i] = 2 * SEMIANCHO_PARED_PX - x[i];
        vx[i] = -vx[i];
      } else if (x[i] < -SEMIANCHO_PARED_PX) {
        x[i] = -2 * SEMIANCHO_PARED_PX - x[i];
        vx[i] = -vx[i];
      }
      if (y[i] > SEMIALTO_PARED_PX) {
        y[i] = 2 * SEMIALTO_PARED_PX - y[i];
        vy[i] = -vy[i];
      } else if (y[i] < -SEMIALTO_PARED_PX) {
        y[i] = -2 * SEMIALTO_PARED_PX - y[i];
        vy[i] = -vy[i];
      }
    }
  }
  calcularFuerzas(p, e0);
  for (let i = 0; i < n; i++) {
    vx[i] = (vx[i] + fx[i] * mediaKick) * mediaArrastre;
    vy[i] = (vy[i] + fy[i] * mediaKick) * mediaArrastre;
  }
}

/**
 * Avanza el parche `dtS` segundos de simulación con sub-pasos de ≈ `DT_SUB`
 * (a lo sumo `SUBPASOS_MAX` por llamada; el tiempo sobrante se descarta, igual
 * que el recorte de tiempo real por frame del resto de la app).
 */
export function avanzarParche(p: ParcheMaterial, e0: readonly [number, number], dtS: number): void {
  if (!(dtS > 0)) return;
  const k = Math.min(SUBPASOS_MAX, Math.max(1, Math.ceil(dtS / DT_SUB)));
  const h = Math.min(dtS, k * DT_SUB) / k;
  for (let i = 0; i < k; i++) pasoParche(p, e0, h);
}

// ---- Lecturas ----

/**
 * Campo interior: E0 + campo (Coulomb difuso, la misma ley que `campoEn` con
 * `SOFTENING2_MATERIALES`) de iones y electrones, PROMEDIADO sobre una región
 * central de 4 x 4 celdas (malla de 8 x 8 puntos). Se promedia porque el campo
 * microscópico entre átomos depende de dónde cae el punto; el promedio sobre
 * una región es el campo "de interior" que un conductor debería anular.
 */
export function campoInterior(p: ParcheMaterial, e0: readonly [number, number]): [number, number] {
  const { n, x, y, ionX, ionY } = p;
  const kq = K_VISUAL * Q_PARTICULA_MATERIAL;
  let sx = 0;
  let sy = 0;
  for (let a = 0; a < MEDIDOR_PUNTOS; a++) {
    const px = ((a + 0.5) / MEDIDOR_PUNTOS - 0.5) * 2 * MEDIDOR_SEMILADO_PX;
    for (let b = 0; b < MEDIDOR_PUNTOS; b++) {
      const py = ((b + 0.5) / MEDIDOR_PUNTOS - 0.5) * 2 * MEDIDOR_SEMILADO_PX;
      for (let j = 0; j < n; j++) {
        let dx = px - ionX[j];
        let dy = py - ionY[j];
        let r2 = dx * dx + dy * dy + SOFTENING2_MATERIALES;
        let f = kq / (r2 * Math.sqrt(r2));
        sx += f * dx;
        sy += f * dy;
        dx = px - x[j];
        dy = py - y[j];
        r2 = dx * dx + dy * dy + SOFTENING2_MATERIALES;
        f = kq / (r2 * Math.sqrt(r2));
        sx -= f * dx;
        sy -= f * dy;
      }
    }
  }
  const m = MEDIDOR_PUNTOS * MEDIDOR_PUNTOS;
  return [e0[0] + sx / m, e0[1] + sy / m];
}

/** |E_interior| / |E0|; 0 si no hay campo externo. */
export function razonInterior(p: ParcheMaterial, e0: readonly [number, number]): number {
  const mag0 = Math.hypot(e0[0], e0[1]);
  if (mag0 === 0) return 0;
  const [ex, ey] = campoInterior(p, e0);
  return Math.hypot(ex, ey) / mag0;
}

/**
 * Desplazamiento medio de los electrones respecto a su propio ion, proyectado
 * sobre el sentido en que empuja el campo a un electrón (−E0), en px. Positivo
 * si se corrieron a favor de esa fuerza. 0 si no hay campo.
 */
export function desplazamientoMedio(p: ParcheMaterial, e0: readonly [number, number]): number {
  const mag0 = Math.hypot(e0[0], e0[1]);
  if (mag0 === 0) return 0;
  const ux = -e0[0] / mag0;
  const uy = -e0[1] / mag0;
  let s = 0;
  for (let i = 0; i < p.n; i++) s += (p.x[i] - p.ionX[i]) * ux + (p.y[i] - p.ionY[i]) * uy;
  return s / p.n;
}

/**
 * Calibración (receta §4.3, paso 1): desplaza TODOS los electrones del
 * conductor `delta` px de forma uniforme a lo largo de `direccion` desde su
 * posición actual (equilibrio sin campo) y devuelve
 * k_eff = −F_media/δ (fuerza restauradora media por electrón, sin arrastre ni
 * campo externo). No modifica el parche recibido.
 */
export function medirKEff(p: ParcheMaterial, delta: number, direccion: readonly [number, number] = [0, 1]): number {
  const copia = clonarParche(p);
  for (let i = 0; i < copia.n; i++) {
    copia.x[i] += delta * direccion[0];
    copia.y[i] += delta * direccion[1];
  }
  calcularFuerzas(copia, [0, 0]);
  let f = 0;
  for (let i = 0; i < copia.n; i++) f += copia.fx[i] * direccion[0] + copia.fy[i] * direccion[1];
  return -f / copia.n / delta;
}

export function clonarParche(p: ParcheMaterial): ParcheMaterial {
  return {
    tipo: p.tipo,
    n: p.n,
    ionX: p.ionX,
    ionY: p.ionY,
    x: p.x.slice(),
    y: p.y.slice(),
    vx: p.vx.slice(),
    vy: p.vy.slice(),
    fx: p.fx.slice(),
    fy: p.fy.slice(),
    fuerzasParaE0: null,
  };
}

// ---- Pre-equilibrado (decisión del usuario: una vez al cargar, oculto) ----

const TEMBLOR_INICIAL_PX = 0.1;
const TIEMPO_PREEQUILIBRADO_S = 24;
/**
 * Fracción del arrastre normal durante el pre-equilibrado. Con ε = 1.5·s los modos no
 * uniformes de la red son muy blandos (electrones casi libres) y con el arrastre completo o
 * con 0.3·γ tardan decenas de segundos en asentarse (medido, temblor 0.1 px: 1.6e-2 px de
 * residuo a los 12 s con 0.3·γ); con 0.1·γ el residuo baja a ≈ 1e-3 px en 12 s y a ≈ 2e-5 px en 24 s. La
 * configuración exacta "cada electrón sobre su átomo" es el mínimo global de la energía
 * (el núcleo 1/√(r²+ε²) es definido positivo: la energía de la distribución neta es ≥ 0 y
 * vale 0 en ese estado), así que el pre-equilibrado solo deshace el temblor inicial. Solo
 * se usa aquí: la respuesta al campo usa γ completo.
 */
const FRACCION_ARRASTRE_PREEQUILIBRADO = 0.1;
const H_PREEQUILIBRADO = 1 / 60;

/**
 * Deja que el propio sistema encuentre su reposo SIN campo externo (spec §4.2,
 * punto 2): electrones con un temblor inicial y arrastre hasta detenerse.
 * Determinista (semilla fija). El resultado se cachea: `Reiniciar` copia el
 * estado ya asentado, no vuelve a simular.
 */
const cachePreequilibrado = new Map<TipoMaterial, ParcheMaterial>();

export function crearParcheEnReposo(tipo: TipoMaterial): ParcheMaterial {
  let base = cachePreequilibrado.get(tipo);
  if (!base) {
    base = crearParche(tipo, TEMBLOR_INICIAL_PX);
    const sinCampo: readonly [number, number] = [0, 0];
    const pasos = Math.round(TIEMPO_PREEQUILIBRADO_S / H_PREEQUILIBRADO);
    for (let i = 0; i < pasos; i++) {
      pasoParche(base, sinCampo, H_PREEQUILIBRADO, GAMMA_ARRASTRE * FRACCION_ARRASTRE_PREEQUILIBRADO);
    }
    base.vx.fill(0);
    base.vy.fill(0);
    base.fuerzasParaE0 = null;
    cachePreequilibrado.set(tipo, base);
  }
  return clonarParche(base);
}
