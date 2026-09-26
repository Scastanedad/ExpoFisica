import { useEffect, useId, useRef, useState, type KeyboardEvent, type RefObject } from "react";
import { useSimulacionStore } from "../store/simulacionStore";
import { useSeleccionStore } from "../store/seleccionStore";
import { formatCarga } from "../fisica/unidades";
import { esTeclaDeMovimiento, moverPorTeclado, type ControladorEscena } from "../render/controladorEscena";
import { EVENTO_CARGA_COLOCADA, type DetalleCargaColocada } from "../render/eventosEscena";
import { ANCHO_ESCENA } from "../render/dimensiones";
import { anunciarMovimiento, describirEscala, nombreCarga } from "./textosEscena";

interface CargaListable {
  id: string;
  q: number;
}

interface Props {
  cargas: CargaListable[];
  alAgregar: (q: number) => void;
  alQuitar: (id: string) => void;
  /** Controlador del canvas (leer/mover cargas): habilita teclado y "tocar el destino". */
  controladorRef?: RefObject<ControladorEscena | null>;
  /** Ancho lógico del canvas, para describir la escala. */
  anchoEscena?: number;
}

/**
 * Agregar/quitar cargas y ALTERNATIVA AL ARRASTRE (WCAG 2.1.1 y 2.5.7): cada
 * carga es un botón. Al enfocarlo se selecciona (anillo cian en el canvas) y las
 * flechas la mueven 1 cuadro (Shift: 5); al activarlo (Intro / clic / toque) se
 * "arma" y el siguiente toque en el canvas la coloca allí. Genérico por props
 * para las dos estaciones, cada una con su lista (store) y su canvas
 * (`controladorRef`); la unidad mostrada es la compartida.
 */
export function PanelCargas({ cargas, alAgregar, alQuitar, controladorRef, anchoEscena = ANCHO_ESCENA }: Props) {
  const unidadCarga = useSimulacionStore((s) => s.unidadCarga);
  const seleccionadaId = useSeleccionStore((s) => s.seleccionadaId);
  const colocarConToque = useSeleccionStore((s) => s.colocarConToque);
  const seleccionar = useSeleccionStore((s) => s.seleccionar);
  const [anuncio, setAnuncio] = useState("");
  const idAyuda = useId();
  const botonPositivaRef = useRef<HTMLButtonElement>(null);
  const chipsRef = useRef<Array<HTMLButtonElement | null>>([]);
  /** Posición del chip que debe recibir el foco tras quitar una carga (o -1: "+ Positiva"). */
  const focoPendienteRef = useRef<number | null>(null);
  const cargasRef = useRef(cargas);
  const unidadRef = useRef(unidadCarga);
  useEffect(() => {
    cargasRef.current = cargas;
    unidadRef.current = unidadCarga;
  });

  const hayControlador = controladorRef !== undefined;

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
      setAnuncio(anunciarMovimiento(nombreCarga(cargasRef.current[i].q, unidadRef.current, i), x, y));
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
      setAnuncio(anunciarMovimiento(nombreCarga(c.q, unidadCarga, indice), destino.x, destino.y));
    }
  }

  function alActivar(c: CargaListable, indice: number) {
    if (!hayControlador) return;
    if (seleccionadaId === c.id && colocarConToque) {
      seleccionar(null);
      setAnuncio("Selección cancelada.");
    } else {
      seleccionar(c.id, true);
      setAnuncio(
        `${nombreCarga(c.q, unidadCarga, indice)} seleccionada. Toca el recuadro para colocarla o usa las flechas.`,
      );
    }
  }

  return (
    <div className="panel-cargas">
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
          const nombre = nombreCarga(c.q, unidadCarga, i);
          return (
            <li key={c.id} className={seleccionada ? "seleccionada" : undefined}>
              <button
                type="button"
                ref={(el) => {
                  chipsRef.current[i] = el;
                }}
                className={`carga-chip ${c.q > 0 ? "carga-positiva" : "carga-negativa"}`}
                aria-pressed={hayControlador ? seleccionada && colocarConToque : undefined}
                aria-label={`Mover ${nombre}`}
                aria-describedby={hayControlador ? idAyuda : undefined}
                onFocus={() => hayControlador && !(seleccionada && colocarConToque) && seleccionar(c.id, false)}
                onBlur={() => {
                  const s = useSeleccionStore.getState();
                  if (s.seleccionadaId === c.id && !s.colocarConToque) seleccionar(null);
                }}
                onKeyDown={(e) => alPulsarTecla(e, c, i)}
                onClick={() => alActivar(c, i)}
              >
                {formatCarga(c.q, unidadCarga)}
              </button>
              <button
                type="button"
                className="carga-quitar"
                onClick={() => quitar(c, i)}
                aria-label={`Quitar ${nombre}`}
              >
                <span aria-hidden="true">×</span>
              </button>
            </li>
          );
        })}
      </ul>
      {hayControlador && (
        <p id={idAyuda} className="ayuda-mover">
          {colocarConToque ? (
            "Toca el recuadro para colocar la carga seleccionada."
          ) : (
            <>
              <span className="ayuda-puntero-fino">
                Para mover sin arrastrar: elige una carga y usa las flechas (Mayús = 5 cuadros), o
                pulsa Intro y toca el recuadro.
              </span>
              <span className="ayuda-puntero-tactil">
                Toca una carga de la lista y luego toca el recuadro para moverla.
              </span>
            </>
          )}
        </p>
      )}
    </div>
  );
}
