/** Constantes de gauss3d (contrato §1, §3). Unidades de mundo: 1 u = 1 cuadro de cuadrícula. */
import type { NivelGauss3D } from "./tipos";

/** Softening (u²) solo para dibujar flechas y trazar líneas; el flujo no lo usa. */
export const SOFT2_3D = 0.01;
/** Distancia mínima carga–superficie (u). Debe ser > R_SEED_3D. */
export const DIST_MIN_SUP = 0.4;
/** Distancia mínima entre las dos cargas (u). Debe ser ≥ R_SEED_3D + R_ABS_3D. */
export const DIST_MIN_CARGAS = 0.8;
/** Radio (u) del punto de siembra de una línea alrededor de su carga. */
export const R_SEED_3D = 0.35;
/** Radio (u) de absorción de las líneas en una carga. */
export const R_ABS_3D = 0.25;
/** La esfera límite de las líneas mide R_LIMITE_FACTOR·R_env + max|r_i|. */
export const R_LIMITE_FACTOR = 3;
/** |E| mínimo (µC/ε₀ por u²) por debajo del cual se corta una línea. */
export const E_MIN_3D = 1e-7;
/**
 * Líneas de campo por µC de carga. Fijado con la medición de
 * `docs-gauss/medicion-lineas-por-uc.md` (script `lineas3d.medicion.test.ts`).
 */
export const LINEAS_POR_UC = 20;
export const MIN_LINEAS_CARGA = 6;
export const MAX_PUNTOS_LINEA = 256;
export const MAX_CARGAS = 2;

/** Niveles de calidad, de alta (0) a baja (2); mismo orden que NIVELES_CALIDAD de la app. */
export const NIVELES_GAUSS3D: readonly NivelGauss3D[] = [
  {
    nombre: "alta",
    presupuestoLineas: 240,
    pasoLinea: 0.15,
    mallaEsfera: [24, 48],
    celdasCara: 12,
    celdasCilindro: [8, 48],
    tapaFlechas: 120,
  },
  {
    nombre: "media",
    presupuestoLineas: 120,
    pasoLinea: 0.2,
    mallaEsfera: [18, 36],
    celdasCara: 9,
    celdasCilindro: [6, 36],
    tapaFlechas: 70,
  },
  {
    nombre: "baja",
    presupuestoLineas: 60,
    pasoLinea: 0.3,
    mallaEsfera: [12, 24],
    celdasCara: 6,
    celdasCilindro: [4, 24],
    tapaFlechas: 36,
  },
];

/** Rangos de la UI (§1), en u salvo `q` (µC) y ángulos. `def` = valor por defecto. */
export const RANGOS = {
  esfera: { radio: { min: 2, max: 8, def: 5 } },
  cubo: { lado: { min: 4, max: 16, def: 8 } },
  cilindro: { radio: { min: 2, max: 8, def: 4 }, altura: { min: 4, max: 16, def: 8 } },
  parche: { lado: { min: 2, max: 12, def: 4 } },
  carga: {
    x: { min: -12, max: 12 },
    y: { min: -12, max: 12 },
    z: { min: -10, max: 10 },
    q: { min: 0.5, max: 5 },
  },
} as const;
