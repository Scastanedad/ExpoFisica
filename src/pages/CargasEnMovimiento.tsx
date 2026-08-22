import { Link } from "react-router-dom";
import { CanvasRendererDinamico } from "../render/CanvasRendererDinamico";
import { SelectorModoVista } from "../ui/SelectorModoVista";
import { ControlesReproduccion } from "../ui/ControlesReproduccion";
import { PanelCargas } from "../ui/PanelCargas";
import { IndicadorEnergia } from "../ui/IndicadorEnergia";
import { useSimulacionDinamicaStore } from "../store/simulacionDinamicaStore";

export function CargasEnMovimiento() {
  const cargas = useSimulacionDinamicaStore((s) => s.cargas);
  const agregarCarga = useSimulacionDinamicaStore((s) => s.agregarCarga);
  const quitarCarga = useSimulacionDinamicaStore((s) => s.quitarCarga);

  return (
    <main className="pagina-simulador">
      <Link to="/" className="volver">
        ← Estaciones
      </Link>
      <h1>Cargas en movimiento</h1>
      <p className="instrucciones">
        Estas cargas se atraen y repelen solas por la fuerza de Coulomb. Arrástralas para
        darles un empujón, agrega más, y cambia el modo de vista mientras se mueven.
      </p>
      <SelectorModoVista />
      <ControlesReproduccion />
      <CanvasRendererDinamico />
      <PanelCargas cargas={cargas} alAgregar={agregarCarga} alQuitar={quitarCarga} />
      <IndicadorEnergia />
    </main>
  );
}
