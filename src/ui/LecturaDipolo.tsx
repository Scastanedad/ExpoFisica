/**
 * Lecturas en vivo del dipolo (E5.1 §5): momento dipolar (p), ángulo, torque (τ),
 * fuerza neta y energía (U) -- publicadas por `CanvasDipolo.tsx` a ~10 Hz vía
 * `store/dipoloStore.ts`. La fórmula de U cambia según el modo (spec §5): en
 * campo uniforme es `−p·E` (exacta ahí); en campo de una carga puntual es la
 * energía de interacción exacta de las dos cargas reales con la fuente (para un
 * dipolo de tamaño finito, `−p·E` ya no es exacta). La explicación larga de U
 * vive en "Notas sobre el modelo" (`pages/Dipolos.tsx`).
 */
import { useId } from "react";
import { formatSI } from "../fisica/escala";
import { useDipoloStore } from "../store/dipoloStore";

/**
 * En campo uniforme la fuerza neta es CERO exacta (mismo campo en los dos extremos): lo que
 * quede es redondeo de coma flotante. Por debajo de este umbral (N) se muestra "≈ 0 N" en vez
 * de un número tipo 3e-13 N que sugeriría una fuerza real.
 */
const UMBRAL_FUERZA_NULA_N = 1e-9;

/**
 * El motor usa la convención del canvas (y hacia abajo: el ángulo crece en sentido horario en
 * pantalla). A la persona se le muestra la convención de los libros: el ángulo crece en sentido
 * antihorario y el torque positivo también es antihorario (por eso se invierte el signo del torque).
 */
function anguloAntihorario(anguloCanvasDeg: number): number {
  return (360 - anguloCanvasDeg) % 360;
}

export function LecturaDipolo() {
  const lectura = useDipoloStore((s) => s.lectura);
  const modoCampo = useDipoloStore((s) => s.modoCampo);
  const idTitulo = useId();

  const fuerzaNula = lectura !== null && modoCampo === "uniforme" && lectura.fuerzaNetaN < UMBRAL_FUERZA_NULA_N;
  const textoFuerza = lectura ? (fuerzaNula ? "≈ 0 N" : formatSI(lectura.fuerzaNetaN, "N")) : "—";

  return (
    <section className="panel-energia panel-dipolo-lecturas" aria-labelledby={idTitulo}>
      <h2 id={idTitulo} className="panel-energia-titulo">
        Lecturas
        <span className="panel-energia-subtitulo"> · del dipolo, en vivo</span>
      </h2>
      <dl className="panel-energia-filas">
        <div>
          <dt>Momento dipolar (p = qd)</dt>
          <dd>{lectura ? formatSI(lectura.pCm, "C·m") : "—"}</dd>
        </div>
        <div>
          <dt>Ángulo del eje (θ)</dt>
          <dd>{lectura ? `${anguloAntihorario(lectura.anguloDeg).toFixed(0)}°` : "—"}</dd>
        </div>
        <div>
          <dt>Torque (τ)</dt>
          <dd>{lectura ? formatSI(-lectura.torqueNm, "N·m") : "—"}</dd>
        </div>
        <div>
          <dt>Fuerza neta</dt>
          <dd>{textoFuerza}</dd>
        </div>
        <div className="panel-energia-total">
          <dt>{modoCampo === "uniforme" ? "Energía (U = −p·E)" : "Energía de interacción (U)"}</dt>
          <dd>{lectura ? formatSI(lectura.energiaJ, "J") : "—"}</dd>
        </div>
      </dl>
      {modoCampo === "uniforme" && (
        <p className="ayuda-mover">Fuerza neta ≈ 0: el campo gira el dipolo, pero no lo traslada.</p>
      )}
    </section>
  );
}
