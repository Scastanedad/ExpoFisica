import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { formatearSI, hojas } from "../fisica/circuitos";
import { useAvisoTemporal } from "../hooks/useAvisoTemporal";
import { useTituloDocumento } from "../hooks/useTituloDocumento";
import { CanvasCircuito } from "../render/CanvasCircuito";
import type { EstadoElectrico } from "../render/circuitos/estado";
import { SimulacionRC, type ModoInterruptor, type ParametrosRC } from "../render/circuitos/simulacionRC";
import { PERSONALIZADO, RANGO_C, RANGO_E, RANGO_R_CARGA, useCircuitosStore } from "../store/circuitosStore";
import { BalanceEnergia } from "../ui/circuitos/BalanceEnergia";
import { EditorArbol } from "../ui/circuitos/EditorArbol";
import { EditorValor } from "../ui/circuitos/EditorValor";
import { GraficaRC } from "../ui/circuitos/GraficaRC";
import { LecturaSonda } from "../ui/circuitos/LecturaSonda";
import { LeyendaCorriente } from "../ui/circuitos/LeyendaCorriente";
import { PanelReduccion } from "../ui/circuitos/PanelReduccion";
import { PRESETS_UI_E7 } from "../ui/circuitos/presetsUI";
import { ResumenCapacitores } from "../ui/circuitos/ResumenCapacitores";
import { TablaCapacitores } from "../ui/circuitos/TablaCapacitores";
import { TextoCapacitores } from "../ui/circuitos/TextoCapacitores";
import {
  MENSAJE_REDUCCION_REINICIA,
  MENSAJE_REINICIO,
  NOTA_ESCALA_TIEMPO,
  NOTA_SENTIDO_DESCARGA,
  TEXTO_GENERAL_E7,
} from "../ui/circuitos/textosE7";
import { useReduccion } from "../ui/circuitos/useReduccion";
import { SelectorSegmentado } from "../ui/SelectorSegmentado";

const INICIAL = PRESETS_UI_E7[0];

