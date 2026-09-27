/**
 * "Empujón" al arrastrar (especificación E2.5 §4, decisión D5): al soltar una
 * carga arrastrada en la estación dinámica, sale con la velocidad que llevaba
 * el puntero, con un tope.
 *
 * Funciones puras (sin DOM). La UI recoge muestras `{t, x, y}` del puntero
 * (px LÓGICOS del canvas, tiempo en ms de `PointerEvent.timeStamp`) y el Worker
 * convierte la velocidad estimada a unidades de simulación.
 *
 * CONVERSIÓN (decisión del usuario, cambia respecto a la spec original):
 * `v_sim = v_puntero / σ`, SIN dividir por el deslizador de velocidad. El
 * lanzamiento se refiere a la reproducción 1×: la energía que se inyecta es la
 * misma a cualquier velocidad de reproducción. Consecuencia: con el deslizador
 * en otra posición, la velocidad que se ve en pantalla al soltar es la del
 * puntero multiplicada por el deslizador (más lenta a 0.25×, más rápida a 3×).
 */

export interface MuestraPuntero {
  /** ms (reloj monótono de alta resolución, `PointerEvent.timeStamp`). */
  t: number;
  x: number;
  y: number;
}

/** Solo cuenta lo que ocurrió justo antes de soltar. */
export const VENTANA_PUNTERO_MS = 100;
/** Si la última muestra es más vieja que esto antes de soltar, el usuario se detuvo: v = 0. */
export const PARADA_MAX_MS = 60;
export const MUESTRAS_MIN = 3;
export const SPAN_MIN_MS = 25;
/** Zona muerta (temblor de la mano), px lógicos por segundo de reloj. */
export const VEL_MIN_EMPUJON_PX_S = 10;
/** Tope de la velocidad en pantalla, px lógicos por segundo de reloj. */
export const VEL_MAX_EMPUJON_PX_S = 250;

/**
 * Velocidad del puntero (px lógicos por s de reloj) por regresión lineal de
 * mínimos cuadrados de x(t) e y(t) sobre la ventana de 100 ms previa a soltar.
 * La regresión es su propio suavizado: los eventos llegan cuantizados al
 * fotograma (~16.7 ms) y con ±1 px de ruido, y dos muestras darían ±60 px/s de
 * error.
 */
export function estimarVelocidadPuntero(
  muestras: readonly MuestraPuntero[],
  tSoltar: number,
): { vx: number; vy: number } {
  const rec = muestras.filter((m) => m.t >= tSoltar - VENTANA_PUNTERO_MS && m.t <= tSoltar);
  if (rec.length < MUESTRAS_MIN) return { vx: 0, vy: 0 };
  const ultima = rec[rec.length - 1];
  if (tSoltar - ultima.t > PARADA_MAX_MS) return { vx: 0, vy: 0 };
  const t0 = rec[0].t;
  if (ultima.t - t0 < SPAN_MIN_MS) return { vx: 0, vy: 0 };

  let st = 0;
  let sx = 0;
  let sy = 0;
  let stt = 0;
  let stx = 0;
  let sty = 0;
  const n = rec.length;
  for (const m of rec) {
    const t = (m.t - t0) / 1000;
    st += t;
    sx += m.x;
    sy += m.y;
    stt += t * t;
    stx += t * m.x;
    sty += t * m.y;
  }
  const den = n * stt - st * st;
  if (Math.abs(den) < 1e-12) return { vx: 0, vy: 0 };
  return { vx: (n * stx - st * sx) / den, vy: (n * sty - st * sy) / den };
}

/**
 * Velocidad del puntero (px lógicos/s de pantalla) -> velocidad de simulación
 * (px por s de SIMULACIÓN): zona muerta, tope en pantalla (conserva la
 * dirección: escala el vector) y división por `sigma` (dilatación temporal).
 * NO depende del deslizador de velocidad (ver cabecera).
 */
export function velocidadPunteroASim(
  vxP: number,
  vyP: number,
  sigma: number,
  tope: number = VEL_MAX_EMPUJON_PX_S,
): { vx: number; vy: number } {
  const m = Math.hypot(vxP, vyP);
  // Zona muerta; también descarta NaN e infinitos.
  if (!(m >= VEL_MIN_EMPUJON_PX_S) || !Number.isFinite(m)) return { vx: 0, vy: 0 };
  const e = Math.min(1, tope / m) / sigma;
  return { vx: vxP * e, vy: vyP * e };
}
