import { useRef } from "react";
import { Link } from "react-router-dom";
import { useTituloDocumento } from "../hooks/useTituloDocumento";
import { CanvasCampoContinuo } from "../render/CanvasCampoContinuo";
import type { ControladorCampoContinuo } from "../render/controladorCampoContinuo";
import { AjustesDipolo, PanelCampoContinuo } from "../ui/PanelCampoContinuo";
import { LecturaCampoContinuo } from "../ui/LecturaCampoContinuo";
import { useCampoContinuoStore } from "../store/campoContinuoStore";
import { RotuloCampoContinuo } from "../ui/RotuloCampoContinuo";

export function CampoContinuo() {
  const controladorRef = useRef<ControladorCampoContinuo | null>(null);
  const objeto = useCampoContinuoStore((s) => s.objeto);

  // Título de la pestaña mientras la estación está abierta; al salir se restaura el anterior.
  useTituloDocumento("Campo continuo · ExpoFísica");

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
        <h1>Campo continuo</h1>
      </header>
      {objeto === "carga" ? (
        <>
          <p className="instrucciones instrucciones-larga">
            Una carga libre en el campo: arrástrala y suéltala. Entre las placas acelera en línea recta;
            cerca de la carga fuente es atraída o repelida según su signo.
          </p>
          <p className="instrucciones instrucciones-corta">
            Arrastra la carga. Uniforme: acelera recto. Carga fuente: atrae o repele.
          </p>
        </>
      ) : (
        <>
          <p className="instrucciones instrucciones-larga">
            Un dipolo son dos cargas opuestas unidas por una varilla: arrástralo. En campo uniforme gira y
            se balancea sin trasladarse; cerca de una carga fuente se alinea y es atraído.
          </p>
          <p className="instrucciones instrucciones-corta">
            Arrastra el dipolo. Uniforme: gira y se balancea. Carga fuente: se alinea y es atraído.
          </p>
        </>
      )}
      <div className="simulador">
        <div className="simulador-lienzo">
          <CanvasCampoContinuo controladorRef={controladorRef} />
          <RotuloCampoContinuo />
        </div>
        <div className="simulador-lateral">
          <PanelCampoContinuo controladorRef={controladorRef} />
          <LecturaCampoContinuo />
          {objeto === "dipolo" && <AjustesDipolo />}
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
                La carga puntual libre
              </li>
              <li>
                Es una sola carga con masa, que se traslada (no gira: es un punto). Siente solo el campo
                de las placas o el de la carga fuente, F = qE. Es independiente del dipolo: nunca están
                los dos a la vez en el campo y no se ejercen fuerza entre sí.
              </li>
              <li>
                Entre las placas la fuerza es la misma en todo el recuadro: la carga acelera en línea
                recta, como una piedra que cae. Cerca de la carga fuente la fuerza crece al acercarse
                (ley 1/r²): con el mismo signo se repelen, con signo opuesto se atraen. A unos pocos
                milímetros de la fuente la simulación suaviza esa ley para que los números no se
                disparen: en el contacto la fuerza es hasta un 20 % menor que la real.
              </li>
              <li>
                No hay fricción: la energía cinética (K) sube lo que baja la potencial (U), y su suma se
                mantiene. En los bordes del recuadro rebota sin perder energía, como una pelota ideal:
                entre las placas vuelve a subir justo hasta la altura de la que la soltaste. Los bordes
                sin placa son paredes que no se dibujan. Contra una placa real no rebotaría: al tocarla
                intercambiaría carga con ella; aquí se simplifica a un rebote para que siga moviéndose.
              </li>
              <li>
                Al tocar la carga fuente se detiene contra ella (una simplificación, igual que con el
                dipolo, para evitar la divergencia del campo a distancia cero): ahí sí se pierde la
                energía del choque. La carga fuente está sujeta por ti y no se simula su reacción.
              </li>
              <li>
                La energía U = qV se mide con V = 0 en la placa negativa (entre las placas) o lejos de
                la fuente (carga fuente). Así, en la placa positiva U vale q por el voltaje del control.
              </li>
              <li>
                La masa de la carga es una constante de escala visual: el movimiento va en «cámara lenta»
                para que se pueda seguir con la vista. Una carga real de esta magnitud y masa pequeña
                cruzaría el recuadro en una fracción de segundo. Por eso no se muestra su rapidez en m/s:
                las fuerzas y las energías sí son las reales. La masa es la misma en los dos tipos de
                campo, así que se pueden comparar.
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
