import { useSimulacionStore } from "../store/simulacionStore";
import type { ModoVista } from "../types/simulacion";

const OPCIONES: { valor: ModoVista; etiqueta: string }[] = [
  { valor: "vectores", etiqueta: "Vectores" },
  { valor: "lineas", etiqueta: "Líneas de campo" },
  { valor: "potencial", etiqueta: "Mapa de potencial" },
];

export function SelectorModoVista() {
  const modoVista = useSimulacionStore((s) => s.modoVista);
  const setModoVista = useSimulacionStore((s) => s.setModoVista);

  return (
    <div className="selector-modo" role="tablist" aria-label="Modo de visualización del campo">
      {OPCIONES.map((op) => (
        <button
          key={op.valor}
          type="button"
          role="tab"
          aria-selected={modoVista === op.valor}
          className={modoVista === op.valor ? "activo" : undefined}
          onClick={() => setModoVista(op.valor)}
        >
          {op.etiqueta}
        </button>
      ))}
    </div>
  );
}
