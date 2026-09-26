import { useRef } from "react";
import { Link } from "react-router-dom";
import { CanvasRenderer } from "../render/CanvasRenderer";
import type { ControladorEscena } from "../render/controladorEscena";
import { SelectorModoVista } from "../ui/SelectorModoVista";
import { PanelCargas } from "../ui/PanelCargas";
import { useSimulacionStore } from "../store/simulacionStore";

export function CargasEnReposo() {
  const cargas = useSimulacionStore((s) => s.cargas);
  const agregarCarga = useSimulacionStore((s) => s.agregarCarga);
  const quitarCarga = useSimulacionStore((s) => s.quitarCarga);
  const controladorRef = useRef<ControladorEscena | null>(null);

  return (
    <main className="pagina-simulador">
      <header className="cabecera-simulador">
        <Link to="/" className="volver">
          ← Estaciones
        </Link>
        <h1>Cargas en reposo</h1>
      </header>
      <p className="instrucciones">
        Las cargas están quietas: solo se mueven cuando las arrastras. Rojo es positiva y azul
        negativa; cambia la vista para ver el campo que producen.
      </p>
      <div className="simulador">
        <div className="simulador-modo">
          <SelectorModoVista />
        </div>
        <div className="simulador-lienzo">
          <CanvasRenderer controladorRef={controladorRef} />
        </div>
        <div className="simulador-lateral">
          <PanelCargas
            cargas={cargas}
            alAgregar={agregarCarga}
            alQuitar={quitarCarga}
            controladorRef={controladorRef}
          />
        </div>
      </div>
    </main>
  );
}
