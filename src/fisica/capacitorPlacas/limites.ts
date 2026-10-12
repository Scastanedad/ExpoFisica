import { A_MAX, A_MIN, D_MAX, D_MIN, EPSILON_0, TOL_LIMITE, V_TOPE } from "./constantes";
import { dielectricoPorId, existeDielectrico } from "./dielectricos";
import { calcularEstado, kappaEfectiva, sincronizar } from "./modelo";
import { eLim } from "./rigidez";
import type { Motivo, Parametros, ResultadoAjuste } from "./tipos";

/** Conectado: d_mín = V/E_lim. */
export function dMinima(V: number, eLimite: number): number {
  return V / eLimite;
}

/** Conectado: V_máx = mín(V_TOPE, E_lim·d). */
export function vMaxima(d: number, eLimite: number): number {
  return Math.min(V_TOPE, eLimite * d);
}

/**
 * Aislado: Q_máx. E = Q/(ε₀·A·κ_ef) no depende de d, así que el límite de rigidez no depende de d;
 * el tope de tensión sí (V = Q·d/(ε₀·A·κ_ef) ≤ V_TOPE).
 */
export function qMaxima(p: Pick<Parametros, "A" | "d" | "materialId" | "f">): number {
  const kEf = kappaEfectiva(dielectricoPorId(p.materialId).kappa, p.f);
  const porRigidez = eLim(p.materialId, p.f) * EPSILON_0 * p.A * kEf;
  const porTension = (V_TOPE * EPSILON_0 * p.A * kEf) / p.d;
  return Math.min(porRigidez, porTension);
}

/** true si el estado supera la rigidez efectiva o el tope de tensión (con tolerancia relativa). */
export function excede(p: Parametros): boolean {
  const e = calcularEstado(p);
  return e.E > e.eLim * (1 + TOL_LIMITE) || e.V > V_TOPE * (1 + TOL_LIMITE);
}

const acotarNum = (x: number, min: number, max: number) => (Number.isFinite(x) ? Math.min(max, Math.max(min, x)) : min);

function acotar(p: Parametros): Parametros {
  return {
    ...p,
    A: acotarNum(p.A, A_MIN, A_MAX),
    d: acotarNum(p.d, D_MIN, D_MAX),
    f: acotarNum(p.f, 0, 1),
    V: acotarNum(p.V, 0, V_TOPE),
    Q: Math.max(0, Number.isFinite(p.Q) ? p.Q : 0),
  };
}

type CampoNum = "A" | "d" | "f" | "Q";
const CAMPOS_NUM: CampoNum[] = ["A", "d", "f", "Q"];

/**
 * Aplica un cambio respetando rangos, rigidez y tope de tensión (solo bloqueo; contrato §6).
 *  - Conectado: editar V se recorta a V_máx; editar d se recorta a d_mín; cualquier otro cambio (material, f, A)
 *    que dejaría E > E_lim sube d hasta V/E_lim (o, si pasa de 10 mm, d = 10 mm y baja V).
 *  - Aislado: NUNCA se baja Q para obedecer: el cambio se detiene en el valor límite (bisección sobre el
 *    recorrido A, d, f, Q) o, si es un cambio de material, el material anterior se conserva.
 */
export function ajustar(p: Parametros, cambio: Partial<Parametros>): ResultadoAjuste {
  const patch: Partial<Parametros> = { ...cambio };
  if (patch.materialId !== undefined && !existeDielectrico(patch.materialId)) delete patch.materialId;
  const base = sincronizar(p);
  const cand = acotar({ ...base, ...patch });
  if (!excede(cand)) return { p: sincronizar(cand) };
  return base.modo === "conectado" ? ajustarConectado(patch, cand) : ajustarAislado(base, patch, cand);
}

function ajustarConectado(patch: Partial<Parametros>, cand: Parametros): ResultadoAjuste {
  const lim = eLim(cand.materialId, cand.f);
  if (patch.V !== undefined && patch.d === undefined) {
    const r = acotar({ ...cand, V: vMaxima(cand.d, lim) });
    return { p: sincronizar(r), bloqueado: { tipo: "limita-V", variable: "V" } };
  }
  const dNecesaria = dMinima(cand.V, lim);
  const motivoDirecto: Motivo = patch.d !== undefined ? { tipo: "limita-d", variable: "d" } : { tipo: "sube-d" };
  if (dNecesaria <= D_MAX) {
    return { p: sincronizar({ ...cand, d: Math.max(cand.d, dNecesaria) }), bloqueado: motivoDirecto };
  }
  const r = acotar({ ...cand, d: D_MAX, V: vMaxima(D_MAX, lim) });
  return { p: sincronizar(r), bloqueado: { tipo: "baja-V", variable: "V" } };
}

function ajustarAislado(base: Parametros, patch: Partial<Parametros>, cand: Parametros): ResultadoAjuste {
  let motivo: Motivo | undefined;
  let material = cand.materialId;
  if (material !== base.materialId && excede({ ...base, materialId: material })) {
    material = base.materialId;
    motivo = { tipo: "material-bloqueado", variable: "material" };
  }
  const origen: Parametros = { ...base, materialId: material };
  const objetivo: Parametros = { ...cand, materialId: material };
  if (excede(origen)) return { p: sincronizar(origen), bloqueado: motivo ?? { tipo: "limita-parametro" } };
  if (!excede(objetivo)) return { p: sincronizar(objetivo), bloqueado: motivo };

  const mezcla = (t: number): Parametros => {
    const r: Parametros = { ...objetivo };
    for (const k of CAMPOS_NUM) r[k] = origen[k] + (objetivo[k] - origen[k]) * t;
    return r;
  };
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    if (excede(mezcla(mid))) hi = mid;
    else lo = mid;
  }
  const variable = CAMPOS_NUM.find((k) => patch[k] !== undefined && patch[k] !== origen[k]);
  return { p: sincronizar(mezcla(lo)), bloqueado: motivo ?? { tipo: "limita-parametro", variable } };
}
