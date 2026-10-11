import { useCallback, useState } from "react";
import { formatearSI } from "../../fisica/circuitos";
import type { ModoInterruptor, SimulacionRC } from "../../render/circuitos/simulacionRC";
import { textoCorriente, textoVoltaje } from "../../render/circuitos/textos";
import { anuncioFase, rotuloCorriente, rotuloTiempo, textoFase } from "./textosE7";
import { useResumenRC } from "./useResumenRC";

interface Props {
  sim: SimulacionRC;
  modo: ModoInterruptor;
}

const menos = (t: string) => t.replace("-", "−");
const nombreCorriente = (rotulo: string): string => (rotulo === "I" ? "Corriente I" : rotulo);

/**
 * Totales de E7 bajo el lienzo: capacitancia total, τ, voltaje, corriente (rotulada «sentido invertido» al
 * descargar) y carga. El rótulo del tiempo dilatado está SIEMPRE visible. Los cambios de fase se anuncian a
 * lectores de pantalla en una región `aria-live` (solo al cambiar de fase, no en cada tic).
 */
export function ResumenCapacitores({ sim, modo }: Props) {
  const [anuncio, setAnuncio] = useState("");
  const alCambiarFase = useCallback((f: Parameters<typeof anuncioFase>[0]) => setAnuncio(anuncioFase(f)), []);
  const r = useResumenRC(sim, alCambiarFase);

  return (
    <section className="resumen-circuito resumen-capacitores" aria-label="Totales del circuito">
      <p className="resumen-tiempo">{r ? rotuloTiempo(r.tauReal, r.tauPantalla) : "Tiempo: —"}</p>
      <dl>
        <div>
          <dt>Estado</dt>
          <dd>{r ? textoFase(r.fase) : "—"}</dd>
        </div>
        <div>
          <dt>Capacitancia total</dt>
          <dd>{r ? formatearSI(r.cEq, "F") : "—"}</dd>
        </div>
        <div>
          <dt>Constante τ = R·C</dt>
          <dd>{r ? formatearSI(r.tauReal, "s") : "—"}</dd>
        </div>
        <div>
          <dt>Voltaje de los capacitores</dt>
          <dd>{r ? textoVoltaje(r.vRed) : "—"}</dd>
        </div>
        <div>
          <dt>{r ? nombreCorriente(rotuloCorriente(modo, r.i)) : "Corriente I"}</dt>
          <dd>{r ? menos(textoCorriente(r.i)) : "—"}</dd>
        </div>
        <div>
          <dt>Carga guardada</dt>
          <dd>{r ? menos(formatearSI(Math.abs(r.q) < 1e-15 ? 0 : r.q, "C")) : "—"}</dd>
        </div>
      </dl>
      <p className="sr-only" role="status" aria-live="polite">
        {anuncio}
      </p>
    </section>
  );
}
