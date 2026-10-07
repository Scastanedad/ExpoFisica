/** Tipos públicos de gauss3d (contrato §2). Código puro: sin DOM ni React. */

export type Vec3 = readonly [number, number, number];
export type Vec3M = [number, number, number];

/** Carga puntual. `q` con signo, en unidades de carga de la app (1 unidad = 1 µC). */
export interface Carga3D {
  x: number;
  y: number;
  z: number;
  q: number;
}

export type TipoSuperficie = "parche" | "esfera" | "cubo" | "cilindro";
export type Superficie =
  | { tipo: "parche"; lado: number; theta: number; phi: number }
  | { tipo: "esfera"; radio: number }
  | { tipo: "cubo"; lado: number }
  | { tipo: "cilindro"; radio: number; altura: number };

export interface Camara {
  azimut: number;
  inclinacion: number;
  zoom: number;
  fov: number;
  ancho: number;
  alto: number;
}
export interface CamaraDerivada {
  pos: Vec3;
  R: Float32Array;
  distancia: number;
  fPx: number;
  encuadre: number;
}

export type Calidad3D = 0 | 1 | 2;
export interface NivelGauss3D {
  nombre: "alta" | "media" | "baja";
  presupuestoLineas: number;
  pasoLinea: number;
  mallaEsfera: readonly [nu: number, nv: number];
  celdasCara: number;
  celdasCilindro: readonly [nz: number, nphi: number];
  tapaFlechas: number;
}

export interface Escenario {
  superficie: Superficie;
  cargas: readonly Carga3D[];
  calidad: Calidad3D;
}

export interface MallaSuperficie {
  tipo: TipoSuperficie;
  vertices: Float32Array;
  triangulos: Uint32Array;
  parcheDeTriangulo: Uint32Array;
  nParches: number;
  areaParche: Float32Array;
  normalTriangulo: Float32Array;
  centroParche: Float32Array;
  nCeldasU: number;
  nCeldasV: number;
}
export interface ResultadoFlujo {
  total: number;
  qEnc: number;
  porCarga: Float64Array;
  porParche: Float32Array;
  densidadParche: Float32Array;
  maxAbsDensidad: number;
}

export interface LineasCampo3D {
  n: number;
  inicio: Uint32Array;
  puntos: Float32Array;
  carga: Uint8Array;
  signo: Int8Array;
  sentido: Int8Array;
  fin: Uint8Array;
  finCarga: Int8Array;
  lineasPorCarga: Uint16Array;
}

export interface Cruces {
  n: number;
  posicion: Float32Array;
  linea: Uint32Array;
  segmento: Uint32Array;
  t: Float32Array;
  sentido: Int8Array;
  salen: number;
  entran: number;
}
