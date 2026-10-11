import { formatearSI } from "../../fisica/circuitos";
import { textosAvisos, type ResumenE6 as Resumen } from "./resumenE6";

interface Props {
  resumen: Resumen | null;
  bateriaReal: boolean;
}

/** Totales del circuito bajo el lienzo: resistencia total, corriente y potencia de la batería, y avisos. */
export function ResumenCircuito({ resumen, bateriaReal }: Props) {
  const avisos = resumen ? textosAvisos(resumen) : [];
  return (
    <section className="resumen-circuito" aria-label="Totales del circuito">
      <dl>
        <div>
          <dt>Resistencia total</dt>
          <dd>{resumen ? formatearSI(resumen.rEq, "Ω") : "—"}</dd>
        </div>
        <div>
          <dt>Corriente de la batería</dt>
          <dd>{resumen ? formatearSI(resumen.iBat, "A") : "—"}</dd>
        </div>
        <div>
          <dt>{bateriaReal ? "Potencia de la batería (incluye la pérdida interna)" : "Potencia de la batería"}</dt>
          <dd>{resumen ? formatearSI(resumen.pBat, "W") : "—"}</dd>
        </div>
        {bateriaReal ? (
          <div>
            <dt>Voltaje en los bornes</dt>
            <dd>{resumen ? formatearSI(resumen.vBornes, "V") : "—"}</dd>
          </div>
        ) : null}
      </dl>
      {avisos.length > 0 ? (
        <p className="resumen-circuito-aviso" role="status">
          {avisos.join(" ")}
        </p>
      ) : null}
    </section>
  );
}
