/**
 * Controles de la Estación 05 (Ley de Gauss). Orden: Figura (Esfera · Cubo · Cilindro · Plano, tamaño y, con Plano, la
 * inclinación θ), Fuente (Una carga | Dipolo, signo, magnitud q, Recolocar), Qué se muestra, La vista y un panel
 * «Avanzado» plegado (x, y de la carga seleccionada, azimut, inclinación, zoom, opacidad). Todo es estado de UI
 * (`store/gauss3dStore.ts`); x, y viven en el controlador.
 *
 * Alternativas al arrastre (WCAG 2.5.7): flechas del teclado sobre el lienzo enfocado (en `CanvasGauss3D`), x/y
 * numéricos, botones ±15° de azimut y chips +q / −q para elegir la carga que se mueve (en dipolo).
 */
import { useId, useState, type ReactNode, type RefObject } from "react";
import { Q_MAX, Q_MIN, Q_PASO } from "../fisica/carga";
import { formatDistancia } from "../fisica/escala";
import { RANGOS } from "../fisica/gauss3d/constantes";
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
import type { Fuente } from "../fisica/gauss3d/presets";
import type { TipoSuperficie } from "../fisica/gauss3d/tipos";
import { SelectorSegmentado, type OpcionSegmentada } from "./SelectorSegmentado";

const FORMAS: ReadonlyArray<{ id: TipoSuperficie; nombre: string }> = [
  { id: "esfera", nombre: "Esfera" },
  { id: "cubo", nombre: "Cubo" },
  { id: "cilindro", nombre: "Cilindro" },
  { id: "parche", nombre: "Plano" },
];

const FUENTES: readonly OpcionSegmentada<Fuente>[] = [
  { valor: "carga", etiqueta: "Una carga" },
  { valor: "dipolo", etiqueta: "Dipolo" },
];

const MEDIDA: Record<TipoSuperficie, string> = {
  parche: "lado",
  esfera: "radio",
  cubo: "lado",
  cilindro: "radio",
};

const PASO_GIRO_DEG = 15;

/** Icono simple de cada figura (decorativo: el nombre ya está en el botón). */
function IconoForma({ forma }: { forma: TipoSuperficie }) {
  const trazo = {
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.6,
    strokeLinejoin: "round",
    strokeLinecap: "round",
  } as const;
  return (
    <svg className="gauss3d-icono" viewBox="0 0 24 24" width="24" height="24" aria-hidden="true" focusable="false">
      {forma === "esfera" && (
        <>
          <circle cx="12" cy="12" r="8" {...trazo} />
          <ellipse cx="12" cy="12" rx="8" ry="3" {...trazo} strokeDasharray="2 2" />
        </>
      )}
      {forma === "cubo" && <path d="M4 9 L10 5 L20 5 L20 15 L14 19 L4 19 Z M4 9 L14 9 L14 19 M14 9 L20 5" {...trazo} />}
      {forma === "cilindro" && (
        <>
          <ellipse cx="12" cy="6" rx="6" ry="2.5" {...trazo} />
          <path d="M6 6 V18 A6 2.5 0 0 0 18 18 V6" {...trazo} />
        </>
      )}
      {forma === "parche" && <path d="M3 17 L9 7 H21 L15 17 Z" {...trazo} />}
    </svg>
  );
}

