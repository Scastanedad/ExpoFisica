import { useCircuitosStore } from "../../store/circuitosStore";
import { textoSonda } from "../../render/circuitos/textos";

/**
 * Lectura de la sonda bajo el lienzo (no sobre él: así nunca tapa los rótulos de los elementos). Es texto
 * visible, no región viva: los anuncios los hace `CanvasCircuito` cuando el visitante mueve la sonda.
 */
export function LecturaSonda() {
  const lectura = useCircuitosStore((s) => s.lecturaSonda);
  const sonda = useCircuitosStore((s) => s.sonda);
  return (
    <p className="lectura-sonda">
      {sonda && lectura ? (
        textoSonda(lectura)
      ) : (
        <span className="lectura-sonda-ayuda">Sonda: toca o arrastra sobre el cable para medir.</span>
      )}
    </p>
  );
}
