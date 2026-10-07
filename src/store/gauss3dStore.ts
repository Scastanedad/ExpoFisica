/**
 * Estado de UI de la Estación 05 (Ley de Gauss), solo lo que cambia por acción del visitante: forma y tamaño de la
 * superficie, q y z de cada carga (valores de deslizador), carga seleccionada, escenario, interruptores y vista.
 *
 * Las posiciones x, y de las cargas NO están aquí: viven en el controlador (`render/controladorGauss3d.ts`), que las
 * mueve con el arrastre sin pasar por React. Cada carga lleva `x0`/`y0` solo como posición INICIAL (la lee el
 * controlador la primera vez que ve su `id`; sin ellas, la coloca él). El azimut que cambia el arrastre también vive
 * en el controlador mientras se arrastra y se publica aquí al soltar.
 */
import { create } from "zustand";
import { Q_MAX, Q_MIN, normalizarCarga } from "../fisica/carga";
import { MAX_CARGAS, RANGOS } from "../fisica/gauss3d/constantes";
import { ESCENARIOS, type DefEscenario } from "../fisica/gauss3d/escenarios";
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
export const ESCENARIO_INICIAL = 2;

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

const aGrados = (rad: number) => Math.round((rad * 180) / Math.PI);

function acotar(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}

export function normalizarAzimutDeg(g: number): number {
  const m = ((((g + 180) % 360) + 360) % 360) - 180;
  return m === -180 ? 180 : m;
}

let contadorId = 0;
const nuevoId = () => ++contadorId;

interface EstadoEscenario {
  escenarioId: number;
  fuera: boolean;
  forma: TipoSuperficie;
  tamano: number;
  thetaDeg: number;
  cargas: CargaUI[];
  seleccionada: number;
  mostrar: Mostrar;
}

function tamanoDe(s: Superficie): number {
  return s.tipo === "esfera" || s.tipo === "cilindro" ? s.radio : s.lado;
}

/** Estado de UI de un escenario (cargas con ids nuevos). */
export function estadoDeEscenario(def: DefEscenario, fuera = false): EstadoEscenario {
  const cargas = fuera && def.variante ? def.variante.cargas : def.cargas;
  const s = def.superficie;
  return {
    escenarioId: def.id,
    fuera: fuera && !!def.variante,
    forma: s.tipo,
    tamano: tamanoDe(s),
    thetaDeg: s.tipo === "parche" ? aGrados(s.theta) : 0,
    cargas: cargas.map((c) => ({ id: nuevoId(), q: c.q, z: c.z, x0: c.x, y0: c.y })),
    seleccionada: 0,
    mostrar: { ...def.mostrar },
  };
}

interface EstadoGauss3D extends EstadoEscenario {
  azimutDeg: number;
  inclinacionDeg: number;
  zoom: number;
  opacidad: number;
  lectura: LecturaGauss | null;

  aplicarEscenario: (id: number, opciones?: { fuera?: boolean; conservarVista?: boolean }) => void;
  setForma: (f: TipoSuperficie) => void;
  setTamano: (t: number) => void;
  setThetaDeg: (t: number) => void;
  setQ: (magnitud: number) => void;
  alternarSigno: () => void;
  setZ: (z: number) => void;
  /** Corrección que hace el controlador de la z de una carga (zona de exclusión): no es una acción del usuario. */
  corregirZ: (id: number, z: number) => void;
  anadirCarga: () => void;
  quitarCarga: () => void;
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

function escenarioBase(id: number): DefEscenario {
  return ESCENARIOS[id - 1] ?? ESCENARIOS[ESCENARIO_INICIAL - 1];
}

export const useGauss3dStore = create<EstadoGauss3D>((set) => ({
  ...estadoDeEscenario(escenarioBase(ESCENARIO_INICIAL)),
  azimutDeg: AZIMUT_INICIAL_DEG,
  inclinacionDeg: INCLINACION_INICIAL_DEG,
  zoom: 1,
  opacidad: 1,
  lectura: null,

  aplicarEscenario: (id, opciones = {}) =>
    set(() => {
      const def = escenarioBase(id);
      const base = estadoDeEscenario(def, opciones.fuera ?? false);
      if (opciones.conservarVista) return base;
      return {
        ...base,
        azimutDeg: aGrados(def.vista.azimut),
        inclinacionDeg: aGrados(def.vista.inclinacion),
        zoom: 1,
      };
    }),

  setForma: (f) =>
    set((s) => (s.forma === f ? s : { forma: f, tamano: rangoTamano(f).def, thetaDeg: f === "parche" ? s.thetaDeg : 0 })),
  setTamano: (t) =>
    set((s) => {
      const r = rangoTamano(s.forma);
      return { tamano: acotar(t, r.min, r.max) };
    }),
  setThetaDeg: (t) => set({ thetaDeg: acotar(Math.round(t), 0, THETA_MAX_DEG) }),

  setQ: (magnitud) =>
    set((s) => {
      const c = s.cargas[s.seleccionada];
      if (!c) return s;
      const signo = c.q < 0 ? -1 : 1;
      const q = normalizarCarga(signo * acotar(magnitud, Q_MIN, Q_MAX));
      if (q === null || q === c.q) return s;
      return { cargas: s.cargas.map((x, i) => (i === s.seleccionada ? { ...x, q } : x)) };
    }),
  alternarSigno: () =>
    set((s) => {
      const c = s.cargas[s.seleccionada];
      if (!c) return s;
      return { cargas: s.cargas.map((x, i) => (i === s.seleccionada ? { ...x, q: -x.q } : x)) };
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

  anadirCarga: () =>
    set((s) => {
      if (s.cargas.length >= MAX_CARGAS) return s;
      const primera = s.cargas[0];
      // opuesta a la primera (el par más didáctico: un dipolo), a media altura
      const nueva: CargaUI = { id: nuevoId(), q: primera ? -primera.q : 3, z: 0 };
      return { cargas: [...s.cargas, nueva], seleccionada: s.cargas.length };
    }),
  quitarCarga: () =>
    set((s) => {
      if (s.cargas.length <= 1) return s;
      const cargas = s.cargas.filter((_, i) => i !== s.seleccionada);
      return { cargas, seleccionada: 0 };
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
