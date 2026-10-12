import { Link } from "react-router-dom";
import { CATALOGO } from "../fisica/capacitorPlacas";
import { useTituloDocumento } from "../hooks/useTituloDocumento";
import { CanvasCapacitorPlacas } from "../render/CanvasCapacitorPlacas";
import { useCapacitorPlacasStore } from "../store/capacitorPlacasStore";

/** Estación 08 · Capacitor de placas. Panel provisional: la fase 3 lo reemplaza por el panel completo. */
export function CapacitorPlacas() {
  useTituloDocumento("Capacitor de placas · ExpoFísica");
  const p = useCapacitorPlacasStore((s) => s.p);
  const cambiar = useCapacitorPlacasStore((s) => s.cambiar);
  const setModo = useCapacitorPlacasStore((s) => s.setModo);

  return (
    <main className="pagina-simulador pagina-capacitor-placas">
      <header className="cabecera-simulador">
        <Link to="/" className="volver">
          ← Estaciones
        </Link>
        <h1>Capacitor de placas</h1>
      </header>
      <p className="instrucciones">
        Arrastra una placa para acercarla o alejarla y arrastra el bloque de color para meterlo entre las placas.
      </p>
      <div className="simulador">
        <div className="simulador-lienzo">
          <CanvasCapacitorPlacas p={p} onCambiar={cambiar} onModo={setModo} />
        </div>
        <div className="simulador-lateral">
          <label>
            Dieléctrico{" "}
            <select value={p.materialId} onChange={(e) => cambiar({ materialId: e.target.value })}>
              {CATALOGO.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.nombre}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>
    </main>
  );
}
