/**
 * Estado de UI de las estaciones de circuitos (E6 resistencias / E7 capacitores): lo que cambia por
 * acción del visitante (árbol o preset, valores, modo, vista de electrones, selección, sonda) y las
 * LECTURAS en vivo que `render/CanvasCircuito.tsx` publica a ~10 Hz (mismo patrón que
 * `materialesStore.ts`).
 *
 * Las posiciones de las partículas NO están aquí: viven en refs dentro de `CanvasCircuito`. Tampoco el
 * resultado numérico de cada fotograma; solo la lectura que muestra la tabla.
 */
import { create } from "zustand";
import {
  MAX_ELEMENTOS,
  agregarParalelo,
  agregarSerie,
  conValor,
  hojas,
  quitar,
  type Bloque,
  type Dominio,
  type LecturaElemento,
  type ModoCircuito,
} from "../fisica/circuitos";
import type { LecturaSondaCircuito, PosicionSonda } from "../render/circuitos/sonda";

/** Rangos didácticos de la spec (§5): E 1–12 V, R 10 Ω–10 kΩ, C 1 µF–1000 µF. */
export const RANGO_E = { min: 1, max: 12, paso: 1 } as const;
export const RANGO_R = { min: 10, max: 10_000 } as const;
export const RANGO_C = { min: 1e-6, max: 1e-3 } as const;
export const RANGO_R_CARGA = RANGO_R;

export const PERSONALIZADO = "personalizado";

export const MENSAJE_TOPE = `Máximo ${MAX_ELEMENTOS} elementos: quita uno para añadir otro.`;
export const MENSAJE_MINIMO = "Debe quedar al menos un elemento.";

/** Lectura de todo el circuito que se muestra en la tabla (publicada a ~10 Hz). */
export interface LecturasCircuito {
  elementos: Record<string, LecturaElemento>;
  /** Corriente que sale del borne + de la batería [A]. */
  iBat: number;
  /** Potencia que entrega la batería [W]. */
  pBat: number;
}

interface EstadoCircuitosStore {
  dominio: Dominio;
  presetId: string;
  arbol: Bloque;
  /** Voltaje de la batería [V]. */
  E: number;
  /** Resistor de carga de E7 [Ω]. */
  rCarga: number;
  modo: ModoCircuito;
  verElectrones: boolean;
  seleccion: string | null;
  sonda: PosicionSonda | null;
  /** Aviso corto tras una edición rechazada (tope de 6, mínimo de 1). */
  mensaje: string | null;
  lecturas: LecturasCircuito | null;
  lecturaSonda: LecturaSondaCircuito | null;

  iniciar: (dominio: Dominio, arbol: Bloque, presetId: string, E?: number) => void;
  elegirPreset: (presetId: string, arbol: Bloque, E?: number) => void;
  setE: (E: number) => void;
  setRCarga: (r: number) => void;
  setModo: (m: ModoCircuito) => void;
  setVerElectrones: (v: boolean) => void;
  seleccionar: (id: string | null) => void;
  setValorElemento: (id: string, valor: number) => void;
  agregarEnSerie: () => void;
  agregarEnParalelo: () => void;
  quitarSeleccionado: () => void;
  setSonda: (s: PosicionSonda | null) => void;
  publicarLecturas: (l: LecturasCircuito | null, s: LecturaSondaCircuito | null) => void;
}

export const acotar = (v: number, min: number, max: number): number => Math.min(max, Math.max(min, v));

export function rangoDe(dominio: Dominio): { min: number; max: number } {
  return dominio === "R" ? RANGO_R : RANGO_C;
}

const idsDe = (b: Bloque): string[] => hojas(b).map((h) => h.id);

export const useCircuitosStore = create<EstadoCircuitosStore>((set, get) => ({
  dominio: "R",
  presetId: PERSONALIZADO,
  arbol: { t: "e", id: "R1", valor: 1000 },
  E: 12,
  rCarga: 1000,
  modo: "dc",
  verElectrones: false,
  seleccion: "R1",
  sonda: null,
  mensaje: null,
  lecturas: null,
  lecturaSonda: null,

  iniciar: (dominio, arbol, presetId, E = 12) =>
    set({
      dominio,
      arbol,
      presetId,
      E,
      modo: dominio === "R" ? "dc" : "abierto",
      seleccion: idsDe(arbol)[0] ?? null,
      sonda: null,
      mensaje: null,
      lecturas: null,
      lecturaSonda: null,
    }),

  elegirPreset: (presetId, arbol, E) =>
    set((s) => ({
      presetId,
      arbol,
      E: E ?? s.E,
      seleccion: idsDe(arbol)[0] ?? null,
      sonda: null,
      mensaje: null,
    })),

  setE: (E) => set({ E: acotar(Math.round(E), RANGO_E.min, RANGO_E.max) }),
  setRCarga: (r) => set({ rCarga: acotar(r, RANGO_R_CARGA.min, RANGO_R_CARGA.max) }),
  setModo: (modo) => set({ modo }),
  setVerElectrones: (verElectrones) => set({ verElectrones }),
  seleccionar: (id) => set({ seleccion: id }),

  setValorElemento: (id, valor) => {
    const { arbol, dominio } = get();
    const { min, max } = rangoDe(dominio);
    set({ arbol: conValor(arbol, id, acotar(valor, min, max)) });
  },

  agregarEnSerie: () => {
    const { arbol, seleccion, dominio } = get();
    if (seleccion === null) return;
    const nuevo = agregarSerie(arbol, seleccion, dominio);
    if (!nuevo) return set({ mensaje: MENSAJE_TOPE });
    const k = idsDe(arbol).indexOf(seleccion);
    set({ arbol: nuevo, presetId: PERSONALIZADO, seleccion: idsDe(nuevo)[k + 1] ?? null, sonda: null, mensaje: null });
  },

  agregarEnParalelo: () => {
    const { arbol, seleccion, dominio } = get();
    if (seleccion === null) return;
    const nuevo = agregarParalelo(arbol, seleccion, dominio);
    if (!nuevo) return set({ mensaje: MENSAJE_TOPE });
    const k = idsDe(arbol).indexOf(seleccion);
    set({ arbol: nuevo, presetId: PERSONALIZADO, seleccion: idsDe(nuevo)[k + 1] ?? null, sonda: null, mensaje: null });
  },

  quitarSeleccionado: () => {
    const { arbol, seleccion, dominio } = get();
    if (seleccion === null) return;
    const nuevo = quitar(arbol, seleccion, dominio);
    if (!nuevo) return set({ mensaje: MENSAJE_MINIMO });
    const k = idsDe(arbol).indexOf(seleccion);
    const ids = idsDe(nuevo);
    set({ arbol: nuevo, presetId: PERSONALIZADO, seleccion: ids[Math.max(0, Math.min(k - 1, ids.length - 1))] ?? null, sonda: null, mensaje: null });
  },

  setSonda: (sonda) => set({ sonda }),
  publicarLecturas: (lecturas, lecturaSonda) => set({ lecturas, lecturaSonda }),
}));
