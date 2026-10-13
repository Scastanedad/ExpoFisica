import { EPSILON_0, KAPPA_AIRE } from "./constantes";
import { dielectricoPorId } from "./dielectricos";
import { eLim } from "./rigidez";
import type { Estado, Modo, Parametros } from "./tipos";

/** Factor de permitividad promedio del hueco: κ_aire·(1−f) + κ·f (dos capacitores en paralelo). */
export function kappaEfectiva(kappa: number, f: number): number {
  return KAPPA_AIRE * (1 - f) + kappa * f;
}

/** C₀ = ε₀A/d (vacío). */
export function c0(A: number, d: number): number {
  return (EPSILON_0 * A) / d;
}

/**
 * Estado de equilibrio de UN capacitor de placas paralelas con un dieléctrico que entra una fracción `f`.
 * Conectado: se usa `p.V` y Q = C·V. Aislado: se usa `p.Q` y V = Q/C. Sin efectos de borde.
 * E es la misma en las dos zonas (placas equipotenciales y mismo d); cambian σ, σ_b y u por zona.
 */
export function calcularEstado(p: Parametros): Estado {
  const mat = dielectricoPorId(p.materialId);
  const kEf = kappaEfectiva(mat.kappa, p.f);
  const C = (EPSILON_0 * p.A * kEf) / p.d;
  const V = p.modo === "conectado" ? p.V : p.Q / C;
  const Q = p.modo === "conectado" ? C * V : p.Q;
  const E = V / p.d;
  const U = 0.5 * C * V * V;
  const e0E = EPSILON_0 * E;
  const lim = eLim(p.materialId, p.f);
  const lado = Math.sqrt(p.A);
  // Fuerza de inserción: ½V²·dC/dx con dC/dx = ε₀·w·(κ − κ_aire)/d; nula si ya entró del todo.
  const F = p.f >= 1 ? 0 : (0.5 * V * V * EPSILON_0 * lado * (mat.kappa - KAPPA_AIRE)) / p.d;
  return {
    C,
    Q,
    V,
    E,
    U,
    uAire: 0.5 * KAPPA_AIRE * e0E * E,
    uDiel: 0.5 * mat.kappa * e0E * E,
    sigmaLibre: mat.kappa * e0E,
    sigmaLibreAire: KAPPA_AIRE * e0E,
    sigmaLigada: (mat.kappa - 1) * e0E,
    eLim: lim,
    ratioRigidez: E / lim,
    F,
  };
}

/** Copia de `p` con Q y V coherentes con el modelo (en el modo activo el dato de entrada se conserva). */
export function sincronizar(p: Parametros): Parametros {
  const e = calcularEstado(p);
  return { ...p, V: e.V, Q: e.Q };
}

/** Cambia de modo conservando Q y V (continuidad: no salta nada). */
export function cambiarModo(p: Parametros, modo: Modo): Parametros {
  return { ...sincronizar(p), modo };
}
