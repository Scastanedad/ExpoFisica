/** Paso de las unidades de mundo (µC/ε₀, u) a SI, solo para lecturas (contrato §1). */
import { C_POR_UNIDAD, ESCALA, K_COULOMB, M_POR_CUADRO, formatSI, type ConfigEscala } from "../escala";

/** 1 µC/ε₀ en N·m²/C = 4π·K·C_POR_UNIDAD ≈ 112 940.9. */
export const FLUJO_UNIDAD_SI = 4 * Math.PI * K_COULOMB * C_POR_UNIDAD;

/** Φ (µC/ε₀) → N·m²/C. Solo depende de `esc.cPorUnidad`. */
export function flujoASI(phi: number, esc: ConfigEscala = ESCALA): number {
  return phi * 4 * Math.PI * K_COULOMB * esc.cPorUnidad;
}

/** |E| (N/C) a `rU` unidades de una carga `q` (µC). */
export function campoSI3D(q: number, rU: number): number {
  const r = rU * M_POR_CUADRO;
  return (K_COULOMB * q * C_POR_UNIDAD) / (r * r);
}

export function uAMetros(u: number): number {
  return u * M_POR_CUADRO;
}

export function formatFlujoSI(phi: number): string {
  return formatSI(flujoASI(phi), "N·m²/C");
}

/** «Φ = 3.00 µC/ε₀» (signo menos tipográfico, como el resto de la app). */
export function formatPhi(phi: number): string {
  const txt = Math.abs(phi) < 0.005 ? "0.00" : Math.abs(phi).toFixed(2);
  const signo = phi < -0.005 ? "−" : "";
  return `Φ = ${signo}${txt} µC/ε₀`;
}
