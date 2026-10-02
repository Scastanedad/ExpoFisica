/**
 * Controles de la Estación 03 (Campo continuo). Todo lo que aquí se cambia es
 * estado de UI (`store/campoContinuoStore.ts`); las posiciones/ángulo del
 * dipolo, de la carga libre y de la carga fuente NO están en este panel: se
 * leen/escriben a través de `ControladorCampoContinuo` (mismo contrato que
 * `ControladorEscena`, ver `render/controladorCampoContinuo.ts`), publicado
 * por `CanvasCampoContinuo.tsx`.
 *
 * Orden (como en las otras estaciones, lo más usado arriba): Pausar/Reiniciar,
 * objeto en el campo (dipolo / carga puntual), tipo de campo, controles de ese
 * campo y del objeto. Los sliders secundarios del dipolo (q, d) están en
 * `AjustesDipolo`, que la página coloca DESPUÉS de las lecturas; la carga
 * libre solo tiene signo y magnitud, que van aquí mismo.
 *
 * Alternativas al arrastre (WCAG 2.1.1/2.5.7, mismo patrón que
 * `PanelSondaQ0.tsx`): por cada objeto arrastrable (el objeto activo siempre;
 * la carga fuente solo en modo "puntual") hay un botón enfocable para moverlo
 * con las flechas (`moverPorTeclado`, reutilizado sin cambios) y otro para
 * "colocar tocando el recuadro" (arma `seleccionStore` y el canvas coloca el
 * objeto donde se toque). Girar el dipolo es SIEMPRE por botones.
 */
import { useEffect, useId, useRef, useState, type KeyboardEvent, type MouseEvent, type RefObject } from "react";
import { D_MAX_PX, D_MIN_PX, D_PASO_PX, VOLTAJE_MAX_KV, VOLTAJE_MIN_KV, VOLTAJE_PASO_KV, type ModoCampoDipolo } from "../fisica/dipolo";
import { Q_MAX, Q_MIN, Q_PASO } from "../fisica/carga";
import { VELOCIDAD_MAX, VELOCIDAD_MIN } from "../fisica/dinamica";
import { formatDistancia, pxAMetros } from "../fisica/escala";
import type { OrientacionPlacas } from "../fisica/campoExterno";
import { ID_CARGA_FUENTE, ID_CARGA_LIBRE, ID_DIPOLO, type ControladorCampoContinuo } from "../render/controladorCampoContinuo";
import { esTeclaDeMovimiento, moverPorTeclado } from "../render/controladorEscena";
import { EVENTO_CARGA_COLOCADA, type DetalleCargaColocada } from "../render/eventosEscena";
import { useCampoContinuoStore, type ObjetoCampo } from "../store/campoContinuoStore";
import { useSeleccionStore } from "../store/seleccionStore";
import { SelectorSegmentado, type OpcionSegmentada } from "./SelectorSegmentado";

const PASO_GIRO_RAD = (15 * Math.PI) / 180;
const PASO_GIRO_GRANDE_RAD = (45 * Math.PI) / 180;

const OBJETOS: OpcionSegmentada<ObjetoCampo>[] = [
  {
    valor: "dipolo",
    etiqueta: "Dipolo",
    descripcion: "dos cargas opuestas unidas por una varilla: gira con el campo",
  },
  {
    valor: "carga",
    etiqueta: "Carga puntual",
    descripcion: "una sola carga libre: el campo la empuja y la acelera",
  },
];

const MODOS: OpcionSegmentada<ModoCampoDipolo>[] = [
  { valor: "uniforme", etiqueta: "Uniforme" },
  { valor: "puntual", etiqueta: "Carga fuente" },
];

/** Qué hace el objeto elegido en cada tipo de campo (texto bajo el selector). */
const DESCRIPCION_MODO: Record<ObjetoCampo, Record<ModoCampoDipolo, string>> = {
  dipolo: {
    uniforme: "dos placas paralelas: el dipolo gira y se balancea, pero no se traslada",
    puntual: "una carga que puedes mover: el dipolo se alinea con su campo y es atraído hacia ella",
  },
  carga: {
    uniforme: "dos placas paralelas: la carga acelera en línea recta, siempre con la misma fuerza",
    puntual: "una carga que puedes mover: atrae o repele a la carga libre, más fuerte cuanto más cerca",
  },
};

