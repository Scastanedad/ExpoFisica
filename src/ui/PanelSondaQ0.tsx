/**
 * Carga de prueba q₀ (E3.1), solo en "Cargas en reposo". La posición de q₀ NO
 * está aquí (vive en un ref dentro de `render/CanvasRenderer.tsx`): este panel
 * solo controla y muestra estado de UI (`store/cargaPruebaStore.ts`).
 *
 * Dos formas de medir ΔV/trabajo, ambas ofrecidas (E3.1 §6 y §9.5): "Marcar
 * A/B" (rápido, sin arrastre) y "Registrar el camino" (arrastra q₀ y compara
 * el trabajo medido por la traza con el valor teórico −q₀ΔV -- ver
 * `CanvasRenderer.tsx`). Si A/B ya están marcados, TODOS los caminos
 * registrados comparan contra ese mismo par fijo (prueba real de
 * independencia del camino); sin A/B marcados, cada camino compara contra sus
 * propios extremos (solo autoconsistencia, se avisa en la lista).
 *
 * Alternativa al arrastre para mover q₀ (WCAG 2.1.1/2.5.7, corrección post
 * revisión UI de T3.1/T3.2): un chip enfocable, igual patrón que las cargas
 * reales de `PanelCargas` -- flechas (1 cuadro, Mayús = 5) con el mismo
 * `ControladorEscena`, bajo el id reservado `ID_SONDA_Q0`, o "armar y tocar
 * el destino" con el botón "Colocar con un toque".
 */
import { useEffect, useId, useRef, useState, type KeyboardEvent, type RefObject } from "react";
import { medirDeltaV, Q0_MAGNITUD_UC } from "../fisica/cargaPrueba";
import { formatCientifica, formatSI } from "../fisica/escala";
import { ID_SONDA_Q0, esTeclaDeMovimiento, moverPorTeclado, type ControladorEscena } from "../render/controladorEscena";
import { EVENTO_CARGA_COLOCADA, type DetalleCargaColocada } from "../render/eventosEscena";
import { useCargaPruebaStore } from "../store/cargaPruebaStore";
import { useSeleccionStore } from "../store/seleccionStore";
import { anunciarMovimiento } from "./textosEscena";

/** Nombre de q₀ en los anuncios de movimiento, igual patrón que `nombreCarga` de las cargas reales. */
const NOMBRE_SONDA = "la sonda q₀";

interface Props {
  /** Controlador del canvas (leer/mover cargas): habilita teclado y "tocar el destino" para q₀. */
  controladorRef?: RefObject<ControladorEscena | null>;
}

