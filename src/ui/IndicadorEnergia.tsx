import { useSimulacionDinamicaStore } from "../store/simulacionDinamicaStore";
import { K_VISUAL } from "../fisica/coulomb";
import { energiaSimAJ, formatSI } from "../fisica/escala";

/**
 * Energía total del sistema en julios, convertida con la misma constante que
 * usa el Worker (`K_VISUAL`) -- ver E0 §3.5. Es "escala del modelo": incluye el
 * suavizado numérico y no debe presentarse como energía real. La Fase 2 lo
 * ampliará a K / U / Total.
 */
export function IndicadorEnergia() {
  const energiaTotal = useSimulacionDinamicaStore((s) => s.energiaTotal);

  return (
    <p className="indicador-energia">
      <span className="indicador-energia-etiqueta">Energía total (escala del modelo)</span>
      <span className="indicador-energia-valor">
        {energiaTotal === null ? "—" : formatSI(energiaSimAJ(energiaTotal, K_VISUAL), "J")}
      </span>
    </p>
  );
}
