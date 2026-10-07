/**
 * Cruces línea–superficie y conteo salen − entran (contrato §2, §3). Las líneas van a favor de E, así que
 * sentido +1 = sale (E·n > 0 en el cruce) y −1 = entra, decidido por el cambio de estado dentro/fuera del segmento.
 */
import { segmentoCruzaSuperficie } from "./rayos";
import { cargasEncerradas } from "./superficies";
import { crearBufferesCruces } from "./unionesBuffers";
import type { Carga3D, Cruces, LineasCampo3D, Superficie } from "./tipos";

const cr = new Float64Array(4);
const pa: [number, number, number] = [0, 0, 0];
const pb: [number, number, number] = [0, 0, 0];

/** Calcula todos los cruces de las líneas con la superficie. Reutiliza `out` si cabe (si no, crea otro mayor). */
export function calcularCruces(lineas: LineasCampo3D, sup: Superficie, out?: Cruces): Cruces {
  let X = out ?? crearBufferesCruces(4 * lineas.n + 16);
  X.n = 0;
  X.salen = 0;
  X.entran = 0;
  const P = lineas.puntos;
  for (let l = 0; l < lineas.n; l++) {
    const i0 = lineas.inicio[l];
    const i1 = lineas.inicio[l + 1];
    for (let g = i0; g < i1 - 1; g++) {
      pa[0] = P[3 * g];
      pa[1] = P[3 * g + 1];
      pa[2] = P[3 * g + 2];
      pb[0] = P[3 * g + 3];
      pb[1] = P[3 * g + 4];
      pb[2] = P[3 * g + 5];
      const nc = segmentoCruzaSuperficie(sup, pa, pb, cr);
      for (let k = 0; k < nc; k++) {
        if (X.n >= X.t.length) X = ampliar(X);
        const t = cr[2 * k];
        const s = cr[2 * k + 1];
        const o = X.n++;
        X.posicion[3 * o] = pa[0] + t * (pb[0] - pa[0]);
        X.posicion[3 * o + 1] = pa[1] + t * (pb[1] - pa[1]);
        X.posicion[3 * o + 2] = pa[2] + t * (pb[2] - pa[2]);
        X.linea[o] = l;
        X.segmento[o] = g;
        X.t[o] = t;
        X.sentido[o] = s;
        if (s > 0) X.salen++;
        else X.entran++;
      }
    }
  }
  return X;
}

/** Duplica la capacidad conservando lo ya escrito (caso raro: líneas muy sinuosas). */
function ampliar(X: Cruces): Cruces {
  const nuevo = crearBufferesCruces(Math.max(16, 2 * X.t.length));
  nuevo.posicion.set(X.posicion.subarray(0, 3 * X.n));
  nuevo.linea.set(X.linea.subarray(0, X.n));
  nuevo.segmento.set(X.segmento.subarray(0, X.n));
  nuevo.t.set(X.t.subarray(0, X.n));
  nuevo.sentido.set(X.sentido.subarray(0, X.n));
  nuevo.n = X.n;
  nuevo.salen = X.salen;
  nuevo.entran = X.entran;
  return nuevo;
}

export function contarSalenEntran(c: Cruces): { salen: number; entran: number; neto: number } {
  return { salen: c.salen, entran: c.entran, neto: c.salen - c.entran };
}

/**
 * Σ signo_i·lineasPorCarga[i] sobre las cargas encerradas: lo que debe valer `neto` en superficies CERRADAS.
 * Parche: no hay invariante, devuelve NaN.
 */
export function lineasNetasEsperadas(sup: Superficie, cargas: readonly Carga3D[], lineas: LineasCampo3D): number {
  if (sup.tipo === "parche") return Number.NaN;
  let neto = 0;
  for (const i of cargasEncerradas(sup, cargas)) neto += Math.sign(cargas[i].q) * lineas.lineasPorCarga[i];
  return neto;
}

/**
 * Líneas por µC realmente dibujadas (para que la UI no afirme «salen − entran = q·LINEAS_POR_UC» cuando el reparto se
 * reescaló por presupuesto, p. ej. calidad media/baja): Σ lineasPorCarga de las cargas + / Σ q de las + (si no hay +,
 * lo análogo con las −). Devuelve 0 sin cargas.
 */
export function lineasPorUCEfectivo(cargas: readonly Carga3D[], lineas: LineasCampo3D): number {
  let nPos = 0;
  let qPos = 0;
  let nNeg = 0;
  let qNeg = 0;
  for (let i = 0; i < cargas.length; i++) {
    if (cargas[i].q > 0) {
      nPos += lineas.lineasPorCarga[i];
      qPos += cargas[i].q;
    } else if (cargas[i].q < 0) {
      nNeg += lineas.lineasPorCarga[i];
      qNeg -= cargas[i].q;
    }
  }
  if (qPos > 0) return nPos / qPos;
  return qNeg > 0 ? nNeg / qNeg : 0;
}
