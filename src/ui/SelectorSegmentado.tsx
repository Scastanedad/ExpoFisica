import { useId, useRef, type KeyboardEvent } from "react";

export interface OpcionSegmentada<T extends string> {
  valor: T;
  etiqueta: string;
  /** Descripción para lector de pantalla (`aria-describedby`); la versión visible la pone quien lo usa. */
  descripcion?: string;
}

interface Props<T extends string> {
  /** Nombre accesible del grupo ("Tipo de campo"). */
  etiquetaGrupo: string;
  opciones: readonly OpcionSegmentada<T>[];
  valor: T;
  alElegir: (valor: T) => void;
}

/**
 * Grupo de opciones excluyentes (`radiogroup`) con el aspecto de `.selector-modo`:
 * una sola opción en el orden de tabulación (roving tabindex) y flechas / Inicio /
 * Fin para moverse; elegir con flechas selecciona y lleva el foco (patrón ARIA),
 * igual que `SelectorModoVista`. Con dos opciones usa dos columnas.
 */
export function SelectorSegmentado<T extends string>({ etiquetaGrupo, opciones, valor, alElegir }: Props<T>) {
  const idBase = useId();
  const botonesRef = useRef<Array<HTMLButtonElement | null>>([]);

  function elegir(indice: number) {
    const i = (indice + opciones.length) % opciones.length;
    alElegir(opciones[i].valor);
    botonesRef.current[i]?.focus();
  }

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    const actual = opciones.findIndex((o) => o.valor === valor);
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
        elegir(opciones.length - 1);
        break;
      default:
        return;
    }
    e.preventDefault();
  }

  return (
    <div
      className={`selector-modo${opciones.length === 2 ? " selector-modo-dos" : ""}`}
      role="radiogroup"
      aria-label={etiquetaGrupo}
      onKeyDown={onKeyDown}
    >
      {opciones.map((op) =>
        op.descripcion ? (
          <span key={op.valor} id={`${idBase}-${op.valor}`} className="sr-only">
            {op.descripcion}
          </span>
        ) : null,
      )}
      {opciones.map((op, i) => {
        const activo = valor === op.valor;
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
            aria-describedby={op.descripcion ? `${idBase}-${op.valor}` : undefined}
            onClick={() => alElegir(op.valor)}
          >
            {op.etiqueta}
          </button>
        );
      })}
    </div>
  );
}
