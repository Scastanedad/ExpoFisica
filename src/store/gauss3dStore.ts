/**
 * Estado de UI de la Estación 05 (Ley de Gauss), solo lo que cambia por acción del visitante: forma y tamaño de la
 * superficie, fuente (una carga o dipolo), q y z de cada carga (valores de deslizador), carga seleccionada, interruptores y vista.
 *
 * Las posiciones x, y de las cargas NO están aquí: viven en el controlador (`render/controladorGauss3d.ts`), que las
 * mueve con el arrastre sin pasar por React. Cada carga lleva `x0`/`y0` solo como posición INICIAL (la lee el
 * controlador la primera vez que ve su `id`; sin ellas, la coloca él). El azimut que cambia el arrastre también vive
 * en el controlador mientras se arrastra y se publica aquí al soltar.
 */
import { create } from "zustand";
import { Q_MAX, Q_MIN, normalizarCarga } from "../fisica/carga";
import { RANGOS } from "../fisica/gauss3d/constantes";
import { posicionInicial, type Fuente } from "../fisica/gauss3d/presets";
import { crearSuperficie } from "../fisica/gauss3d/superficies";
import type { Superficie, TipoSuperficie } from "../fisica/gauss3d/tipos";

export const AZIMUT_INICIAL_DEG = 35;
export const INCLINACION_INICIAL_DEG = 30;
export const INCLINACION_MIN_DEG = 15;
export const INCLINACION_MAX_DEG = 85;
export const ZOOM_MIN = 0.5;
export const ZOOM_MAX = 2.5;
export const OPACIDAD_MIN = 0.2;
export const OPACIDAD_MAX = 1;
export const Z_MIN = RANGOS.carga.z.min;
export const Z_MAX = RANGOS.carga.z.max;
export const Z_PASO = 0.5;
export const THETA_MAX_DEG = 90;
export const FORMA_INICIAL: TipoSuperficie = "esfera";
export const FUENTE_INICIAL: Fuente = "carga";

export type { Fuente };

export interface CargaUI {
  /** Identificador estable (el controlador guarda x, y por id). */
  id: number;
  /** Con signo, en µC (|q| de 0.5 a 5 en pasos de 0.5). */
  q: number;
  z: number;
  /** Posición inicial en el plano (opcional: sin ella el controlador elige una). */
  x0?: number;
  y0?: number;
}

export interface Mostrar {
  lineas: boolean;
  flujo: boolean;
  campo: boolean;
}

/** Lo que el controlador publica (≤ 10 Hz) tras recalcular la geometría. */
export interface LecturaGauss {
  /** Φ en µC/ε₀ (`calcularFlujo`, nunca un conteo de líneas). */
  phi: number;
  qEnc: number;
  salen: number;
  entran: number;
  nLineas: number;
  tipo: string;
  calidad: string;
  /** Por carga: q (µC), si está dentro de la superficie y si está en el centro. */
  cargas: ReadonlyArray<{ q: number; dentro: boolean; centrada: boolean }>;
  /** Posición (x, y) de cada carga, en u: alimenta los campos numéricos de «Avanzado». */
  xy: ReadonlyArray<readonly [number, number]>;
}

interface RangoTamano {
  min: number;
  max: number;
  def: number;
  paso: number;
}

/** Rango del deslizador «tamaño» según la forma (esfera/cilindro: radio; cubo/parche: lado; el cilindro mide 2R de alto). */
export function rangoTamano(forma: TipoSuperficie): RangoTamano {
  switch (forma) {
    case "esfera":
      return { ...RANGOS.esfera.radio, paso: 0.5 };
    case "cubo":
      return { ...RANGOS.cubo.lado, paso: 1 };
    case "cilindro":
      return { ...RANGOS.cilindro.radio, paso: 0.5 };
    case "parche":
      return { ...RANGOS.parche.lado, paso: 1 };
  }
}

/** Superficie que corresponde a (forma, tamaño, θ en grados). Cilindro: radio = tamaño, altura = 2·tamaño. */
export function superficieDeUI(forma: TipoSuperficie, tamano: number, thetaDeg: number): Superficie {
  switch (forma) {
    case "esfera":
      return crearSuperficie("esfera", { radio: tamano });
    case "cubo":
      return crearSuperficie("cubo", { lado: tamano });
    case "cilindro":
      return crearSuperficie("cilindro", { radio: tamano, altura: 2 * tamano });
    case "parche":
      return crearSuperficie("parche", { lado: tamano, theta: (thetaDeg * Math.PI) / 180, phi: 0 });
  }
}

function acotar(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}

export function normalizarAzimutDeg(g: number): number {
  const m = ((((g + 180) % 360) + 360) % 360) - 180;
  return m === -180 ? 180 : m;
}

let contadorId = 0;
const nuevoId = () => ++contadorId;

/** Cargas de UI (ids nuevos, x0/y0 como posición inicial) de la posición inicial de (forma, fuente). */
function cargasIniciales(forma: TipoSuperficie, fuente: Fuente): { tamano: number; cargas: CargaUI[] } {
  const p = posicionInicial(forma, fuente);
  return { tamano: p.tamano, cargas: p.cargas.map((c) => ({ id: nuevoId(), q: c.q, z: c.z, x0: c.x, y0: c.y })) };
}

interface EstadoGauss3D {
  forma: TipoSuperficie;
  fuente: Fuente;
  tamano: number;
  thetaDeg: number;
  cargas: CargaUI[];
  seleccionada: number;
  mostrar: Mostrar;
  azimutDeg: number;
  inclinacionDeg: number;
  zoom: number;
  opacidad: number;
  lectura: LecturaGauss | null;

