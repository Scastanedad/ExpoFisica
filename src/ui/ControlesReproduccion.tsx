import { useSimulacionDinamicaStore } from "../store/simulacionDinamicaStore";

export function ControlesReproduccion() {
  const enPausa = useSimulacionDinamicaStore((s) => s.enPausa);
  const togglePausa = useSimulacionDinamicaStore((s) => s.togglePausa);
  const velocidadSimulacion = useSimulacionDinamicaStore((s) => s.velocidadSimulacion);
  const setVelocidadSimulacion = useSimulacionDinamicaStore((s) => s.setVelocidadSimulacion);

  return (
    <div className="controles-reproduccion">
      <button type="button" className="boton-pausa" onClick={togglePausa}>
        {enPausa ? "Reanudar" : "Pausar"}
      </button>
      <label className="control-velocidad">
        <span>Velocidad</span>
        <input
          type="range"
          min={0.25}
          max={3}
          step={0.25}
          value={velocidadSimulacion}
          onChange={(e) => setVelocidadSimulacion(Number(e.target.value))}
        />
        <output>{velocidadSimulacion.toFixed(2)}×</output>
      </label>
    </div>
  );
}