export function PanelSondaQ0({ controladorRef }: Props) {
  const activo = useCargaPruebaStore((s) => s.activo);
  const signoQ0 = useCargaPruebaStore((s) => s.signoQ0);
  const registrarTrayecto = useCargaPruebaStore((s) => s.registrarTrayecto);
  const vA = useCargaPruebaStore((s) => s.vA);
  const vB = useCargaPruebaStore((s) => s.vB);
  const caminos = useCargaPruebaStore((s) => s.caminos);
  const lectura = useCargaPruebaStore((s) => s.lectura);
  const activar = useCargaPruebaStore((s) => s.activar);
  const desactivar = useCargaPruebaStore((s) => s.desactivar);
  const alternarSigno = useCargaPruebaStore((s) => s.alternarSigno);
  const setRegistrarTrayecto = useCargaPruebaStore((s) => s.setRegistrarTrayecto);
  const marcarA = useCargaPruebaStore((s) => s.marcarA);
  const marcarB = useCargaPruebaStore((s) => s.marcarB);
  const limpiarAB = useCargaPruebaStore((s) => s.limpiarAB);
  const limpiarCaminos = useCargaPruebaStore((s) => s.limpiarCaminos);

  const seleccionadaId = useSeleccionStore((s) => s.seleccionadaId);
  const colocarConToque = useSeleccionStore((s) => s.colocarConToque);
  const seleccionar = useSeleccionStore((s) => s.seleccionar);
  const sondaSeleccionada = seleccionadaId === ID_SONDA_Q0;

  const [anuncio, setAnuncio] = useState("");
  const contenedorRef = useRef<HTMLElement>(null);
  const idAyuda = useId();
  const hayControlador = controladorRef !== undefined;

  const medida = medirDeltaV(vA, vB, signoQ0);

  // Anuncia la colocación de q₀ con un toque en el recuadro (el teclado se anuncia en alPulsarTecla).
  useEffect(() => {
    const alColocar = (e: Event) => {
      const { id, x, y } = (e as CustomEvent<DetalleCargaColocada>).detail;
      if (id === ID_SONDA_Q0) setAnuncio(anunciarMovimiento(NOMBRE_SONDA, x, y));
    };
    window.addEventListener(EVENTO_CARGA_COLOCADA, alColocar);
    return () => window.removeEventListener(EVENTO_CARGA_COLOCADA, alColocar);
  }, []);

  // Si se oculta la sonda con foco/armado activo, no dejar el store en un estado que ya no aplica.
  useEffect(() => {
    if (!activo && sondaSeleccionada) seleccionar(null);
  }, [activo, sondaSeleccionada, seleccionar]);

  function alPulsarTecla(e: KeyboardEvent<HTMLButtonElement>) {
    if (e.key === "Escape") {
      seleccionar(null);
      return;
    }
    const ctrl = controladorRef?.current;
    if (!ctrl || !esTeclaDeMovimiento(e.key)) return;
    e.preventDefault(); // que las flechas no desplacen la página
    const destino = moverPorTeclado(ctrl, ID_SONDA_Q0, e.key, e.shiftKey);
    if (destino) setAnuncio(anunciarMovimiento(NOMBRE_SONDA, destino.x, destino.y));
  }

  /** No borrar la selección si el foco se queda dentro del panel (p. ej. pasa al botón "Colocar"). */
  function alPerderFoco(siguiente: Node | null) {
    const s = useSeleccionStore.getState();
    if (s.seleccionadaId !== ID_SONDA_Q0 || s.colocarConToque) return;
    if (siguiente && contenedorRef.current?.contains(siguiente)) return;
    seleccionar(null);
  }

  function alternarArmado() {
    if (!sondaSeleccionada) return;
    if (colocarConToque) {
      seleccionar(ID_SONDA_Q0, false);
      setAnuncio("Selección cancelada.");
    } else {
      seleccionar(ID_SONDA_Q0, true);
      setAnuncio("Sonda q₀ lista para colocar: toca el recuadro.");
    }
  }

  return (
    <section className="panel-sonda" aria-label="Carga de prueba q sub 0" ref={contenedorRef}>
      <p className="sr-only" aria-live="polite">
        {anuncio}
      </p>
      <button
        type="button"
        className="boton-colocar"
        aria-pressed={activo}
        onClick={() => (activo ? desactivar() : activar())}
      >
        {activo ? "Ocultar la sonda q₀" : "Medir el campo con una sonda (q₀)"}
      </button>
      {activo && (
        <div className="panel-sonda-cuerpo">
          <p className="panel-sonda-ayuda">
            Arrastra el círculo con mira: mide el campo, el potencial y la fuerza que sentiría ahí una
            carga de prueba de {Q0_MAGNITUD_UC} µC. q₀ no tiene masa (no se mueve sola) y no afecta a las
            demás cargas: solo las mide.
          </p>

          {hayControlador && (
            <div className="panel-sonda-chip-fila">
              <button
                type="button"
                className={`sonda-chip${sondaSeleccionada ? " seleccionada" : ""}`}
                aria-label="Elegir la sonda q₀ para moverla con las flechas o con un toque"
                aria-describedby={idAyuda}
                onFocus={() => seleccionar(ID_SONDA_Q0, false)}
                onBlur={(e) => alPerderFoco(e.relatedTarget)}
                onKeyDown={alPulsarTecla}
                onClick={() => seleccionar(ID_SONDA_Q0, false)}
              >
                ⊕ q₀
              </button>
              {sondaSeleccionada && (
                <button
                  type="button"
                  className="boton-colocar"
                  aria-pressed={colocarConToque}
                  onClick={alternarArmado}
                  onBlur={(e) => alPerderFoco(e.relatedTarget)}
                >
                  {colocarConToque ? "Toca el recuadro para colocarla" : "Colocar q₀ en el recuadro"}
                </button>
              )}
            </div>
          )}
          {hayControlador && (
            <p id={idAyuda} className="ayuda-mover">
              <span className="ayuda-puntero-fino">Elige q₀ y usa las flechas para moverla.</span>
              <span className="ayuda-puntero-tactil">Elige q₀ y toca "Colocar q₀ en el recuadro".</span>
            </p>
          )}

          <button type="button" className="boton-colocar" onClick={alternarSigno}>
            Signo de q₀: {signoQ0 > 0 ? "+" : "−"}
          </button>
          <dl className="panel-sonda-lecturas">
            <div>
              <dt>Campo (E)</dt>
              <dd>{lectura ? formatCientifica(lectura.moduloE, "N/C") : "—"}</dd>
            </div>
            <div>
              <dt>Potencial (V)</dt>
              <dd>{lectura ? formatSI(lectura.v, "V") : "—"}</dd>
            </div>
            <div>
              <dt>Fuerza sobre q₀ (F = q₀E)</dt>
              <dd>{lectura ? formatSI(lectura.moduloF, "N") : "—"}</dd>
            </div>
          </dl>
          {!lectura && (
            <p className="panel-sonda-nota">Demasiado cerca de una carga: aléjala un poco para medir.</p>
          )}

          <div className="panel-sonda-deltav">
            <h3>Medir ΔV y el trabajo del campo</h3>
            <div className="panel-sonda-ab">
              <button type="button" onClick={() => marcarA(lectura?.v ?? null)} disabled={!lectura}>
                Marcar A{vA !== null ? ` · ${formatSI(vA, "V")}` : ""}
              </button>
              <button type="button" onClick={() => marcarB(lectura?.v ?? null)} disabled={!lectura}>
                Marcar B{vB !== null ? ` · ${formatSI(vB, "V")}` : ""}
              </button>
              {(vA !== null || vB !== null) && (
                <button type="button" onClick={limpiarAB}>
                  Reiniciar A/B
                </button>
              )}
            </div>
            {medida && (
              <dl className="panel-sonda-lecturas panel-sonda-lecturas--resultado">
                <div>
                  <dt>ΔV = V_B − V_A</dt>
                  <dd>{formatSI(medida.deltaV, "V")}</dd>
                </div>
                <div>
                  <dt>Trabajo del campo</dt>
                  <dd>{formatSI(medida.wCampo, "J")}</dd>
                </div>
                <div>
                  <dt>Trabajo que hace tu mano</dt>
                  <dd>{formatSI(medida.wExt, "J")}</dd>
                </div>
              </dl>
            )}

            <details className="panel-sonda-camino">
              <summary>Registrar el camino al arrastrar (opcional)</summary>
              <div className="panel-sonda-camino-cuerpo">
                <label className="panel-sonda-check">
                  <input
                    type="checkbox"
                    checked={registrarTrayecto}
                    onChange={(e) => setRegistrarTrayecto(e.target.checked)}
                  />
                  Grabar el próximo arrastre como un camino
                </label>
                <p className="panel-sonda-ayuda">
                  Con esto activo, arrastra q₀ por rutas distintas: el trabajo que hace el campo es el
                  mismo, sin importar el camino. Marca A y B primero para comparar todos los caminos
                  contra el mismo par de puntos; sin A/B marcados, cada camino solo se compara consigo
                  mismo.
                </p>
                {caminos.length > 0 && (
                  <>
                    <ul className="panel-sonda-caminos">
                      {caminos.map((c, i) => (
                        <li key={c.id}>
                          Camino {i + 1}:{" "}
                          {c.wTraza === null
                            ? "la sonda pasó demasiado cerca de una carga: aléjala un poco para medir."
                            : `${formatSI(c.wTraza, "J")} (teórico −q₀ΔV: ${
                                c.wTeorico !== null ? formatSI(c.wTeorico, "J") : "—"
                              }${c.teoricoFijo ? "" : ", extremos de este camino: marca A/B para comparar entre caminos"})`}
                        </li>
                      ))}
                    </ul>
                    <button type="button" onClick={limpiarCaminos}>
                      Limpiar caminos
                    </button>
                  </>
                )}
              </div>
            </details>
          </div>
        </div>
      )}
    </section>
  );
}
