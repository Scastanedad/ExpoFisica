import { MENSAJE_PUENTE_NO_REDUCIBLE, formatearSI } from "../../fisica/circuitos";
import type { ControlReduccion } from "./useReduccion";

interface Props {
  control: ControlReduccion;
  /** El puente de Wheatstone no es serie-paralelo: no se reduce. */
  puente: boolean;
  /** Voltaje de la batería [V] y resistencia interna (0 = ideal), para la corriente final. */
  E: number;
  rInt: number;
  alVolver: () => void;
}

/**
 * Reducción paso a paso a la resistencia equivalente: cada pulsación colapsa un bloque (serie o paralelo) y
 * el lienzo dibuja el circuito ya reducido; aquí quedan las fórmulas con números. El estado vive en
 * `useReduccion`; este componente solo presenta.
 */
export function PanelReduccion({ control, puente, E, rInt, alVolver }: Props) {
  const { k, vista, avanzar } = control;
  const ultimo = vista.aplicados[vista.aplicados.length - 1];

  return (
    <section className="panel-reduccion" aria-label="Reducción paso a paso">
      <h3 className="panel-circuito-titulo">Reducir a una sola resistencia</h3>
      {puente ? (
        <p className="panel-reduccion-texto">{MENSAJE_PUENTE_NO_REDUCIBLE}</p>
      ) : vista.total === 0 ? (
        <p className="panel-reduccion-texto">Con un solo resistor no hay nada que reducir. Añade otro para probar.</p>
      ) : (
        <>
          <p className="panel-reduccion-texto">
            Cada pulsación cambia un bloque por una sola resistencia equivalente, hasta que queda una.
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
              Resistencia equivalente: <strong>{formatearSI(vista.equivalente, "Ω")}</strong>. Corriente de la batería:
              I = E / {rInt > 0 ? "(R_eq + r_int)" : "R_eq"} ={" "}
              {formatearSI(E / (vista.equivalente + rInt), "A")}.
            </p>
          ) : null}
          <p className="sr-only" role="status" aria-live="polite">
            {ultimo ? `Paso ${k} de ${vista.total}: ${ultimo.formula}` : ""}
          </p>
        </>
      )}
    </section>
  );
}
