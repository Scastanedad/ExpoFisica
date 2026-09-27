import { useEffect, useId, useRef, useState, type KeyboardEvent, type RefObject } from "react";
import { useSimulacionStore } from "../store/simulacionStore";
import { useSeleccionStore } from "../store/seleccionStore";
import { aplicarMagnitud } from "../fisica/carga";
import { formatCarga } from "../fisica/unidades";
import { esTeclaDeMovimiento, moverPorTeclado, type ControladorEscena } from "../render/controladorEscena";
import { EVENTO_CARGA_COLOCADA, type DetalleCargaColocada } from "../render/eventosEscena";
import { ANCHO_ESCENA } from "../render/dimensiones";
import { EditorMagnitud } from "./EditorMagnitud";
import { anunciarMagnitud, anunciarMovimiento, describirEscala, nombreCarga } from "./textosEscena";

interface CargaListable {
  id: string;
  q: number;
}

interface Props {
  cargas: CargaListable[];
  alAgregar: (q: number) => void;
  alQuitar: (id: string) => void;
  /** Si se pasa, aparece el control de magnitud de la carga elegida (el signo no se edita). */
  alCambiarMagnitud?: (id: string, q: number) => void;
  /** Estación dinámica: teclado y "tocar el destino" dejan la carga en reposo (se dice en los anuncios). */
  colocaEnReposo?: boolean;
  /** Controlador del canvas (leer/mover cargas): habilita teclado y "tocar el destino". */
  controladorRef?: RefObject<ControladorEscena | null>;
  /** Ancho lógico del canvas, para describir la escala. */
  anchoEscena?: number;
}

/**
 * Agregar/quitar cargas y ALTERNATIVA AL ARRASTRE (WCAG 2.1.1 y 2.5.7).
 *
 * Cada carga es un chip numerado ("1 · +1 µC"): tocarlo o enfocarlo la
 * SELECCIONA (la edita y le pone el anillo cian en el canvas), sin moverla
 * (fase 2 §B4: seleccionar y armar para mover son gestos distintos). Para
 * moverla con un toque hay un botón aparte, "Colocar en el recuadro", que la
 * arma; el siguiente toque en el lienzo la coloca allí. Con teclado, las
 * flechas ya la mueven sin armar nada (Mayús = 5 cuadros).
 *
 * Genérico por props para las dos estaciones, cada una con su lista (store) y
 * su canvas (`controladorRef`); la unidad mostrada es la compartida.
 */
