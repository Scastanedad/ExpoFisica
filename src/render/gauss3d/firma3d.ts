/**
 * Firma de capa de la estación Ley de Gauss (contrato §4), mismo patrón que `firmaCapa.ts`: arrays tipados, sin
 * cadenas, se compara en cada frame.
 *  - "geometria": cambia la superficie (tipo/tamaños), cualquier x,y,z,q de carga, el nº de cargas, la calidad o un
 *    toggle que añade cálculo (líneas, campo). No depende de la cámara.
 *  - "camara": azimut, inclinación, zoom, fov, tamaño del canvas, dpr, opacidad o el toggle de flujo (solo colorea).
 *  - "igual": no hay que hacer nada.
 */
import type { Escenario, Superficie } from "../../fisica/gauss3d/tipos";

export interface DatosFirma3D {
  escenario: Escenario;
  camara: { azimut: number; inclinacion: number; zoom: number; fov: number; ancho: number; alto: number };
  dpr: number;
  mostrar: { lineas: boolean; flujo: boolean; campo: boolean };
  opacidad: number;
}

export type CambioFirma3D = "igual" | "camara" | "geometria";

export interface Firma3D {
  comparar(d: DatosFirma3D): CambioFirma3D;
  guardar(d: DatosFirma3D): void;
}

const N_CAMARA = 10;
const N_GEO_FIJO = 8;

function indiceTipo(s: Superficie): number {
  return s.tipo === "parche" ? 0 : s.tipo === "esfera" ? 1 : s.tipo === "cubo" ? 2 : 3;
}

/** Parámetros de la superficie en 3 casillas (según el tipo). */
function paramsSuperficie(s: Superficie, k: number): number {
  switch (s.tipo) {
    case "parche":
      return k === 0 ? s.lado : k === 1 ? s.theta : s.phi;
    case "esfera":
      return k === 0 ? s.radio : 0;
    case "cubo":
      return k === 0 ? s.lado : 0;
    case "cilindro":
      return k === 0 ? s.radio : k === 1 ? s.altura : 0;
  }
}

function escribirGeometria(d: DatosFirma3D, out: Float64Array): void {
  const e = d.escenario;
  out[0] = indiceTipo(e.superficie);
  out[1] = paramsSuperficie(e.superficie, 0);
  out[2] = paramsSuperficie(e.superficie, 1);
  out[3] = paramsSuperficie(e.superficie, 2);
  out[4] = e.calidad;
  out[5] = d.mostrar.lineas ? 1 : 0;
  out[6] = d.mostrar.campo ? 1 : 0;
  out[7] = e.cargas.length;
  for (let i = 0; i < e.cargas.length; i++) {
    const c = e.cargas[i];
    out[N_GEO_FIJO + 4 * i] = c.x;
    out[N_GEO_FIJO + 4 * i + 1] = c.y;
    out[N_GEO_FIJO + 4 * i + 2] = c.z;
    out[N_GEO_FIJO + 4 * i + 3] = c.q;
  }
}

function escribirCamara(d: DatosFirma3D, out: Float64Array): void {
  const c = d.camara;
  out[0] = c.azimut;
  out[1] = c.inclinacion;
  out[2] = c.zoom;
  out[3] = c.fov;
  out[4] = c.ancho;
  out[5] = c.alto;
  out[6] = d.dpr;
  out[7] = d.opacidad;
  out[8] = d.mostrar.flujo ? 1 : 0;
  out[9] = 0;
}

export function crearFirma3D(): Firma3D {
  let valida = false;
  let geometria = new Float64Array(0);
  const camara = new Float64Array(N_CAMARA);
  // buffer de trabajo para comparar sin asignar (se reasigna solo si cambia el nº de cargas)
  let trabajo = new Float64Array(0);

  return {
    comparar(d) {
      if (!valida) return "geometria";
      const n = N_GEO_FIJO + 4 * d.escenario.cargas.length;
      if (geometria.length !== n) return "geometria";
      if (trabajo.length !== n) trabajo = new Float64Array(n);
      escribirGeometria(d, trabajo);
      for (let i = 0; i < n; i++) if (trabajo[i] !== geometria[i]) return "geometria";
      const c = d.camara;
      if (
        camara[0] !== c.azimut ||
        camara[1] !== c.inclinacion ||
        camara[2] !== c.zoom ||
        camara[3] !== c.fov ||
        camara[4] !== c.ancho ||
        camara[5] !== c.alto ||
        camara[6] !== d.dpr ||
        camara[7] !== d.opacidad ||
        camara[8] !== (d.mostrar.flujo ? 1 : 0)
      ) {
        return "camara";
      }
      return "igual";
    },
    guardar(d) {
      const n = N_GEO_FIJO + 4 * d.escenario.cargas.length;
      if (geometria.length !== n) geometria = new Float64Array(n);
      escribirGeometria(d, geometria);
      escribirCamara(d, camara);
      valida = true;
    },
  };
}
