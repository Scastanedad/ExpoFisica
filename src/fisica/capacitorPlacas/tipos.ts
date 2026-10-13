export type Modo = "conectado" | "aislado";

export interface Parametros {
  modo: Modo;
  /** Área de cada placa, m² (placas cuadradas de lado √A). */
  A: number;
  /** Separación, m. */
  d: number;
  /** Id del catálogo (`dielectricos.ts`). */
  materialId: string;
  /** Fracción del dieléctrico insertada, 0..1. */
  f: number;
  /** Tensión, V. En modo conectado es la entrada; en aislado es derivada. */
  V: number;
  /** Carga, C. En modo aislado es la entrada; en conectado es derivada. */
  Q: number;
}

export interface Estado {
  /** Capacitancia, F. */
  C: number;
  Q: number;
  V: number;
  /** Campo uniforme en todo el hueco (igual en la zona de aire y en la del dieléctrico), V/m. */
  E: number;
  /** Energía almacenada, J. */
  U: number;
  /** Densidad de energía en la zona de aire y en la del dieléctrico, J/m³. */
  uAire: number;
  uDiel: number;
  /** Densidad de carga libre en la zona del dieléctrico y en la de aire, C/m². */
  sigmaLibre: number;
  sigmaLibreAire: number;
  /** Densidad de carga ligada en las caras del dieléctrico, C/m². */
  sigmaLigada: number;
  /** Rigidez efectiva según la fracción insertada, V/m. */
  eLim: number;
  /** E / eLim (1 = límite). */
  ratioRigidez: number;
  /** Fuerza que mete la lámina, ½V²·dC/dx, N (0 si ya está dentro o no hay dieléctrico). */
  F: number;
}

export interface Dielectrico {
  id: string;
  nombre: string;
  /** Uso real, una línea para la UI. */
  uso: string;
  kappa: number;
  /** Rigidez dieléctrica, V/m. */
  eMax: number;
}

export type TipoMotivo =
  | "limita-V"
  | "limita-d"
  | "sube-d"
  | "baja-V"
  | "limita-parametro"
  | "material-bloqueado";

export interface Motivo {
  tipo: TipoMotivo;
  variable?: "A" | "d" | "f" | "V" | "Q" | "material";
}

export interface ResultadoAjuste {
  p: Parametros;
  /** Presente si el cambio pedido se recortó o se bloqueó por la rigidez o por el tope de tensión. */
  bloqueado?: Motivo;
}

export type TipoCambio = "sube" | "baja" | "igual";

export interface Cambio {
  /** actual / referencia. */
  razon: number;
  tipo: TipoCambio;
  /** «↑ ×3,7 (= κ)», «↓ ÷5,6 (= 1/κ)» o «= igual». */
  etiqueta: string;
}

export interface Referencia {
  p: Parametros;
  estado: Estado;
  /** true: fijada a mano con «Fijar referencia» (no sigue al estado). */
  fijada: boolean;
}
