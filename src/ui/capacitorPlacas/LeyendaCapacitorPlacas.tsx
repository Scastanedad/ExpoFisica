/** Leyenda sencilla de la estación 08: qué se ve y qué significa (mismo patrón que las otras estaciones). */
export function LeyendaCapacitorPlacas() {
  return (
    <section className="panel-circuito leyenda-capacitor-placas" aria-label="Qué estás viendo">
      <h3 className="panel-circuito-titulo">Qué estás viendo</h3>
      <ul>
        <li>
          <strong>Capacitor:</strong> dos placas conductoras separadas por un aislante. Guarda carga y energía en el campo
          eléctrico que hay entre ellas: <em>C = Q/V</em>.
        </li>
        <li>
          <strong>Dieléctrico:</strong> un aislante cuyas moléculas se <em>polarizan</em> (los pequeños dipolos se alinean).
          En sus caras queda carga ligada que <em>debilita el campo</em> dentro: <em>E = E₀/κ</em>.
        </li>
        <li>
          <strong>κ (constante dieléctrica):</strong> cuántas veces sube la capacitancia al llenar el espacio entre las
          placas: <em>C = κ·C₀</em>.
        </li>
        <li>
          <strong>Rigidez dieléctrica:</strong> el campo máximo que aguanta el material antes de romperse y dejar pasar
          una chispa. Por eso las placas no se acercan más allá de <em>d = V / E máx</em>.
        </li>
        <li>
          <strong>Colores:</strong> ⊕ rojo claro y ⊖ azul claro son las cargas libres de las placas; las flechas cian son
          el campo (se vuelven ámbar al acercarse a la rigidez); el bloque de color es el dieléctrico.
        </li>
        <li>
          <strong>Modelo:</strong> campo uniforme y sin efectos de borde; el dibujo no está a escala (la separación y el
          número de cargas se muestran en escala logarítmica).
        </li>
      </ul>
    </section>
  );
}
