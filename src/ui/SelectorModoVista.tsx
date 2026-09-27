import { useRef, type KeyboardEvent } from "react";
import { useSimulacionStore } from "../store/simulacionStore";
import type { ModoVista } from "../types/simulacion";

const OPCIONES: { valor: ModoVista; etiqueta: string; descripcion: string }[] = [
  { valor: "vectores", etiqueta: "Vectores", descripcion: "flechas que muestran el campo en cada punto" },
  { valor: "lineas", etiqueta: "Líneas de campo", descripcion: "trayectorias que sigue el campo eléctrico" },
  {
    valor: "equipotenciales",
    etiqueta: "Equipotenciales",
    descripcion: "curvas de igual voltaje (potencial) junto con las líneas de campo",
  },
];

/**
 * Grupo de opciones excluyentes (`radiogroup`): una sola opción en el orden de
 * tabulación (roving tabindex) y flechas / Inicio / Fin para moverse, como
 * espera un lector de pantalla. Elegir con flechas selecciona (patrón ARIA).
 * La descripción del modo activo (antes solo `sr-only`) también se ve como
 * texto normal debajo (fase 2 §C): "vectores del campo" sería confuso para
 * alguien que ve el selector pero no lo activa con lector de pantalla.
 */
export function SelectorModoVista() {
  const modoVista = useSimulacionStore((s) => s.modoVista);
  const setModoVista = useSimulacionStore((s) => s.setModoVista);
  const mostrarLineas = useSimulacionStore((s) => s.mostrarLineasEnEquipotenciales);
  const setMostrarLineas = useSimulacionStore((s) => s.setMostrarLineasEnEquipotenciales);
  const botonesRef = useRef<Array<HTMLButtonElement | null>>([]);

  function elegir(indice: number) {
    const i = (indice + OPCIONES.length) % OPCIONES.length;
    setModoVista(OPCIONES[i].valor);
    botonesRef.current[i]?.focus();
  }

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    const actual = OPCIONES.findIndex((o) => o.valor === modoVista);
    switch (e.key) {
      case "ArrowRight":
      case "ArrowDown":
        elegir(actual + 1);
        break;
      case "ArrowLeft":
      case "ArrowUp":
        elegir(actual - 1);
        break;
      case "Home":
        elegir(0);
        break;
      case "End":
        elegir(OPCIONES.length - 1);
        break;
      default:
        return;
    }
    e.preventDefault();
  }

  const activa = OPCIONES.find((o) => o.valor === modoVista) ?? OPCIONES[0];

  return (
    <div className="selector-modo-envoltorio">
      <div
        className="selector-modo"
        role="radiogroup"
        aria-label="Modo de visualización del campo"
        onKeyDown={onKeyDown}
      >
        {OPCIONES.map((op) => (
          <span key={op.valor} id={`modo-vista-${op.valor}`} className="sr-only">
            {op.descripcion}
          </span>
        ))}
        {OPCIONES.map((op, i) => {
          const activo = modoVista === op.valor;
          return (
            <button
              key={op.valor}
              ref={(el) => {
                botonesRef.current[i] = el;
              }}
              type="button"
              role="radio"
              aria-checked={activo}
              tabIndex={activo ? 0 : -1}
              className={activo ? "activo" : undefined}
              aria-describedby={`modo-vista-${op.valor}`}
              onClick={() => setModoVista(op.valor)}
            >
              {op.etiqueta}
            </button>
          );
        })}
      </div>
      <p className="selector-modo-descripcion" aria-hidden="true">
        {activa.descripcion.charAt(0).toUpperCase() + activa.descripcion.slice(1)}.
      </p>
      {modoVista === "equipotenciales" && (
        <label className="panel-sonda-check selector-modo-toggle-lineas">
          <input
            type="checkbox"
            checked={mostrarLineas}
            onChange={(e) => setMostrarLineas(e.target.checked)}
          />
          Mostrar líneas de campo
        </label>
      )}
    </div>
  );
}
