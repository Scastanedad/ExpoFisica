import { E_MAX_AIRE, KAPPA_AIRE } from "./constantes";
import type { Dielectrico } from "./tipos";

/**
 * Catálogo de dieléctricos reales. Valores de la tabla de constantes y rigideces dieléctricas aproximadas
 * a temperatura ambiente de Serway (Física para ciencias e ingeniería, capítulo de capacitancia):
 * son valores de tabla, ideales (la rigidez real depende del espesor y de la geometría).
 * PENDIENTE: verificar cada valor contra el libro (ver contrato §5).
 * El agua queda fuera a propósito (conduce y no tiene rigidez tabulada).
 * Orden: por κ creciente, con el aire primero.
 */
export const FUENTE_CATALOGO = "Serway, tabla de constantes y rigideces dieléctricas aproximadas (temperatura ambiente)";

export const AIRE: Dielectrico = {
  id: "aire",
  nombre: "Aire",
  uso: "capacitor variable de radio",
  kappa: KAPPA_AIRE,
  eMax: E_MAX_AIRE,
};

export const CATALOGO: readonly Dielectrico[] = [
  AIRE,
  { id: "teflon", nombre: "Teflón", uso: "RF y alta temperatura", kappa: 2.1, eMax: 60e6 },
  { id: "silicona", nombre: "Aceite de silicona", uso: "transformadores y capacitores de potencia", kappa: 2.5, eMax: 15e6 },
  { id: "poliestireno", nombre: "Poliestireno", uso: "capacitores de película de audio", kappa: 2.56, eMax: 24e6 },
  { id: "mylar", nombre: "Mylar (PET)", uso: "capacitores de película comunes", kappa: 3.2, eMax: 7e6 },
  { id: "pvc", nombre: "PVC", uso: "aislamiento de cables eléctricos", kappa: 3.4, eMax: 40e6 },
  { id: "papel", nombre: "Papel", uso: "capacitores de papel antiguos", kappa: 3.7, eMax: 16e6 },
  { id: "pyrex", nombre: "Vidrio Pyrex", uso: "botella de Leyden, laboratorio", kappa: 5.6, eMax: 14e6 },
  { id: "porcelana", nombre: "Porcelana", uso: "aisladores de alta tensión", kappa: 6, eMax: 12e6 },
  { id: "neopreno", nombre: "Neopreno", uso: "aislamiento flexible de cables", kappa: 6.7, eMax: 12e6 },
  { id: "titanato", nombre: "Titanato de estroncio", uso: "capacitores cerámicos de κ muy alta", kappa: 233, eMax: 8e6 },
];

export function existeDielectrico(id: string): boolean {
  return CATALOGO.some((m) => m.id === id);
}

/** Devuelve el material; un id desconocido cae al aire (el caller valida con `existeDielectrico` si le importa). */
export function dielectricoPorId(id: string): Dielectrico {
  return CATALOGO.find((m) => m.id === id) ?? AIRE;
}