export function Capacitores() {
  useTituloDocumento("Capacitores · ExpoFísica");

  const arbol = useCircuitosStore((s) => s.arbol);
  const presetId = useCircuitosStore((s) => s.presetId);
  const E = useCircuitosStore((s) => s.E);
  const rCarga = useCircuitosStore((s) => s.rCarga);
  const modoStore = useCircuitosStore((s) => s.modo);
  const verElectrones = useCircuitosStore((s) => s.verElectrones);
  const seleccion = useCircuitosStore((s) => s.seleccion);
  const iniciar = useCircuitosStore((s) => s.iniciar);
  const elegirPreset = useCircuitosStore((s) => s.elegirPreset);
  const seleccionar = useCircuitosStore((s) => s.seleccionar);
  const setE = useCircuitosStore((s) => s.setE);
  const setRCarga = useCircuitosStore((s) => s.setRCarga);
  const setModo = useCircuitosStore((s) => s.setModo);
  const setVerElectrones = useCircuitosStore((s) => s.setVerElectrones);
  const setValorElemento = useCircuitosStore((s) => s.setValorElemento);
  const setSonda = useCircuitosStore((s) => s.setSonda);

  // Al entrar a la estación se parte siempre del primer ejemplo, descargado y cargando (el store es compartido con E6).
  useEffect(() => {
    iniciar("C", INICIAL.arbol, INICIAL.id, INICIAL.E);
    setRCarga(INICIAL.rCarga);
    setModo("cargar");
  }, [iniciar, setRCarga, setModo]);

  // Solo se exponen dos posiciones del interruptor; el modo «abierto» del motor no se muestra.
  const modo: ModoInterruptor = modoStore === "descargar" ? "descargar" : "cargar";

  const reduccion = useReduccion(arbol, "C");
  const reducido = reduccion.k > 0;
  const arbolVista = reducido ? reduccion.vista.arbolVista : arbol;

  // El circuito vive en un objeto fuera de React: ni las cargas ni el estado de los capacitores pasan por el estado.
  const [sim] = useState(() => new SimulacionRC());

  const [aviso, mostrarAviso] = useAvisoTemporal(7000);
  const paramsRef = useRef<ParametrosRC>({ arbol: arbolVista, modo, E, rCarga });
  const avisoRef = useRef(mostrarAviso);
  useEffect(() => {
    paramsRef.current = { arbol: arbolVista, modo, E, rCarga };
    avisoRef.current = mostrarAviso;
  }, [arbolVista, modo, E, rCarga, mostrarAviso]);

  const obtenerEstado = useCallback(
    (dt: number): EstadoElectrico | null => {
      // Mientras el store aún trae el circuito de otra estación, no se simula.
      if (useCircuitosStore.getState().dominio !== "C") return null;
      const r = sim.configurar(paramsRef.current);
      if (r.reiniciado) avisoRef.current(MENSAJE_REINICIO);
      sim.avanzar(dt);
      return sim.estado();
    },
    [sim],
  );

  const hoja = useMemo(() => hojas(arbol).find((h) => h.id === seleccion) ?? null, [arbol, seleccion]);

  const volverAlCompleto = () => {
    reduccion.volver();
    const ids = hojas(arbol).map((h) => h.id);
    if (seleccion === null || !ids.includes(seleccion)) seleccionar(ids[0] ?? null);
  };

  return (
    <main className="pagina-simulador pagina-circuitos pagina-capacitores">
      <header className="cabecera-simulador">
        <Link to="/" className="volver">
          ← Estaciones
        </Link>
        <h1>Capacitores</h1>
      </header>
      <p className="instrucciones instrucciones-larga">
        Elige una red de hasta seis capacitores y pulsa Cargar o Descargar. Los puntos son la carga que va por el cable y se
        acumula en las placas, sin atravesar el aislante. Toca un capacitor o arrastra sobre el cable para medir con la sonda.
      </p>
      <p className="instrucciones instrucciones-corta">Elige una red, pulsa Cargar o Descargar y toca el cable para medir.</p>
      <div className="simulador">
        <div className="simulador-lienzo">
          <CanvasCircuito
            arbol={arbolVista}
            dominio="C"
            conRCarga
            obtenerEstado={obtenerEstado}
            etiqueta={`Circuito con una batería de ${E} voltios, un resistor de carga de ${formatearSI(rCarga, "Ω")} y capacitores${reducido ? ", reducido paso a paso" : ""}. Usa los totales y la tabla para leer los valores.`}
          />
          <div className="interruptor-rc">
            <SelectorSegmentado<ModoInterruptor>
              etiquetaGrupo="Interruptor"
              opciones={[
                { valor: "cargar", etiqueta: "Cargar", descripcion: "La batería carga los capacitores" },
                {
                  valor: "descargar",
                  etiqueta: "Descargar",
                  descripcion: "Se quita la batería y los capacitores se descargan por el resistor",
                },
              ]}
              valor={modo}
              alElegir={setModo}
            />
            <button type="button" className="boton-banco" onClick={() => sim.reiniciar()}>
              Volver a empezar
            </button>
          </div>
          <LecturaSonda />
          <ResumenCapacitores sim={sim} modo={modo} />
          <LeyendaCorriente notaSentido={modo === "descargar" ? NOTA_SENTIDO_DESCARGA : undefined} />
          {reducido ? (
            <p className="tabla-circuito-nota">
              Estás viendo el circuito reducido. Pulsa «Circuito completo» para ver el voltaje, la corriente, la carga y la
              energía de cada capacitor en la tabla.
            </p>
          ) : (
            <TablaCapacitores modo={modo} />
          )}
        </div>
        <div className="simulador-lateral">
          <section className="panel-circuito" aria-label="Elegir la red">
            <h3 className="panel-circuito-titulo">Red de ejemplo</h3>
            <div className="presets-circuitos">
              <SelectorSegmentado<string>
                etiquetaGrupo="Red de ejemplo"
                opciones={[
                  ...PRESETS_UI_E7.map((p) => ({ valor: p.id, etiqueta: p.nombre, descripcion: p.descripcion })),
                  ...(presetId === PERSONALIZADO ? [{ valor: PERSONALIZADO, etiqueta: "Personalizado" }] : []),
                ]}
                valor={presetId}
                alElegir={(id) => {
                  const p = PRESETS_UI_E7.find((x) => x.id === id);
                  if (!p) return;
                  elegirPreset(p.id, p.arbol, p.E);
                  setRCarga(p.rCarga);
                }}
              />
            </div>
            <p className="panel-circuito-nota">
              Todas las redes de ejemplo suman 100 µF: así solo cambia cómo se reparten el voltaje y la carga.
            </p>
          </section>
          <p className="aviso-reinicio" role="status">
            {aviso}
          </p>

          <GraficaRC sim={sim} modo={modo} />

          <label className="panel-sonda-check">
            <input type="checkbox" checked={verElectrones} onChange={(e) => setVerElectrones(e.target.checked)} />
            Ver electrones
          </label>

          <EditorArbol />
          {hoja ? (
            <EditorValor
              etiqueta={`Capacitancia de ${hoja.id}`}
              valor={hoja.valor}
              min={RANGO_C.min}
              max={RANGO_C.max}
              escala="log"
              formato={(v) => formatearSI(v, "F")}
              alCambiar={(v) => setValorElemento(hoja.id, v)}
            />
          ) : null}
          <EditorValor
            etiqueta="Resistencia de carga Rc"
            valor={rCarga}
            min={RANGO_R_CARGA.min}
            max={RANGO_R_CARGA.max}
            escala="log"
            formato={(v) => formatearSI(v, "Ω")}
            alCambiar={setRCarga}
          />
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

          <PanelReduccion
            control={reduccion}
            puente={false}
            dominio="C"
            alTerminar={(eq) => `Constante de tiempo: τ = R·C = ${formatearSI(rCarga * eq, "s")}.`}
            nota={MENSAJE_REDUCCION_REINICIA}
            alVolver={volverAlCompleto}
          />

          <BalanceEnergia sim={sim} />

          <TextoCapacitores sim={sim} arbol={arbol} modo={modo} />

          <button type="button" className="boton-banco" onClick={() => setSonda(null)}>
            Quitar la sonda
          </button>

          <details className="notas-modelo">
            <summary>Notas sobre el modelo</summary>
            <ul>
              <li>{TEXTO_GENERAL_E7}</li>
              <li>{NOTA_ESCALA_TIEMPO}</li>
              <li>
                Si cambias la capacitancia de un capacitor o la forma de la red, los capacitores vuelven a descargarse. Si
                cambias el voltaje, la resistencia o el interruptor, la carga guardada se conserva.
              </li>
              <li>
                El voltaje se mide respecto al borne negativo de la batería. Al descargar, la batería sale del circuito y
                el borne queda a 0 V. Un cable ideal no pierde voltaje: el voltaje cae dentro del resistor y de los
                capacitores.
              </li>
              <li>
                La rapidez de los puntos es proporcional a la corriente, sin mínimo: se frenan a medida que el capacitor se
                carga y se detienen cuando ya no pasa corriente.
              </li>
              <li>Los valores van de 1 µF a 1000 µF, de 10 Ω a 10 kΩ y de 1 V a 12 V: son didácticos.</li>
            </ul>
          </details>
        </div>
      </div>
    </main>
  );
}
