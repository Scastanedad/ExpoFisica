/**
 * Ley de Coulomb — superposición de campo y potencial eléctrico de cargas puntuales.
 * Fórmulas: .claude/skills/electromagnetismo-computacional/references/ecuaciones_maxwell.md
 *
 * K_VISUAL no es una constante "irreal": es la elección de una UNIDAD de campo
 * para trabajar en píxeles y unidades de carga (E_sim = K_VISUAL·q/r², con r
 * en px). Es la misma ley que en SI con otro factor: 1 unidad de E_sim
 * equivale a `factoresSim(K_VISUAL).campo` ≈ 4.494×10⁷ N/C (1 unidad de carga
 * = 1 µC, 1 cuadro de 50 px = 1 cm). La conversión a SI y las lecturas exactas
 * viven en fisica/escala.ts (no dependen de K_VISUAL ni del softening).
 *
 * Papel de K_VISUAL en la app:
 *  - Dibujo (flechas, líneas de campo, equipotenciales): usa SOFTENING2_ESTATICO
 *    (ε = 1 px) y solo fija cuán largas se ven las flechas; las equipotenciales
 *    se rotulan en volts SI, así que no dependen de esta constante.
 *  - Estación dinámica: el Worker la usa TAMBIÉN como constante de la ley de
 *    fuerza (con masa de simulación 1), así que fija la escala de tiempo del
 *    movimiento (cámara lenta), no la física: cambiarla equivale a reescalar
 *    el tiempo por sqrt(K'/K). La energía del Worker se pasa a julios con
 *    energiaSimAJ(E, K_VISUAL) y el resultado no depende de esta constante.
 */
export const K_VISUAL = 5000;

/** Softening: evita la singularidad 1/r² (y 1/r) cuando el punto está muy
 * cerca de una carga, mismo principio que en el integrador de N cargas
 * (references/metodos_numericos.md). Es un artefacto numérico deliberado,
 * no un efecto físico: con ε = 10 px (2 mm) el campo a 1 cm sale un 5.7 %
 * bajo el exacto. Las LECTURAS numéricas no deben usarlo (usar campoSI /
 * potencialSI de escala.ts, o pasar SOFTENING2_ESTATICO como `soft2`). */
export const SOFTENING2 = 100;

export interface PuntoCarga {
  x: number;
  y: number;
  q: number;
}

/**
 * `soft2` (px²) es opcional y por defecto vale SOFTENING2, de modo que los
 * llamadores existentes no cambian de resultado.
 */
export function campoEn(
  x: number,
  y: number,
  cargas: PuntoCarga[],
  soft2: number = SOFTENING2,
): [number, number] {
  let Ex = 0;
  let Ey = 0;
  for (const c of cargas) {
    const dx = x - c.x;
    const dy = y - c.y;
    const r2 = dx * dx + dy * dy + soft2;
    const r = Math.sqrt(r2);
    const factor = (K_VISUAL * c.q) / (r2 * r);
    Ex += factor * dx;
    Ey += factor * dy;
  }
  return [Ex, Ey];
}

export function potencialEn(
  x: number,
  y: number,
  cargas: PuntoCarga[],
  soft2: number = SOFTENING2,
): number {
  let V = 0;
  for (const c of cargas) {
    const dx = x - c.x;
    const dy = y - c.y;
    const r = Math.sqrt(dx * dx + dy * dy + soft2);
    V += (K_VISUAL * c.q) / r;
  }
  return V;
}
