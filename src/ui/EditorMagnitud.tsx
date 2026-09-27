import { useId } from "react";
import { Q_MAX, Q_MIN, Q_PASO, pasoMagnitud } from "../fisica/carga";
import { formatCarga } from "../fisica/unidades";
import type { UnidadCarga } from "../types/simulacion";
import { describirRangoMagnitud, valorTextoMagnitud } from "./textosEscena";

interface Props {
  id: string;
  q: number;
  /** Posición (desde 0) de la carga en la lista, para el nombre accesible. */
  indice: number;
  unidad: UnidadCarga;
  alCambiar: (id: string, q: number) => void;
}

/**
 * Control de la MAGNITUD de una carga (E2.1): botones −/+ de 44 px y un
 * deslizador de 10 posiciones (0.5 a 5 en pasos de 0.5). El signo no se edita.
 * En los extremos los botones usan `aria-disabled` (no `disabled`) para no
 * perder el foco del teclado; el anuncio lo hace `PanelCargas` (aria-live) a
 * través de `alCambiar`.
 */
export function EditorMagnitud({ id, q, indice, unidad, alCambiar }: Props) {
  const idAyuda = useId();
  const signo = q < 0 ? -1 : 1;
  const magnitud = Math.abs(q);
  const enMinimo = magnitud <= Q_MIN;
  const enMaximo = magnitud >= Q_MAX;
  const numero = indice + 1;

  return (
    <div
      className="editor-magnitud"
      role="group"
      aria-label={`Magnitud de la carga n.º ${numero}`}
      aria-describedby={idAyuda}
    >
      <p className="editor-magnitud-titulo" aria-hidden="true">
        <span>Magnitud · carga n.º {numero}</span>
        <output className={q > 0 ? "carga-positiva" : "carga-negativa"}>{formatCarga(q, unidad)}</output>
      </p>
      <div className="control-deslizador editor-magnitud-fila">
        <button
          type="button"
          className="boton-paso"
          aria-label="Disminuir magnitud"
          aria-disabled={enMinimo}
          onClick={() => alCambiar(id, pasoMagnitud(q, -1))}
        >
          <span aria-hidden="true">−</span>
        </button>
        <input
          type="range"
          min={Q_MIN}
          max={Q_MAX}
          step={Q_PASO}
          value={magnitud}
          aria-label="Magnitud"
          aria-valuetext={valorTextoMagnitud(q, unidad)}
          onChange={(e) => alCambiar(id, signo * Number(e.target.value))}
        />
        <button
          type="button"
          className="boton-paso"
          aria-label="Aumentar magnitud"
          aria-disabled={enMaximo}
          onClick={() => alCambiar(id, pasoMagnitud(q, 1))}
        >
          <span aria-hidden="true">+</span>
        </button>
      </div>
      <p id={idAyuda} className="ayuda-mover">
        Más carga, más campo (E = kq/r²). El signo no cambia: para invertirlo, quita la carga y agrega
        otra.<span className="sr-only"> {describirRangoMagnitud(unidad)}</span>
      </p>
    </div>
  );
}
