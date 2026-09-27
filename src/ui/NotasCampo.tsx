import { DELTA_V_SI } from "../fisica/equipotenciales";
import { formatSI } from "../fisica/escala";

/**
 * Notas del modelo sobre cómo se dibuja el campo (E2.1 §8 y E2.3 §9), comunes a
 * las dos estaciones: se insertan dentro del `<ul>` de "Notas sobre el modelo".
 * Solo dicen lo que el dibujo simplifica; la física de cada vista está en
 * fisica/equipotenciales.ts y fisica/lineasCampo.ts. Con subtítulos (Dibujo /
 * Física) para orientar la lectura (revisor-ui, fase 2 §C).
 */
export function NotasCampo() {
  return (
    <>
      <li className="notas-subtitulo" aria-hidden="true">
        Dibujo
      </li>
      <li>
        La longitud de cada flecha crece con la intensidad del campo en escala logarítmica: al
        duplicar la carga la flecha crece, pero no al doble.
      </li>
      <li>
        Cada línea de campo representa una cantidad fija de carga (normalmente 0.1 µC, es decir, 10
        líneas por µC). Con muchas cargas, o en equipos lentos, se dibujan menos líneas por carga,
        siempre en proporción a la carga.
      </li>
      <li>
        Las líneas de campo son un corte plano de un campo en tres dimensiones: dicen la dirección y,
        de forma cualitativa, dónde el campo es más intenso. La densidad de líneas no mide la
        intensidad: para eso mira qué tan juntas están las curvas.
      </li>
      <li>
        Cada curva equipotencial tiene {formatSI(DELTA_V_SI, "V")} más (o menos) que su vecina. Donde
        el campo es más intenso las curvas están más juntas; con más carga aparecen más curvas y más
        lejos de la carga. Cerca de cada carga no se dibujan más porque quedarían pegadas: el
        potencial de una carga puntual crece sin límite.
      </li>
      <li>
        Por ser un corte plano, cerca de cargas de magnitudes muy distintas (por ejemplo +5 µC y
        −0.5 µC) pueden llegar a una carga más líneas de las que le corresponden.
      </li>
      <li className="notas-subtitulo" aria-hidden="true">
        Física
      </li>
      <li>
        Con 5 µC el campo supera los 3 MV/m (lo que el aire seco aguanta sin ionizarse) a menos de
        unos 12 cm de la carga: en la realidad habría descargas eléctricas. Aquí ignoramos el aire: es
        electrostática en el vacío con cargas puntuales.
      </li>
    </>
  );
}
