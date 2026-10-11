import type { Bloque } from "../../fisica/circuitos";
import type { ModoInterruptor, SimulacionRC } from "../../render/circuitos/simulacionRC";
import { textoEducativoE7 } from "./textosE7";
import { useResumenRC } from "./useResumenRC";

interface Props {
  sim: SimulacionRC;
  arbol: Bloque;
  modo: ModoInterruptor;
}

/** Texto educativo de E7: depende de la forma de la red y de si hay carga que descargar (se actualiza a ~10 Hz). */
export function TextoCapacitores({ sim, arbol, modo }: Props) {
  const r = useResumenRC(sim);
  const texto = textoEducativoE7(arbol, modo, r?.fase ?? "cargando");
  return (
    <section className="panel-circuito texto-educativo" aria-label="Qué estás viendo">
      <h3 className="panel-circuito-titulo">{texto.titulo}</h3>
      {texto.parrafos.map((p) => (
        <p key={p}>{p}</p>
      ))}
    </section>
  );
}
