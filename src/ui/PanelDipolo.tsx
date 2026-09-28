/**
 * Controles de la Estación 03 (Dipolos). Todo lo que aquí se cambia es estado
 * de UI (`store/dipoloStore.ts`); las posiciones/ángulo del dipolo y de la
 * carga fuente NO están en este panel: se leen/escriben a través de
 * `ControladorDipolo` (mismo contrato que `ControladorEscena`, ver
 * `render/controladorDipolo.ts`), publicado por `CanvasDipolo.tsx`.
 *
 * Orden (como en las otras estaciones, lo más usado arriba): Pausar/Reiniciar,
 * tipo de campo, controles de ese campo y del dipolo. Los sliders secundarios
 * (q, d) están en `AjustesDipolo`, que la página coloca DESPUÉS de las lecturas.
 *
 * Alternativas al arrastre (WCAG 2.1.1/2.5.7, mismo patrón que
 * `PanelSondaQ0.tsx`): por cada objeto arrastrable (el dipolo siempre; la
 * carga fuente solo en modo "puntual") hay un botón enfocable para moverlo con
 * las flechas (`moverPorTeclado`, reutilizado sin cambios) y otro para
 * "colocar tocando el recuadro" (arma `seleccionStore` y el canvas coloca el
 * objeto donde se toque). Girar el dipolo es SIEMPRE por botones.
 */
import { useEffect, useId, useRef, useState, type KeyboardEvent, type MouseEvent, type RefObject } from "react";
import { D_MAX_PX, D_MIN_PX, D_PASO_PX, VOLTAJE_MAX_KV, VOLTAJE_MIN_KV, VOLTAJE_PASO_KV, type ModoCampoDipolo } from "../fisica/dipolo";
import { Q_MAX, Q_MIN, Q_PASO } from "../fisica/carga";
import { formatDistancia, pxAMetros } from "../fisica/escala";
import type { OrientacionPlacas } from "../fisica/campoExterno";
import { ID_CARGA_FUENTE, ID_DIPOLO, type ControladorDipolo } from "../render/controladorDipolo";
import { esTeclaDeMovimiento, moverPorTeclado } from "../render/controladorEscena";
import { EVENTO_CARGA_COLOCADA, type DetalleCargaColocada } from "../render/eventosEscena";
import { useDipoloStore } from "../store/dipoloStore";
import { useSeleccionStore } from "../store/seleccionStore";
import { SelectorSegmentado, type OpcionSegmentada } from "./SelectorSegmentado";

const PASO_GIRO_RAD = (15 * Math.PI) / 180;
const PASO_GIRO_GRANDE_RAD = (45 * Math.PI) / 180;

const MODOS: OpcionSegmentada<ModoCampoDipolo>[] = [
  {
    valor: "uniforme",
    etiqueta: "Uniforme",
    descripcion: "dos placas paralelas: el dipolo gira y se balancea, pero no se traslada",
  },
  {
    valor: "puntual",
    etiqueta: "Carga puntual",
    descripcion: "una carga que puedes mover: el dipolo se alinea con su campo y es atraído hacia ella",
  },
];

const ORIENTACIONES: OpcionSegmentada<OrientacionPlacas>[] = [
  { valor: "vertical", etiqueta: "Placas arriba/abajo" },
  { valor: "horizontal", etiqueta: "Placas izq./der." },
];

/** Dónde queda la placa positiva, en texto completo y abreviado (según orientación y polaridad). */
function lugarPlacaPositiva(orientacion: OrientacionPlacas, polaridad: 1 | -1): { largo: string; corto: string } {
  if (orientacion === "vertical") {
    return polaridad === 1 ? { largo: "arriba", corto: "arriba" } : { largo: "abajo", corto: "abajo" };
  }
  return polaridad === 1
    ? { largo: "a la izquierda", corto: "izq." }
    : { largo: "a la derecha", corto: "der." };
}

/** "El dipolo movido a …" / "La carga fuente movida a …" (concuerda en género; posiciones desde el borde izquierdo y el superior). */
function textoMovimiento(id: string, x: number, y: number): string {
  const [sujeto, participio] = id === ID_DIPOLO ? ["El dipolo", "movido"] : ["La carga fuente", "movida"];
  return `${sujeto} ${participio} a ${formatDistancia(pxAMetros(x))} del borde izquierdo y ${formatDistancia(pxAMetros(y))} del borde superior.`;
}

/** Si el texto no cambia entre dos anuncios seguidos, un lector de pantalla no lo repite: se le añade un espacio duro. */
function siguienteAnuncio(previo: string, texto: string): string {
  return previo === texto ? `${texto} ` : texto;
}

interface Props {
  controladorRef: RefObject<ControladorDipolo | null>;
}

