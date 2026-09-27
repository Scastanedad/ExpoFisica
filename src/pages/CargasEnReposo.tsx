import { useRef } from "react";
import { Link } from "react-router-dom";
import { CanvasRenderer } from "../render/CanvasRenderer";
import type { ControladorEscena } from "../render/controladorEscena";
import { SelectorModoVista } from "../ui/SelectorModoVista";
import { LeyendaVista } from "../ui/LeyendaVista";
import { NotasCampo } from "../ui/NotasCampo";
import { PanelCargas } from "../ui/PanelCargas";
import { PanelSondaQ0 } from "../ui/PanelSondaQ0";
import { LecturaFuerza } from "../ui/LecturaFuerza";
import { useSimulacionStore } from "../store/simulacionStore";

export function CargasEnReposo() {
  const cargas = useSimulacionStore((s) => s.cargas);
  const agregarCarga = useSimulacionStore((s) => s.agregarCarga);
  const quitarCarga = useSimulacionStore((s) => s.quitarCarga);
  const cambiarMagnitud = useSimulacionStore((s) => s.cambiarMagnitud);
  const controladorRef = useRef<ControladorEscena | null>(null);

  return (
    // --reserva-v/--reserva-lateral: alto medido de cabecera + instrucciones + margen en
    // escritorio (>= 900x560), para que ni el lienzo ni la columna de controles se pasen del
    // viewport (fase 2 §B1; medido con Chrome headless). Los dos valores coinciden porque el
    // lienzo y la columna arrancan a la misma altura.
    <main
      className="pagina-simulador"
      style={{ ["--reserva-v" as string]: "156px", ["--reserva-lateral" as string]: "156px" }}
    >
      <header className="cabecera-simulador">
        <Link to="/" className="volver">
          ← Estaciones
        </Link>
        <h1>Cargas en reposo</h1>
        <div className="cabecera-modo">
          <SelectorModoVista />
        </div>
      </header>
      <p className="instrucciones">
        Las cargas están quietas: solo se mueven cuando las arrastras. Rojo es positiva y azul
        negativa; cambia la vista para ver el campo que producen.
      </p>
      <div className="simulador">
        <div className="simulador-lienzo">
          <CanvasRenderer controladorRef={controladorRef} conSondaQ0 />
          <LeyendaVista cargas={cargas} />
        </div>
        <div className="simulador-lateral">
          <PanelCargas
            cargas={cargas}
            alAgregar={agregarCarga}
            alQuitar={quitarCarga}
            alCambiarMagnitud={cambiarMagnitud}
            controladorRef={controladorRef}
          />
          <LecturaFuerza />
          <PanelSondaQ0 controladorRef={controladorRef} />
          <details className="notas-modelo">
            <summary>Notas sobre el modelo</summary>
            <ul>
              <NotasCampo />
              <li>El tamaño del círculo es solo un símbolo: las cargas son puntos.</li>
              <li>
                Cambiar la carga a mano es solo un control del simulador: en la realidad la carga no se
                crea ni se destruye.
              </li>
              <li>
                Las fuerzas mostradas son exactas (ley de Coulomb sin ningún suavizado): dos cargas nunca
                se ejercen fuerza a sí mismas, y la que ves sobre cada una es la suma de todas las demás.
              </li>
              <li>
                q₀ (la sonda con mira) no tiene masa: no se mueve sola, la colocas tú, y no está en la
                lista de cargas del dibujo (no las empuja ni las atrae).
              </li>
            </ul>
          </details>
        </div>
      </div>
    </main>
  );
}
