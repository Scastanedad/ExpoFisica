import { useCircuitosStore } from "../../store/circuitosStore";

/**
 * Leyenda del sentido de la corriente y aviso de honestidad (spec §7): los puntos son una
 * representación, no la velocidad de arrastre de los electrones.
 */
export function LeyendaCorriente() {
  const verElectrones = useCircuitosStore((s) => s.verElectrones);
  return (
    <div className="leyenda-corriente">
      <p className="leyenda-corriente-sentido">
        <span className={`leyenda-punto ${verElectrones ? "negativa" : "positiva"}`} aria-hidden="true" />
        {verElectrones
          ? "Puntos y flechas: electrones, al revés que la corriente convencional."
          : "Puntos y flechas: corriente convencional, de + a −."}
      </p>
      <p className="leyenda-corriente-aviso">
        Los puntos son una representación. La velocidad real de arrastre de los electrones en un cable es de ~0,1
        mm/s; la señal eléctrica viaja casi a la velocidad de la luz. Aquí la rapidez de los puntos solo indica cuánta
        corriente hay.
      </p>
    </div>
  );
}
