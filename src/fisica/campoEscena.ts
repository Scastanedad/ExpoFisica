/**
 * Física GENÉRICA de "campo externo activo en una escena" (extraída de
 * `dipolo.ts` §E5.1 para reutilizarla en la Estación 03 "Campo continuo" con
 * un segundo objeto, `cargaLibre.ts` §E5.x): qué fuentes de campo cuentan
 * según el modo (placas uniformes XOR una carga fuente puntual, nunca las
 * dos a la vez -- decisión de UI, no una restricción física), el campo total
 * en un punto, y la "zona de exclusión" que impide que la integración
 * diverja al acercarse demasiado a la fuente puntual.
 *
 * Estas tres funciones NO dependían de nada específico del dipolo (theta,
 * omega, momento de inercia): por eso viven aquí y `dipolo.ts` las reexporta
 * tal cual, para que nada que ya las importe desde `dipolo.ts`
 * (`fuerzasDipolo.ts`, `dipolo.test.ts`) tenga que cambiar.
 */
import { campoEn, type PuntoCarga } from "./coulomb";
import { sumarCampoExterno } from "./campoExterno";
import { SOFTENING2 } from "./coulomb";

export type ModoCampoEscena = "uniforme" | "puntual";

/** Lo mínimo que necesita `camposActivos`/`campoTotalEnPunto`: cualquier objeto de parámetros de la escena (dipolo, carga libre) es un superconjunto de esto. */
export interface ParametrosCampoEscena {
  modoCampo: ModoCampoEscena;
  /** Campo externo uniforme, unidades de simulación (solo se usa si `modoCampo === "uniforme"`). */
  externoSim: readonly [number, number] | null;
  /** Carga puntual fuente, arrastrable (solo se usa si `modoCampo === "puntual"`). */
  cargaFuente: PuntoCarga | null;
}

/** Qué fuentes de campo están realmente activas según `modoCampo` (evita que la UI tenga que "limpiar" el campo no usado). */
export function camposActivos(params: ParametrosCampoEscena): {
  cargasFuente: PuntoCarga[];
  externoSim: readonly [number, number] | null;
} {
  if (params.modoCampo === "uniforme") return { cargasFuente: [], externoSim: params.externoSim };
  return { cargasFuente: params.cargaFuente ? [params.cargaFuente] : [], externoSim: null };
}

/** Campo total (cargas fuente + externo uniforme si aplica) en un punto, unidades de simulación. */
export function campoTotalEnPunto(
  x: number,
  y: number,
  cargasFuente: readonly PuntoCarga[],
  externoSim: readonly [number, number] | null,
  soft2: number = SOFTENING2,
): [number, number] {
  const base = campoEn(x, y, cargasFuente as PuntoCarga[], soft2);
  return externoSim ? sumarCampoExterno(base, externoSim) : base;
}

/**
 * Cerca del contacto con la carga fuente (`distancia < distMin`) se detiene
 * la traslación radial hacia adentro (se conserva la componente tangencial),
 * en vez de dejar que la integración diverja (mismo espíritu que las paredes
 * elásticas de "Cargas en movimiento": una simplificación deliberada, no un
 * error a corregir con más precisión numérica). `distMin` lo decide el
 * llamador (el dipolo usa `RADIO_CARGA_PX + d/2`; una carga libre puntual usa
 * `2·RADIO_CARGA_PX`, ver `cargaLibre.ts`).
 *
 * Trabaja con componentes sueltas (no con un `EstadoDipolo`/`EstadoCargaLibre`
 * concreto) para no acoplarse a la forma del estado de cada estación.
 */
export function aplicarZonaExclusion(
  x: number,
  y: number,
  vx: number,
  vy: number,
  fuente: PuntoCarga | null,
  distMin: number,
): { x: number; y: number; vx: number; vy: number } {
  if (!fuente) return { x, y, vx, vy };
  const dx = x - fuente.x;
  const dy = y - fuente.y;
  const dist = Math.hypot(dx, dy);
  if (!(dist < distMin) || dist < 1e-6) return { x, y, vx, vy };
  const nx = dx / dist;
  const ny = dy / dist;
  const xNueva = fuente.x + nx * distMin;
  const yNueva = fuente.y + ny * distMin;
  const vRad = vx * nx + vy * ny;
  const vxNueva = vRad < 0 ? vx - vRad * nx : vx;
  const vyNueva = vRad < 0 ? vy - vRad * ny : vy;
  return { x: xNueva, y: yNueva, vx: vxNueva, vy: vyNueva };
}
