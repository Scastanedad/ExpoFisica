import { useId } from "react";
import { useSimulacionDinamicaStore } from "../store/simulacionDinamicaStore";
import { MODO_DEBUG } from "./modoDebug";
import { textosEnergia } from "./textosEnergia";

/**
 * Panel de energía de la estación dinámica: cinética (K), potencial (U) y total
 * (K + U) por separado, en julios "en la escala de este modelo" (ver
 * textosEnergia.ts). Se actualiza ~4 veces por segundo con UN solo objeto del
 * store. Es una lista de definiciones sin `aria-live`: cambia 4 veces por
 * segundo y un lector de pantalla la leería sin parar. La fila "Energía que tú
 * aportaste" siempre está presente (con "0 J" antes de intervenir, fase 2 §C)
 * para que su aparición no se confunda con un cambio de layout; hace
 * verificable la conservación: sin intervenir, K + U no cambia. El resumen "la
 * energía pasa de potencial a cinética..." se explica en las Notas del modelo
 * (fase 2 §B8), no aquí: el título usa un subtítulo corto y deja "escala del
 * modelo" para el aria-label, técnico.
 */
export function IndicadorEnergia() {
  const energia = useSimulacionDinamicaStore((s) => s.energia);
  const filas = energia ? textosEnergia(energia) : null;
  const idTitulo = useId();

  return (
    <section className="panel-energia" aria-labelledby={idTitulo}>
      <h2 id={idTitulo} className="panel-energia-titulo">
        Energía
        <span className="panel-energia-subtitulo"> · en julios, con las cargas y distancias que ves</span>
      </h2>
      <span className="sr-only">Escala de este modelo: la magnitud absoluta no es comparable con un laboratorio real.</span>
      <dl className="panel-energia-filas">
        <div>
          <dt>Cinética (K)</dt>
          <dd>{filas?.cinetica ?? "—"}</dd>
        </div>
        <div>
          <dt>Potencial (U)</dt>
          <dd>{filas?.potencial ?? "—"}</dd>
        </div>
        <div className="panel-energia-total">
          <dt>Total (K + U)</dt>
          <dd>{filas?.total ?? "—"}</dd>
        </div>
        <div>
          <dt>Energía que tú aportaste</dt>
          <dd>{filas?.aportada ?? "0 J"}</dd>
        </div>
      </dl>
      {MODO_DEBUG && energia && (
        <p className="chip-debug">
          deriva {(energia.deriva * 100).toFixed(3)} % · W_ext {energia.trabajoExterno.toFixed(3)} ·{" "}
          {energia.subpasosPorS.toFixed(0)} sub-pasos/s · {energia.ticksPorS.toFixed(0)} ticks/s
        </p>
      )}
    </section>
  );
}