export function PanelDipolo({ controladorRef }: Props) {
  const modoCampo = useDipoloStore((s) => s.modoCampo);
  const orientacionPlacas = useDipoloStore((s) => s.orientacionPlacas);
  const polaridadPlacas = useDipoloStore((s) => s.polaridadPlacas);
  const voltajeKV = useDipoloStore((s) => s.voltajeKV);
  const qFuenteUC = useDipoloStore((s) => s.qFuenteUC);
  const signoFuente = useDipoloStore((s) => s.signoFuente);
  const mostrarFuerzas = useDipoloStore((s) => s.mostrarFuerzas);
  const enPausa = useDipoloStore((s) => s.enPausa);

  const setModoCampo = useDipoloStore((s) => s.setModoCampo);
  const setOrientacionPlacas = useDipoloStore((s) => s.setOrientacionPlacas);
  const alternarPolaridadPlacas = useDipoloStore((s) => s.alternarPolaridadPlacas);
  const setVoltajeKV = useDipoloStore((s) => s.setVoltajeKV);
  const setQFuenteUC = useDipoloStore((s) => s.setQFuenteUC);
  const alternarSignoFuente = useDipoloStore((s) => s.alternarSignoFuente);
  const setMostrarFuerzas = useDipoloStore((s) => s.setMostrarFuerzas);
  const togglePausa = useDipoloStore((s) => s.togglePausa);

  const seleccionadaId = useSeleccionStore((s) => s.seleccionadaId);
  const colocarConToque = useSeleccionStore((s) => s.colocarConToque);
  const seleccionar = useSeleccionStore((s) => s.seleccionar);
  const dipoloElegido = seleccionadaId === ID_DIPOLO;
  const fuenteElegida = seleccionadaId === ID_CARGA_FUENTE;

  const [anuncio, setAnuncio] = useState("");
  const contenedorRef = useRef<HTMLElement>(null);
  const idAyudaDipolo = useId();
  const idAyudaFuente = useId();
  const idPolaridad = useId();
  const idSignoFuente = useId();

  function anunciar(texto: string) {
    setAnuncio((previo) => siguienteAnuncio(previo, texto));
  }

  // Anuncia la colocación con un toque en el recuadro (el teclado se anuncia en alPulsarTecla).
  useEffect(() => {
    const alColocar = (e: Event) => {
      const { id, x, y } = (e as CustomEvent<DetalleCargaColocada>).detail;
      if (id === ID_DIPOLO || id === ID_CARGA_FUENTE) {
        setAnuncio((previo) => siguienteAnuncio(previo, textoMovimiento(id, x, y)));
      }
    };
    window.addEventListener(EVENTO_CARGA_COLOCADA, alColocar);
    return () => window.removeEventListener(EVENTO_CARGA_COLOCADA, alColocar);
  }, []);

  // La carga fuente solo existe en modo "puntual": si se cambia a "uniforme", no dejar su selección colgada.
  useEffect(() => {
    if (modoCampo !== "puntual" && seleccionadaId === ID_CARGA_FUENTE) seleccionar(null);
  }, [modoCampo, seleccionadaId, seleccionar]);

  function alPulsarTecla(id: string) {
    return (e: KeyboardEvent<HTMLButtonElement>) => {
      if (e.key === "Escape") {
        seleccionar(null);
        return;
      }
      const ctrl = controladorRef.current;
      if (!ctrl || !esTeclaDeMovimiento(e.key)) return;
      e.preventDefault(); // que las flechas no desplacen la página
      const destino = moverPorTeclado(ctrl, id, e.key, e.shiftKey);
      if (destino) anunciar(textoMovimiento(id, destino.x, destino.y));
    };
  }

  /** No borrar la selección si el foco se queda dentro del panel o si el objeto está armado para colocarlo. */
  function alPerderFoco(id: string, siguiente: Node | null) {
    const s = useSeleccionStore.getState();
    if (s.seleccionadaId !== id || s.colocarConToque) return;
    if (siguiente && contenedorRef.current?.contains(siguiente)) return;
    seleccionar(null);
  }

  function alternarArmado(id: string, nombre: string, armado: boolean) {
    if (armado) {
      seleccionar(id, false);
      anunciar("Selección cancelada.");
    } else {
      seleccionar(id, true);
      anunciar(`${nombre[0].toUpperCase()}${nombre.slice(1)} listo para colocar: toca el recuadro.`);
    }
  }

  function alPulsarEscape(e: KeyboardEvent<HTMLButtonElement>) {
    if (e.key === "Escape") seleccionar(null);
  }

  /** Gira el dipolo (15°, o 45° con Mayús) y anuncia el ángulo resultante del eje. */
  function girar(dir: 1 | -1, e: MouseEvent<HTMLButtonElement>) {
    const ctrl = controladorRef.current;
    if (!ctrl) return;
    ctrl.girar(dir * (e.shiftKey ? PASO_GIRO_GRANDE_RAD : PASO_GIRO_RAD));
    anunciar(
      `Dipolo girado ${dir > 0 ? "en sentido horario" : "en sentido antihorario"}. Ángulo del eje: ${((360 - ctrl.anguloDeg()) % 360).toFixed(0)}°.`,
    );
  }

  function reiniciar() {
    controladorRef.current?.reiniciar();
    seleccionar(null);
    anunciar("Dipolo y carga fuente restablecidos a su posición inicial.");
  }

  function cambiarPolaridad() {
    const siguiente = polaridadPlacas === 1 ? -1 : 1;
    alternarPolaridadPlacas();
    anunciar(`La placa positiva queda ${lugarPlacaPositiva(orientacionPlacas, siguiente).largo}.`);
  }

  const placaPositiva = lugarPlacaPositiva(orientacionPlacas, polaridadPlacas);
  const descripcionModo = (MODOS.find((m) => m.valor === modoCampo) ?? MODOS[0]).descripcion ?? "";

  return (
    <section className="panel-dipolo" aria-label="Controles del dipolo" ref={contenedorRef}>
      <p className="sr-only" aria-live="polite">
        {anuncio}
      </p>

      <div className="panel-dipolo-grupo panel-dipolo-acciones">
        <button type="button" className="boton-pausa" onClick={togglePausa}>
          {enPausa ? "Reanudar" : "Pausar"}
        </button>
        <button type="button" className="boton-pausa" onClick={reiniciar}>
          Reiniciar posición
        </button>
      </div>

      <div className="panel-dipolo-grupo">
        <div className="selector-modo-envoltorio">
          <SelectorSegmentado etiquetaGrupo="Tipo de campo" opciones={MODOS} valor={modoCampo} alElegir={setModoCampo} />
          <p className="selector-modo-descripcion" aria-hidden="true">
            {descripcionModo.charAt(0).toUpperCase() + descripcionModo.slice(1)}.
          </p>
        </div>
      </div>

      {modoCampo === "uniforme" ? (
        <div className="panel-dipolo-grupo">
          <SelectorSegmentado
            etiquetaGrupo="Orientación de las placas"
            opciones={ORIENTACIONES}
            valor={orientacionPlacas}
            alElegir={setOrientacionPlacas}
          />
          <button
            type="button"
            className="boton-colocar"
            aria-pressed={polaridadPlacas === -1}
            aria-describedby={idPolaridad}
            onClick={cambiarPolaridad}
          >
            Invertir polaridad <span aria-hidden="true">· + {placaPositiva.corto}</span>
          </button>
          <span id={idPolaridad} className="sr-only">
            La placa positiva está {placaPositiva.largo}.
          </span>
          <label className="control-deslizador control-deslizador-apilado">
            <span>Voltaje entre las placas</span>
            <input
              type="range"
              min={VOLTAJE_MIN_KV}
              max={VOLTAJE_MAX_KV}
              step={VOLTAJE_PASO_KV}
              value={voltajeKV}
              onChange={(e) => setVoltajeKV(Number(e.target.value))}
            />
            <output>{voltajeKV} kV</output>
          </label>
        </div>
      ) : (
        <div className="panel-dipolo-grupo">
          <button
            type="button"
            className="boton-colocar"
            aria-pressed={signoFuente === -1}
            aria-describedby={idSignoFuente}
            onClick={alternarSignoFuente}
          >
            Invertir signo de la carga <span aria-hidden="true">· {signoFuente === 1 ? "+" : "−"}</span>
          </button>
          <span id={idSignoFuente} className="sr-only">
            La carga fuente es {signoFuente === 1 ? "positiva" : "negativa"}.
          </span>
          <label className="control-deslizador control-deslizador-apilado">
            <span>Magnitud de la carga fuente</span>
            <input
              type="range"
              min={Q_MIN}
              max={Q_MAX}
              step={Q_PASO}
              value={qFuenteUC}
              onChange={(e) => setQFuenteUC(Number(e.target.value))}
            />
            <output>{qFuenteUC} µC</output>
          </label>
          <div className="panel-sonda-chip-fila">
            <button
              type="button"
              className={`sonda-chip${fuenteElegida ? " seleccionada" : ""}`}
              aria-pressed={fuenteElegida}
              aria-label="Elegir la carga fuente para moverla con las flechas"
              aria-describedby={idAyudaFuente}
              onFocus={() => seleccionar(ID_CARGA_FUENTE, false)}
              onBlur={(e) => alPerderFoco(ID_CARGA_FUENTE, e.relatedTarget)}
              onKeyDown={alPulsarTecla(ID_CARGA_FUENTE)}
              onClick={() => seleccionar(ID_CARGA_FUENTE, false)}
            >
              ⊕ carga fuente
            </button>
          </div>
          <button
            type="button"
            className="boton-colocar"
            aria-pressed={fuenteElegida && colocarConToque}
            onClick={() => alternarArmado(ID_CARGA_FUENTE, "la carga fuente", fuenteElegida && colocarConToque)}
            onKeyDown={alPulsarEscape}
            onBlur={(e) => alPerderFoco(ID_CARGA_FUENTE, e.relatedTarget)}
          >
            {fuenteElegida && colocarConToque ? "Toca el recuadro para colocarla" : "Colocar tocando el recuadro"}
          </button>
          <p id={idAyudaFuente} className="ayuda-mover">
            <span className="ayuda-puntero-fino">Arrástrala, o elígela con ⊕ y usa las flechas.</span>
            <span className="ayuda-puntero-tactil">Arrástrala, o toca «Colocar tocando el recuadro» y luego el punto.</span>
          </p>
        </div>
      )}

      <div className="panel-dipolo-grupo">
        <div className="panel-sonda-chip-fila">
          <button
            type="button"
            className={`sonda-chip${dipoloElegido ? " seleccionada" : ""}`}
            aria-pressed={dipoloElegido}
            aria-label="Elegir el dipolo para moverlo con las flechas"
            aria-describedby={idAyudaDipolo}
            onFocus={() => seleccionar(ID_DIPOLO, false)}
            onBlur={(e) => alPerderFoco(ID_DIPOLO, e.relatedTarget)}
            onKeyDown={alPulsarTecla(ID_DIPOLO)}
            onClick={() => seleccionar(ID_DIPOLO, false)}
          >
            ⊕ dipolo
          </button>
          <button
            type="button"
            className="boton-paso"
            aria-label="Girar el dipolo en sentido antihorario"
            onClick={(e) => girar(-1, e)}
          >
            ↺
          </button>
          <button type="button" className="boton-paso" aria-label="Girar el dipolo en sentido horario" onClick={(e) => girar(1, e)}>
            ↻
          </button>
        </div>
        <button
          type="button"
          className="boton-colocar"
          aria-pressed={dipoloElegido && colocarConToque}
          onClick={() => alternarArmado(ID_DIPOLO, "el dipolo", dipoloElegido && colocarConToque)}
          onKeyDown={alPulsarEscape}
          onBlur={(e) => alPerderFoco(ID_DIPOLO, e.relatedTarget)}
        >
          {dipoloElegido && colocarConToque ? "Toca el recuadro para colocarlo" : "Colocar tocando el recuadro"}
        </button>
        <p id={idAyudaDipolo} className="ayuda-mover">
          <span className="ayuda-puntero-fino">Arrástralo, o elígelo con ⊕ y usa las flechas.</span>
          <span className="ayuda-puntero-tactil">Arrástralo, o toca «Colocar tocando el recuadro» y luego el punto.</span>
        </p>
        <p className="ayuda-mover">
          <span className="ayuda-puntero-fino">↺ y ↻ lo giran 15° (Mayús: 45°).</span>
          <span className="ayuda-puntero-tactil">↺ y ↻ lo giran 15°.</span>
        </p>
        <label className="panel-sonda-check">
          <input type="checkbox" checked={mostrarFuerzas} onChange={(e) => setMostrarFuerzas(e.target.checked)} />
          Mostrar la fuerza sobre +q y −q
        </label>
      </div>
    </section>
  );
}

/** Sliders secundarios del dipolo (q y d): la página los coloca después de las lecturas. */
export function AjustesDipolo() {
  const qUC = useDipoloStore((s) => s.qUC);
  const dPx = useDipoloStore((s) => s.dPx);
  const setQUC = useDipoloStore((s) => s.setQUC);
  const setDPx = useDipoloStore((s) => s.setDPx);

  return (
    <section className="panel-dipolo panel-dipolo-ajustes" aria-label="Ajustes del dipolo">
      <div className="panel-dipolo-grupo">
        <label className="control-deslizador control-deslizador-apilado">
          <span>Carga de cada extremo (q)</span>
          <input type="range" min={Q_MIN} max={Q_MAX} step={Q_PASO} value={qUC} onChange={(e) => setQUC(Number(e.target.value))} />
          <output>{qUC} µC</output>
        </label>
        <label className="control-deslizador control-deslizador-apilado">
          <span>Separación entre las cargas (d)</span>
          <input type="range" min={D_MIN_PX} max={D_MAX_PX} step={D_PASO_PX} value={dPx} onChange={(e) => setDPx(Number(e.target.value))} />
          <output>{formatDistancia(pxAMetros(dPx))}</output>
        </label>
      </div>
    </section>
  );
}
