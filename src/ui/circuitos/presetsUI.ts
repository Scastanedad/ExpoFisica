/**
 * Presets de E6 tal como los usa la interfaz: el árbol (o el contenedor de valores del puente), la topología
 * y un nombre corto para el selector. Los datos y los resultados esperados viven en `fisica/circuitos/presets`.
 */
import { PRESETS_E6, type Bloque, type PresetE6 } from "../../fisica/circuitos";
import { arbolDePuente } from "../../render/circuitos/estado";
import type { Topologia } from "../../store/circuitosStore";

export interface PresetUI {
  id: string;
  /** Nombre corto del botón. */
  nombre: string;
  /** Nombre completo para lectores de pantalla. */
  descripcion: string;
  arbol: Bloque;
  topologia: Topologia;
  E: number;
}

const NOMBRE_CORTO: Record<string, string> = {
  serie3: "3 en serie",
  paralelo3: "3 en paralelo",
  serieParalelo: "Serie + paralelo",
  escalera: "Escalera R-2R",
  mixto6: "Mixto de 6",
  wheatstoneEq: "Puente equilibrado",
  wheatstoneDes: "Puente desequilibrado",
};

export function presetUI(p: PresetE6): PresetUI {
  const arbol = p.arbol ?? arbolDePuente(p.puente as NonNullable<PresetE6["puente"]>);
  return {
    id: p.id,
    nombre: NOMBRE_CORTO[p.id] ?? p.nombre,
    descripcion: p.nombre,
    arbol,
    topologia: p.puente ? "puente" : "arbol",
    E: p.E,
  };
}

export const PRESETS_UI_E6: PresetUI[] = PRESETS_E6.map(presetUI);