const NOMBRES: Record<string, { sujeto: string; participio: string }> = {
  [ID_DIPOLO]: { sujeto: "El dipolo", participio: "movido" },
  [ID_CARGA_LIBRE]: { sujeto: "La carga libre", participio: "movida" },
  [ID_CARGA_FUENTE]: { sujeto: "La carga fuente", participio: "movida" },
};

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

/** "El dipolo movido a …" / "La carga libre movida a …" (concuerda en género; posiciones desde el borde izquierdo y el superior). */
function textoMovimiento(id: string, x: number, y: number): string {
  const { sujeto, participio } = NOMBRES[id] ?? NOMBRES[ID_CARGA_FUENTE];
  return `${sujeto} ${participio} a ${formatDistancia(pxAMetros(x))} del borde izquierdo y ${formatDistancia(pxAMetros(y))} del borde superior.`;
}

/** Si el texto no cambia entre dos anuncios seguidos, un lector de pantalla no lo repite: se le añade un espacio duro. */
function siguienteAnuncio(previo: string, texto: string): string {
  return previo === texto ? `${texto} ` : texto;
}

/** Coma decimal como el resto de la interfaz: "1,00". */
function formatoVelocidad(v: number): string {
  return v.toFixed(2).replace(".", ",");
}

/** Qué controles trae cada objeto y cada tipo de campo (para anunciarlos al cambiar). */
const CONTROLES_OBJETO: Record<ObjetoCampo, string> = {
  dipolo: "girar el dipolo, carga de cada extremo y separación",
  carga: "signo, magnitud y velocidad de la animación",
};
const CONTROLES_CAMPO: Record<ModoCampoDipolo, string> = {
  uniforme: "orientación de las placas, invertir polaridad y voltaje",
  puntual: "signo y magnitud de la carga fuente",
};

function textoCambio(objeto: ObjetoCampo, modo: ModoCampoDipolo, cambio: "objeto" | "campo"): string {
  const nombreObjeto = objeto === "carga" ? "carga libre" : "dipolo";
  const nombreCampo = modo === "uniforme" ? "campo uniforme" : "campo de una carga fuente";
  const nuevos = cambio === "objeto" ? CONTROLES_OBJETO[objeto] : CONTROLES_CAMPO[modo];
  return `Ahora: ${nombreObjeto} en ${nombreCampo}. Controles nuevos: ${nuevos}.`;
}

interface Props {
  controladorRef: RefObject<ControladorCampoContinuo | null>;
}

