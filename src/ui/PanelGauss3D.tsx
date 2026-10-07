/**
 * Controles de la Estación 05 (Ley de Gauss). Panel reducido: 3 deslizadores visibles (tamaño de la superficie, q de
 * la carga seleccionada y, junto al lienzo, su altura z), botones de forma, añadir/quitar carga y vista inicial,
 * 3 interruptores (líneas, flujo, campo E), los 9 escenarios y un panel «Avanzado» plegado (x, y, θ, azimut,
 * inclinación, zoom, opacidad). Todo es estado de UI (`store/gauss3dStore.ts`); x, y viven en el controlador.
 *
 * Alternativas al arrastre (WCAG 2.5.7): flechas del teclado sobre el lienzo enfocado (en `CanvasGauss3D`), x/y
 * numéricos, botones ±15° de azimut y selector de carga.
 */
import { useId, useState, type ReactNode, type RefObject } from "react";
import { Q_MAX, Q_MIN, Q_PASO } from "../fisica/carga";
import { formatDistancia } from "../fisica/escala";
import { MAX_CARGAS, RANGOS } from "../fisica/gauss3d/constantes";
import { ESCENARIOS } from "../fisica/gauss3d/escenarios";
import { uAMetros } from "../fisica/gauss3d/unidades";
import type { ControladorGauss3D } from "../render/controladorGauss3d";
import {
  INCLINACION_MAX_DEG,
  INCLINACION_MIN_DEG,
  OPACIDAD_MAX,
  OPACIDAD_MIN,
  THETA_MAX_DEG,
  ZOOM_MAX,
  ZOOM_MIN,
  rangoTamano,
  useGauss3dStore,
} from "../store/gauss3dStore";
import type { TipoSuperficie } from "../fisica/gauss3d/tipos";

/** Nombre corto de cada escenario (botones 1–9); el nombre completo va en `title` y en el aria-label. */
const NOMBRE_CORTO: Record<number, string> = {
  1: "Parche",
  2: "Cerrada",
  3: "Dentro",
  4: "Tamaño",
  5: "Formas",
  6: "Cruza",
  7: "Dipolo",
  8: "Abierta",
  9: "Útil",
};

const FORMAS: ReadonlyArray<{ id: TipoSuperficie; nombre: string }> = [
  { id: "parche", nombre: "Parche" },
  { id: "esfera", nombre: "Esfera" },
  { id: "cubo", nombre: "Cubo" },
  { id: "cilindro", nombre: "Cilindro" },
];

const MEDIDA: Record<TipoSuperficie, string> = {
  parche: "lado",
  esfera: "radio",
  cubo: "lado",
  cilindro: "radio",
};

const PASO_GIRO_DEG = 15;

interface Props {
  controladorRef: RefObject<ControladorGauss3D | null>;
  /** Texto para la región viva de la página. */
  anunciar: (texto: string) => void;
  /** Id del párrafo de ayuda de movimiento (lo referencia el lienzo con aria-describedby). */
  idAyuda: string;
  /** Contenido justo bajo los botones de escenario (los textos educativos en móvil). */
  bajoEscenarios?: ReactNode;
}

/** Entero con coma decimal como el resto de la interfaz: «2,5». */
const decimal = (v: number, d = 1) => v.toFixed(d).replace(".", ",");

function textoQ(q: number): string {
  return `${q > 0 ? "+" : "−"}${decimal(Math.abs(q), Math.abs(q) % 1 === 0 ? 0 : 1)} µC`;
}

/** Número editable que se sincroniza con el valor externo salvo mientras se escribe. */
function CampoNumerico({
  etiqueta,
  valor,
  min,
  max,
  paso,
  alCambiar,
}: {
  etiqueta: string;
  valor: number;
  min: number;
  max: number;
  paso: number;
  alCambiar: (v: number) => void;
}) {
  // null = no se está escribiendo: se muestra el valor externo (que sigue al arrastre y a las flechas)
  const [texto, setTexto] = useState<string | null>(null);
  return (
    <label className="gauss3d-numerico">
      <span>{etiqueta}</span>
      <input
        type="number"
        inputMode="decimal"
        min={min}
        max={max}
        step={paso}
        value={texto ?? valor.toFixed(1)}
        onFocus={() => setTexto(valor.toFixed(1))}
        onBlur={() => setTexto(null)}
        onChange={(e) => {
          setTexto(e.target.value);
          const v = Number(e.target.value);
          if (e.target.value !== "" && Number.isFinite(v)) alCambiar(v);
        }}
      />
    </label>
  );
}

