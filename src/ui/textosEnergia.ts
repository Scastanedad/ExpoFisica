/**
 * Textos del panel de energía (E2.5 §2): K, U y E en julios "escala del modelo"
 * con `formatSI(energiaSimAJ(x, K_VISUAL), "J")`. Se usa `K_VISUAL` y NO `σ²K`:
 * la energía del Worker está en unidades de simulación y su valor en julios no
 * depende del reloj (E0 §3.5).
 */
import { K_VISUAL } from "../fisica/coulomb";
import { UMBRAL_E_CERO, UMBRAL_RUIDO, valorEnergiaMostrable } from "../fisica/dinamica";
import { energiaSimAJ, formatSI } from "../fisica/escala";
import type { EnergiaDinamica } from "../types/simulacion";

export interface FilasEnergia {
  cinetica: string;
  potencial: string;
  /** "≈ 0 J" si |E| < 0.5 % de K + Σ|U| (los dígitos de una suma que cancela términos grandes no significan nada). */
  total: string;
  /** null hasta la primera intervención del visitante. */
  aportada: string | null;
}

function enJulios(eSim: number): string {
  return formatSI(energiaSimAJ(eSim, K_VISUAL), "J");
}

export function textosEnergia(e: EnergiaDinamica): FilasEnergia {
  const totalMostrable = valorEnergiaMostrable(e.total, e.escala, UMBRAL_E_CERO);
  return {
    cinetica: enJulios(valorEnergiaMostrable(e.cinetica, e.escala, UMBRAL_RUIDO)),
    potencial: enJulios(valorEnergiaMostrable(e.potencial, e.escala, UMBRAL_RUIDO)),
    total: totalMostrable === 0 && e.escala > 0 ? "≈ 0 J" : enJulios(totalMostrable),
    aportada:
      e.intervenciones > 0
        ? enJulios(valorEnergiaMostrable(e.trabajoExterno, e.escala, UMBRAL_RUIDO))
        : null,
  };
}
