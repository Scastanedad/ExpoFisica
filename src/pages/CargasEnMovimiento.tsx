import { useRef } from "react";
import { Link } from "react-router-dom";
import { CanvasRendererDinamico } from "../render/CanvasRendererDinamico";
import type { ControladorEscena } from "../render/controladorEscena";
import { SelectorModoVista } from "../ui/SelectorModoVista";
import { ControlesReproduccion } from "../ui/ControlesReproduccion";
import { LeyendaVista } from "../ui/LeyendaVista";
import { NotasCampo } from "../ui/NotasCampo";
import { PanelCargas } from "../ui/PanelCargas";
import { IndicadorEnergia } from "../ui/IndicadorEnergia";
import { useSimulacionDinamicaStore } from "../store/simulacionDinamicaStore";

export function CargasEnMovimiento() {
  const cargas = useSimulacionDinamicaStore((s) => s.cargas);
  const agregarCarga = useSimulacionDinamicaStore((s) => s.agregarCarga);
  const quitarCarga = useSimulacionDinamicaStore((s) => s.quitarCarga);
  const cambiarMagnitud = useSimulacionDinamicaStore((s) => s.cambiarMagnitud);
  const controladorRef = useRef<ControladorEscena | null>(null);

  return (
    // --reserva-v/--reserva-lateral: alto medido de cabecera + instrucciones (3 líneas) +
    // margen en escritorio (fase 2 §B1; medido con Chrome headless a 1366x768 y 1366x650).
    <main
      className="pagina-simulador"
      style={{ ["--reserva-v" as string]: "178px", ["--reserva-lateral" as string]: "178px" }}
    >
      <header className="cabecera-simulador">
        <Link to="/" className="volver">
          ← Estaciones
        </Link>
        <h1>Cargas en movimiento</h1>
        <div className="cabecera-modo">
          <SelectorModoVista />
        </div>
      </header>
      <p className="instrucciones instrucciones-larga">
        Las iguales se repelen y las opuestas se atraen. Arrastra una carga para colocarla: mientras
        la sujetas queda quieta, pero sigue empujando a las demás. Si la sueltas en pleno movimiento,
        sale lanzada (con un límite de velocidad): dale un empujón.
      </p>
      {/* En pantallas angostas el lienzo queda pegado arriba (sticky): la instrucción se acorta a 2
          líneas para no empujarlo. `display:none` saca el texto oculto del árbol de accesibilidad. */}
      <p className="instrucciones instrucciones-corta">
        Arrastra una carga y suéltala: sale lanzada con la velocidad de tu dedo. Mientras la sujetas,
        empuja a las demás.
      </p>
      <div className="simulador">
        <div className="simulador-lienzo">
          <CanvasRendererDinamico controladorRef={controladorRef} />
          <LeyendaVista cargas={cargas} />
        </div>
        <div className="simulador-lateral">
          <ControlesReproduccion />
          <IndicadorEnergia />
          <PanelCargas
            cargas={cargas}
            alAgregar={agregarCarga}
            alQuitar={quitarCarga}
            alCambiarMagnitud={cambiarMagnitud}
            colocaEnReposo
            controladorRef={controladorRef}
          />
          {/* Las notas son muchas: plegadas por defecto para que la columna de controles no obligue a hacer scroll. */}
          <details className="notas-modelo">
            <summary>Notas sobre el modelo</summary>
            <ul>
              <li className="notas-subtitulo" aria-hidden="true">
                Movimiento
              </li>
              <li>
                La animación va en cámara lenta: con cargas y masas de laboratorio el movimiento
                ocurriría en milisegundos.
              </li>
              <li>Con el teclado o tocando el destino, la carga se recoloca en reposo (no se lanza).</li>
              <li>Las paredes del recuadro son un artificio del simulador.</li>
              <li>Solo fuerza de Coulomb (sin campo magnético ni radiación).</li>
              <NotasCampo />
              <li>
                El dibujo del campo usa un suavizado menor que el de la simulación: muy cerca de una
                carga (a pocos milímetros), la fuerza que sienten las demás es bastante menor que la
                que sugiere el dibujo.
              </li>
              <li>
                Todas las partículas tienen la misma masa. La fuerza entre dos cargas es proporcional
                al producto de sus magnitudes y cada una la siente con el mismo módulo y sentido
                opuesto: entre +5 µC y −0.5 µC ambas aceleran con el mismo módulo. En cambio, dentro de
                un mismo campo, una carga mayor recibe más fuerza (F = qE) y acelera más.
              </li>
              <li>
                Con cargas grandes todo ocurre más rápido: usa el deslizador de velocidad si lo
                necesitas.
              </li>
              <li className="notas-subtitulo" aria-hidden="true">
                Energía
              </li>
              <li>
                La energía pasa de potencial (U) a cinética (K) y viceversa; la suma se conserva
                mientras no intervengas. Los números están en la escala de este modelo (1 cuadro = 1 cm,
                1 unidad = 1 µC) e incluyen un pequeño suavizado numérico cuando las cargas casi se
                tocan: no son comparables con julios de un laboratorio real.
              </li>
              <li>
                Cambiar una carga con la simulación en marcha aporta o retira energía: la energía total
                salta en ese instante y se toma como nueva referencia (no es un error del simulador).
              </li>
              <li>
                El empujón tiene un tope de velocidad y se mide a velocidad 1×: con el deslizador en
                otra posición la carga se ve más lenta o más rápida, pero lleva la misma energía. La
                energía que aportas al mover, lanzar o cambiar una carga modifica la energía total; si
                no intervienes, K + U se mantiene constante.
              </li>
            </ul>
          </details>
        </div>
      </div>
    </main>
  );
}
