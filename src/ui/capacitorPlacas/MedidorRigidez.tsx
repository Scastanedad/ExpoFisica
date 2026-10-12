import type { Estado, Parametros } from "../../fisica/capacitorPlacas";
import { porcentaje, textoRigidez } from "./textosCapacitor";

/** Medidor E / E_máx (margen de seguridad). Ámbar desde el umbral de aviso; la frase va con el valor. */
export function MedidorRigidez({ p, e }: { p: Parametros; e: Estado }) {
  const { nivel } = textoRigidez(p, e);
  const pct = Math.min(100, e.ratioRigidez * 100);
  const valor = porcentaje(e.ratioRigidez);
  return (
    <div className={`medidor-rigidez nivel-${nivel}`}>
      <p className="medidor-rigidez-titulo">
        <span>Campo / rigidez dieléctrica</span>
        <output>{valor}</output>
      </p>
      <div
        className="medidor-rigidez-barra"
        role="meter"
        aria-label="Campo eléctrico respecto a la rigidez dieléctrica"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(pct)}
        aria-valuetext={`${valor} de la rigidez${nivel === "ok" ? "" : nivel === "aviso" ? ", cerca del límite" : ", en el límite"}`}
      >
        <span style={{ width: `${pct}%` }} />
        <i aria-hidden="true" className="medidor-rigidez-marca" />
      </div>
    </div>
  );
}
