/**
 * Cabecera, lecturas en vivo y leyenda de la Estación 04. Los números salen de
 * `store/materialesStore.ts` (publicados a ~10 Hz por
 * `render/CanvasMateriales.tsx`). No usan `aria-live`: cambian varias veces
 * por segundo; el resumen para lector de pantalla lo anuncia `PanelMateriales`
 * una vez que las lecturas se estabilizan.
 *
 * Textos (checklist de honestidad, spec E5.2 §7): nunca se dice que el
 * conductor "cancela" el campo por completo ni que los electrones del aislante
 * "no se mueven".
 */
import { useId } from "react";
import { formatSI } from "../fisica/escala";
import { ESPACIADO_PX, type TipoMaterial } from "../fisica/materiales";
import { useMaterialesStore, type LecturaMaterial as Lectura } from "../store/materialesStore";

const TEXTOS: Record<TipoMaterial, { titulo: string; resumen: string }> = {
  conductor: {
    titulo: "Conductor",
    resumen:
      "Sus electrones son libres: viajan por el material y se acumulan en un borde, y el campo dentro queda casi en cero (no exactamente).",
  },
  aislante: {
    titulo: "Aislante",
    resumen:
      "Cada electrón está atado a su átomo por un resorte: se corre un poco, pero no puede viajar. El campo dentro se reduce poco.",
  },
};

/** Título del material, sobre su lienzo. */
export function CabeceraMaterial({ tipo }: { tipo: TipoMaterial }) {
  return (
    <figcaption className="materiales-cabecera">
      <h2>{TEXTOS[tipo].titulo}</h2>
    </figcaption>
  );
}

/** Qué es el material, bajo sus lecturas (arriba se queda solo el título: el lienzo aparece antes). */
export function DescripcionMaterial({ tipo }: { tipo: TipoMaterial }) {
  return <p className="materiales-descripcion">{TEXTOS[tipo].resumen}</p>;
}

/** Fila con la leyenda de lo que se ve en los lienzos: forma y tamaño además del color (no solo color). */
export function LeyendaMateriales() {
  return (
    <ul className="leyenda-vista leyenda-materiales" aria-label="Leyenda de los lienzos">
      <li>
        <span className="muestra-electron" aria-hidden="true" />
        Electrón (−)
      </li>
      <li>
        <span className="muestra-atomo" aria-hidden="true" />
        Átomo (+)
      </li>
      <li>
        <span className="muestra-trazo muestra-campo-flecha" aria-hidden="true" />
        Campo eléctrico
      </li>
      <li>
        <span className="muestra-zona" aria-hidden="true" />
        Zona donde se mide
      </li>
    </ul>
  );
}

/** Aviso visible sobre los lienzos cuando la simulación está en pausa (mismo estilo que la Estación 03). */
export function ChipPausaMateriales() {
  const enPausa = useMaterialesStore((s) => s.enPausa);
  if (!enPausa) return null;
  return <span className="rotulo-dipolo-pausa materiales-pausa">En pausa</span>;
}

function porcentaje(razon: number): string {
  const p = razon * 100;
  return `${p < 10 ? p.toFixed(1) : p.toFixed(0)} %`;
}

function fraccionDeSeparacion(l: Lectura): string {
  const f = (l.desplazamientoPx / ESPACIADO_PX) * 100;
  return `${f < 10 ? f.toFixed(1) : f.toFixed(0)} %`;
}

export function LecturaMaterial({ tipo }: { tipo: TipoMaterial }) {
  const lectura = useMaterialesStore((s) => s.lectura);
  const l: Lectura | null = lectura ? lectura[tipo] : null;
  const idTitulo = useId();
  const barra = l ? Math.max(0, Math.min(1, l.razon)) : 0;

  return (
    <section className="materiales-lectura" aria-labelledby={idTitulo}>
      <h3 id={idTitulo} className="materiales-lectura-titulo">
        Lecturas · {TEXTOS[tipo].titulo.toLowerCase()}
      </h3>
      {/* La cifra clave (cuánto campo queda dentro) va grande y pegada a su barra; el resto es secundario. */}
      <dl className="panel-energia-filas materiales-filas">
        <div className="materiales-cifra">
          <dt>Campo dentro</dt>
          <dd>
            <strong>{l ? porcentaje(l.razon) : "—"}</strong>
            <span> del externo</span>
          </dd>
        </div>
      </dl>
      <div className="materiales-barra" aria-hidden="true">
        <div className={`materiales-barra-relleno materiales-barra-${tipo}`} style={{ width: `${barra * 100}%` }} />
      </div>
      <dl className="panel-energia-filas materiales-filas materiales-filas-secundarias">
        <div>
          <dt>Campo dentro (|E|)</dt>
          <dd>{l ? formatSI(l.eInteriorSI, "N/C") : "—"}</dd>
        </div>
        <div>
          <dt>Corrimiento (respecto al espacio entre átomos)</dt>
          <dd>{l ? fraccionDeSeparacion(l) : "—"}</dd>
        </div>
      </dl>
    </section>
  );
}
