import { useRef, type KeyboardEvent } from "react";
import { useSimulacionStore } from "../store/simulacionStore";
import type { ModoVista } from "../types/simulacion";

const OPCIONES: { valor: ModoVista; etiqueta: string }[] = [
  { valor: "vectores", etiqueta: "Vectores" },
  { valor: "lineas", etiqueta: "Líneas de campo" },
  { valor: "potencial", etiqueta: "Mapa de potencial" },
];

/**
 * Grupo de opciones excluyentes (`radiogroup`): una sola opción en el orden de
 * tabulación (roving tabindex) y flechas / Inicio / Fin para moverse, como
 * espera un lector de pantalla. Elegir con flechas selecciona (patrón ARIA).
 */
export function SelectorModoVista() {
  const modoVista = useSimulacionStore((s) => s.modoVista);
  const setModoVista = useSimulacionStore((s) => s.setModoVista);
  const botonesRef = useRef<Array<HTMLButtonElement | null>>([]);

  function elegir(indice: number) {
    const i = (indice + OPCIONES.length) % OPCIONES.length;
    setModoVista(OPCIONES[i].valor);
    botonesRef.current[i]?.focus();
  }

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    const actual = OPCIONES.findIndex((o) => o.valor === modoVista);
    switch (e.key) {
      case "ArrowRight":
      case "ArrowDown":
        elegir(actual + 1);
        break;
      case "ArrowLeft":
      case "ArrowUp":
        elegir(actual - 1);
        break;
      case "Home":
        elegir(0);
        break;
      case "End":
        elegir(OPCIONES.length - 1);
        break;
      default:
        return;
    }
    e.preventDefault();
  }

  return (
    <div
      className="selector-modo"
      role="radiogroup"
      aria-label="Modo de visualización del campo"
      onKeyDown={onKeyDown}
    >
      {OPCIONES.map((op, i) => {
        const activo = modoVista === op.valor;
        return (
          <button
            key={op.valor}
            ref={(el) => {
              botonesRef.current[i] = el;
            }}
            type="button"
            role="radio"
            aria-checked={activo}
            tabIndex={activo ? 0 : -1}
            className={activo ? "activo" : undefined}
            onClick={() => setModoVista(op.valor)}
          >
            {op.etiqueta}
          </button>
        );
      })}
    </div>
  );
}
