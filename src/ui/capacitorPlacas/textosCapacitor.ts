/**
 * Textos y formatos de la estación 08 (puro, sin DOM; se prueba en Node). Todo sale de `Parametros`/`Estado`:
 * nada se calcula aquí. Valores con prefijos SI y 3 cifras (`formatearSI`).
 */
import {
  D_MAX,
  E_MAX_AIRE,
  KAPPA_AIRE,
  UMBRAL_AVISO,
  V_TOPE,
  dMinima,
  kappaEfectiva,
  qMaxima,
  sinDielectrico,
  trabajoSeparar,
  dielectricoPorId,
  type Dielectrico,
  type Estado,
  type Motivo,
  type Parametros,
} from "../../fisica/capacitorPlacas";
import { formatearSI } from "../../fisica/circuitos/formato";

const coma = (n: number, cifras = 3) => String(Number(n.toPrecision(cifras))).replace(".", ",");
const menos = (t: string) => t.replace("-", "−");

/** Porcentaje legible: «0,7 %», «85 %», «< 0,1 %». */
export function porcentaje(razon: number): string {
  const p = razon * 100;
  if (p <= 0) return "0 %";
  if (p < 0.1) return "< 0,1 %";
  if (p < 10) return `${coma(p, 2)} %`;
  return `${Math.round(p)} %`;
}

export const fmtC = (c: number) => formatearSI(c, "F");
export const fmtQ = (q: number) => menos(formatearSI(q, "C"));
export const fmtV = (v: number) => formatearSI(v, "V");
export const fmtE = (e: number) => formatearSI(e, "V/m");
export const fmtU = (u: number) => formatearSI(u, "J");
export const fmtDensidad = (u: number) => formatearSI(u, "J/m³");
export const fmtMetros = (m: number) => formatearSI(m, "m");
export const fmtArea = (m2: number) => `${coma(m2 * 1e4, 3)} cm²`;
export const fmtKappa = (k: number) => coma(k);

/** Material que limita el campo ahora: el aire si queda aire en el hueco (f < 1) o el propio dieléctrico. */
export function quienLimita(p: Parametros): Dielectrico {
  const mat = dielectricoPorId(p.materialId);
  if (mat.id === "aire" || p.f < 1) return dielectricoPorId("aire").eMax <= mat.eMax ? dielectricoPorId("aire") : mat;
  return mat;
}

/** Cuánto sube C respecto al aire con esta inserción (= κ_ef/κ_aire, ≈ κ con el hueco lleno). */
export function razonCapacitancia(p: Parametros): number {
  return kappaEfectiva(dielectricoPorId(p.materialId).kappa, p.f) / KAPPA_AIRE;
}

/** Texto principal que cambia según el estado (modo, material, inserción). */
export function textoEstado(p: Parametros, e: Estado): string {
  const mat = dielectricoPorId(p.materialId);
  const r = coma(razonCapacitancia(p), 3);
  if (sinDielectrico(p)) {
    if (p.modo === "conectado") {
      return mat.id === "aire"
        ? `Con aire entre las placas. La batería mantiene V = ${fmtV(e.V)}: la carga es Q = ${fmtQ(e.Q)} y el campo E = V/d = ${fmtE(e.E)}. Elige un dieléctrico y mételo entre las placas.`
        : `${mat.nombre} aún está fuera. Arrástralo o usa el deslizador para meterlo entre las placas y compara con la referencia.`;
    }
    return `Aislado: la carga Q = ${fmtQ(e.Q)} queda atrapada en las placas y ya no la mantiene ninguna batería. ${
      mat.id === "aire" ? "Elige un dieléctrico y mételo para ver qué cambia." : `Mete ${mat.nombre} para ver qué cambia.`
    }`;
  }
  if (p.modo === "conectado") {
    return `La batería mantiene V = ${fmtV(e.V)}: al meter ${mat.nombre} entra más carga (la capacitancia sube ×${r}) y el campo no cambia: E = V/d = ${fmtE(e.E)}.`;
  }
  return `Aislado: la carga no cambia (Q = ${fmtQ(e.Q)}). ${mat.nombre} se polariza y debilita el campo dentro: E y V bajan ×1/κ (÷${r}) y la capacitancia sube ×${r}.`;
}

export type NivelRigidez = "ok" | "aviso" | "limite";

