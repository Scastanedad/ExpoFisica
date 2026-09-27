import { DELTA_V_SI } from "../fisica/equipotenciales";
import { formatSI } from "../fisica/escala";
import { useSimulacionStore } from "../store/simulacionStore";

/** Reemplaza el último espacio por uno duro (U+00A0) para que "200 kV" no se parta al final de línea. */
function sinCorte(texto: string): string {
  return texto.replace(/ (?=\S+$)/, " ");
}

interface Props {
  /** Cargas de la estación actual (cada una lee su propia lista: estática o dinámica). */
  cargas: ReadonlyArray<{ q: number }>;
}

/**
 * Leyenda de las vistas "Líneas de campo" y "Equipotenciales" (E2.3 §9, fase 2
 * §B2): qué significa cada trazo del lienzo. Es texto del DOM (no del canvas)
 * para que se lea a cualquier tamaño y con lector de pantalla; las muestras de
 * trazo son decorativas. Las líneas blancas se explican en ambos modos (las
 * dibuja también "Líneas de campo"); las curvas ámbar solo en "Equipotenciales".
 * Los textos de las curvas y el campo son los del físico, tal cual; "(mismo
 * voltaje)" es una aclaración para público general sin alterar esa frase.
 */
export function LeyendaVista({ cargas }: Props) {
  const modoVista = useSimulacionStore((s) => s.modoVista);
  if (modoVista !== "lineas" && modoVista !== "equipotenciales") return null;
  const equipotenciales = modoVista === "equipotenciales";
  const hayAmbosSignos = cargas.some((c) => c.q > 0) && cargas.some((c) => c.q < 0);
  const paso = sinCorte(formatSI(DELTA_V_SI, "V"));

  return (
    <ul className="leyenda-vista" aria-label="Qué significa cada trazo del lienzo">
      {equipotenciales && (
        <li>
          <span className="muestra-trazo muestra-equipotencial" aria-hidden="true" />
          <span>
            Curvas ámbar: mismo potencial (mismo voltaje); cada curva difiere {paso} de la vecina.
          </span>
        </li>
      )}
      {equipotenciales && (
        <li>
          <span className="muestra-trazo muestra-negativa" aria-hidden="true" />
          <span>Discontinua: potencial negativo.</span>
        </li>
      )}
      {equipotenciales && hayAmbosSignos && (
        <li>
          <span className="muestra-trazo muestra-cero" aria-hidden="true" />
          <span>La curva más gruesa es 0 V (potencial nulo respecto a un punto muy lejano).</span>
        </li>
      )}
      <li>
        <span className="muestra-trazo muestra-campo" aria-hidden="true" />
        <span>Líneas blancas: campo eléctrico; cortan cada curva en ángulo recto.</span>
      </li>
      <li>
        <span className="muestra-trazo muestra-campo" aria-hidden="true" />
        <span>
          Las flechas de las líneas señalan hacia dónde empujaría el campo a una carga positiva (a una
          negativa, al revés).
        </span>
      </li>
    </ul>
  );
}