interface Props {
  controladorRef: RefObject<ControladorGauss3D | null>;
  /** Texto para la región viva de la página. */
  anunciar: (texto: string) => void;
  /** Id del párrafo de ayuda de movimiento (lo referencia el lienzo con aria-describedby). */
  idAyuda: string;
  /** Contenido justo bajo el bloque Fuente (los textos educativos en móvil). */
  bajoFuente?: ReactNode;
  /** Contenido bajo los interruptores (la leyenda, que en pantallas anchas y bajas se muestra aquí y no bajo el lienzo). */
  bajoInterruptores?: ReactNode;
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

export function PanelGauss3D({ controladorRef, anunciar, idAyuda, bajoFuente, bajoInterruptores }: Props) {
  const fuente = useGauss3dStore((s) => s.fuente);
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
  const xy = lectura?.xy[seleccionada] ?? [0, 0];
  const esDipolo = fuente === "dipolo";

  /** Fin de un gesto de deslizador: refina ya la calidad. */
  const alSoltar = {
    onPointerUp: () => controladorRef.current?.soltar(),
    onPointerCancel: () => controladorRef.current?.soltar(),
    onKeyUp: () => controladorRef.current?.soltar(),
    onBlur: () => controladorRef.current?.soltar(),
  };

  function elegirFuente(f: Fuente) {
    if (f === fuente) return;
    acc().setFuente(f);
    controladorRef.current?.soltar();
    anunciar(
      f === "dipolo"
        ? "Fuente: dipolo, una carga positiva y una negativa, en su posición inicial."
        : "Fuente: una carga, en su posición inicial.",
    );
  }

  function elegirForma(f: TipoSuperficie) {
    if (f === forma) return;
    acc().setForma(f);
    controladorRef.current?.soltar();
    anunciar(`Figura: ${FORMAS.find((x) => x.id === f)?.nombre.toLowerCase()}. Cargas en su posición inicial.`);
  }

  function elegirCargaDipolo(indice: number) {
    if (indice < 0 || indice === seleccionada) return;
    acc().seleccionar(indice);
    anunciar(`Seleccionada la carga ${cargas[indice].q > 0 ? "positiva" : "negativa"}.`);
  }

  function cambiarSigno() {
    acc().alternarSigno();
    controladorRef.current?.soltar();
    anunciar(
      esDipolo
        ? "Polaridad del dipolo intercambiada."
        : `La carga es ahora ${carga && carga.q > 0 ? "negativa" : "positiva"}.`,
    );
  }

  function recolocar() {
    acc().recolocar();
    controladorRef.current?.soltar();
    anunciar(esDipolo ? "Dipolo recolocado en su posición inicial." : "Carga recolocada en su posición inicial.");
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
  const idPositiva = cargas.findIndex((c) => c.q > 0);
  const idNegativa = cargas.findIndex((c) => c.q < 0);

  return (
    <section className="panel-dipolo gauss3d-panel" aria-label="Controles de la figura y las cargas">
      <div className="panel-dipolo-grupo">
        <h2 className="panel-dipolo-titulo">Figura</h2>
        <div className="gauss3d-formas" role="group" aria-label="Figura">
          {FORMAS.map((f) => (
            <button
              key={f.id}
              type="button"
              className="gauss3d-boton gauss3d-boton-forma"
              aria-pressed={f.id === forma}
              onClick={() => elegirForma(f.id)}
            >
              <IconoForma forma={f.id} />
              {f.nombre}
            </button>
          ))}
        </div>
        <label className="control-deslizador control-deslizador-apilado">
          <span>Tamaño ({MEDIDA[forma]})</span>
          <input
            type="range"
            min={rango.min}
            max={rango.max}
            step={rango.paso}
            value={tamano}
            aria-label={`Tamaño de la figura: ${MEDIDA[forma]}, entre ${formatDistancia(uAMetros(rango.min))} y ${formatDistancia(uAMetros(rango.max))}`}
            aria-valuetext={`${MEDIDA[forma]} de ${tamanoTexto}`}
            onChange={(e) => acc().setTamano(Number(e.target.value))}
            {...alSoltar}
          />
          <output>{tamanoTexto}</output>
        </label>
        {forma === "parche" && (
          <label className="control-deslizador control-deslizador-apilado">
            <span>Inclinación del plano (θ)</span>
            <input
              type="range"
              min={0}
              max={THETA_MAX_DEG}
              step={5}
              value={thetaDeg}
              aria-label="Inclinación del plano, en grados"
              aria-valuetext={`${thetaDeg} grados`}
              onChange={(e) => acc().setThetaDeg(Number(e.target.value))}
              {...alSoltar}
            />
            <output>{thetaDeg}°</output>
          </label>
        )}
      </div>

      <div className="panel-dipolo-grupo">
        <h2 className="panel-dipolo-titulo">Fuente</h2>
        <SelectorSegmentado etiquetaGrupo="Fuente" opciones={FUENTES} valor={fuente} alElegir={elegirFuente} />
        {esDipolo && (
          <div className="gauss3d-cargas" role="group" aria-label="Carga que se mueve con las flechas y la altura z">
            {(
              [
                [idPositiva, "+q", "carga positiva", true],
                [idNegativa, "−q", "carga negativa", false],
              ] as const
            ).map(([i, corto, largo, positiva]) => (
              <button
                key={corto}
                type="button"
                className={`sonda-chip${i === seleccionada ? " seleccionada" : ""}`}
                aria-pressed={i === seleccionada}
                onClick={() => elegirCargaDipolo(i)}
              >
                <span className={positiva ? "carga-positiva" : "carga-negativa"} aria-hidden="true">
                  ●
                </span>
                &nbsp;{corto}
                <span className="sr-only"> ({largo})</span>
              </button>
            ))}
          </div>
        )}
        {carga && (
          <>
            <button type="button" className="boton-colocar" data-activo={carga.q < 0} onClick={cambiarSigno}>
              {esDipolo ? "Invertir polaridad" : "Invertir signo"} · <span aria-hidden="true">{carga.q > 0 ? "+" : "−"}</span>
              <span className="sr-only">ahora {carga.q > 0 ? "positiva" : "negativa"}</span>
            </button>
            <label className="control-deslizador control-deslizador-apilado">
              <span>Magnitud {esDipolo ? "de las cargas" : "de la carga"} (q)</span>
              <input
                type="range"
                min={Q_MIN}
                max={Q_MAX}
                step={Q_PASO}
                value={Math.abs(carga.q)}
                aria-label={`Magnitud ${esDipolo ? "de las dos cargas" : "de la carga"}, entre ${decimal(Q_MIN)} y ${decimal(Q_MAX)} microcoulombs`}
                aria-valuetext={`${decimal(Math.abs(carga.q))} µC`}
                onChange={(e) => acc().setQ(Number(e.target.value))}
                {...alSoltar}
              />
              <output>{textoQ(carga.q)}</output>
            </label>
          </>
        )}
        <button type="button" className="boton-colocar" onClick={recolocar}>
          Recolocar
        </button>
        {bajoFuente}
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
        {bajoInterruptores}
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
            <div
              className="gauss3d-fila"
              role="group"
              aria-label={`Posición de la carga${esDipolo ? (carga.q > 0 ? " positiva" : " negativa") : ""} en el suelo`}
            >
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
