/**
 * Ley de Coulomb — superposición de campo y potencial eléctrico de cargas puntuales.
 * Fórmulas: .claude/skills/electromagnetismo-computacional/references/ecuaciones_maxwell.md
 *
 * K_VISUAL es una constante de escala visual, no la constante física real
 * (k = 8.99e9 N·m²/C² sería inmanejable en pixeles). Cada unidad de carga se
 * interpreta como 1 microCoulomb (ver fisica/unidades.ts) — K_VISUAL solo
 * ajusta qué tan largas se ven las flechas/qué tan intensos los colores en
 * un canvas de cientos de pixeles.
 */
export const K_VISUAL = 5000;

/** Softening: evita la singularidad 1/r² (y 1/r) cuando el punto está muy
 * cerca de una carga, mismo principio que en el integrador de N cargas
 * (references/metodos_numericos.md). Es un artefacto numérico deliberado,
 * no un efecto físico. */
export const SOFTENING2 = 100;

export interface PuntoCarga {
  x: number;
  y: number;
  q: number;
}

export function campoEn(x: number, y: number, cargas: PuntoCarga[]): [number, number] {
  let Ex = 0;
  let Ey = 0;
  for (const c of cargas) {
    const dx = x - c.x;
    const dy = y - c.y;
    const r2 = dx * dx + dy * dy + SOFTENING2;
    const r = Math.sqrt(r2);
    const factor = (K_VISUAL * c.q) / (r2 * r);
    Ex += factor * dx;
    Ey += factor * dy;
  }
  return [Ex, Ey];
}

export function potencialEn(x: number, y: number, cargas: PuntoCarga[]): number {
  let V = 0;
  for (const c of cargas) {
    const dx = x - c.x;
    const dy = y - c.y;
    const r = Math.sqrt(dx * dx + dy * dy + SOFTENING2);
    V += (K_VISUAL * c.q) / r;
  }
  return V;
}
