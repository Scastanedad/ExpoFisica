/**
 * Posiciones iniciales del panel simplificado de la estación Ley de Gauss: una por cada (figura × fuente).
 * Tabla aprobada por el físico en `docs-gauss/panel-simple-fisica.md` §1. Código puro: sin DOM ni React.
 *
 * La primera carga del dipolo es +q (la que queda seleccionada); la segunda es −q. Ninguna cae en la franja de
 * exclusión de la superficie cerrada (`DIST_MIN_SUP`) ni a menos de `DIST_MIN_CARGAS` de la otra.
 */
import { RANGOS } from "./constantes";
import type { Carga3D, TipoSuperficie } from "./tipos";

export type Fuente = "carga" | "dipolo";

export interface PosicionInicial {
  /** Tamaño inicial de la figura (radio o lado, en u). */
  tamano: number;
  /** Cargas en µC y u; 1 si la fuente es «carga», 2 (+q, −q) si es «dipolo». */
  cargas: Carga3D[];
}

/** Magnitud inicial |q| (µC) de las cargas. */
export const Q_INICIAL = 3;
/** Semiseparación en x (u) de las cargas del dipolo. */
const X_DIPOLO = 2;
/** Plano: la carga queda debajo (z < 0), a favor de la normal, para que Φ sea positivo y fácil de leer. */
const Z_PLANO = -4;
/** Tamaño inicial del Plano (el def de RANGOS, 4, se queda corto: Φ ≈ 6 % de q). */
const LADO_PLANO = 8;

function tamanoInicial(forma: TipoSuperficie): number {
  switch (forma) {
    case "esfera":
      return RANGOS.esfera.radio.def;
    case "cubo":
      return RANGOS.cubo.lado.def;
    case "cilindro":
      return RANGOS.cilindro.radio.def;
    case "parche":
      return LADO_PLANO;
  }
}

/** Tamaño y cargas iniciales de la combinación (forma, fuente). Devuelve objetos nuevos en cada llamada. */
export function posicionInicial(forma: TipoSuperficie, fuente: Fuente): PosicionInicial {
  const z = forma === "parche" ? Z_PLANO : 0;
  const cargas: Carga3D[] =
    fuente === "carga"
      ? [{ x: 0, y: 0, z, q: Q_INICIAL }]
      : [
          { x: -X_DIPOLO, y: 0, z, q: Q_INICIAL },
          { x: X_DIPOLO, y: 0, z, q: -Q_INICIAL },
        ];
  return { tamano: tamanoInicial(forma), cargas };
}
