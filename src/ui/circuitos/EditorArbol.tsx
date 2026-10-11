import { MAX_ELEMENTOS, contarHojas, hojas } from "../../fisica/circuitos";
import { MENSAJE_PUENTE, useCircuitosStore } from "../../store/circuitosStore";
import { textoValorElemento } from "../../render/circuitos/textos";
import { SelectorSegmentado } from "../SelectorSegmentado";

/**
 * Editor del circuito: elegir un elemento y, sobre él, «añadir en serie», «añadir en paralelo» o «quitar»
 * (tope de 6). Teclado: el selector es un grupo de opciones con flechas; los botones tienen 44 px y usan
 * `aria-disabled` para no perder el foco. El aviso (tope, mínimo) se anuncia con `role="status"`.
 */
export function EditorArbol() {
  const arbol = useCircuitosStore((s) => s.arbol);
  const dominio = useCircuitosStore((s) => s.dominio);
  const seleccion = useCircuitosStore((s) => s.seleccion);
  const topologia = useCircuitosStore((s) => s.topologia);
  const mensaje = useCircuitosStore((s) => s.mensaje);
  const seleccionar = useCircuitosStore((s) => s.seleccionar);
  const agregarEnSerie = useCircuitosStore((s) => s.agregarEnSerie);
  const agregarEnParalelo = useCircuitosStore((s) => s.agregarEnParalelo);
  const quitarSeleccionado = useCircuitosStore((s) => s.quitarSeleccionado);

  const lista = hojas(arbol);
  const n = contarHojas(arbol);
  const fijo = topologia === "puente";
  const lleno = n >= MAX_ELEMENTOS || fijo;
  const nombre = dominio === "R" ? "resistor" : "capacitor";
  const opciones = lista.map((h) => ({
    valor: h.id,
    etiqueta: h.id,
    descripcion: `${nombre} de ${textoValorElemento(dominio, h.valor)}`,
  }));

  return (
    <section className="editor-arbol" aria-label="Armar el circuito">
      <h3 className="editor-arbol-titulo">
        Elementos ({n} de {MAX_ELEMENTOS})
      </h3>
      {seleccion !== null && lista.some((h) => h.id === seleccion) ? (
        <SelectorSegmentado
          etiquetaGrupo="Elemento seleccionado"
          opciones={opciones}
          valor={seleccion}
          alElegir={seleccionar}
        />
      ) : null}
      <div className="editor-arbol-acciones">
        <button type="button" aria-disabled={lleno} onClick={agregarEnSerie}>
          Añadir en serie
        </button>
        <button type="button" aria-disabled={lleno} onClick={agregarEnParalelo}>
          Añadir en paralelo
        </button>
        <button type="button" aria-disabled={n <= 1 || fijo} onClick={quitarSeleccionado}>
          Quitar
        </button>
      </div>
      <p className="editor-arbol-aviso" role="status">
        {mensaje ??
          (fijo
            ? MENSAJE_PUENTE
            : seleccion ? `Se añade junto a ${seleccion} y copia su valor.` : "Elige un elemento para añadir junto a él.")}
      </p>
    </section>
  );
}
