import type { ModoInterruptor, SimulacionRC } from "../../render/circuitos/simulacionRC";
import { LeyendaCorriente } from "./LeyendaCorriente";
import { NOTA_SENTIDO_DESCARGA } from "./textosE7";
import { useResumenRC } from "./useResumenRC";

/** Leyenda de E7: la nota de sentido invertido sale al descargar, también si se descarga por bajar E con el interruptor en Cargar. */
export function LeyendaCapacitores({ sim, modo }: { sim: SimulacionRC; modo: ModoInterruptor }) {
  const r = useResumenRC(sim);
  const invertido = modo === "descargar" || r?.fase === "descargando";
  return <LeyendaCorriente notaSentido={invertido ? NOTA_SENTIDO_DESCARGA : undefined} />;
}
