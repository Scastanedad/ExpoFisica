import { calcularEstado } from "./modelo";
import type { Cambio, Parametros, Referencia } from "./tipos";

const TOL_IGUAL = 1e-3;
const TOL_KAPPA = 5e-3;

/** Sin dieléctrico en el hueco: aire como material o nada insertado. */
export function sinDielectrico(p: Parametros): boolean {
  return p.materialId === "aire" || p.f <= 0;
}

/** Referencia = mismos modo, A, d y dato de entrada (V o Q) pero con aire. */
export function referenciaDe(p: Parametros): Referencia {
  const pr: Parametros = { ...p, materialId: "aire", f: 0 };
  return { p: pr, estado: calcularEstado(pr), fijada: false };
}

/** Seguimiento automático: sigue al estado mientras no haya dieléctrico; se congela al meterlo. */
export function actualizarReferencia(ref: Referencia | null, actual: Parametros): Referencia {
  if (ref === null) return referenciaDe(actual);
  if (ref.fijada) return ref;
  return sinDielectrico(actual) ? referenciaDe(actual) : ref;
}

/** «Fijar referencia»: toma los valores actuales y deja de seguirlos. */
export function fijarReferencia(actual: Parametros): Referencia {
  return { p: { ...actual }, estado: calcularEstado(actual), fijada: true };
}

function num(x: number): string {
  return String(Number(x.toPrecision(3))).replace(".", ",");
}

/** Compara un valor actual con el de referencia. `kappa` sirve para anotar «(= κ)» o «(= 1/κ)». */
export function comparar(ref: number, actual: number, kappa: number): Cambio {
  if (ref === 0) {
    return actual === 0
      ? { razon: 1, tipo: "igual", etiqueta: "= igual" }
      : { razon: Infinity, tipo: "sube", etiqueta: "↑ desde 0" };
  }
  const razon = actual / ref;
  if (Math.abs(razon - 1) <= TOL_IGUAL) return { razon, tipo: "igual", etiqueta: "= igual" };
  const nota =
    Math.abs(razon / kappa - 1) <= TOL_KAPPA ? " (= κ)" : Math.abs(razon * kappa - 1) <= TOL_KAPPA ? " (= 1/κ)" : "";
  return razon > 1
    ? { razon, tipo: "sube", etiqueta: `↑ ×${num(razon)}${nota}` }
    : { razon, tipo: "baja", etiqueta: `↓ ÷${num(1 / razon)}${nota}` };
}
