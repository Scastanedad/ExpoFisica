import { formatearSI } from "../../fisica/circuitos";
import type { SimulacionRC } from "../../render/circuitos/simulacionRC";
import { useResumenRC } from "./useResumenRC";

/**
 * Energía desde el último reinicio: la batería entrega, los capacitores almacenan y el resistor disipa
 * (Entregada = Almacenada + Disipada). Se actualiza a ~10 Hz; no es región viva.
 */
export function BalanceEnergia({ sim }: { sim: SimulacionRC }) {
  const r = useResumenRC(sim);
  // Si el voltaje de la batería baja por debajo del de los capacitores, la batería también recibe energía: ya no solo «entrega».
  const neta = r !== null && (r.eEntregada < 0 || (sim.parametros !== null && r.vRed > sim.parametros.E * 1.01));
  const dato = (j: number | undefined) => (j === undefined ? "—" : formatearSI(j, "J"));
  return (
    <section className="balance-energia" aria-label="Balance de energía">
      <h3 className="panel-circuito-titulo">Energía desde que empezaste</h3>
      <dl>
        <div>
          <dt>{neta ? "Neta de la batería" : "Entregada por la batería"}</dt>
          <dd>{dato(r?.eEntregada)}</dd>
        </div>
        <div>
          <dt>Guardada en los capacitores</dt>
          <dd>{dato(r?.uAlmacenada)}</dd>
        </div>
        <div>
          <dt>Disipada en el resistor</dt>
          <dd>{dato(r?.eDisipada)}</dd>
        </div>
      </dl>
    </section>
  );
}
