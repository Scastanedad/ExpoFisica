import { useCallback, useMemo, useState } from "react";
import type { Bloque, Dominio } from "../../fisica/circuitos";
import { vistaReduccion, type VistaReduccion } from "./reduccionVista";

export interface ControlReduccion {
  /** Pasos aplicados (0 = circuito completo). */
  k: number;
  vista: VistaReduccion;
  avanzar: () => void;
  volver: () => void;
}

/**
 * Estado de UI de la reducción. Se asocia al árbol sobre el que se pidió: si el visitante edita el circuito
 * (otro árbol), vuelve solo al circuito completo, sin efectos ni reinicios manuales.
 */
export function useReduccion(arbol: Bloque, dominio: Dominio): ControlReduccion {
  const [est, setEst] = useState<{ arbol: Bloque; k: number }>({ arbol, k: 0 });
  const k = est.arbol === arbol ? est.k : 0;
  const vista = useMemo(() => vistaReduccion(arbol, dominio, k), [arbol, dominio, k]);
  const avanzar = useCallback(() => setEst({ arbol, k: Math.min(k + 1, vista.total) }), [arbol, k, vista.total]);
  const volver = useCallback(() => setEst({ arbol, k: 0 }), [arbol]);
  return { k, vista, avanzar, volver };
}