export function PanelGauss3D({ controladorRef, anunciar, idAyuda, bajoEscenarios }: Props) {
  const escenarioId = useGauss3dStore((s) => s.escenarioId);
  const fuera = useGauss3dStore((s) => s.fuera);
  const forma = useGauss3dStore((s) => s.forma);
  const tamano = useGauss3dStore((s) => s.tamano);
  const thetaDeg = useGauss3dStore((s) => s.thetaDeg);
  const cargas = useGauss3dStore((s) => s.cargas);
  const seleccionada = useGauss3dStore((s) => s.seleccionada);
  const mostrar = useGauss3dStore((s) => s.mostrar);
  const azimutDeg = useGauss3dStore((s) => s.azimutDeg);
  const inclinacionDeg = useGauss3dStore((s) => s.inclinacionDeg);
  const zoom = useGauss3dStore((s) => s.zoom);
  const opacidad = useGauss3dStore((s) => s.opacidad);
  const lectura = useGauss3dStore((s) => s.lectura);
  const acc = useGauss3dStore.getState;
  const idInterruptores = useId();

  const carga = cargas[seleccionada];
  const rango = rangoTamano(forma);
  const def = ESCENARIOS[escenarioId - 1];
  const xy = lectura?.xy[seleccionada] ?? [0, 0];

  /** Fin de un gesto de deslizador: refina ya la calidad. */
  const alSoltar = {
    onPointerUp: () => controladorRef.current?.soltar(),
    onPointerCancel: () => controladorRef.current?.soltar(),
    onKeyUp: () => controladorRef.current?.soltar(),
    onBlur: () => controladorRef.current?.soltar(),
  };

  function elegirEscenario(id: number) {
    acc().aplicarEscenario(id);
    controladorRef.current?.soltar();
    anunciar(`Escenario ${id}: ${ESCENARIOS[id - 1].nombre}.`);
  }

  function alternarFuera() {
    acc().aplicarEscenario(3, { fuera: !fuera, conservarVista: true });
    controladorRef.current?.soltar();
    anunciar(fuera ? "La carga está dentro de la superficie." : "La carga está fuera de la superficie.");
  }

  function elegirForma(f: TipoSuperficie) {
    if (f === forma) return;
    acc().setForma(f);
    controladorRef.current?.soltar();
    anunciar(`Superficie: ${FORMAS.find((x) => x.id === f)?.nombre.toLowerCase()}.`);
  }

  function cambiarSigno() {
    acc().alternarSigno();
    controladorRef.current?.soltar();
    anunciar(`La carga ${seleccionada + 1} es ahora ${carga && carga.q > 0 ? "negativa" : "positiva"}.`);
  }

  function anadir() {
    acc().anadirCarga();
    controladorRef.current?.soltar();
    anunciar("Carga añadida: ahora hay dos. La nueva es la seleccionada.");
  }

  function quitar() {
    acc().quitarCarga();
    controladorRef.current?.soltar();
    anunciar("Carga quitada: queda una.");
  }

  function girar(delta: number) {
    controladorRef.current?.girarVistaDeg(delta);
    anunciar(`Vista girada ${delta > 0 ? "a la derecha" : "a la izquierda"} ${PASO_GIRO_DEG}°.`);
  }

  function vistaInicial() {
    acc().vistaInicial();
    anunciar("Vista inicial restablecida.");
  }

  const tamanoTexto = formatDistancia(uAMetros(tamano));

  return (
    <section className="panel-dipolo gauss3d-panel" aria-label="Controles de la superficie y las cargas">
      <div className="panel-dipolo-grupo">
        <h2 className="panel-dipolo-titulo">Escenarios</h2>
        <div className="gauss3d-escenarios" role="group" aria-label="Escenarios">
          {ESCENARIOS.map((e) => (
            <button
              key={e.id}
              type="button"
              className="gauss3d-boton gauss3d-escenario"
              aria-pressed={e.id === escenarioId}
              aria-label={`${e.id} ${NOMBRE_CORTO[e.id]}. ${e.nombre}`}
              title={e.nombre}
              onClick={() => elegirEscenario(e.id)}
            >
              <span aria-hidden="true">
                <strong>{e.id}</strong> {NOMBRE_CORTO[e.id]}
              </span>
            </button>
          ))}
        </div>
        {escenarioId === 3 && def.variante && (
          <button type="button" className="boton-colocar" data-activo={fuera} aria-pressed={fuera} onClick={alternarFuera}>
            {fuera ? "La carga está fuera · ponerla dentro" : "La carga está dentro · ponerla fuera"}
          </button>
        )}
        {bajoEscenarios}
      </div>

      <div className="panel-dipolo-grupo" role="group" aria-labelledby={idInterruptores}>
        <h2 className="panel-dipolo-titulo" id={idInterruptores}>
          Qué se muestra
        </h2>
        <div className="gauss3d-interruptores">
          {(
            [
              ["lineas", "Líneas", "Líneas de campo y marcadores"],
              ["flujo", "Flujo", "Flujo (parches de color)"],
              ["campo", "Campo E", "Campo E (flechas)"],
            ] as const
          ).map(([k, corto, largo]) => (
            <label key={k} className="panel-sonda-check" title={largo}>
              <input type="checkbox" aria-label={largo} checked={mostrar[k]} onChange={(e) => acc().setMostrar(k, e.target.checked)} />
              {corto}
            </label>
          ))}
        </div>
      </div>

      <div className="panel-dipolo-grupo">
        <h2 className="panel-dipolo-titulo">La superficie</h2>
        <div className="gauss3d-formas" role="group" aria-label="Forma de la superficie">
          {FORMAS.map((f) => (
            <button
              key={f.id}
              type="button"
              className="gauss3d-boton"
              aria-pressed={f.id === forma}
              onClick={() => elegirForma(f.id)}
            >
              {f.nombre}
            </button>
          ))}
        </div>
        <label className="control-deslizador control-deslizador-apilado">
          <span>Tamaño de la superficie ({MEDIDA[forma]})</span>
          <input
            type="range"
            min={rango.min}
            max={rango.max}
            step={rango.paso}
            value={tamano}
            aria-label={`Tamaño de la superficie: ${MEDIDA[forma]}, entre ${formatDistancia(uAMetros(rango.min))} y ${formatDistancia(uAMetros(rango.max))}`}
            aria-valuetext={`${MEDIDA[forma]} de ${tamanoTexto}`}
            onChange={(e) => acc().setTamano(Number(e.target.value))}
            {...alSoltar}
          />
          <output>{tamanoTexto}</output>
        </label>
      </div>

      <div className="panel-dipolo-grupo">
        <h2 className="panel-dipolo-titulo">{cargas.length > 1 ? "Las cargas" : "La carga"}</h2>
        {cargas.length > 1 && (
          <div className="gauss3d-cargas" role="group" aria-label="Carga seleccionada">
            {cargas.map((c, i) => (
              <button
                key={c.id}
                type="button"
                className={`sonda-chip${i === seleccionada ? " seleccionada" : ""}`}
                aria-pressed={i === seleccionada}
                onClick={() => acc().seleccionar(i)}
              >
                <span className={c.q > 0 ? "carga-positiva" : "carga-negativa"} aria-hidden="true">
                  ●
                </span>
                &nbsp;Carga {i + 1} · {textoQ(c.q)}
              </button>
            ))}
          </div>
        )}
        {carga && (
          <>
            <button type="button" className="boton-colocar" data-activo={carga.q < 0} onClick={cambiarSigno}>
              Invertir signo · <span aria-hidden="true">{carga.q > 0 ? "+" : "−"}</span>
              <span className="sr-only">ahora {carga.q > 0 ? "positiva" : "negativa"}</span>
            </button>
            <label className="control-deslizador control-deslizador-apilado">
              <span>Magnitud de la carga{cargas.length > 1 ? ` ${seleccionada + 1}` : ""} (q)</span>
              <input
                type="range"
                min={Q_MIN}
                max={Q_MAX}
                step={Q_PASO}
                value={Math.abs(carga.q)}
                aria-label={`Magnitud de la carga ${seleccionada + 1}, entre ${decimal(Q_MIN)} y ${decimal(Q_MAX)} microcoulombs`}
                aria-valuetext={`${carga.q > 0 ? "positiva" : "negativa"}, ${decimal(Math.abs(carga.q))} µC`}
                onChange={(e) => acc().setQ(Number(e.target.value))}
                {...alSoltar}
              />
              <output>{textoQ(carga.q)}</output>
            </label>
          </>
        )}
        <div className="gauss3d-fila">
          <button type="button" className="boton-colocar" disabled={cargas.length >= MAX_CARGAS} onClick={anadir}>
            Añadir carga
          </button>
          <button type="button" className="boton-colocar" disabled={cargas.length <= 1} onClick={quitar}>
            Quitar carga
          </button>
        </div>
      </div>

      <div className="panel-dipolo-grupo">
        <h2 className="panel-dipolo-titulo">La vista</h2>
        <div className="gauss3d-fila">
          <button
            type="button"
            className="boton-paso"
            aria-label={`Girar la vista ${PASO_GIRO_DEG} grados a la izquierda`}
            onClick={() => girar(-PASO_GIRO_DEG)}
          >
            ↺
          </button>
          <button
            type="button"
            className="boton-paso"
            aria-label={`Girar la vista ${PASO_GIRO_DEG} grados a la derecha`}
            onClick={() => girar(PASO_GIRO_DEG)}
          >
            ↻
          </button>
          <button type="button" className="boton-colocar" onClick={vistaInicial}>
            Vista inicial
          </button>
        </div>
      </div>

      <details className="gauss3d-avanzado">
        <summary>Avanzado</summary>
        <div className="panel-dipolo-grupo">
          {carga && (
            <div className="gauss3d-fila" role="group" aria-label={`Posición de la carga ${seleccionada + 1} en el suelo`}>
              <CampoNumerico
                etiqueta="x (cuadros)"
                valor={xy[0]}
                min={RANGOS.carga.x.min}
                max={RANGOS.carga.x.max}
                paso={0.5}
                alCambiar={(v) => controladorRef.current?.fijarXY(seleccionada, v, xy[1])}
              />
              <CampoNumerico
                etiqueta="y (cuadros)"
                valor={xy[1]}
                min={RANGOS.carga.y.min}
                max={RANGOS.carga.y.max}
                paso={0.5}
                alCambiar={(v) => controladorRef.current?.fijarXY(seleccionada, xy[0], v)}
              />
            </div>
          )}
          {forma === "parche" && (
            <label className="control-deslizador control-deslizador-apilado">
              <span>Inclinación del parche (θ)</span>
              <input
                type="range"
                min={0}
                max={THETA_MAX_DEG}
                step={5}
                value={thetaDeg}
                aria-label="Inclinación del parche, en grados"
                aria-valuetext={`${thetaDeg} grados`}
                onChange={(e) => acc().setThetaDeg(Number(e.target.value))}
                {...alSoltar}
              />
              <output>{thetaDeg}°</output>
            </label>
          )}
          <label className="control-deslizador control-deslizador-apilado">
            <span>Azimut de la vista</span>
            <input
              type="range"
              min={-180}
              max={180}
              step={5}
              value={Math.round(azimutDeg)}
              aria-label="Azimut de la vista, en grados"
              aria-valuetext={`${Math.round(azimutDeg)} grados`}
              onChange={(e) => acc().setAzimutDeg(Number(e.target.value))}
            />
            <output>{Math.round(azimutDeg)}°</output>
          </label>
          <label className="control-deslizador control-deslizador-apilado">
            <span>Inclinación de la vista</span>
            <input
              type="range"
              min={INCLINACION_MIN_DEG}
              max={INCLINACION_MAX_DEG}
              step={5}
              value={inclinacionDeg}
              aria-label="Inclinación de la vista, en grados sobre el suelo"
              aria-valuetext={`${inclinacionDeg} grados sobre el suelo`}
              onChange={(e) => acc().setInclinacionDeg(Number(e.target.value))}
            />
            <output>{inclinacionDeg}°</output>
          </label>
          <label className="control-deslizador control-deslizador-apilado">
            <span>Zoom</span>
            <input
              type="range"
              min={ZOOM_MIN}
              max={ZOOM_MAX}
              step={0.1}
              value={zoom}
              aria-label="Zoom de la vista"
              aria-valuetext={`${decimal(zoom)} veces`}
              onChange={(e) => acc().setZoom(Number(e.target.value))}
            />
            <output>{decimal(zoom)}×</output>
          </label>
          <label className="control-deslizador control-deslizador-apilado">
            <span>Opacidad de la superficie</span>
            <input
              type="range"
              min={OPACIDAD_MIN}
              max={OPACIDAD_MAX}
              step={0.05}
              value={opacidad}
              aria-label="Opacidad de la superficie, en por ciento"
              aria-valuetext={`${Math.round(opacidad * 100)} por ciento`}
              onChange={(e) => acc().setOpacidad(Number(e.target.value))}
            />
            <output>{Math.round(opacidad * 100)} %</output>
          </label>
        </div>
      </details>
      <p id={idAyuda} className="ayuda-mover">
        <span className="ayuda-puntero-fino">
          Arrastra una carga por el suelo; con las flechas del teclado (lienzo enfocado) se mueve la seleccionada. Su
          altura es el deslizador vertical. Arrastra en el vacío para girar la vista; ↺ y ↻ la giran {PASO_GIRO_DEG}°.
        </span>{" "}
        <span className="ayuda-puntero-tactil">
          Arrastra una carga por el suelo; su altura es el deslizador vertical junto al lienzo. Arrastra en el vacío para
          girar la vista.
        </span>
      </p>
    </section>
  );
}
