/**
 * Fuerza individual sobre cada carga (E3.2). Compartido por las dos
 * estaciones: el toggle "Mostrar fuerzas" (`store/simulacionStore.ts`) dibuja
 * el vector sobre TODAS las cargas; la lectura numérica (N) es solo de la
 * carga elegida (`store/seleccionStore.ts`) y se publica a ~10 Hz en
 * `store/lecturasStore.ts` desde el bucle de dibujo de cada canvas.
 */
import { formatSI } from "../fisica/escala";
import { useLecturasStore } from "../store/lecturasStore";
import { useSeleccionStore } from "../store/seleccionStore";
import { useSimulacionStore } from "../store/simulacionStore";

export function LecturaFuerza() {
  const mostrarFuerzas = useSimulacionStore((s) => s.mostrarFuerzas);
  const setMostrarFuerzas = useSimulacionStore((s) => s.setMostrarFuerzas);
  const seleccionadaId = useSeleccionStore((s) => s.seleccionadaId);
  const fuerza = useLecturasStore((s) => s.fuerzaSeleccionada);

  return (
    <section className="panel-fuerza" aria-label="Fuerza sobre las cargas">
      <label className="panel-sonda-check">
        <input
          type="checkbox"
          checked={mostrarFuerzas}
          onChange={(e) => setMostrarFuerzas(e.target.checked)}
        />
        Mostrar fuerzas
      </label>
      <p className="panel-fuerza-lectura">
        {seleccionadaId
          ? `Fuerza sobre la carga elegida: ${fuerza ? formatSI(fuerza.modulo, "N") : "—"}`
          : "Elige una carga para ver, en newtons, la fuerza que siente."}
      </p>
    </section>
  );
}
