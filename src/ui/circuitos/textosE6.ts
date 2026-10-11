/**
 * Textos educativos de E6 «Resistencias» (spec E6-E7-circuitos-criterios §2). Puros y sin DOM: el texto
 * depende de la FORMA del circuito (serie, paralelo, mixto, puente), no del preset elegido, así que sigue
 * siendo cierto cuando el visitante edita el circuito.
 */
import type { Bloque } from "../../fisica/circuitos";
import { valoresDePuente } from "../../render/circuitos/estado";
import type { Topologia } from "../../store/circuitosStore";

export interface TextoEducativo {
  titulo: string;
  parrafos: string[];
}

/** Tolerancia relativa para decir que el puente está equilibrado (R1·R4 = R2·R3). */
const TOL_EQUILIBRIO = 1e-9;

export const TEXTO_GENERAL_E6 =
  "Los valores son los de un circuito ideal: cables sin resistencia y batería ideal, salvo que actives «Batería real».";

export const TEXTO_BATERIA_REAL =
  "Batería real: el voltaje en los bornes baja al pedir más corriente, porque parte del voltaje se pierde dentro de la propia batería.";

export type FormaCircuito = "uno" | "serie" | "paralelo" | "mixto" | "puente";

export function formaDelCircuito(arbol: Bloque, topologia: Topologia): FormaCircuito {
  if (topologia === "puente") return "puente";
  if (arbol.t === "e") return "uno";
  const hijosSimples = arbol.hijos.every((h) => h.t === "e");
  if (!hijosSimples) return "mixto";
  return arbol.t === "s" ? "serie" : "paralelo";
}

/** Sentido de la corriente por el puente R5 (de A a B si V_A > V_B), o null si está equilibrado. */
export function sentidoPuente(arbol: Bloque): "AaB" | "BaA" | null {
  const { R1, R2, R3, R4 } = valoresDePuente(arbol);
  const a = R2 * R3; // V_A > V_B  ⇔  R2·R3 > R1·R4
  const b = R1 * R4;
  if (Math.abs(a - b) <= TOL_EQUILIBRIO * Math.max(a, b)) return null;
  return a > b ? "AaB" : "BaA";
}

const BASE_PUENTE =
  "R5 une los puntos A y B y no es ni serie ni paralelo. Si R1/R2 = R3/R4, los puntos A y B tienen el mismo voltaje y por el puente no pasa corriente (aunque tenga resistencia).";

export function textoEducativoE6(arbol: Bloque, topologia: Topologia): TextoEducativo {
  switch (formaDelCircuito(arbol, topologia)) {
    case "uno":
      return {
        titulo: "Un solo resistor",
        parrafos: [
          "Todo el voltaje de la batería cae en el resistor y la corriente es I = V / R. Añade otro en serie o en paralelo y compara.",
        ],
      };
    case "serie":
      return {
        titulo: "Resistores en serie",
        parrafos: [
          "La misma corriente atraviesa todos; el voltaje se reparte en proporción a la resistencia (V = R·I). La suma de las caídas es el voltaje de la batería.",
          "La resistencia total es la suma de las resistencias.",
        ],
      };
    case "paralelo":
      return {
        titulo: "Resistores en paralelo",
        parrafos: [
          "Todas las ramas tienen el mismo voltaje; la corriente se reparte: más por la menor resistencia.",
          "Añadir una rama en paralelo baja la resistencia total.",
        ],
      };
    case "mixto":
      return {
        titulo: "Serie y paralelo combinados",
        parrafos: [
          "Cada bloque en paralelo comparte voltaje y reparte la corriente; cada bloque en serie comparte corriente y reparte el voltaje.",
          "Para hallar la resistencia total se reduce de adentro hacia afuera: usa «Reducir un paso».",
        ],
      };
    case "puente": {
      const sentido = sentidoPuente(arbol);
      if (sentido === null) {
        return {
          titulo: "Puente de Wheatstone equilibrado",
          parrafos: [BASE_PUENTE, "Aquí se cumple: por R5 no pasa corriente y A y B miden lo mismo con la sonda."],
        };
      }
      const ruta = sentido === "AaB" ? "de A hacia B" : "de B hacia A";
      return {
        titulo: "Puente de Wheatstone desequilibrado",
        parrafos: [
          BASE_PUENTE,
          `Aquí no se cumple: aparece corriente por el puente, ${ruta}, hacia el punto de menor voltaje.`,
        ],
      };
    }
  }
}
