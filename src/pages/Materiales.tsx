import { useRef } from "react";
import { Link } from "react-router-dom";
import { useTituloDocumento } from "../hooks/useTituloDocumento";
import { CanvasMateriales, type ControladorMateriales } from "../render/CanvasMateriales";
import {
  CabeceraMaterial,
  ChipPausaMateriales,
  DescripcionMaterial,
  LecturaMaterial,
  LeyendaMateriales,
} from "../ui/LecturaMaterial";
import { ControlVoltaje, PanelMateriales } from "../ui/PanelMateriales";
import { ZOOM_PARCHE } from "../render/dibujarMateriales";

export function Materiales() {
  const controladorRef = useRef<ControladorMateriales | null>(null);

  // Título de la pestaña mientras la estación está abierta; al salir se restaura el anterior.
  useTituloDocumento("Conductores y aislantes · ExpoFísica");

  return (
    // --reserva-v: alto de todo lo que rodea a los lienzos en pantalla ancha (cabecera, instrucciones, aviso y
    // leyenda, título de cada material, lecturas, descripción y márgenes). --reserva-lateral: lo que queda
    // sobre la columna de controles (cabecera + instrucciones + márgenes).
    <main
      className="pagina-simulador"
      style={{ ["--reserva-v" as string]: "362px", ["--reserva-lateral" as string]: "130px" }}
    >
      <header className="cabecera-simulador">
        <Link to="/" className="volver">
          ← Estaciones
        </Link>
        <h1>Conductores y aislantes</h1>
      </header>
      <p className="instrucciones instrucciones-larga instrucciones-materiales">
        Mismo campo eléctrico para los dos materiales. En el conductor los electrones son libres y se
        corren hacia la placa positiva; en el aislante están atados a su átomo. Cambia el voltaje y
        compara.
      </p>
      <p className="instrucciones instrucciones-corta">
        Mismo campo para los dos materiales. Mueve el voltaje y compara.
      </p>
      <div className="simulador">
        <div className="simulador-lienzo materiales-zona">
          <div className="materiales-info">
            <p className="materiales-aviso" role="note">
              <strong>
                <span aria-hidden="true">
                  Recorte microscópico, ampliado {ZOOM_PARCHE}×
                </span>
                <span className="sr-only">Recorte microscópico, ampliado {ZOOM_PARCHE} veces</span>
              </strong>
            </p>
            <LeyendaMateriales />
            <ChipPausaMateriales />
          </div>
          <CanvasMateriales
            controladorRef={controladorRef}
            cabeceraConductor={<CabeceraMaterial tipo="conductor" />}
            pieConductor={
              <>
                <LecturaMaterial tipo="conductor" />
                <DescripcionMaterial tipo="conductor" />
              </>
            }
            cabeceraAislante={<CabeceraMaterial tipo="aislante" />}
            pieAislante={
              <>
                <LecturaMaterial tipo="aislante" />
                <DescripcionMaterial tipo="aislante" />
              </>
            }
          />
          {/* Pantalla angosta: el voltaje queda fijo al pie mientras se recorren los dos lienzos. */}
          <div className="materiales-voltaje-movil">
            <ControlVoltaje />
          </div>
        </div>
        <div className="simulador-lateral">
          <PanelMateriales controladorRef={controladorRef} />
          <details className="notas-modelo">
            <summary>Notas sobre el modelo</summary>
            <ul>
              <li className="notas-subtitulo" aria-hidden="true">
                Lo que ves
              </li>
              <li>
                Cada material es un recorte microscópico de 140 átomos ampliado {ZOOM_PARCHE} veces, no
                un objeto completo. En un metal real los electrones de conducción son casi libres y el
                campo dentro es todavía menor que en este modelo: prácticamente nulo.
              </li>
              <li>
                Puntos rojos pequeños: átomos fijos (carga positiva). Círculos grandes azules:
                electrones (carga negativa). Los bordes se iluminan en azul, con signos «−», donde se
                acumulan electrones, y en rojo, con signos «+», donde quedan átomos sin compensar. Las
                líneas blancas dentro de cada material continúan las del campo de fuera: cuantas menos
                hay, más campo se apartó.
              </li>
              <li>
                El recuadro punteado es la zona donde se mide el campo dentro: un promedio sobre los 4
                por 4 átomos del centro.
              </li>
              <li className="notas-subtitulo" aria-hidden="true">
                Simplificaciones
              </li>
              <li>
                Es un fragmento microscópico ampliado, con unos pocos cientos de electrones. Según el
                voltaje y la orientación de las placas, el campo dentro del conductor queda en menos
                del 2 % del externo, prácticamente cero: desde menos del 1 % (a partir de 60 kV) hasta
                cerca del 1,5 % con campos débiles. El del aislante queda en el 80 % o el 90 %. Esos
                valores pequeños oscilan de forma irregular al mover el voltaje, y a veces el campo
                dentro sale ligeramente invertido: es ruido de la carga de superficie discreta del
                modelo, no un efecto físico. No se llega a cero exacto.
              </li>
              <li>
                En el modelo cada átomo todavía retiene un poco a sus electrones, por eso queda algo de
                campo. En un metal real los electrones de conducción son casi libres y el campo dentro
                es aún menor. Que el resultado sea casi cero no depende de tener muchos electrones: en
                este modelo lo decide cuánto retiene cada átomo a los suyos.
              </li>
              <li>
                Los bordes del recuadro son la superficie del material: los electrones libres no pueden
                salir de él (en la realidad lo impide la energía que cuesta arrancarle un electrón a un
                metal). A voltajes altos se apilan contra ese borde, en una capa más gruesa que un
                átomo.
              </li>
              <li>
                Las masas, las cargas y los tiempos de este modelo están en una escala propia, elegida
                para que el movimiento se vea en unos segundos. No son los de un electrón real.
              </li>
              <li>
                Las cargas están «difusas»: cada una se reparte en una nube algo más ancha que la
                separación entre átomos (1,5 veces). Con cargas puntuales, los electrones quedarían
                atrapados en su átomo y el conductor casi no se distinguiría del aislante.
              </li>
              <li>
                Los electrones del conductor pierden energía por fricción (como en una resistencia
                eléctrica), por eso se asientan en unos segundos en vez de oscilar para siempre.
              </li>
              <li>
                El aislante de este modelo no tiene interacción entre átomos vecinos; en la realidad hay
                pequeñas correcciones por los átomos cercanos. Aun así, se polariza: sus electrones sí se
                corren un poco y eso reduce algo el campo. Cuánto lo reduce depende del material: este
                aislante es poco polarizable; un vidrio o un plástico real reduce el campo bastante
                más.
              </li>
              <li>
                La forma del recorte importa: con las placas a los lados, el aislante reduce el campo
                un 10 % en vez de un 20 %, y el conductor, con campos débiles, aparta algo menos que
                con las placas arriba y abajo.
              </li>
              <li>
                Al quitar o cambiar mucho el campo, los electrones del conductor tardan un rato en
                acomodarse del todo (son casi libres y se mueven con poca fuerza restauradora).
                «Reiniciar» devuelve todo al estado inicial.
              </li>
              <li className="notas-subtitulo" aria-hidden="true">
                El campo uniforme (las placas)
              </li>
              <li>
                Modela un capacitor de placas paralelas ideal, con las placas a 10 cm. A partir de cierto
                voltaje el campo superaría la rigidez dieléctrica del aire real (unos 3 millones de V/m):
                en la realidad saltarían chispas antes de llegar al máximo de este control.
              </li>
            </ul>
          </details>
        </div>
      </div>
    </main>
  );
}
