/**
 * Rótulo corto bajo el lienzo de la Estación 03 (Campo continuo): dice, sin
 * abrir las notas, si lo que se ve tiene fricción (dipolo en campo de una
 * carga puntual: el giro se amortigua y el dipolo se asienta; la traslación no
 * tiene fricción; dipolo en campo uniforme: oscila sin parar; carga libre:
 * nunca hay fricción y rebota en los bordes), la leyenda del color de las
 * flechas de fuerza y, sobre todo con `prefers-reduced-motion` (la estación
 * arranca en pausa), un aviso visible de "En pausa".
 */
import { useCampoContinuoStore } from "../store/campoContinuoStore";

export function RotuloCampoContinuo() {
  const objeto = useCampoContinuoStore((s) => s.objeto);
  const modoCampo = useCampoContinuoStore((s) => s.modoCampo);
  const mostrarFuerzas = useCampoContinuoStore((s) => s.mostrarFuerzas);
  const enPausa = useCampoContinuoStore((s) => s.enPausa);

  const friccion =
    objeto === "carga"
      ? "Sin fricción: rebota en los bordes"
      : modoCampo === "uniforme"
        ? "Sin fricción: oscila sin parar"
        : "Con fricción en el giro: se asienta";

  return (
    <div className="rotulo-dipolo">
      <span>{friccion}</span>
      {mostrarFuerzas && (
        <span className="rotulo-dipolo-leyenda">
          <span className="muestra-trazo muestra-fuerza" aria-hidden="true" />
          {objeto === "carga" ? "Fuerza sobre la carga" : "Fuerza sobre cada carga"}
        </span>
      )}
      {/* Única región viva del rótulo: siempre montada para que el aviso se anuncie al aparecer. */}
      <span role="status" className={enPausa ? "rotulo-dipolo-pausa" : "sr-only"}>
        {enPausa ? "En pausa: pulsa Reanudar" : ""}
      </span>
    </div>
  );
}
