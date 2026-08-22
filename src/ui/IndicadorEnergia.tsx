import { useSimulacionDinamicaStore } from "../store/simulacionDinamicaStore";

export function IndicadorEnergia() {
  const energiaTotal = useSimulacionDinamicaStore((s) => s.energiaTotal);

  return (
    <p className="indicador-energia">
      Energía total del sistema: {energiaTotal === null ? "—" : energiaTotal.toFixed(1)}
    </p>
  );
}
