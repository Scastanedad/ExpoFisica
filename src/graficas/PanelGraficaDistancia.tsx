/**
 * Gráfica vs. distancia |E|(r)/V(r) ("Cargas en reposo", E4.1 §3): fija una
 * recta A→B y una carga de referencia, mide con la ley EXACTA (sin
 * softening, a diferencia de la lectura en vivo de q₀ -- E4.1 §3.3/§7.3) y
 * compara contra la curva teórica de esa carga sola, en ejes log-log.
 *
 * Decisión de UX (no dictada por la spec, E4.1 §10.1): de los DOS flujos que
 * describe §3.1 (clic directo en el lienzo, o arrastrar q₀ + "Fijar A/B"),
 * este panel implementa SOLO el segundo. Evita tocar
 * `hooks/useInteraccionEscena.ts` (ya revisado, con lógica delicada de
 * arrastre/"tocar el destino") para añadir un tercer modo de clic; reutiliza
 * el `ControladorEscena` que YA expone la posición de q₀ y de cada carga
 * real (mismo patrón que `PanelSondaQ0`/`PanelCargas`). Requiere la sonda q₀
 * activa -- una limitación real frente al §3.1 ("no requiere q₀ activa" para
 * el flujo 1), documentada aquí y en el informe de la tarea.
 *
 * No es continua (E4.1 §6.3): se recalcula una sola vez al pulsar "Graficar",
 * nunca en cada movimiento de q₀.
 */
import { useId, useRef, useState, type RefObject } from "react";
import type { PuntoCarga } from "../fisica/coulomb";
import {
  N_PUNTOS_TEORICOS,
  curvaTeorica,
  muestrearDistancia,
  puntoTeoricoEnR,
  tramosCampo,
  tramosPotencial,
  type CargaConId,
  type CurvaDistancia,
  type PuntoCurvaTeorica,
  type PuntoLinea,
} from "../fisica/muestreoDistancia";
import { useAvisoTemporal } from "../hooks/useAvisoTemporal";
import { ID_SONDA_Q0, type ControladorEscena } from "../render/controladorEscena";
import { useCargaPruebaStore } from "../store/cargaPruebaStore";
import { useGraficaDistanciaStore } from "../store/graficaDistanciaStore";
import { useSeleccionStore } from "../store/seleccionStore";
import { useSimulacionStore } from "../store/simulacionStore";
import { ajustarDprCanvas } from "./ajustarDprCanvas";
import {
  COLOR_MEDIDO,
  COLOR_TEORICO,
  dibujarEjesLogLog,
  dibujarTramosLogLog,
  limpiarLienzo,
} from "./dibujoGrafica";
import { construirCSVDistancia, descargarTexto, nombreArchivoCSV, type CargaParaMetadatos } from "./exportarCSV";

const ANCHO = 300;
const ALTO = 180;

type Variable = "e" | "v";

interface Props {
  controladorRef?: RefObject<ControladorEscena | null>;
}

