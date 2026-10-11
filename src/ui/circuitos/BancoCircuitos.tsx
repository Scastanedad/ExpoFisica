/**
 * BANCO DE PRUEBAS de la base compartida de circuitos (E6/E7). NO es una estación ni tiene ruta: solo
 * se monta en desarrollo con `npm run dev` y la dirección `http://localhost:5173/?banco=circuitos`
 * (ver `main.tsx`). Sirve para ver el lienzo, el editor de árbol, la sonda, las partículas y la tabla
 * con los presets reales del motor antes de construir las estaciones.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  PRESETS_E6,
  PRESETS_E7,
  factorTiempo,
  formatearSI,
  tauRC,
  transitorioDeArbol,
  type Dominio,
  type ModoCircuito,
  type Transitorio,
} from "../../fisica/circuitos";
import { useTituloDocumento } from "../../hooks/useTituloDocumento";
import { CanvasCircuito } from "../../render/CanvasCircuito";
import { estadoDC, estadoTransitorio, type EstadoElectrico } from "../../render/circuitos/estado";
import {
  PERSONALIZADO,
  RANGO_C,
  RANGO_E,
  RANGO_R,
  RANGO_R_CARGA,
  useCircuitosStore,
} from "../../store/circuitosStore";
import { SelectorSegmentado } from "../SelectorSegmentado";
import { EditorArbol } from "./EditorArbol";
import { EditorValor } from "./EditorValor";
import { LecturaSonda } from "./LecturaSonda";
import { LeyendaCorriente } from "./LeyendaCorriente";
import { TablaCircuito } from "./TablaCircuito";

const PRESETS_R = PRESETS_E6.flatMap((p) => (p.arbol ? [{ id: p.id, nombre: p.nombre, arbol: p.arbol }] : []));
const PRESETS_C = PRESETS_E7.map((p) => ({ id: p.id, nombre: p.nombre, arbol: p.arbol }));

export function BancoCircuitos() {
  useTituloDocumento("Banco de circuitos (desarrollo) · ExpoFísica");
  const dominio = useCircuitosStore((s) => s.dominio);
  const presetId = useCircuitosStore((s) => s.presetId);
  const arbol = useCircuitosStore((s) => s.arbol);
  const E = useCircuitosStore((s) => s.E);
  const rCarga = useCircuitosStore((s) => s.rCarga);
  const modo = useCircuitosStore((s) => s.modo);
  const verElectrones = useCircuitosStore((s) => s.verElectrones);
  const seleccion = useCircuitosStore((s) => s.seleccion);
  const iniciar = useCircuitosStore((s) => s.iniciar);
  const elegirPreset = useCircuitosStore((s) => s.elegirPreset);
  const setE = useCircuitosStore((s) => s.setE);
  const setRCarga = useCircuitosStore((s) => s.setRCarga);
  const setModo = useCircuitosStore((s) => s.setModo);
  const setVerElectrones = useCircuitosStore((s) => s.setVerElectrones);
  const setValorElemento = useCircuitosStore((s) => s.setValorElemento);
  const setSonda = useCircuitosStore((s) => s.setSonda);

  useEffect(() => {
    iniciar("R", PRESETS_R[0].arbol, PRESETS_R[0].id);
  }, [iniciar]);

  const presets = dominio === "R" ? PRESETS_R : PRESETS_C;
  const hoja = useMemo(() => {
    const buscar = (b: typeof arbol): { id: string; valor: number }[] =>
      b.t === "e" ? [{ id: b.id, valor: b.valor }] : b.hijos.flatMap(buscar);
    return buscar(arbol).find((h) => h.id === seleccion) ?? null;
  }, [arbol, seleccion]);

  // E6: resultado DC (se recalcula solo si cambia el árbol o E). E7: transitorio en un ref, fuera de React.
  const dc = useMemo(() => {
    if (dominio !== "R") return null;
    try {
      return estadoDC(arbol, E);
    } catch {
      return null;
    }
  }, [dominio, arbol, E]);
  const transitorioRef = useRef<{ tr: Transitorio; factor: number } | null>(null);
  const [reinicio, setReinicio] = useState(0);
  const reinicioVistoRef = useRef(0);

  // Al cambiar E, Rc, el interruptor o la red se crea otro transitorio (la matriz se factoriza una vez);
  // `transitorioDeArbol` conserva la carga si los capacitores no cambiaron y reinicia si cambiaron.
  useEffect(() => {
    if (dominio !== "C") {
      transitorioRef.current = null;
      return;
    }
    const reiniciar = reinicioVistoRef.current !== reinicio;
    reinicioVistoRef.current = reinicio;
    const previo = reiniciar ? null : (transitorioRef.current?.tr ?? null);
    const tr = transitorioDeArbol(arbol, { modo, E, rCarga }, previo);
    // Tiempo dilatado: el τ real se muestra en segundos visibles (spec §6).
    transitorioRef.current = { tr, factor: factorTiempo(tauRC(arbol, rCarga, 0, modo)) };
  }, [dominio, arbol, modo, E, rCarga, reinicio]);

  const obtenerEstado = useCallback(
    (dt: number): EstadoElectrico | null => {
      if (dominio === "R") return dc;
      const act = transitorioRef.current;
      if (!act) return null;
      act.tr.avanzar(dt / act.factor);
      return estadoTransitorio(act.tr, E, rCarga);
    },
    [dominio, dc, E, rCarga],
  );

  const rango = dominio === "R" ? RANGO_R : RANGO_C;
  const unidad = dominio === "R" ? "Ω" : "F";

  return (
    <main className="pagina-simulador pagina-circuitos banco-circuitos">
      <header className="cabecera-simulador">
        <h1>Banco de circuitos</h1>
      </header>
      <p className="instrucciones banco-aviso" role="note">
        Banco de pruebas de desarrollo (sin ruta). Toca un elemento o arrastra sobre el cable para medir con la
        sonda. {seleccion ? `Seleccionado: ${seleccion}.` : ""}
      </p>
      <div className="simulador">
        <div className="simulador-lienzo">
          <CanvasCircuito
            arbol={arbol}
            dominio={dominio}
            conRCarga={dominio === "C"}
            obtenerEstado={obtenerEstado}
            etiqueta={`Circuito de ${dominio === "R" ? "resistores" : "capacitores"} con una batería de ${E} voltios. Usa la tabla para leer los valores de cada elemento.`}
          />
          <LecturaSonda />
          <LeyendaCorriente />
          <TablaCircuito />
        </div>
        <div className="simulador-lateral">
          <SelectorSegmentado<Dominio>
            etiquetaGrupo="Tipo de circuito"
            opciones={[
              { valor: "R", etiqueta: "Resistores" },
              { valor: "C", etiqueta: "Capacitores" },
            ]}
            valor={dominio}
            alElegir={(d) => {
              const p = d === "R" ? PRESETS_R[0] : PRESETS_C[0];
              iniciar(d, p.arbol, p.id);
            }}
          />
          <SelectorSegmentado<string>
            etiquetaGrupo="Circuito de ejemplo"
            opciones={[
              ...presets.map((p) => ({ valor: p.id, etiqueta: p.nombre })),
              ...(presetId === PERSONALIZADO ? [{ valor: PERSONALIZADO, etiqueta: "Personalizado" }] : []),
            ]}
            valor={presetId}
            alElegir={(id) => {
              const p = presets.find((x) => x.id === id);
              if (p) {
                elegirPreset(p.id, p.arbol);
                setReinicio((n) => n + 1);
              }
            }}
          />
          <SelectorSegmentado<"conv" | "elec">
            etiquetaGrupo="Sentido que se dibuja"
            opciones={[
              { valor: "conv", etiqueta: "Corriente convencional" },
              { valor: "elec", etiqueta: "Ver electrones" },
            ]}
            valor={verElectrones ? "elec" : "conv"}
            alElegir={(v) => setVerElectrones(v === "elec")}
          />
          {dominio === "C" ? (
            <>
              <SelectorSegmentado<ModoCircuito>
                etiquetaGrupo="Interruptor"
                opciones={[
                  { valor: "abierto", etiqueta: "Abierto" },
                  { valor: "cargar", etiqueta: "Cargar" },
                  { valor: "descargar", etiqueta: "Descargar" },
                ]}
                valor={modo}
                alElegir={setModo}
              />
              <button type="button" className="boton-banco" onClick={() => setReinicio((n) => n + 1)}>
                Descargar todo y reiniciar
              </button>
            </>
          ) : null}
          <EditorArbol />
          {hoja ? (
            <EditorValor
              etiqueta={`${dominio === "R" ? "Resistencia" : "Capacitancia"} de ${hoja.id}`}
              valor={hoja.valor}
              min={rango.min}
              max={rango.max}
              escala="log"
              formato={(v) => formatearSI(v, unidad)}
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
          {dominio === "C" ? (
            <EditorValor
              etiqueta="Resistencia de carga Rc"
              valor={rCarga}
              min={RANGO_R_CARGA.min}
              max={RANGO_R_CARGA.max}
              escala="log"
              formato={(v) => formatearSI(v, "Ω")}
              alCambiar={setRCarga}
            />
          ) : null}
          <button type="button" className="boton-banco" onClick={() => setSonda(null)}>
            Quitar la sonda
          </button>
        </div>
      </div>
    </main>
  );
}
