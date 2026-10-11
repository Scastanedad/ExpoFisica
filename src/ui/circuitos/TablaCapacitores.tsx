import { formatearSI, hojas } from "../../fisica/circuitos";
import { useCircuitosStore } from "../../store/circuitosStore";
import { textoCorriente, textoValorElemento, textoVoltaje } from "../../render/circuitos/textos";
import type { ModoInterruptor } from "../../render/circuitos/simulacionRC";

const menos = (t: string) => t.replace("-", "−");

/**
 * Tabla accesible de E7 con las mismas lecturas que los rótulos del lienzo (se actualiza a ~10 Hz): por
 * capacitor, voltaje, corriente, carga Q de la placa conectada al lado + y energía ½·C·V². No es región viva:
 * anunciar cada tic saturaría al lector de pantalla; los cambios de fase («terminó de cargar») se anuncian
 * aparte, en `ResumenCapacitores`.
 */
export function TablaCapacitores({ modo }: { modo: ModoInterruptor }) {
  const arbol = useCircuitosStore((s) => s.arbol);
  const lecturas = useCircuitosStore((s) => s.lecturas);
  const seleccion = useCircuitosStore((s) => s.seleccion);
  const rCarga = useCircuitosStore((s) => s.rCarga);
  const seleccionar = useCircuitosStore((s) => s.seleccionar);

  const rc = lecturas?.elementos.Rc;
  return (
    <div className="tabla-circuito-caja">
      <table className="tabla-circuito tabla-capacitores">
        <caption>Lecturas de cada elemento del circuito</caption>
        <thead>
          <tr>
            <th scope="col">Elemento</th>
            <th scope="col">Valor</th>
            <th scope="col">Voltaje</th>
            <th scope="col">Corriente</th>
            <th scope="col">Carga Q</th>
            <th scope="col">Energía</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <th scope="row">Rc</th>
            <td>{textoValorElemento("R", rCarga)}</td>
            <td>{rc ? textoVoltaje(rc.v) : "—"}</td>
            <td>{rc ? textoCorriente(rc.i) : "—"}</td>
            <td>—</td>
            <td>—</td>
          </tr>
          {hojas(arbol).map((h) => {
            const l = lecturas?.elementos[h.id];
            const activa = h.id === seleccion;
            return (
              <tr key={h.id} className={activa ? "activa" : undefined} aria-current={activa ? "true" : undefined}>
                <th scope="row">
                  <button
                    type="button"
                    className="tabla-circuito-elegir"
                    onClick={() => seleccionar(h.id)}
                    aria-label={`Seleccionar ${h.id}`}
                  >
                    {h.id}
                  </button>
                </th>
                <td>{textoValorElemento("C", h.valor)}</td>
                <td>{l ? textoVoltaje(l.v) : "—"}</td>
                <td>{l ? textoCorriente(l.i) : "—"}</td>
                <td>{l ? menos(formatearSI(Math.abs(l.q) < 1e-15 ? 0 : l.q, "C")) : "—"}</td>
                <td>{l ? formatearSI(l.u, "J") : "—"}</td>
              </tr>
            );
          })}
          <tr className="tabla-circuito-bateria">
            <th scope="row">Batería</th>
            <td>—</td>
            <td colSpan={4}>
              {modo === "descargar" ? "fuera del circuito: la corriente va por el resistor" : lecturas ? `sale ${textoCorriente(lecturas.iBat)}` : "—"}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}
