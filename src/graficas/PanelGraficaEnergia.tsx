/**
 * Gráfica vs. tiempo de K/U/E ("Cargas en movimiento", E4.1 §1). Canvas 2D
 * PROPIO, independiente del canvas principal: no comparte su `rAF` ni su
 * `useEscalaCss` (E4.1 §6). La ingesta es un `useEffect` que se dispara
 * cuando `simulacionDinamicaStore.energia` cambia (4 Hz, ya throttled por el
 * Worker -- E2.5 §2.3): nunca un `setInterval` nuevo. Redibuja ahí mismo (con
 * 80 puntos por curva el costo es trivial, muy por debajo del tope de 10 Hz
 * de la spec), así que jamás compite con los ≥ 50 fps del canvas principal.
 */
import { useCallback, useEffect, useId, useRef, useState, type RefObject } from "react";
import { useAvisoTemporal } from "../hooks/useAvisoTemporal";
import type { ControladorEscena } from "../render/controladorEscena";
import { useSimulacionDinamicaStore } from "../store/simulacionDinamicaStore";
import { INTERVALO_ESPERADO_ENERGIA_S, VENTANA_TIEMPO_S, crearColeccionEnergia, empujarEnergia } from "./adaptadores";
import { ajustarDprCanvas } from "./ajustarDprCanvas";
import {
  COLOR_E,
  COLOR_K,
  COLOR_U,
  autoescala,
  dibujarEjesLineales,
  dibujarTrazo,
  insertarCortesPorHueco,
  limpiarLienzo,
} from "./dibujoGrafica";
import { construirCSVEnergia, descargarTexto, nombreArchivoCSV, type CargaParaMetadatos } from "./exportarCSV";

const ANCHO = 300;
const ALTO = 180;

interface Props {
  controladorRef?: RefObject<ControladorEscena | null>;
}

export function PanelGraficaEnergia({ controladorRef }: Props) {
  const energia = useSimulacionDinamicaStore((s) => s.energia);
  const cargas = useSimulacionDinamicaStore((s) => s.cargas);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [coleccion] = useState(() => crearColeccionEnergia());
  const [pausado, setPausado] = useState(false);
  const [avisoCsv, mostrarAvisoCsv] = useAvisoTemporal();
  // Se fija en el `useEffect` de montaje (nunca durante el render) para no llamar a una
  // función impura (`performance.now`) en el cuerpo del componente.
  const t0Ref = useRef(0);
  const idTitulo = useId();

  const redibujar = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = ajustarDprCanvas(canvas, ANCHO, ALTO);
    if (!ctx) return;
    limpiarLienzo(ctx, ANCHO, ALTO);
    const kSerie = coleccion.serie("K")!.leer(VENTANA_TIEMPO_S);
    const uSerie = coleccion.serie("U")!.leer(VENTANA_TIEMPO_S);
    const eSerie = coleccion.serie("E")!.leer(VENTANA_TIEMPO_S);
    const tUltimo = Math.max(
      kSerie[kSerie.length - 1]?.t ?? 0,
      uSerie[uSerie.length - 1]?.t ?? 0,
      eSerie[eSerie.length - 1]?.t ?? 0,
    );
    const dominioX: [number, number] =
      tUltimo > VENTANA_TIEMPO_S ? [tUltimo - VENTANA_TIEMPO_S, tUltimo] : [0, VENTANA_TIEMPO_S];
    const todos = [...kSerie, ...uSerie, ...eSerie].map((m) => m.valor);
    const dominioY = autoescala(todos, 0.1, true);
    const { mapX, mapY } = dibujarEjesLineales(ctx, ANCHO, ALTO, dominioX, dominioY, "J");
    // Corte honesto por hueco (hallazgo Crítico de `fisico-revisor`, E4.1 §1.3): sin esto, pausar
    // y reanudar la gráfica dibujaría una línea recta uniendo el punto de antes de la pausa con el
    // de después, en vez del corte que pide la spec (`serie.leer()` nunca produce `NaN`).
    dibujarTrazo(
      ctx,
      insertarCortesPorHueco(uSerie, INTERVALO_ESPERADO_ENERGIA_S).map((m) => ({ x: mapX(m.t), y: mapY(m.valor) })),
      COLOR_U,
      { guion: [5, 3] },
    );
    dibujarTrazo(
      ctx,
      insertarCortesPorHueco(kSerie, INTERVALO_ESPERADO_ENERGIA_S).map((m) => ({ x: mapX(m.t), y: mapY(m.valor) })),
      COLOR_K,
    );
    dibujarTrazo(
      ctx,
      insertarCortesPorHueco(eSerie, INTERVALO_ESPERADO_ENERGIA_S).map((m) => ({ x: mapX(m.t), y: mapY(m.valor) })),
      COLOR_E,
      { grosor: 2.2 },
    );
  }, [coleccion]);

  // Fija el origen del eje X y dibuja el marco vacío al montar (antes de la primera muestra).
  useEffect(() => {
    t0Ref.current = performance.now();
    redibujar();
  }, [redibujar]);

  useEffect(() => {
    if (!energia || pausado) return;
    const tS = (performance.now() - t0Ref.current) / 1000;
    empujarEnergia(coleccion, energia, tS);
    redibujar();
  }, [energia, pausado, coleccion, redibujar]);

  function alLimpiar() {
    coleccion.vaciar();
    t0Ref.current = performance.now();
    redibujar();
  }

  function alExportar() {
    const cargasMeta: CargaParaMetadatos[] = cargas.map((c) => ({
      id: c.id,
      q: c.q,
      x: controladorRef?.current?.posicion(c.id)?.x ?? 0,
      y: controladorRef?.current?.posicion(c.id)?.y ?? 0,
    }));
    descargarTexto(
      nombreArchivoCSV("energia", "cargas-en-movimiento"),
      construirCSVEnergia(coleccion, cargasMeta),
    );
    mostrarAvisoCsv("CSV descargado.");
  }

  return (
    <section className="panel-grafica" aria-labelledby={idTitulo}>
      <h2 id={idTitulo} className="panel-grafica-titulo">
        Energía en el tiempo
        <span className="panel-grafica-subtitulo"> · escala del modelo, últimos {VENTANA_TIEMPO_S} s</span>
      </h2>
      <canvas ref={canvasRef} width={ANCHO} height={ALTO} className="lienzo-grafica" role="img"
        aria-label="Gráfica de energía cinética, potencial y total contra el tiempo real transcurrido" />
      <ul className="panel-grafica-leyenda">
        <li>
          <span className="muestra-color" style={{ backgroundColor: COLOR_K, color: COLOR_K }} /> Cinética (K)
        </li>
        <li>
          <span className="muestra-color muestra-guion" style={{ backgroundColor: COLOR_U, color: COLOR_U }} /> Potencial (U)
        </li>
        <li>
          <span className="muestra-color" style={{ backgroundColor: COLOR_E, color: COLOR_E }} /> Total (K + U)
        </li>
      </ul>
      <div className="panel-grafica-controles">
        <button type="button" className="boton-colocar" aria-pressed={pausado} onClick={() => setPausado((p) => !p)}>
          {pausado ? "Reanudar gráfica" : "Pausar gráfica"}
        </button>
        <button type="button" className="boton-colocar" onClick={alLimpiar}>
          Limpiar gráfica
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
      <p className="panel-grafica-nota">
        Un tramo plano durante la pausa de la simulación demuestra que nada cambia sin que intervengas.
      </p>
    </section>
  );
}