export function PanelGraficaDistancia({ controladorRef }: Props) {
  const cargas = useSimulacionStore((s) => s.cargas);
  const activoQ0 = useCargaPruebaStore((s) => s.activo);
  const seleccionadaId = useSeleccionStore((s) => s.seleccionadaId);
  // A/B viven en un store compartido (no en `useState` local): así
  // `render/CanvasRenderer.tsx` puede dibujar un marcador en el lienzo principal de dónde
  // quedaron fijados (corrección post revisión UI, E4.1 §3) sin pasar la posición por props.
  const puntoA = useGraficaDistanciaStore((s) => s.puntoA);
  const puntoB = useGraficaDistanciaStore((s) => s.puntoB);
  const setPuntoA = useGraficaDistanciaStore((s) => s.setPuntoA);
  const setPuntoB = useGraficaDistanciaStore((s) => s.setPuntoB);
  const limpiarPuntos = useGraficaDistanciaStore((s) => s.limpiarPuntos);
  const [curva, setCurva] = useState<CurvaDistancia | null>(null);
  const [teoricaPura, setTeoricaPura] = useState<PuntoCurvaTeorica[] | null>(null);
  const [variable, setVariable] = useState<Variable>("e");
  const [mensaje, setMensaje] = useState("");
  const [avisoCsv, mostrarAvisoCsv] = useAvisoTemporal();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const idTitulo = useId();

  function posicionSonda(): PuntoLinea | null {
    return controladorRef?.current?.posicion(ID_SONDA_Q0) ?? null;
  }

  function fijarA() {
    const p = posicionSonda();
    if (p) setPuntoA({ ...p });
  }

  function fijarB() {
    const p = posicionSonda();
    if (p) setPuntoB({ ...p });
  }

  function limpiar() {
    limpiarPuntos();
    setCurva(null);
    setTeoricaPura(null);
    setMensaje("");
    const ctx = canvasRef.current ? ajustarDprCanvas(canvasRef.current, ANCHO, ALTO) : null;
    if (ctx) limpiarLienzo(ctx, ANCHO, ALTO);
  }

  /** Todas las cargas con posición (px lógicos) vía el controlador; sin él, no hay nada que graficar. */
  function cargasConPosicion(): CargaConId[] {
    const ctrl = controladorRef?.current;
    if (!ctrl) return [];
    return cargas
      .map((c) => {
        const p = ctrl.posicion(c.id);
        return p ? { id: c.id, x: p.x, y: p.y, q: c.q } : null;
      })
      .filter((c): c is CargaConId => c !== null);
  }

  function elegirCargaRef(todas: CargaConId[], a: PuntoLinea): CargaConId | null {
    if (todas.length === 0) return null;
    if (todas.length === 1) return todas[0];
    const porSeleccion = todas.find((c) => c.id === seleccionadaId);
    if (porSeleccion) return porSeleccion;
    return todas.reduce((cerca, c) =>
      Math.hypot(c.x - a.x, c.y - a.y) < Math.hypot(cerca.x - a.x, cerca.y - a.y) ? c : cerca,
    );
  }

  function graficar() {
    if (!puntoA || !puntoB) {
      setMensaje("Fija A y B primero.");
      return;
    }
    const todas = cargasConPosicion();
    const ref = elegirCargaRef(todas, puntoA);
    if (!ref) {
      setMensaje("Coloca al menos una carga para graficar su campo.");
      return;
    }
    const puntos: PuntoCarga[] = todas;
    const c = muestrearDistancia(puntoA, puntoB, ref, puntos, undefined);
    const teorica = curvaTeorica(ref.q, c.rMin, c.rMax, N_PUNTOS_TEORICOS);
    setCurva(c);
    setTeoricaPura(teorica);
    setMensaje(
      c.esLineaRadial
        ? ""
        : "La línea no pasa en línea recta desde la carga: acércala en línea recta para ver la pendiente 1/r² con claridad.",
    );
    redibujar(c, teorica, variable);
  }

  function redibujar(c: CurvaDistancia, teorica: PuntoCurvaTeorica[], variable_: Variable) {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = ajustarDprCanvas(canvas, ANCHO, ALTO);
    if (!ctx) return;
    limpiarLienzo(ctx, ANCHO, ALTO);
    const logR = [Math.log10(c.rMin), Math.log10(c.rMax)] as [number, number];
    if (variable_ === "e") {
      const valores = [...c.muestras.map((m) => m.eModulo), ...teorica.map((t) => t.eTeorico)].filter(
        (v): v is number => v !== null && v > 0,
      );
      const logY = [Math.log10(Math.min(...valores)), Math.log10(Math.max(...valores))] as [number, number];
      const { mapLogX, mapLogY } = dibujarEjesLogLog(ctx, ANCHO, ALTO, logR, logY, "N/C");
      dibujarTramosLogLog(ctx, tramosCampo(c.muestras), mapLogX, mapLogY, COLOR_MEDIDO, { puntos: true });
      dibujarTramosLogLog(
        ctx,
        [teorica.map((t) => ({ r: t.r, valor: t.eTeorico }))],
        mapLogX,
        mapLogY,
        COLOR_TEORICO,
        { guion: [5, 3], grosor: 1.4 },
      );
    } else {
      const valores = [...c.muestras.map((m) => m.v), ...teorica.map((t) => Math.abs(t.vTeorico))].filter(
        (v): v is number => v !== null && Math.abs(v) > 0,
      );
      const abs = valores.map((v) => Math.abs(v));
      const logY = [Math.log10(Math.min(...abs)), Math.log10(Math.max(...abs))] as [number, number];
      const { mapLogX, mapLogY } = dibujarEjesLogLog(ctx, ANCHO, ALTO, logR, logY, "V");
      const tramosV = tramosPotencial(c.muestras).map((tramo) =>
        tramo.map((p) => ({ r: p.r, valor: Math.abs(p.valor) })),
      );
      dibujarTramosLogLog(ctx, tramosV, mapLogX, mapLogY, COLOR_MEDIDO, { puntos: true });
      dibujarTramosLogLog(
        ctx,
        [teorica.map((t) => ({ r: t.r, valor: Math.abs(t.vTeorico) }))],
        mapLogX,
        mapLogY,
        COLOR_TEORICO,
        { guion: [5, 3], grosor: 1.4 },
      );
    }
  }

  function alCambiarVariable(v: Variable) {
    setVariable(v);
    if (curva && teoricaPura) redibujar(curva, teoricaPura, v);
  }

  function alExportar() {
    if (!curva || !teoricaPura || !puntoA || !puntoB) return;
    const todas = cargasConPosicion();
    const teoricaEnR = curva.muestras.map((m) => puntoTeoricoEnR(curva.cargaRefQ, m.r));
    const cargasMeta: CargaParaMetadatos[] = todas.map((c) => ({ id: c.id, q: c.q, x: c.x, y: c.y }));
    descargarTexto(
      nombreArchivoCSV("distancia", "cargas-en-reposo"),
      construirCSVDistancia(curva, teoricaEnR, teoricaPura, cargasMeta, { a: puntoA, b: puntoB }),
    );
    mostrarAvisoCsv("CSV descargado.");
  }

  return (
    <section className="panel-grafica" aria-labelledby={idTitulo}>
      <h2 id={idTitulo} className="panel-grafica-titulo">
        Campo y potencial contra la distancia
      </h2>
      {!activoQ0 ? (
        <p className="panel-grafica-nota">
          Activa la sonda q₀ para fijar la recta A→B (arrástrala y usa "Fijar A"/"Fijar B" abajo).
        </p>
      ) : (
        <>
          <p className="panel-sonda-ayuda">
            Arrastra q₀ a un punto, pulsa "Fijar A"; muévela a otro punto, pulsa "Fijar B". La carga de
            referencia es la única que haya en la escena, o la que tengas seleccionada.
          </p>
          <div className="panel-grafica-controles">
            <button type="button" className="boton-colocar" onClick={fijarA}>
              Fijar A{puntoA ? " ✓" : ""}
            </button>
            <button type="button" className="boton-colocar" onClick={fijarB}>
              Fijar B{puntoB ? " ✓" : ""}
            </button>
            <button type="button" className="boton-colocar" onClick={graficar} disabled={!puntoA || !puntoB}>
              Graficar
            </button>
          </div>
        </>
      )}
      {curva && (
        <>
          <div className="panel-grafica-pestanas" role="group" aria-label="Variable a graficar">
            <button
              type="button"
              aria-pressed={variable === "e"}
              className={`pestana-grafica${variable === "e" ? " activa" : ""}`}
              onClick={() => alCambiarVariable("e")}
            >
              Campo |E|
            </button>
            <button
              type="button"
              aria-pressed={variable === "v"}
              className={`pestana-grafica${variable === "v" ? " activa" : ""}`}
              onClick={() => alCambiarVariable("v")}
            >
              Potencial V
            </button>
          </div>
          <canvas
            ref={canvasRef}
            width={ANCHO}
            height={ALTO}
            className="lienzo-grafica"
            role="img"
            aria-label={`Gráfica log-log de ${variable === "e" ? "campo eléctrico" : "potencial"} contra la distancia a la carga de referencia, medido y teórico`}
          />
          <ul className="panel-grafica-leyenda">
            <li>
              <span className="muestra-color" style={{ backgroundColor: COLOR_MEDIDO, color: COLOR_MEDIDO }} /> Medido (todas las cargas)
            </li>
            <li>
              <span className="muestra-color muestra-guion" style={{ backgroundColor: COLOR_TEORICO, color: COLOR_TEORICO }} /> Teórico (solo
              la carga de referencia)
            </li>
          </ul>
          <div className="panel-grafica-controles">
            <button type="button" className="boton-colocar" onClick={limpiar}>
              Limpiar
            </button>
            <button type="button" className="boton-colocar" onClick={alExportar}>
              Exportar CSV
            </button>
          </div>
          {avisoCsv && (
            <p className="panel-grafica-aviso" aria-live="polite">
              {avisoCsv}
            </p>
          )}
        </>
      )}
      {mensaje && <p className="panel-grafica-nota">{mensaje}</p>}
      <p className="panel-grafica-nota">
        La curva teórica es de una sola carga aislada: si la medida se aparta, es la superposición de las
        demás cargas, no un error de medición.
      </p>
    </section>
  );
}
