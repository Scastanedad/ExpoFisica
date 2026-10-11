import { hojas } from "../../fisica/circuitos";
import { useCircuitosStore } from "../../store/circuitosStore";
import { textoCorriente, textoPotencia, textoValorElemento, textoVoltaje } from "../../render/circuitos/textos";

/**
 * Tabla accesible con las mismas lecturas que los rótulos del lienzo (se actualiza a ~10 Hz). No es una
 * región viva: anunciar cada tic saturaría al lector de pantalla; los anuncios los hace `CanvasCircuito`
 * solo cuando el visitante elige un elemento o mueve la sonda.
 */
export function TablaCircuito() {
  const arbol = useCircuitosStore((s) => s.arbol);
  const dominio = useCircuitosStore((s) => s.dominio);
  const lecturas = useCircuitosStore((s) => s.lecturas);
  const seleccion = useCircuitosStore((s) => s.seleccion);
  const rCarga = useCircuitosStore((s) => s.rCarga);
  const seleccionar = useCircuitosStore((s) => s.seleccionar);

  const filas = hojas(arbol);
  return (
    <div className="tabla-circuito-caja">
      <table className="tabla-circuito">
        <caption>Lecturas de cada elemento del circuito</caption>
        <thead>
          <tr>
            <th scope="col">Elemento</th>
            <th scope="col">Valor</th>
            <th scope="col">Voltaje</th>
            <th scope="col">Corriente</th>
            <th scope="col">Potencia</th>
          </tr>
        </thead>
        <tbody>
          {dominio === "C" ? (
            <Fila id="Rc" valor={textoValorElemento("R", rCarga)} l={lecturas?.elementos.Rc} activa={false} />
          ) : null}
          {filas.map((h) => (
            <Fila
              key={h.id}
              id={h.id}
              valor={textoValorElemento(dominio, h.valor)}
              l={lecturas?.elementos[h.id]}
              activa={h.id === seleccion}
              alElegir={() => seleccionar(h.id)}
            />
          ))}
          <tr className="tabla-circuito-bateria">
            <th scope="row">Batería</th>
            <td>—</td>
            <td colSpan={2}>{lecturas ? `sale ${textoCorriente(lecturas.iBat)}` : "—"}</td>
            <td>{lecturas ? textoPotencia(lecturas.pBat) : "—"}</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

interface PropsFila {
  id: string;
  valor: string;
  l: { v: number; i: number; p: number } | undefined;
  activa: boolean;
  alElegir?: () => void;
}

function Fila({ id, valor, l, activa, alElegir }: PropsFila) {
  return (
    <tr className={activa ? "activa" : undefined} aria-current={activa ? "true" : undefined}>
      <th scope="row">
        {alElegir ? (
          <button type="button" className="tabla-circuito-elegir" onClick={alElegir} aria-label={`Seleccionar ${id}`}>
            {id}
          </button>
        ) : (
          id
        )}
      </th>
      <td>{valor}</td>
      <td>{l ? textoVoltaje(l.v) : "—"}</td>
      <td>{l ? textoCorriente(l.i) : "—"}</td>
      <td>{l ? textoPotencia(l.p) : "—"}</td>
    </tr>
  );
}
