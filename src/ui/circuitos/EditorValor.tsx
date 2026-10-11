import { useId } from "react";
import { pasoSerie125, posicionLog, valorDesdePosicionLog } from "./escalaValor";

interface Props {
  /** Nombre accesible y título visible («Resistencia de R2», «Voltaje de la batería»). */
  etiqueta: string;
  valor: number;
  min: number;
  max: number;
  /** log: R y C (varias décadas). lineal: la batería (pasos fijos). */
  escala: "log" | "lineal";
  /** Paso en escala lineal. */
  paso?: number;
  formato: (v: number) => string;
  alCambiar: (v: number) => void;
  ayuda?: string;
}

/**
 * Editor del valor de un elemento del circuito, con el mismo aspecto que `EditorMagnitud` (−/+ de 44 px
 * y un deslizador) pero para magnitudes con unidades y rangos de varias décadas (EditorMagnitud solo sabe
 * de cargas). Los botones usan `aria-disabled` en los extremos para no perder el foco del teclado.
 */
export function EditorValor({ etiqueta, valor, min, max, escala, paso = 1, formato, alCambiar, ayuda }: Props) {
  const idAyuda = useId();
  const log = escala === "log";
  const enMinimo = valor <= min;
  const enMaximo = valor >= max;
  const mover = (dir: 1 | -1) => {
    if ((dir === -1 && enMinimo) || (dir === 1 && enMaximo)) return;
    alCambiar(log ? pasoSerie125(valor, dir, min, max) : Math.min(max, Math.max(min, valor + dir * paso)));
  };

  return (
    <div className="editor-valor" role="group" aria-label={etiqueta} aria-describedby={ayuda ? idAyuda : undefined}>
      <p className="editor-valor-titulo">
        <span>{etiqueta}</span>
        <output>{formato(valor)}</output>
      </p>
      <div className="control-deslizador editor-valor-fila">
        <button
          type="button"
          className="boton-paso"
          aria-label={`Disminuir: ${etiqueta}`}
          aria-disabled={enMinimo}
          onClick={() => mover(-1)}
        >
          <span aria-hidden="true">−</span>
        </button>
        <input
          type="range"
          min={log ? 0 : min}
          max={log ? 1000 : max}
          step={log ? 1 : paso}
          value={log ? Math.round(posicionLog(valor, min, max) * 1000) : valor}
          aria-label={etiqueta}
          aria-valuetext={formato(valor)}
          onChange={(e) => {
            const n = Number(e.target.value);
            alCambiar(log ? valorDesdePosicionLog(n / 1000, min, max) : n);
          }}
        />
        <button
          type="button"
          className="boton-paso"
          aria-label={`Aumentar: ${etiqueta}`}
          aria-disabled={enMaximo}
          onClick={() => mover(1)}
        >
          <span aria-hidden="true">+</span>
        </button>
      </div>
      {ayuda ? (
        <p id={idAyuda} className="ayuda-mover">
          {ayuda}
        </p>
      ) : null}
    </div>
  );
}
