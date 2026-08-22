import { Link } from "react-router-dom";
import { CanvasRenderer } from "../render/CanvasRenderer";
import { SelectorModoVista } from "../ui/SelectorModoVista";
import { PanelCargas } from "../ui/PanelCargas";
import { useSimulacionStore } from "../store/simulacionStore";

export function CampoFijo() {
  const cargas = useSimulacionStore((s) => s.cargas);
  const agregarCarga = useSimulacionStore((s) => s.agregarCarga);
  const quitarCarga = useSimulacionStore((s) => s.quitarCarga);

  return (
    <main className="pagina-simulador">
      <Link to="/" className="volver">
        ← Estaciones
      </Link>
      <h1>Campo eléctrico</h1>
      <p className="instrucciones">
        Arrastra las cargas (rojo = positiva, azul = negativa) y cambia el modo de vista
        para explorar el campo eléctrico que producen.
      </p>
      <SelectorModoVista />
      <CanvasRenderer />
      <PanelCargas cargas={cargas} alAgregar={agregarCarga} alQuitar={quitarCarga} />
    </main>
  );
}
