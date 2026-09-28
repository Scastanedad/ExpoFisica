import { useRef } from "react";
import { Link } from "react-router-dom";
import { useTituloDocumento } from "../hooks/useTituloDocumento";
import { CanvasDipolo } from "../render/CanvasDipolo";
import type { ControladorDipolo } from "../render/controladorDipolo";
import { AjustesDipolo, PanelDipolo } from "../ui/PanelDipolo";
import { LecturaDipolo } from "../ui/LecturaDipolo";
import { RotuloDipolo } from "../ui/RotuloDipolo";

export function Dipolos() {
  const controladorRef = useRef<ControladorDipolo | null>(null);

  // Título de la pestaña mientras la estación está abierta; al salir se restaura el anterior.
  useTituloDocumento("Dipolos · ExpoFísica");

  return (
    // --reserva-v/--reserva-lateral: alto de cabecera + instrucciones (2 líneas) + rótulo bajo el lienzo + margen.
    <main
      className="pagina-simulador"
      style={{ ["--reserva-v" as string]: "164px", ["--reserva-lateral" as string]: "140px" }}
    >
      <header className="cabecera-simulador">
        <Link to="/" className="volver">
          ← Estaciones
        </Link>
        <h1>Dipolos</h1>
      </header>
      <p className="instrucciones instrucciones-larga">
        Un dipolo son dos cargas opuestas unidas por una varilla: arrástralo. En campo uniforme gira y
        se balancea sin trasladarse; cerca de una carga puntual se alinea y es atraído.
      </p>
      <p className="instrucciones instrucciones-corta">
        Arrastra el dipolo. Uniforme: gira y se balancea. Carga puntual: se alinea y es atraído.
      </p>
      <div className="simulador">
        <div className="simulador-lienzo">
          <CanvasDipolo controladorRef={controladorRef} />
          <RotuloDipolo />
        </div>
        <div className="simulador-lateral">
          <PanelDipolo controladorRef={controladorRef} />
          <LecturaDipolo />
          <AjustesDipolo />
          <details className="notas-modelo">
            <summary>Notas sobre el modelo</summary>
            <ul>
              <li className="notas-subtitulo" aria-hidden="true">
                El dipolo
              </li>
              <li>
                Se simulan dos cargas puntuales reales (no la fórmula de libro de texto de un «dipolo
                ideal» de tamaño cero). En campo uniforme el par coincide exactamente con esa fórmula
                (τ = p×E). Cerca de una carga puntual la fuerza real se aparta de la ideal, unos pocos
                por ciento con la separación inicial y más cuanto más separes las cargas — un dipolo
                real siempre tiene tamaño.
              </li>
              <li>
                En campo uniforme, las fuerzas sobre +q y −q son iguales y opuestas: su suma es cero
                (por eso el dipolo no se traslada) pero forman un par que lo hace girar. Con una carga
                puntual el campo no es igual en los dos extremos: las dos fuerzas dejan de ser iguales
                y opuestas y queda una fuerza neta. Con el dipolo alineado con el campo, esa fuerza
                apunta hacia donde el campo es más intenso, es decir, hacia la carga.
              </li>
              <li>
                En campo uniforme NO hay fricción: el dipolo oscila alrededor de la posición alineada
                con el campo, sin perder energía mecánica y sin detenerse. La energía U de la lectura
                sube y baja porque se intercambia con la energía cinética del giro; es la suma de las
                dos la que se conserva (y no se muestra). Con una carga puntual sí hay una fricción
                que frena SOLO el giro, a propósito: es como una molécula polar que roza contra un
                medio (aire, líquido) que no se dibuja. Sin ella, el dipolo giraría para siempre y la
                atracción sería difícil de ver. La traslación no tiene fricción, y al llegar a la carga
                fuente el dipolo se detiene en el contacto (una simplificación para evitar la
                divergencia del campo a distancia cero).
              </li>
              <li>
                El momento de inercia con el que gira es una constante de escala visual (para que el
                giro se vea en unos segundos), no la inercia real de nada.
              </li>
              <li>
                Un dipolo es atraído por cualquier carga, positiva o negativa, una vez que se alinea con
                su campo: no solo «lo opuesto atrae».
              </li>
              <li>
                Las líneas de campo del modo «Carga puntual» son solo las de la carga fuente: las
                cargas del dipolo también crean campo, pero no se dibuja (ese campo propio no ejerce
                fuerza sobre el propio dipolo; el que lo mueve es el de la fuente). La fuente está
                sujeta por ti: no se simula su reacción a la fuerza del dipolo. Las flechas violeta son la
                fuerza sobre cada carga del dipolo, en escala logarítmica (una flecha el doble de larga
                no es el doble de fuerte).
              </li>
              <li>
                En campo de una carga puntual, la energía (U) es la energía de interacción exacta de las
                dos cargas reales con la fuente, no −p·E: esa fórmula solo es exacta para un dipolo
                puntual ideal o en campo uniforme.
              </li>
              <li className="notas-subtitulo" aria-hidden="true">
                El campo uniforme (las placas)
              </li>
              <li>
                Modela un capacitor de placas paralelas ideal: en la realidad las placas tendrían que
                ser mucho más grandes que la separación entre ellas para que el campo sea uniforme de
                borde a borde. Aquí se supone exacto por simplicidad.
              </li>
              <li>
                En el extremo del control el campo (unos 2 a 3 millones de V/m según la orientación de
                las placas) ya es del orden de la rigidez dieléctrica del aire real (unos 3 millones de
                V/m): en la realidad podrían saltar chispas cerca del máximo.
              </li>
            </ul>
          </details>
        </div>
      </div>
    </main>
  );
}
