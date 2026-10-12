import { useId } from "react";
import { CATALOGO } from "../../fisica/capacitorPlacas";
import { fmtE, fmtKappa } from "./textosCapacitor";

interface Props {
  valor: string;
  alElegir: (id: string) => void;
}

/**
 * Selector del dieléctrico: grupo de radios nativos (teclado y lectores de pantalla gratis) con κ y rigidez
 * visibles en cada opción y su uso real en una línea. Elegir un material no lo mete entre las placas:
 * eso se hace arrastrando el bloque o con el deslizador de inserción.
 */
export function SelectorDielectrico({ valor, alElegir }: Props) {
  const nombre = useId();
  return (
    <fieldset className="selector-dielectrico">
      <legend className="panel-circuito-titulo">Dieléctrico</legend>
      <div className="selector-dielectrico-lista">
        {CATALOGO.map((m) => (
          <label key={m.id} className={`opcion-dielectrico${valor === m.id ? " activa" : ""}`}>
            <input
              type="radio"
              name={nombre}
              value={m.id}
              checked={valor === m.id}
              onChange={() => alElegir(m.id)}
              aria-describedby={`${nombre}-${m.id}`}
            />
            <span className="opcion-dielectrico-nombre">{m.id === "aire" ? "Aire (sin dieléctrico)" : m.nombre}</span>
            <span className="opcion-dielectrico-datos">
              κ = {fmtKappa(m.kappa)} · E máx {fmtE(m.eMax)}
            </span>
            <span id={`${nombre}-${m.id}`} className="sr-only">
              Uso real: {m.uso}.
            </span>
          </label>
        ))}
      </div>
      <p className="panel-circuito-nota">
        Valores de tabla (Serway), aproximados y a temperatura ambiente: en la práctica varían con el espesor, la
        temperatura y la frecuencia.
      </p>
    </fieldset>
  );
}