export function PanelCargas({
  cargas,
  alAgregar,
  alQuitar,
  alCambiarMagnitud,
  colocaEnReposo = false,
  controladorRef,
  anchoEscena = ANCHO_ESCENA,
}: Props) {
  const unidadCarga = useSimulacionStore((s) => s.unidadCarga);
  const seleccionadaId = useSeleccionStore((s) => s.seleccionadaId);
  const colocarConToque = useSeleccionStore((s) => s.colocarConToque);
  const editandoId = useSeleccionStore((s) => s.editandoId);
  const seleccionar = useSeleccionStore((s) => s.seleccionar);
  const [anuncio, setAnuncio] = useState("");
  const idAyuda = useId();
  const contenedorRef = useRef<HTMLDivElement>(null);
  const botonPositivaRef = useRef<HTMLButtonElement>(null);
  const chipsRef = useRef<Array<HTMLButtonElement | null>>([]);
  /** Posición del chip que debe recibir el foco tras quitar una carga (o -1: "+ Positiva"). */
  const focoPendienteRef = useRef<number | null>(null);
  const cargasRef = useRef(cargas);
  const unidadRef = useRef(unidadCarga);
  const enReposoRef = useRef(colocaEnReposo);
  useEffect(() => {
    cargasRef.current = cargas;
    unidadRef.current = unidadCarga;
    enReposoRef.current = colocaEnReposo;
  });

  const hayControlador = controladorRef !== undefined;

  // `editandoId` (fase 2 §B3) nunca es null si hay al menos una carga: sin nada elegido
  // todavía se muestra la primera, así el editor de magnitud siempre dice a cuál se refiere.
  const indiceEditada = Math.max(
    0,
    cargas.findIndex((c) => c.id === editandoId),
  );
  const cargaEditada = cargas[indiceEditada];

  // Con una carga "armada", Escape cancela aunque el foco ya esté en el canvas o en el body.
  useEffect(() => {
    if (!colocarConToque) return;
    const alTeclear = (e: globalThis.KeyboardEvent) => {
      if (e.key === "Escape") seleccionar(null);
    };
    document.addEventListener("keydown", alTeclear);
    return () => document.removeEventListener("keydown", alTeclear);
  }, [colocarConToque, seleccionar]);

  // Tras quitar una carga con teclado el botón enfocado desaparece: devolver el foco al
  // chip vecino (o a "+ Positiva" si no queda ninguna) para no perder el lugar.
  const cantidad = cargas.length;
  useEffect(() => {
    const pendiente = focoPendienteRef.current;
    if (pendiente === null) return;
    focoPendienteRef.current = null;
    if (cantidad === 0 || pendiente < 0) botonPositivaRef.current?.focus();
    else chipsRef.current[Math.min(pendiente, cantidad - 1)]?.focus();
  }, [cantidad]);

  // Anuncia la colocación con un toque en el recuadro (el teclado se anuncia en alPulsarTecla).
  useEffect(() => {
    const alColocar = (e: Event) => {
      const { id, x, y } = (e as CustomEvent<DetalleCargaColocada>).detail;
      const i = cargasRef.current.findIndex((c) => c.id === id);
      if (i < 0) return;
      setAnuncio(
        anunciarMovimiento(nombreCarga(cargasRef.current[i].q, unidadRef.current, i), x, y, enReposoRef.current),
      );
    };
    window.addEventListener(EVENTO_CARGA_COLOCADA, alColocar);
    return () => window.removeEventListener(EVENTO_CARGA_COLOCADA, alColocar);
  }, []);

  function agregar(q: number) {
    alAgregar(q);
    setAnuncio(`Carga ${q > 0 ? "positiva" : "negativa"} agregada. Ahora hay ${cargas.length + 1}.`);
  }

  function quitar(c: CargaListable, indice: number) {
    if (seleccionadaId === c.id) seleccionar(null);
    focoPendienteRef.current = Math.min(indice, cargas.length - 2);
    alQuitar(c.id);
    setAnuncio(`Quitada la ${nombreCarga(c.q, unidadCarga, indice)}. Quedan ${cargas.length - 1}.`);
  }

  function cambiarMagnitud(id: string, qDeseada: number) {
    const indice = cargas.findIndex((c) => c.id === id);
    if (indice < 0 || !alCambiarMagnitud) return;
    const nueva = aplicarMagnitud(cargas[indice].q, qDeseada);
    if (nueva === null) return;
    alCambiarMagnitud(id, nueva);
    setAnuncio(anunciarMagnitud(nueva, unidadCarga, indice));
  }

  function alPulsarTecla(e: KeyboardEvent<HTMLButtonElement>, c: CargaListable, indice: number) {
    if (e.key === "Escape") {
      seleccionar(null);
      return;
    }
    const ctrl = controladorRef?.current;
    if (!ctrl || !esTeclaDeMovimiento(e.key)) return;
    e.preventDefault(); // que las flechas no desplacen la página
    const destino = moverPorTeclado(ctrl, c.id, e.key, e.shiftKey);
    if (destino) {
      setAnuncio(
        anunciarMovimiento(nombreCarga(c.q, unidadCarga, indice), destino.x, destino.y, colocaEnReposo),
      );
    }
  }

  /** Tocar/clicar un chip SOLO selecciona (lo edita); no lo arma para moverlo (fase 2 §B4). */
  function alElegir(c: CargaListable) {
    if (!hayControlador) return;
    seleccionar(c.id, false);
  }

  /** No borrar la selección si el foco se queda dentro del panel (p. ej. pasa al botón "Colocar"). */
  function alPerderFoco(id: string, siguiente: Node | null) {
    const s = useSeleccionStore.getState();
    if (s.seleccionadaId !== id || s.colocarConToque) return;
    if (siguiente && contenedorRef.current?.contains(siguiente)) return;
    seleccionar(null);
  }

  /** Botón explícito "Colocar en el recuadro": arma o desarma la carga seleccionada. */
  function alternarArmado(indice: number) {
    if (!seleccionadaId) return;
    const nombre = nombreCarga(cargas[indice]?.q ?? 0, unidadCarga, indice);
    if (colocarConToque) {
      seleccionar(seleccionadaId, false);
      setAnuncio("Selección cancelada.");
    } else {
      seleccionar(seleccionadaId, true);
      setAnuncio(`${nombre} lista para colocar: toca el recuadro.`);
    }
  }

  const indiceSeleccionada = cargas.findIndex((c) => c.id === seleccionadaId);

  return (
    <div className="panel-cargas" ref={contenedorRef}>
      <p className="sr-only" aria-live="polite">
        <span>{describirEscala(anchoEscena)}</span> <span>{anuncio}</span>
      </p>
      <div className="panel-cargas-botones">
        <button type="button" ref={botonPositivaRef} onClick={() => agregar(1)}>
          + Positiva
        </button>
        <button type="button" onClick={() => agregar(-1)}>
          + Negativa
        </button>
      </div>
      <ul className="panel-cargas-lista">
        {cargas.map((c, i) => {
          const seleccionada = seleccionadaId === c.id;
          const editando = editandoId === c.id;
          const nombre = nombreCarga(c.q, unidadCarga, i);
          return (
            <li
              key={c.id}
              className={[seleccionada && "seleccionada", editando && "editando"].filter(Boolean).join(" ") || undefined}
            >
              <button
                type="button"
                ref={(el) => {
                  chipsRef.current[i] = el;
                }}
                className={`carga-chip ${c.q > 0 ? "carga-positiva" : "carga-negativa"}`}
                aria-label={`Elegir ${nombre}`}
                aria-describedby={hayControlador ? idAyuda : undefined}
                onFocus={() => hayControlador && seleccionar(c.id, false)}
                onBlur={(e) => alPerderFoco(c.id, e.relatedTarget)}
                onKeyDown={(e) => alPulsarTecla(e, c, i)}
                onClick={() => alElegir(c)}
              >
                <span className="carga-chip-numero" aria-hidden="true">
                  {i + 1}
                </span>
                {formatCarga(c.q, unidadCarga)}
              </button>
              {seleccionada && (
                <button
                  type="button"
                  className="carga-quitar"
                  onClick={() => quitar(c, i)}
                  onBlur={(e) => alPerderFoco(c.id, e.relatedTarget)}
                  aria-label={`Quitar ${nombre}`}
                >
                  <span aria-hidden="true">×</span>
                </button>
              )}
            </li>
          );
        })}
      </ul>
      {hayControlador && (
        <p id={idAyuda} className="ayuda-mover">
          <span className="ayuda-puntero-fino">Elige una carga y usa las flechas para moverla.</span>
          <span className="ayuda-puntero-tactil">Elige una carga y toca "Colocar en el recuadro".</span>
        </p>
      )}
      {hayControlador && seleccionadaId && (
        <button
          type="button"
          className="boton-colocar"
          aria-pressed={colocarConToque}
          onClick={() => alternarArmado(indiceSeleccionada)}
          onBlur={(e) => alPerderFoco(seleccionadaId, e.relatedTarget)}
        >
          {colocarConToque
            ? "Toca el recuadro para colocarla"
            : `Colocar la carga n.º ${indiceSeleccionada + 1} en el recuadro`}
        </button>
      )}
      {alCambiarMagnitud && cargaEditada && (
        <EditorMagnitud
          id={cargaEditada.id}
          q={cargaEditada.q}
          indice={indiceEditada}
          unidad={unidadCarga}
          alCambiar={cambiarMagnitud}
        />
      )}
    </div>
  );
}
