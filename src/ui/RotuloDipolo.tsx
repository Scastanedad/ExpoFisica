/**
 * Rótulo corto bajo el lienzo de la Estación 03: dice, sin abrir las notas, si el
 * giro que se ve tiene fricción (campo de una carga puntual: el giro se
 * amortigua y el dipolo se asienta; la traslación no tiene fricción) o no (campo uniforme: oscila sin parar), la leyenda del color de las
 * flechas de fuerza y, sobre todo con `prefers-reduced-motion` (la estación
 * arranca en pausa), un aviso visible de "En pausa".
 */
import { useDipoloStore } from "../store/dipoloStore";

export function RotuloDipolo() {
  const modoCampo = useDipoloStore((s) => s.modoCampo);
  const mostrarFuerzas = useDipoloStore((s) => s.mostrarFuerzas);
  const enPausa = useDipoloStore((s) => s.enPausa);

  return (
    <div className="rotulo-dipolo" role="status">
      <span>{modoCampo === "uniforme" ? "Sin fricción: oscila sin parar" : "Con fricción en el giro: se asienta"}</span>
      {mostrarFuerzas && (
        <span className="rotulo-dipolo-leyenda">
          <span className="muestra-trazo muestra-fuerza" aria-hidden="true" />
          Fuerza sobre cada carga
        </span>
      )}
      {enPausa && <span className="rotulo-dipolo-pausa">En pausa: pulsa Reanudar</span>}
    </div>
  );
}
