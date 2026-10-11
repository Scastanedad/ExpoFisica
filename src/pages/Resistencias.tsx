import { useCallback, useEffect, useMemo } from "react";
import { Link } from "react-router-dom";
import { formatearSI, hojas } from "../fisica/circuitos";
import { useTituloDocumento } from "../hooks/useTituloDocumento";
import { CanvasCircuito } from "../render/CanvasCircuito";
import { estadoDC, estadoPuente, type EstadoElectrico } from "../render/circuitos/estado";
import {
  PERSONALIZADO,
  RANGO_E,
  RANGO_R,
  R_INTERNA,
  useCircuitosStore,
} from "../store/circuitosStore";
import { EditorArbol } from "../ui/circuitos/EditorArbol";
import { EditorValor } from "../ui/circuitos/EditorValor";
import { LecturaSonda } from "../ui/circuitos/LecturaSonda";
import { LeyendaCorriente } from "../ui/circuitos/LeyendaCorriente";
import { PanelReduccion } from "../ui/circuitos/PanelReduccion";
import { PRESETS_UI_E6 } from "../ui/circuitos/presetsUI";
import { resumenE6 } from "../ui/circuitos/resumenE6";
import { ResumenCircuito } from "../ui/circuitos/ResumenCircuito";
import { TablaCircuito } from "../ui/circuitos/TablaCircuito";
import { TEXTO_BATERIA_REAL, TEXTO_GENERAL_E6, textoEducativoE6 } from "../ui/circuitos/textosE6";
import { useReduccion } from "../ui/circuitos/useReduccion";
import { SelectorSegmentado } from "../ui/SelectorSegmentado";

const INICIAL = PRESETS_UI_E6[0];

