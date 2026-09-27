/**
 * Magnitud de carga editable (especificación E2.1).
 *
 * La magnitud de cada carga está entre 0.5 y 5 µC en pasos de 0.5. El signo NO
 * se edita (es la identidad de la carga: rojo/azul, atracción/repulsión) y el
 * cero está prohibido. Toda carga que entre a un store o al Worker pasa por
 * `normalizarCarga`, de modo que un valor fuera de rango o sin cuantizar se
 * corrige y un 0 / NaN se rechaza.
 *
 * Los múltiplos de 0.5 son exactos en coma flotante binaria: E(2q) = 2·E(q) se
 * cumple sin error de redondeo. Funciones puras, sin DOM: las usan los stores,
 * el Worker, el dibujo y (en la Parte B) el sembrado de líneas de campo.
 */

/** Magnitud mínima permitida (unidades de carga = µC). */
export const Q_MIN = 0.5;
/** Magnitud máxima permitida. */
export const Q_MAX = 5;
/** Paso de edición de la magnitud. */
export const Q_PASO = 0.5;

/** [0.5, 1, 1.5, …, 5]: los diez valores exactos de magnitud. */
export const MAGNITUDES_PERMITIDAS: readonly number[] = Array.from(
  { length: Math.round((Q_MAX - Q_MIN) / Q_PASO) + 1 },
  (_, i) => Q_MIN + i * Q_PASO,
);

/**
 * Conserva el signo; la magnitud se cuantiza al múltiplo de `Q_PASO` más
 * cercano (empates hacia arriba, "half away from zero" sobre |q|/Q_PASO) y se
 * acota a [Q_MIN, Q_MAX]. Devuelve `null` si `q` es 0, NaN o ±Infinity (una
 * carga nula no tiene campo ni signo).
 */
export function normalizarCarga(q: number): number | null {
  if (!Number.isFinite(q) || q === 0) return null;
  const pasos = Math.round(Math.abs(q) / Q_PASO);
  const magnitud = Math.min(Q_MAX, Math.max(Q_MIN, pasos * Q_PASO));
  return q < 0 ? -magnitud : magnitud;
}

/** Un paso arriba (+1) o abajo (−1) en magnitud, con el signo conservado y saturando en los límites. */
export function pasoMagnitud(q: number, dir: 1 | -1): number {
  const base = normalizarCarga(q);
  if (base === null) return q;
  const signo = base < 0 ? -1 : 1;
  const magnitud = Math.min(Q_MAX, Math.max(Q_MIN, Math.abs(base) + dir * Q_PASO));
  return signo * magnitud;
}

/** ¿|q| es uno de los diez valores permitidos? (vale para cualquier signo). */
export function esMagnitudValida(q: number): boolean {
  return MAGNITUDES_PERMITIDAS.includes(Math.abs(q));
}

/**
 * Nueva carga al "editar la magnitud": conserva el signo de `qActual` e ignora
 * el signo de `qDeseada` (el signo no es editable). `null` si `qDeseada` es 0,
 * NaN o infinita, o si `qActual` no tiene signo (0/NaN).
 */
export function aplicarMagnitud(qActual: number, qDeseada: number): number | null {
  if (Number.isNaN(qActual) || qActual === 0) return null;
  const magnitud = normalizarCarga(Math.abs(qDeseada));
  if (magnitud === null) return null;
  return qActual < 0 ? -magnitud : magnitud;
}

// ---- Líneas de campo por carga (las usa el sembrado de la Parte B / E2.3) ----

/** Líneas de campo por unidad de carga: 1 línea = 0.1 µC. */
export const LINEAS_POR_UNIDAD = 10;
export const Q_POR_LINEA = 1 / LINEAS_POR_UNIDAD;
/** Presupuesto global de líneas trazadas (decisión del usuario: 200; degradar si no se llega a 50 fps). */
export const PRESUPUESTO_LINEAS = 200;
/** Con menos líneas no se distingue una simetría radial. */
export const LINEAS_MIN_POR_CARGA = 4;

/**
 * Reparte las líneas de campo entre las cargas de forma proporcional a |q|.
 * `ideal_i = 10·|q_i|`; `f = min(1, presupuesto / Σ ideal)` (común a todas);
 * `N_i = max(LINEAS_MIN_POR_CARGA, round_half_up(f·ideal_i))`.
 *
 * Con `f = 1` resulta exactamente `10·|q_i|` (entero para todo q permitido) y
 * `Σ N_i = Σ ideal_i ≤ presupuesto`.
 *
 * COTA CORRECTA (sustituye a la de E2.1 §3.2, que era errónea): cada N_i es
 * `≤ max(4, f·ideal_i + ½)`, así que `Σ N_i ≤ Σ max(4, f·ideal_i + ½)`. Con m
 * cargas elevadas por el mínimo (las de `f·ideal_i < 3.5`), esto da
 * `Σ N_i ≤ presupuesto + ½(n − m) + 4m ≤ presupuesto + 4n`; y si el mínimo no
 * actúa (m = 0) o `f = 1`, `Σ N_i ≤ presupuesto + n/2`. La cota `max(presupuesto
 * + n/2, 4n)` de la spec original es falsa cuando `f < 1` y hay cargas pequeñas
 * junto a grandes (p. ej. 6 cargas de 5 µC y 20 de 0.5 µC: f = 0.5, las pequeñas
 * suben de 3 a 4 y la suma es 230 > 213). El exceso máximo sobre el presupuesto
 * (≈ 15 % en la práctica) es irrelevante para el coste de trazado (E2.3 §8), y el
 * mínimo se mantiene porque con < 4 líneas no se distingue una simetría radial.
 */
export function repartirLineas(
  qs: readonly number[],
  presupuesto: number = PRESUPUESTO_LINEAS,
): number[] {
  const ideales = qs.map((q) => LINEAS_POR_UNIDAD * Math.abs(q));
  const suma = ideales.reduce((a, b) => a + b, 0);
  const f = suma > 0 ? Math.min(1, presupuesto / suma) : 1;
  return ideales.map((ideal) => Math.max(LINEAS_MIN_POR_CARGA, Math.floor(f * ideal + 0.5)));
}
