import type { ReactNode } from "react";
import { FRASE_CAPACITORES_AL_REVES, MENSAJE_PUENTE_NO_REDUCIBLE, formatearSI, type Dominio } from "../../fisica/circuitos";
import type { ControlReduccion } from "./useReduccion";

interface Props {
  control: ControlReduccion;
  /** El puente de Wheatstone no es serie-paralelo: no se reduce. */
  puente: boolean;
  /** R = resistores (E6), C = capacitores (E7): cambia las palabras (las fórmulas ya vienen del motor). */
  dominio: Dominio;
  /** Frase que se añade al llegar al equivalente (corriente de la batería en E6, τ en E7). */
  alTerminar: (equivalente: number) => ReactNode;
  /** Aviso opcional bajo el botón (E7: el transitorio vuelve a empezar). */
  nota?: string;
  alVolver: () => void;
}

const PALABRAS = {
  R: {
    titulo: "Reducir a una sola resistencia",
    uno: "Con un solo resistor no hay nada que reducir. Añade otro para probar.",
    elemento: "una sola resistencia equivalente",
    equivalente: "Resistencia equivalente",
    unidad: "Ω",
  },
  C: {
    titulo: "Reducir a un solo capacitor",
    uno: "Con un solo capacitor no hay nada que reducir. Añade otro para probar.",
    elemento: "un solo capacitor equivalente",
    equivalente: "Capacitancia equivalente",
    unidad: "F",
  },
} as const;

/**
 * Reducción paso a paso a la resistencia equivalente: cada pulsación colapsa un bloque (serie o paralelo) y
 * el lienzo dibuja el circuito ya reducido; aquí quedan las fórmulas con números. El estado vive en
 * `useReduccion`; este componente solo presenta.
 */
export function PanelReduccion({ control, puente, dominio, alTerminar, nota, alVolver }: Props) {
  const palabras = PALABRAS[dominio];
  const { k, vista, avanzar } = control;
  const ultimo = vista.aplicados[vista.aplicados.length - 1];

  return (
    <section className="panel-reduccion" aria-label="Reducción paso a paso">
      <h3 className="panel-circuito-titulo">{palabras.titulo}</h3>
      {puente ? (
        <p className="panel-reduccion-texto">{MENSAJE_PUENTE_NO_REDUCIBLE}</p>
      ) : vista.total === 0 ? (
        <p className="panel-reduccion-texto">{palabras.uno}</p>
      ) : (
        <>
          <p className="panel-reduccion-texto">
            Cada pulsación cambia un bloque por {palabras.elemento}, hasta que queda un solo elemento.
            {dominio === "C" ? ` ${FRASE_CAPACITORES_AL_REVES}` : ""}
          </p>
          <div className="panel-reduccion-acciones">
            <button type="button" aria-disabled={vista.terminada} onClick={vista.terminada ? undefined : avanzar}>
              Reducir un paso
            </button>
            <button type="button" aria-disabled={k === 0} onClick={k === 0 ? undefined : alVolver}>
              Circuito completo
            </button>
          </div>
          <p className="panel-reduccion-progreso">
            Paso {k} de {vista.total}
          </p>
          {vista.aplicados.length > 0 ? (
            <ol className="panel-reduccion-pasos">
              {vista.aplicados.map((p) => (
                <li key={p.resultado.id}>
                  <code>{p.formula}</code>
                </li>
              ))}
            </ol>
          ) : null}
          {vista.terminada ? (
            <p className="panel-reduccion-final">
              {palabras.equivalente}: <strong>{formatearSI(vista.equivalente, palabras.unidad)}</strong>.{" "}
              {alTerminar(vista.equivalente)}
            </p>
          ) : null}
          {nota ? <p className="panel-reduccion-texto">{nota}</p> : null}
          <p className="sr-only" role="status" aria-live="polite">
            {ultimo ? `Paso ${k} de ${vista.total}: ${ultimo.formula}` : ""}
          </p>
        </>
      )}
    </section>
  );
}