export function Resistencias() {
  useTituloDocumento("Resistencias · ExpoFísica");

  const arbol = useCircuitosStore((s) => s.arbol);
  const presetId = useCircuitosStore((s) => s.presetId);
  const topologia = useCircuitosStore((s) => s.topologia);
  const E = useCircuitosStore((s) => s.E);
  const bateriaReal = useCircuitosStore((s) => s.bateriaReal);
  const verElectrones = useCircuitosStore((s) => s.verElectrones);
  const seleccion = useCircuitosStore((s) => s.seleccion);
  const lecturas = useCircuitosStore((s) => s.lecturas);
  const iniciar = useCircuitosStore((s) => s.iniciar);
  const elegirPreset = useCircuitosStore((s) => s.elegirPreset);
  const seleccionar = useCircuitosStore((s) => s.seleccionar);
  const setE = useCircuitosStore((s) => s.setE);
  const setVerElectrones = useCircuitosStore((s) => s.setVerElectrones);
  const setBateriaReal = useCircuitosStore((s) => s.setBateriaReal);
  const setValorElemento = useCircuitosStore((s) => s.setValorElemento);
  const setSonda = useCircuitosStore((s) => s.setSonda);

  // Al entrar a la estación se parte siempre del primer ejemplo (el store es compartido con E7).
  useEffect(() => {
    iniciar("R", INICIAL.arbol, INICIAL.id, INICIAL.E, INICIAL.topologia);
  }, [iniciar]);

  const puente = topologia === "puente";
  const rInt = bateriaReal ? R_INTERNA : 0;
  const reduccion = useReduccion(arbol, "R");
  const reducido = !puente && reduccion.k > 0;
  const arbolVista = reducido ? reduccion.vista.arbolVista : arbol;

  // E6 es régimen estacionario: el resultado solo se recalcula si cambia el circuito, E o la batería real.
  const estado = useMemo<EstadoElectrico | null>(() => {
    try {
      return puente ? estadoPuente(arbol, E, rInt) : estadoDC(arbolVista, E, rInt);
    } catch {
      return null;
    }
  }, [puente, arbol, arbolVista, E, rInt]);
  const obtenerEstado = useCallback((): EstadoElectrico | null => estado, [estado]);

  const hoja = useMemo(() => hojas(arbol).find((h) => h.id === seleccion) ?? null, [arbol, seleccion]);
  const texto = textoEducativoE6(arbol, topologia);
  const resumen = useMemo(() => {
    const r = resumenE6(lecturas, E);
    return r && reducido ? { ...r, quemados: [] } : r;
  }, [lecturas, E, reducido]);

  const volverAlCompleto = () => {
    reduccion.volver();
    const ids = hojas(arbol).map((h) => h.id);
    if (seleccion === null || !ids.includes(seleccion)) seleccionar(ids[0] ?? null);
  };

  return (
    <main className="pagina-simulador pagina-circuitos">
      <header className="cabecera-simulador">
        <Link to="/" className="volver">
          ← Estaciones
        </Link>
        <h1>Resistencias</h1>
      </header>
      <p className="instrucciones instrucciones-larga">
        Elige un circuito o arma el tuyo con hasta seis resistores. Los puntos muestran hacia dónde va la corriente.
        Toca un resistor o arrastra sobre el cable para medir el voltaje y la corriente con la sonda.
      </p>
      <p className="instrucciones instrucciones-corta">Elige un circuito y toca el cable para medir con la sonda.</p>
      <div className="simulador">
        <div className="simulador-lienzo">
          <CanvasCircuito
            arbol={arbolVista}
            dominio="R"
            disposicion={puente ? "puente" : "arbol"}
            obtenerEstado={obtenerEstado}
            etiqueta={`Circuito de resistores con una batería de ${E} voltios${reducido ? ", reducido paso a paso" : ""}. Usa la tabla para leer los valores de cada elemento.`}
          />
          <LecturaSonda />
          <ResumenCircuito resumen={resumen} bateriaReal={bateriaReal} />
          <LeyendaCorriente />
          {reducido ? (
            <p className="tabla-circuito-nota">
              Estás viendo el circuito reducido. Pulsa «Circuito completo» para ver el voltaje y la corriente de cada
              resistor en la tabla.
            </p>
          ) : (
            <TablaCircuito />
          )}
        </div>
        <div className="simulador-lateral">
          <section className="panel-circuito" aria-label="Elegir el circuito">
            <h3 className="panel-circuito-titulo">Circuito de ejemplo</h3>
            <div className="presets-circuitos">
              <SelectorSegmentado<string>
                etiquetaGrupo="Circuito de ejemplo"
                opciones={[
                  ...PRESETS_UI_E6.map((p) => ({ valor: p.id, etiqueta: p.nombre, descripcion: p.descripcion })),
                  ...(presetId === PERSONALIZADO ? [{ valor: PERSONALIZADO, etiqueta: "Personalizado" }] : []),
                ]}
                valor={presetId}
                alElegir={(id) => {
                  const p = PRESETS_UI_E6.find((x) => x.id === id);
                  if (p) elegirPreset(p.id, p.arbol, undefined, p.topologia);
                }}
              />
            </div>
          </section>

          <label className="panel-sonda-check">
            <input type="checkbox" checked={verElectrones} onChange={(e) => setVerElectrones(e.target.checked)} />
            Ver electrones
          </label>

          <EditorArbol />
          {hoja ? (
            <EditorValor
              etiqueta={`Resistencia de ${hoja.id}`}
              valor={hoja.valor}
              min={RANGO_R.min}
              max={RANGO_R.max}
              escala="log"
              formato={(v) => formatearSI(v, "Ω")}
              alCambiar={(v) => setValorElemento(hoja.id, v)}
            />
          ) : null}

          <EditorValor
            etiqueta="Voltaje de la batería"
            valor={E}
            min={RANGO_E.min}
            max={RANGO_E.max}
            escala="lineal"
            paso={RANGO_E.paso}
            formato={(v) => `${v} V`}
            alCambiar={setE}
          />
          <div className="panel-circuito">
            <label className="panel-sonda-check">
              <input type="checkbox" checked={bateriaReal} onChange={(e) => setBateriaReal(e.target.checked)} />
              Batería real ({R_INTERNA} Ω internos)
            </label>
            {bateriaReal ? <p className="panel-circuito-nota">{TEXTO_BATERIA_REAL}</p> : null}
          </div>

          <PanelReduccion control={reduccion} puente={puente} E={E} rInt={rInt} alVolver={volverAlCompleto} />

          <section className="panel-circuito texto-educativo" aria-label="Qué estás viendo">
            <h3 className="panel-circuito-titulo">{texto.titulo}</h3>
            {texto.parrafos.map((p) => (
              <p key={p}>{p}</p>
            ))}
          </section>

          <button type="button" className="boton-banco" onClick={() => setSonda(null)}>
            Quitar la sonda
          </button>

          <details className="notas-modelo">
            <summary>Notas sobre el modelo</summary>
            <ul>
              <li>{TEXTO_GENERAL_E6}</li>
              <li>
                Es régimen estacionario: al mover un valor, el reparto nuevo aparece al instante. Los cambios reales
                duran nanosegundos y no se animan.
              </li>
              <li>
                El voltaje se mide respecto al borne negativo de la batería; solo las diferencias de voltaje son
                físicas, el cero es una elección. Un cable ideal no pierde voltaje: el voltaje cae dentro de los
                resistores.
              </li>
              <li>
                La rapidez de los puntos es proporcional a la corriente, con un mínimo visible para que una rama con
                poca corriente no parezca apagada. Si no pasa corriente, los puntos se detienen.
              </li>
              <li>
                Los valores van de 10 Ω a 10 kΩ y de 1 V a 12 V: son didácticos. Con seis resistores de 10 Ω en
                paralelo la corriente sería de 7,2 A, que una pila real no entregaría.
              </li>
            </ul>
          </details>
        </div>
      </div>
    </main>
  );
}