  /** Cambia de figura y recoloca las cargas en la posición inicial de la combinación (también tamaño). */
  setForma: (f: TipoSuperficie) => void;
  /** Cambia de fuente y recoloca las cargas (conserva figura y tamaño). */
  setFuente: (f: Fuente) => void;
  /** Devuelve las cargas a su posición inicial para la figura y fuente actuales (conserva el tamaño). */
  recolocar: () => void;
  setTamano: (t: number) => void;
  setThetaDeg: (t: number) => void;
  setQ: (magnitud: number) => void;
  alternarSigno: () => void;
  setZ: (z: number) => void;
  /** Corrección que hace el controlador de la z de una carga (zona de exclusión): no es una acción del usuario. */
  corregirZ: (id: number, z: number) => void;
  seleccionar: (indice: number) => void;
  setMostrar: (k: keyof Mostrar, v: boolean) => void;
  setAzimutDeg: (g: number) => void;
  girarAzimutDeg: (delta: number) => void;
  setInclinacionDeg: (g: number) => void;
  setZoom: (z: number) => void;
  setOpacidad: (o: number) => void;
  vistaInicial: () => void;
  publicarLectura: (l: LecturaGauss | null) => void;
}

export const useGauss3dStore = create<EstadoGauss3D>((set) => ({
  forma: FORMA_INICIAL,
  fuente: FUENTE_INICIAL,
  ...cargasIniciales(FORMA_INICIAL, FUENTE_INICIAL),
  thetaDeg: 0,
  seleccionada: 0,
  mostrar: { lineas: true, flujo: true, campo: false },
  azimutDeg: AZIMUT_INICIAL_DEG,
  inclinacionDeg: INCLINACION_INICIAL_DEG,
  zoom: 1,
  opacidad: 1,
  lectura: null,

  setForma: (f) =>
    set((s) =>
      s.forma === f
        ? s
        : { forma: f, ...cargasIniciales(f, s.fuente), seleccionada: 0, thetaDeg: f === "parche" ? s.thetaDeg : 0 },
    ),
  setFuente: (fu) =>
    set((s) => (s.fuente === fu ? s : { fuente: fu, cargas: cargasIniciales(s.forma, fu).cargas, seleccionada: 0 })),
  recolocar: () => set((s) => ({ cargas: cargasIniciales(s.forma, s.fuente).cargas, seleccionada: 0 })),
  setTamano: (t) =>
    set((s) => {
      const r = rangoTamano(s.forma);
      return { tamano: acotar(t, r.min, r.max) };
    }),
  setThetaDeg: (t) => set({ thetaDeg: acotar(Math.round(t), 0, THETA_MAX_DEG) }),

  setQ: (magnitud) =>
    set((s) => {
      if (!s.cargas[s.seleccionada]) return s;
      const m = acotar(magnitud, Q_MIN, Q_MAX);
      // Dipolo: las dos cargas cambian a la vez (cada una conserva su signo, siempre opuestos).
      const objetivo = (i: number) => s.fuente === "dipolo" || i === s.seleccionada;
      let cambia = false;
      const cargas = s.cargas.map((x, i) => {
        if (!objetivo(i)) return x;
        const q = normalizarCarga((x.q < 0 ? -1 : 1) * m);
        if (q === null || q === x.q) return x;
        cambia = true;
        return { ...x, q };
      });
      return cambia ? { cargas } : s;
    }),
  alternarSigno: () =>
    set((s) => {
      if (!s.cargas[s.seleccionada]) return s;
      const objetivo = (i: number) => s.fuente === "dipolo" || i === s.seleccionada;
      return { cargas: s.cargas.map((x, i) => (objetivo(i) ? { ...x, q: -x.q } : x)) };
    }),
  setZ: (z) =>
    set((s) => {
      const c = s.cargas[s.seleccionada];
      const v = acotar(z, Z_MIN, Z_MAX);
      if (!c || c.z === v) return s;
      return { cargas: s.cargas.map((x, i) => (i === s.seleccionada ? { ...x, z: v } : x)) };
    }),
  corregirZ: (id, z) =>
    set((s) => {
      const i = s.cargas.findIndex((c) => c.id === id);
      if (i < 0 || Math.abs(s.cargas[i].z - z) < 1e-9) return s;
      return { cargas: s.cargas.map((x, k) => (k === i ? { ...x, z } : x)) };
    }),

  seleccionar: (indice) =>
    set((s) => (indice < 0 || indice >= s.cargas.length || indice === s.seleccionada ? s : { seleccionada: indice })),

  setMostrar: (k, v) => set((s) => (s.mostrar[k] === v ? s : { mostrar: { ...s.mostrar, [k]: v } })),
  setAzimutDeg: (g) => set({ azimutDeg: normalizarAzimutDeg(g) }),
  girarAzimutDeg: (delta) => set((s) => ({ azimutDeg: normalizarAzimutDeg(s.azimutDeg + delta) })),
  setInclinacionDeg: (g) => set({ inclinacionDeg: acotar(g, INCLINACION_MIN_DEG, INCLINACION_MAX_DEG) }),
  setZoom: (z) => set({ zoom: acotar(z, ZOOM_MIN, ZOOM_MAX) }),
  setOpacidad: (o) => set({ opacidad: acotar(o, OPACIDAD_MIN, OPACIDAD_MAX) }),
  vistaInicial: () =>
    set({ azimutDeg: AZIMUT_INICIAL_DEG, inclinacionDeg: INCLINACION_INICIAL_DEG, zoom: 1, opacidad: 1 }),
  publicarLectura: (l) => set({ lectura: l }),
}));

export type EstadoUIGauss3D = EstadoGauss3D;
