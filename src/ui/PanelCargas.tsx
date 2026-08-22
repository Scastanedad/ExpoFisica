import { useSimulacionStore } from "../store/simulacionStore";
import { formatCarga } from "../fisica/unidades";

interface CargaListable {
  id: string;
  q: number;
}

interface Props {
  cargas: CargaListable[];
  alAgregar: (q: number) => void;
  alQuitar: (id: string) => void;
}

/** Agregar/quitar cargas -- genérico por props para que lo use tanto la
 * página de campo fijo como la de cargas en movimiento, cada una con su
 * propia lista (store distinto), pero mostrando la unidad compartida. */
export function PanelCargas({ cargas, alAgregar, alQuitar }: Props) {
  const unidadCarga = useSimulacionStore((s) => s.unidadCarga);

  return (
    <div className="panel-cargas">
      <div className="panel-cargas-botones">
        <button type="button" onClick={() => alAgregar(1)}>
          + Positiva
        </button>
        <button type="button" onClick={() => alAgregar(-1)}>
          + Negativa
        </button>
      </div>
      <ul className="panel-cargas-lista">
        {cargas.map((c) => (
          <li key={c.id}>
            <span className={c.q > 0 ? "carga-positiva" : "carga-negativa"}>
              {formatCarga(c.q, unidadCarga)}
            </span>
            <button type="button" onClick={() => alQuitar(c.id)} aria-label={`Quitar carga ${c.id}`}>
              ×
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
