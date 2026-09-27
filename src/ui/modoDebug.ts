/**
 * Diagnóstico opcional: se activa abriendo la página con `?debug` en la URL
 * (p. ej. /cargas-en-movimiento?debug). Muestra en la estación dinámica la
 * deriva de energía y los contadores del reloj del Worker (sub-pasos/s) para
 * medir en el equipo real de la exposición. Nunca aparece para el visitante.
 * Se lee una vez al cargar la página.
 */
export const MODO_DEBUG: boolean =
  typeof window !== "undefined" && new URLSearchParams(window.location.search).has("debug");
