/**
 * Gráfica vs. tiempo secundaria de |E|/V/|F| en la posición de q₀ ("Cargas en
 * reposo", E4.1 §2): solo existe si la sonda q₀ está activa (E3.1 §0: q₀ no
 * existe en "Cargas en movimiento"). Un "osciloscopio" de lo que ya muestra
 * `PanelSondaQ0`: un selector de variable (pestañas E/V/F, escalas no
 * comparables, §2.3) porque difieren en varios órdenes de magnitud.
 *
 * Ingesta: `useEffect` sobre `cargaPruebaStore.lectura` (~10 Hz, ya
 * publicado por el bucle de dibujo del canvas principal -- E3.1 §6). Mismo
 * canvas propio y mismo criterio de redibujo bajo demanda que
 * `PanelGraficaEnergia` (E4.1 §6).
 */
import { useCallback, useEffect, useId, useRef, useState, type RefObject } from "react";
import { useAvisoTemporal } from "../hooks/useAvisoTemporal";
import type { ControladorEscena } from "../render/controladorEscena";
import { useCargaPruebaStore } from "../store/cargaPruebaStore";
import { useSimulacionStore } from "../store/simulacionStore";
import { INTERVALO_ESPERADO_Q0_S, VENTANA_TIEMPO_S, crearColeccionQ0, empujarLecturaQ0 } from "./adaptadores";
import { ajustarDprCanvas } from "./ajustarDprCanvas";
import {
  COLOR_ACTIVO,
  autoescala,
  dibujarEjesLineales,
  dibujarTrazo,
  insertarCortesPorHueco,
  limpiarLienzo,
} from "./dibujoGrafica";
import { construirCSVQ0, descargarTexto, nombreArchivoCSV, type CargaParaMetadatos } from "./exportarCSV";

const ANCHO = 300;
const ALTO = 160;

type Variable = "moduloE" | "v" | "moduloF";

const PESTANAS: { clave: Variable; etiqueta: string; unidad: string }[] = [
  { clave: "moduloE", etiqueta: "Campo |E|", unidad: "N/C" },
  { clave: "v", etiqueta: "Potencial V", unidad: "V" },
  { clave: "moduloF", etiqueta: "Fuerza |F|", unidad: "N" },
];

interface Props {
  controladorRef?: RefObject<ControladorEscena | null>;
}

export function PanelGraficaQ0({ controladorRef }: Props) {
  const activo = useCargaPruebaStore((s) => s.activo);
  const lectura = useCargaPruebaStore((s) => s.lectura);
  const cargas = useSimulacionStore((s) => s.cargas);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [coleccion] = useState(() => crearColeccionQ0());
  const [pausado, setPausado] = useState(false);
  const [variable, setVariable] = useState<Variable>("moduloE");
  const [avisoCsv, mostrarAvisoCsv] = useAvisoTemporal();
  // Se fija en un `useEffect` (nunca durante el render) para no llamar a una función
  // impura (`performance.now`) en el cuerpo del componente.
  const t0Ref = useRef(0);
  const idTitulo = useId();

  const redibujar = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = ajustarDprCanvas(canvas, ANCHO, ALTO);
    if (!ctx) return;
    limpiarLienzo(ctx, ANCHO, ALTO);
    const pestana = PESTANAS.find((p) => p.clave === variable)!;
    const serie = coleccion.serie(variable)!.leer(VENTANA_TIEMPO_S);
    // Corte honesto por hueco (hallazgo Crítico de `fisico-revisor`, E4.1 §2.2): `serie.leer()`
    // nunca produce `NaN` (su `push()` descarta valores no finitos), así que sin esto la lectura
    // `null` de q₀ cerca de una carga -- o pausar/reanudar la gráfica -- dibujaría una línea recta
    // uniendo el punto anterior y el siguiente, en vez del corte honesto que pide la spec.
    const conCortes = insertarCortesPorHueco(serie, INTERVALO_ESPERADO_Q0_S);
    const tUltimo = serie[serie.length - 1]?.t ?? 0;
    const dominioX: [number, number] =
      tUltimo > VENTANA_TIEMPO_S ? [tUltimo - VENTANA_TIEMPO_S, tUltimo] : [0, VENTANA_TIEMPO_S];
    const dominioY = autoescala(serie.map((m) => m.valor), 0.1, true);
    const { mapX, mapY } = dibujarEjesLineales(ctx, ANCHO, ALTO, dominioX, dominioY, pestana.unidad);
    dibujarTrazo(
      ctx,
      conCortes.map((m) => ({ x: mapX(m.t), y: mapY(m.valor) })),
      COLOR_ACTIVO,
      { grosor: 1.8 },
    );
  }, [coleccion, variable]);

  useEffect(() => {
    if (t0Ref.current === 0) t0Ref.current = performance.now();
  }, []);

  useEffect(() => {
    if (!activo) return;
    if (!pausado) {
      const tS = (performance.now() - t0Ref.current) / 1000;
      empujarLecturaQ0(coleccion, lectura, tS);
    }
    redibujar();
  }, [lectura, activo, pausado, coleccion, redibujar]);

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
    descargarTexto(nombreArchivoCSV("q0", "cargas-en-reposo"), construirCSVQ0(coleccion, cargasMeta));
    mostrarAvisoCsv("CSV descargado.");
  }

  return (
    <section className="panel-grafica" aria-labelledby={idTitulo}>
      <h2 id={idTitulo} className="panel-grafica-titulo">
        E/V/F en q₀, en el tiempo
        <span className="panel-grafica-subtitulo"> · últimos {VENTANA_TIEMPO_S} s</span>
      </h2>
      {/* Persiste con un aviso en vez de ocultarse por completo si q₀ está inactiva -- mismo
          criterio que `PanelGraficaDistancia` (corrección post revisión UI, antes eran
          inconsistentes entre sí: uno se ocultaba, el otro avisaba). */}
      {!activo ? (
        <p className="panel-grafica-nota">Activa la sonda q₀ para ver esta gráfica.</p>
      ) : (
        <>
          <div className="panel-grafica-pestanas" role="group" aria-label="Variable a graficar">
            {PESTANAS.map((p) => (
              <button
                key={p.clave}
                type="button"
                aria-pressed={variable === p.clave}
                className={`pestana-grafica${variable === p.clave ? " activa" : ""}`}
                onClick={() => setVariable(p.clave)}
              >
                {p.etiqueta}
              </button>
            ))}
          </div>
          <canvas
            ref={canvasRef}
            width={ANCHO}
            height={ALTO}
            className="lienzo-grafica"
            role="img"
            aria-label={`Gráfica de ${PESTANAS.find((p) => p.clave === variable)!.etiqueta} en la posición de q₀ contra el tiempo`}
          />
          {!lectura && (
            <p className="panel-grafica-nota">Sin dato ahora mismo: q₀ está demasiado cerca de una carga.</p>
          )}
          <div className="panel-grafica-controles">
            <button
              type="button"
              className="boton-colocar"
              aria-pressed={pausado}
              onClick={() => setPausado((p) => !p)}
            >
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
        </>
      )}
    </section>
  );
}
