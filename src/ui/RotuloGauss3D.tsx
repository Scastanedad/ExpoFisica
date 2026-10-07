/**
 * Bajo el lienzo de la estación 5: lectura mínima de Φ y de la carga encerrada (la lectura completa con textos
 * educativos es de la fase 4), leyenda del color del flujo y nota sobre las flechas del campo E.
 * Sin aria-live: la región viva limitada es de la fase 5.
 */
import { formatFlujoSI, formatPhi } from "../fisica/gauss3d/unidades";
import { useGauss3dStore } from "../store/gauss3dStore";

/** Coma decimal como el resto de la interfaz. */
const coma = (t: string) => t.replace(/(\d)\.(\d)/g, "$1,$2");

export function RotuloGauss3D() {
  const lectura = useGauss3dStore((s) => s.lectura);
  const flujo = useGauss3dStore((s) => s.mostrar.flujo);
  const campo = useGauss3dStore((s) => s.mostrar.campo);
  return (
    <div className="gauss3d-rotulo">
      <p className="gauss3d-lectura-fila" aria-label="Lectura del flujo">
        {lectura ? (
          <>
            <strong>{coma(formatPhi(lectura.phi))}</strong>
            <span>{coma(formatFlujoSI(lectura.phi))}</span>
            {lectura.tipo !== "parche" ? <span>q_enc = {coma(lectura.qEnc.toFixed(2)).replace("-", "−")} µC</span> : <span>sin carga encerrada</span>}
          </>
        ) : (
          <span>Calculando…</span>
        )}
      </p>
      <ul className="gauss3d-leyenda" aria-label="Leyenda de colores">
        {flujo && (
          <>
            <li>
              <i className="gauss3d-muestra gauss3d-muestra-sale" aria-hidden="true" />
              Rojo: el campo sale
            </li>
            <li>
              <i className="gauss3d-muestra gauss3d-muestra-entra" aria-hidden="true" />
              Azul: el campo entra
            </li>
          </>
        )}
        {campo && (
          <li>
            <i className="gauss3d-muestra gauss3d-muestra-campo" aria-hidden="true" />
            Flechas ámbar: dirección de E, su longitud no está a escala
          </li>
        )}
      </ul>
    </div>
  );
}
