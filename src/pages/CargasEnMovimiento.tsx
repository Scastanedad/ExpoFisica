import { useRef, useState } from "react";
import { Link } from "react-router-dom";
import { CanvasRendererDinamico } from "../render/CanvasRendererDinamico";
import type { ControladorEscena } from "../render/controladorEscena";
import { SelectorModoVista } from "../ui/SelectorModoVista";
import { ControlesReproduccion } from "../ui/ControlesReproduccion";
import { PanelCargas } from "../ui/PanelCargas";
import { IndicadorEnergia } from "../ui/IndicadorEnergia";
import { useSimulacionDinamicaStore } from "../store/simulacionDinamicaStore";

/** Pantalla ancha pero baja (p. ej. 1366x~650): las notas arrancan plegadas para evitar el scroll. */
const PANTALLA_ANCHA_Y_BAJA = "(min-width: 900px) and (max-height: 720px)";

export function CargasEnMovimiento() {
  const cargas = useSimulacionDinamicaStore((s) => s.cargas);
  const agregarCarga = useSimulacionDinamicaStore((s) => s.agregarCarga);
  const quitarCarga = useSimulacionDinamicaStore((s) => s.quitarCarga);
  const controladorRef = useRef<ControladorEscena | null>(null);
  const [notasAbiertas] = useState(() => !window.matchMedia(PANTALLA_ANCHA_Y_BAJA).matches);

  return (
    <main className="pagina-simulador">
      <header className="cabecera-simulador">
        <Link to="/" className="volver">
          ← Estaciones
        </Link>
        <h1>Cargas en movimiento</h1>
      </header>
      <p className="instrucciones">
        Las cargas se mueven solas: las iguales se repelen y las opuestas se atraen (fuerza de
        Coulomb). Arrastrar una carga la detiene y la recoloca donde la sueltes.
      </p>
      <div className="simulador">
        <div className="simulador-modo">
          <SelectorModoVista />
        </div>
        <div className="simulador-lienzo">
          <CanvasRendererDinamico controladorRef={controladorRef} />
        </div>
        <div className="simulador-lateral">
          <ControlesReproduccion />
          <PanelCargas
            cargas={cargas}
            alAgregar={agregarCarga}
            alQuitar={quitarCarga}
            controladorRef={controladorRef}
          />
          <IndicadorEnergia />
          <details className="notas-modelo" open={notasAbiertas}>
            <summary>Notas sobre el modelo</summary>
            <ul>
              <li>
                La animación va en cámara lenta: con cargas y masas de laboratorio el movimiento
                ocurriría en milisegundos.
              </li>
              <li>Las paredes del recuadro son un artificio del simulador.</li>
              <li>Solo fuerza de Coulomb (sin campo magnético ni radiación).</li>
            </ul>
          </details>
        </div>
      </div>
    </main>
  );
}
