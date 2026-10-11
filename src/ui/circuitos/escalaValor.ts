/**
 * Escalas de los controles de valor de los circuitos (sin DOM): deslizador logarítmico a 2 cifras
 * significativas y pasos 1-2-5 para los botones − / +. Pura y probada.
 */

/** Posición del deslizador (0..1) de un valor en una escala logarítmica [min, max]. */
export function posicionLog(valor: number, min: number, max: number): number {
  const v = Math.min(max, Math.max(min, valor));
  return Math.log(v / min) / Math.log(max / min);
}

/** Valor para una posición 0..1 del deslizador, redondeado a 2 cifras significativas (4,7 k en vez de 4 683). */
export function valorDesdePosicionLog(pos: number, min: number, max: number): number {
  const p = Math.min(1, Math.max(0, pos));
  const v = min * Math.pow(max / min, p);
  const r = Number(v.toPrecision(2));
  return Math.min(max, Math.max(min, r));
}

/** Siguiente valor de la serie 1-2-5 (…, 10, 20, 50, 100, …) estrictamente mayor/menor que `valor`. */
export function pasoSerie125(valor: number, dir: 1 | -1, min: number, max: number): number {
  const decada = Math.floor(Math.log10(valor) + 1e-9);
  const candidatos: number[] = [];
  for (let d = decada - 1; d <= decada + 1; d++) {
    for (const m of [1, 2, 5]) candidatos.push(Number((m * 10 ** d).toPrecision(3)));
  }
  candidatos.sort((a, b) => a - b);
  const tol = valor * 1e-9;
  const siguiente =
    dir === 1 ? candidatos.find((c) => c > valor + tol) : [...candidatos].reverse().find((c) => c < valor - tol);
  return Math.min(max, Math.max(min, siguiente ?? valor));
}
