/**
 * Escenarios rápidos de la estación 08 (puro). Cada uno devuelve parámetros ya válidos y la referencia que
 * corresponde: la comparación del panel arranca mostrando «antes → después».
 */
import {
  A_DEFECTO,
  D_DEFECTO,
  V_DEFECTO,
  cambiarModo,
  referenciaDe,
  sincronizar,
  type Parametros,
  type Referencia,
} from "../../fisica/capacitorPlacas";

export interface Escenario {
  id: string;
  etiqueta: string;
  /** Qué enseña, en una línea. */
  idea: string;
  construir: () => { p: Parametros; referencia: Referencia };
}

const aire = (extra: Partial<Parametros> = {}): Parametros =>
  sincronizar({ modo: "conectado", A: A_DEFECTO, d: D_DEFECTO, materialId: "aire", f: 0, V: V_DEFECTO, Q: 0, ...extra });

export const ESCENARIOS: readonly Escenario[] = [
  {
    id: "vidrio-conectado",
    etiqueta: "Meter vidrio con la batería conectada",
    idea: "V se mantiene: entra más carga, C y U suben ×κ y el campo no cambia.",
    construir: () => {
      const base = aire();
      return { p: sincronizar({ ...base, materialId: "pyrex", f: 1 }), referencia: referenciaDe(base) };
    },
  },
  {
    id: "cargar-desconectar-vidrio",
    etiqueta: "Cargar, desconectar y meter vidrio",
    idea: "Q queda fija: V, E y U bajan ÷κ y C sube ×κ.",
    construir: () => {
      const aislado = cambiarModo(aire(), "aislado");
      return { p: sincronizar({ ...aislado, materialId: "pyrex", f: 1 }), referencia: referenciaDe(aislado) };
    },
  },
  {
    id: "separar-aislado",
    etiqueta: "Separar placas aislado",
    idea: "Q fija y E constante: V y U suben al separar; alguien hace trabajo.",
    construir: () => {
      const base = cambiarModo(aire(), "aislado");
      return {
        p: sincronizar({ ...base, d: 5 * D_DEFECTO }),
        referencia: { ...referenciaDe(base), fijada: true },
      };
    },
  },
  {
    id: "cerca-ruptura-aire",
    etiqueta: "Cerca de la ruptura del aire",
    idea: "Con 2800 V a 1 mm el campo llega al 93 % de la rigidez del aire (3 MV/m): casi salta la chispa.",
    construir: () => {
      const p = aire({ V: 2800 });
      return { p, referencia: referenciaDe(p) };
    },
  },
  {
    id: "titanato",
    etiqueta: "Titanato: κ = 233",
    idea: "Un cerámico de κ muy alta: con la misma batería guarda 233 veces más carga.",
    construir: () => {
      const base = aire();
      return { p: sincronizar({ ...base, materialId: "titanato", f: 1 }), referencia: referenciaDe(base) };
    },
  },
];