export function PanelCampoContinuo({ controladorRef }: Props) {
  const objeto = useCampoContinuoStore((s) => s.objeto);
  const modoCampo = useCampoContinuoStore((s) => s.modoCampo);
  const orientacionPlacas = useCampoContinuoStore((s) => s.orientacionPlacas);
  const polaridadPlacas = useCampoContinuoStore((s) => s.polaridadPlacas);
  const voltajeKV = useCampoContinuoStore((s) => s.voltajeKV);
  const qFuenteUC = useCampoContinuoStore((s) => s.qFuenteUC);
  const qCargaLibreUC = useCampoContinuoStore((s) => s.qCargaLibreUC);
  const signoCargaLibre = useCampoContinuoStore((s) => s.signoCargaLibre);
  const signoFuente = useCampoContinuoStore((s) => s.signoFuente);
  const mostrarFuerzas = useCampoContinuoStore((s) => s.mostrarFuerzas);
  const enPausa = useCampoContinuoStore((s) => s.enPausa);

  const setObjeto = useCampoContinuoStore((s) => s.setObjeto);
  const setModoCampo = useCampoContinuoStore((s) => s.setModoCampo);
  const setOrientacionPlacas = useCampoContinuoStore((s) => s.setOrientacionPlacas);
  const alternarPolaridadPlacas = useCampoContinuoStore((s) => s.alternarPolaridadPlacas);
  const setVoltajeKV = useCampoContinuoStore((s) => s.setVoltajeKV);
  const setQFuenteUC = useCampoContinuoStore((s) => s.setQFuenteUC);
  const alternarSignoFuente = useCampoContinuoStore((s) => s.alternarSignoFuente);
  const setQCargaLibreUC = useCampoContinuoStore((s) => s.setQCargaLibreUC);
  const alternarSignoCargaLibre = useCampoContinuoStore((s) => s.alternarSignoCargaLibre);
  const velocidadCargaLibre = useCampoContinuoStore((s) => s.velocidadCargaLibre);
  const setVelocidadCargaLibre = useCampoContinuoStore((s) => s.setVelocidadCargaLibre);
  const setMostrarFuerzas = useCampoContinuoStore((s) => s.setMostrarFuerzas);
  const togglePausa = useCampoContinuoStore((s) => s.togglePausa);

  const seleccionadaId = useSeleccionStore((s) => s.seleccionadaId);
  const colocarConToque = useSeleccionStore((s) => s.colocarConToque);
  const seleccionar = useSeleccionStore((s) => s.seleccionar);
  const dipoloElegido = seleccionadaId === ID_DIPOLO;
  const cargaLibreElegida = seleccionadaId === ID_CARGA_LIBRE;
  const fuenteElegida = seleccionadaId === ID_CARGA_FUENTE;

  const [anuncio, setAnuncio] = useState("");
  const contenedorRef = useRef<HTMLElement>(null);
  const idAyudaDipolo = useId();
  const idAyudaFuente = useId();
  const idAyudaCargaLibre = useId();
  const idSignoCargaLibre = useId();
  const idPolaridad = useId();
  const idSignoFuente = useId();

  function anunciar(texto: string) {
    setAnuncio((previo) => siguienteAnuncio(previo, texto));
  }

  // Anuncia la colocación con un toque en el recuadro (el teclado se anuncia en alPulsarTecla).
  useEffect(() => {
    const alColocar = (e: Event) => {
      const { id, x, y } = (e as CustomEvent<DetalleCargaColocada>).detail;
      if (id === ID_DIPOLO || id === ID_CARGA_LIBRE || id === ID_CARGA_FUENTE) {
        setAnuncio((previo) => siguienteAnuncio(previo, textoMovimiento(id, x, y)));
      }
    };
    window.addEventListener(EVENTO_CARGA_COLOCADA, alColocar);
    return () => window.removeEventListener(EVENTO_CARGA_COLOCADA, alColocar);
  }, []);

  // La carga fuente solo existe en modo "puntual", y solo el objeto activo está en pantalla: al
  // cambiar de modo o de objeto, no dejar colgada la selección de algo que ya no se ve.
  useEffect(() => {
    const fuenteHuerfana = modoCampo !== "puntual" && seleccionadaId === ID_CARGA_FUENTE;
    const objetoHuerfano =
      (objeto !== "dipolo" && seleccionadaId === ID_DIPOLO) || (objeto !== "carga" && seleccionadaId === ID_CARGA_LIBRE);
    if (fuenteHuerfana || objetoHuerfano) seleccionar(null);
  }, [objeto, modoCampo, seleccionadaId, seleccionar]);

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

  /** Cambios hechos por el usuario (no el montaje): se anuncian; el foco se queda en el radio. */
  function elegirObjeto(nuevo: ObjetoCampo) {
    if (nuevo === objeto) return;
    setObjeto(nuevo);
    anunciar(textoCambio(nuevo, modoCampo, "objeto"));
  }

  function elegirModo(nuevo: ModoCampoDipolo) {
    if (nuevo === modoCampo) return;
    setModoCampo(nuevo);
    anunciar(textoCambio(objeto, nuevo, "campo"));
  }

  function cambiarSignoFuente() {
    alternarSignoFuente();
    anunciar(`La carga fuente es ahora ${signoFuente === 1 ? "negativa" : "positiva"}.`);
  }

  function cambiarSignoCargaLibre() {
    alternarSignoCargaLibre();
    anunciar(`La carga libre es ahora ${signoCargaLibre === 1 ? "negativa" : "positiva"}.`);
  }

  function reiniciar() {
    controladorRef.current?.reiniciar();
    seleccionar(null);
    // Concordancia: "Dipolo restablecido", "Carga libre restablecida", "… y carga fuente restablecidos/as".
    const conFuente = modoCampo === "puntual";
    const sujeto = `${objeto === "carga" ? "Carga libre" : "Dipolo"}${conFuente ? " y carga fuente" : ""}`;
    const participio = `restablecid${objeto === "carga" ? "a" : "o"}${conFuente ? "s" : ""}`;
    anunciar(`${sujeto} ${participio} a su posición inicial.`);
  }

  function cambiarPolaridad() {
    const siguiente = polaridadPlacas === 1 ? -1 : 1;
    alternarPolaridadPlacas();
    anunciar(`La placa positiva queda ${lugarPlacaPositiva(orientacionPlacas, siguiente).largo}.`);
  }

  const placaPositiva = lugarPlacaPositiva(orientacionPlacas, polaridadPlacas);
  const descripcionObjeto = (OBJETOS.find((o) => o.valor === objeto) ?? OBJETOS[0]).descripcion ?? "";
  const descripcionModo = DESCRIPCION_MODO[objeto][modoCampo];
  const modos = MODOS.map((m) => ({ ...m, descripcion: DESCRIPCION_MODO[objeto][m.valor] }));

  return (
    <section className="panel-dipolo" aria-label="Controles del campo y del objeto" ref={contenedorRef}>
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
          <SelectorSegmentado etiquetaGrupo="Objeto en el campo" opciones={OBJETOS} valor={objeto} alElegir={elegirObjeto} />
          <p className="selector-modo-descripcion" aria-hidden="true">
            {descripcionObjeto.charAt(0).toUpperCase() + descripcionObjeto.slice(1)}.
          </p>
        </div>
        <div className="selector-modo-envoltorio">
          <SelectorSegmentado etiquetaGrupo="Tipo de campo" opciones={modos} valor={modoCampo} alElegir={elegirModo} />
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
            data-activo={polaridadPlacas === -1}
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
          <h2 className="panel-dipolo-titulo">La carga fuente</h2>
          <button
            type="button"
            className="boton-colocar"
            data-activo={signoFuente === -1}
            aria-describedby={idSignoFuente}
            onClick={cambiarSignoFuente}
          >
            Invertir signo de la carga fuente <span aria-hidden="true">· {signoFuente === 1 ? "+" : "−"}</span>
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
              aria-label="Carga fuente: elegir para moverla con las flechas"
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
            data-activo={fuenteElegida && colocarConToque}
            onClick={() => alternarArmado(ID_CARGA_FUENTE, "la carga fuente", fuenteElegida && colocarConToque)}
            onKeyDown={alPulsarEscape}
            onBlur={(e) => alPerderFoco(ID_CARGA_FUENTE, e.relatedTarget)}
          >
            {fuenteElegida && colocarConToque ? "Toca el recuadro para colocarla" : "Colocar tocando el recuadro"}
            <span className="sr-only"> (la carga fuente)</span>
          </button>
          <p id={idAyudaFuente} className="ayuda-mover">
            <span className="ayuda-puntero-fino">Arrástrala, o elígela con ⊕ y usa las flechas.</span>
            <span className="ayuda-puntero-tactil">Arrástrala, o toca «Colocar tocando el recuadro» y luego el punto.</span>
          </p>
        </div>
      )}

      {objeto === "carga" ? (
        <div className="panel-dipolo-grupo">
          <h2 className="panel-dipolo-titulo">La carga libre</h2>
          <button
            type="button"
            className="boton-colocar"
            data-activo={signoCargaLibre === -1}
            aria-describedby={idSignoCargaLibre}
            onClick={cambiarSignoCargaLibre}
          >
            Invertir signo de la carga libre <span aria-hidden="true">· {signoCargaLibre === 1 ? "+" : "−"}</span>
          </button>
          <span id={idSignoCargaLibre} className="sr-only">
            La carga libre es {signoCargaLibre === 1 ? "positiva" : "negativa"}.
          </span>
          <label className="control-deslizador control-deslizador-apilado">
            <span>Magnitud de la carga libre</span>
            <input
              type="range"
              min={Q_MIN}
              max={Q_MAX}
              step={Q_PASO}
              value={qCargaLibreUC}
              onChange={(e) => setQCargaLibreUC(Number(e.target.value))}
            />
            <output>{qCargaLibreUC} µC</output>
          </label>
          <label className="control-deslizador control-deslizador-apilado">
            <span>Velocidad de la animación (1× = tiempo de pantalla)</span>
            <input
              type="range"
              min={VELOCIDAD_MIN}
              max={VELOCIDAD_MAX}
              step={0.25}
              value={velocidadCargaLibre}
              aria-valuetext={`${formatoVelocidad(velocidadCargaLibre)} veces`}
              onChange={(e) => setVelocidadCargaLibre(Number(e.target.value))}
            />
            <output>{formatoVelocidad(velocidadCargaLibre)}×</output>
          </label>
          <div className="panel-sonda-chip-fila">
            <button
              type="button"
              className={`sonda-chip${cargaLibreElegida ? " seleccionada" : ""}`}
              aria-pressed={cargaLibreElegida}
              aria-label="Carga libre: elegir para moverla con las flechas"
              aria-describedby={idAyudaCargaLibre}
              onFocus={() => seleccionar(ID_CARGA_LIBRE, false)}
              onBlur={(e) => alPerderFoco(ID_CARGA_LIBRE, e.relatedTarget)}
              onKeyDown={alPulsarTecla(ID_CARGA_LIBRE)}
              onClick={() => seleccionar(ID_CARGA_LIBRE, false)}
            >
              ⊕ carga libre
            </button>
          </div>
          <button
            type="button"
            className="boton-colocar"
            data-activo={cargaLibreElegida && colocarConToque}
            onClick={() => alternarArmado(ID_CARGA_LIBRE, "la carga libre", cargaLibreElegida && colocarConToque)}
            onKeyDown={alPulsarEscape}
            onBlur={(e) => alPerderFoco(ID_CARGA_LIBRE, e.relatedTarget)}
          >
            {cargaLibreElegida && colocarConToque ? "Toca el recuadro para colocarla" : "Colocar tocando el recuadro"}
            <span className="sr-only"> (la carga libre)</span>
          </button>
          <p id={idAyudaCargaLibre} className="ayuda-mover">
            <span className="ayuda-puntero-fino">Arrástrala y suéltala, o elígela con ⊕ y usa las flechas.</span>
            <span className="ayuda-puntero-tactil">Arrástrala, o toca «Colocar tocando el recuadro» y luego el punto.</span>
          </p>
          <label className="panel-sonda-check">
            <input type="checkbox" checked={mostrarFuerzas} onChange={(e) => setMostrarFuerzas(e.target.checked)} />
            Mostrar la fuerza sobre la carga
          </label>
        </div>
      ) : (
      <div className="panel-dipolo-grupo">
        <h2 className="panel-dipolo-titulo">El dipolo</h2>
        <div className="panel-sonda-chip-fila">
          <button
            type="button"
            className={`sonda-chip${dipoloElegido ? " seleccionada" : ""}`}
            aria-pressed={dipoloElegido}
            aria-label="Dipolo: elegir para moverlo con las flechas"
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
          data-activo={dipoloElegido && colocarConToque}
          onClick={() => alternarArmado(ID_DIPOLO, "el dipolo", dipoloElegido && colocarConToque)}
          onKeyDown={alPulsarEscape}
          onBlur={(e) => alPerderFoco(ID_DIPOLO, e.relatedTarget)}
        >
          {dipoloElegido && colocarConToque ? "Toca el recuadro para colocarlo" : "Colocar tocando el recuadro"}
            <span className="sr-only"> (el dipolo)</span>
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
      )}
    </section>
  );
}

/** Sliders secundarios del dipolo (q y d): la página los coloca después de las lecturas. */
export function AjustesDipolo() {
  const qUC = useCampoContinuoStore((s) => s.qUC);
  const dPx = useCampoContinuoStore((s) => s.dPx);
  const setQUC = useCampoContinuoStore((s) => s.setQUC);
  const setDPx = useCampoContinuoStore((s) => s.setDPx);

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