/** Estado del margen de seguridad (E / E_máx) y su frase. */
export function textoRigidez(p: Parametros, e: Estado): { nivel: NivelRigidez; texto: string } {
  const lim = quienLimita(p);
  const mat = dielectricoPorId(p.materialId);
  const eMax = fmtE(e.eLim);
  const nombre = lim.id === "aire" ? "del aire" : `de ${lim.nombre}`;
  const nota =
    mat.id !== "aire" && p.f > 0 && p.f < 1 && lim.id === "aire" ? " La zona con aire rompe antes que el dieléctrico." : "";
  if (e.ratioRigidez >= 1 - 1e-6) {
    return {
      nivel: "limite",
      texto: `En el límite: el campo llegó a la rigidez ${nombre} (${eMax}). Más allá saltaría una chispa, así que no se permite.${nota}`,
    };
  }
  if (e.ratioRigidez >= UMBRAL_AVISO) {
    return { nivel: "aviso", texto: `Estás al ${porcentaje(e.ratioRigidez)} de la rigidez ${nombre} (${eMax}).${nota}` };
  }
  return {
    nivel: "ok",
    texto: `El campo está al ${porcentaje(e.ratioRigidez)} de la rigidez ${nombre} (${eMax}): margen amplio.${nota}`,
  };
}

/** Frase para el último recorte o bloqueo por rigidez. */
export function textoBloqueo(b: Motivo, p: Parametros, e: Estado): string {
  switch (b.tipo) {
    case "limita-V":
      return `Esa tensión haría saltar una chispa a esta separación: V quedó en ${fmtV(e.V)} (E = ${fmtE(e.E)}).`;
    case "limita-d":
      return `No puedes acercar más las placas: con V = ${fmtV(e.V)} el campo ya está en la rigidez; la separación mínima es ${fmtMetros(dMinima(e.V, e.eLim))}.`;
    case "sube-d":
      return `Con ese cambio el campo superaría la rigidez, así que las placas se separaron a ${fmtMetros(p.d)}.`;
    case "baja-V":
      return `V bajó a ${fmtV(e.V)} para no superar la rigidez.`;
    case "material-bloqueado":
      return "No se puede cambiar de material ahora: con esta carga, el campo superaría su rigidez.";
    case "limita-parametro":
      if (b.variable === "f") {
        return "Aislado: no puedes sacar más el dieléctrico, porque el campo subiría y superaría la rigidez.";
      }
      if (b.variable === "Q") {
        return `Esa carga superaría el límite: la carga máxima aquí es Q = ${fmtQ(qMaxima(p))}.`;
      }
      if (b.variable === "A") {
        return "Con un área menor el campo (E = Q/κε₀A) superaría la rigidez.";
      }
      return "Ese cambio superaría el límite de rigidez o de tensión de la sala.";
  }
}

/** Rótulo del trabajo al separar (o acercar) las placas, con números del estado actual. */
export function textoTrabajo(p: Parametros): string {
  const separar = p.d * 2 <= D_MAX;
  const dNueva = separar ? p.d * 2 : p.d / 2;
  const t = trabajoSeparar(p, dNueva);
  const verbo = separar ? "separas" : "acercas";
  const destino = fmtMetros(dNueva);
  if (p.modo === "aislado") {
    return separar
      ? `Si las ${verbo} a ${destino}, la energía sube ${fmtU(Math.abs(t.dU))} (Q fija): alguien hace ese trabajo contra la atracción de las placas.`
      : `Si las ${verbo} a ${destino}, la energía baja ${fmtU(Math.abs(t.dU))} (Q fija): las placas se atraen y el campo hace el trabajo.`;
  }
  const bateria = t.dQ < 0 ? "recibe" : "entrega";
  const energiaBat = fmtU(Math.abs(t.wBateria));
  return separar
    ? `Si las ${verbo} a ${destino}, la energía baja ${fmtU(Math.abs(t.dU))} y la batería ${bateria} ${fmtQ(Math.abs(t.dQ))} de carga (${energiaBat} de energía). Tú sigues haciendo un trabajo de ${fmtU(Math.abs(t.wExterno))}.`
    : `Si las ${verbo} a ${destino}, la energía sube ${fmtU(Math.abs(t.dU))} y la batería ${bateria} ${fmtQ(Math.abs(t.dQ))} de carga (${energiaBat} de energía). El campo te ayuda: tu trabajo es negativo (${menos(fmtU(t.wExterno))}).`;
}

/** Línea de la fuerza que mete la lámina (solo si hay lámina que pueda entrar). */
export function textoFuerza(e: Estado): string | null {
  if (!(e.F > 0)) return null;
  return `Fuerza que mete el dieléctrico: F = ½V²·dC/dx = ${formatearSI(e.F, "N")}.`;
}

export const TEXTO_V_TOPE = `Tensión máxima de la sala: ${fmtV(V_TOPE)}.`;
export const TEXTO_RIGIDEZ_AIRE = `Rigidez del aire: ${fmtE(E_MAX_AIRE)}.`;
