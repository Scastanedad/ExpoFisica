import { E_MAX_AIRE } from "./constantes";
import { dielectricoPorId } from "./dielectricos";

/**
 * Rigidez efectiva del hueco según la fracción insertada: f = 0 solo hay aire; 0 < f < 1 la zona de aire sigue
 * ahí y rompe primero (mínimo de las dos); f = 1 solo rige el material.
 */
export function eLim(materialId: string, f: number): number {
  const mat = dielectricoPorId(materialId);
  if (materialId === "aire" || f <= 0) return E_MAX_AIRE;
  if (f >= 1) return mat.eMax;
  return Math.min(E_MAX_AIRE, mat.eMax);
}
