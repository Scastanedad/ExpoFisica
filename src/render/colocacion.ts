/**
 * Colocación inicial de cargas nuevas en la estación estática (funciones puras,
 * sin DOM). Las posiciones nunca pasan por estado de React: el llamador escribe
 * el resultado en su `posicionesRef`.
 *
 * - `posicionesEnAnillo`: reparto simétrico para el primer lote (cuando aún no
 *   hay ninguna carga colocada).
 * - `elegirPosicionNueva`: para una carga que se añade con otras ya presentes
 *   (quizá arrastradas por el visitante), busca en una malla de candidatos la
 *   que deja más lejos a la vecina más cercana. La distancia se "satura" en
 *   `distanciaObjetivo`: todo candidato que ya cumple es igual de bueno y entre
 *   ellos gana el más cercano al centro (evita mandar todo a las esquinas). Si
 *   ninguno cumple, gana el de mayor distancia mínima.
 */
import { LIMITE_ARRASTRE, type Posicion } from "./controladorEscena";

/**
 * Separación buscada entre cargas, en radios de agarre. El mínimo funcional es 2
 * (que no compartan zona de agarre); se apunta a 3 para que no queden apiñadas.
 */
export const SEPARACION_OBJETIVO_EN_RADIOS = 3;

/** Separación de la malla de candidatos (px lógicos). */
const PASO_CANDIDATOS = 10;

/** `n` posiciones repartidas en un círculo centrado, empezando arriba. */
export function posicionesEnAnillo(n: number, ancho: number, alto: number): Posicion[] {
  const cx = ancho / 2;
  const cy = alto / 2;
  const radio = Math.min(ancho, alto) * 0.25;
  return Array.from({ length: n }, (_, i) => {
    const angulo = (i / Math.max(n, 1)) * Math.PI * 2 - Math.PI / 2;
    return { x: cx + Math.cos(angulo) * radio, y: cy + Math.sin(angulo) * radio };
  });
}

/**
 * Posición para una carga nueva. `distanciaObjetivo` (px lógicos) suele ser
 * SEPARACION_OBJETIVO_EN_RADIOS·radioAgarre(escalaCss) (>= 2·radio: dos cargas
 * nunca comparten zona de agarre).
 * Respeta el margen de borde de `LIMITE_ARRASTRE`.
 */
export function elegirPosicionNueva(
  existentes: ReadonlyArray<Posicion>,
  ancho: number,
  alto: number,
  distanciaObjetivo: number,
): Posicion {
  const cx = ancho / 2;
  const cy = alto / 2;
  if (existentes.length === 0) return { x: cx, y: cy };

  let mejor: Posicion = { x: cx, y: cy };
  let mejorDistancia = -1;
  let mejorAlCentro = Infinity;

  for (let y = LIMITE_ARRASTRE; y <= alto - LIMITE_ARRASTRE; y += PASO_CANDIDATOS) {
    for (let x = LIMITE_ARRASTRE; x <= ancho - LIMITE_ARRASTRE; x += PASO_CANDIDATOS) {
      let minima = Infinity;
      for (const p of existentes) {
        const d = Math.hypot(x - p.x, y - p.y);
        if (d < minima) minima = d;
      }
      const puntaje = Math.min(minima, distanciaObjetivo);
      const alCentro = Math.hypot(x - cx, y - cy);
      if (puntaje > mejorDistancia || (puntaje === mejorDistancia && alCentro < mejorAlCentro)) {
        mejor = { x, y };
        mejorDistancia = puntaje;
        mejorAlCentro = alCentro;
      }
    }
  }
  return mejor;
}
