/**
 * Estación 5 · Ley de Gauss (`/ley-de-gauss`). Una superficie fija en el origen y hasta dos cargas que se arrastran
 * por el suelo (la altura es el deslizador vertical junto al lienzo). Estado de UI en `store/gauss3dStore.ts`; las
 * posiciones x, y, el azimut en curso y la calidad de cálculo viven en el controlador (`render/controladorGauss3d.ts`).
 */
import { useId, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { formatDistancia } from "../fisica/escala";
import { ESCENARIOS } from "../fisica/gauss3d/escenarios";
import { RANGOS } from "../fisica/gauss3d/constantes";
import { uAMetros } from "../fisica/gauss3d/unidades";
import { useTituloDocumento } from "../hooks/useTituloDocumento";
import { CanvasGauss3D } from "../render/CanvasGauss3D";
import type { ControladorGauss3D } from "../render/controladorGauss3d";
import { Z_MAX, Z_MIN, Z_PASO, useGauss3dStore } from "../store/gauss3dStore";
import { PanelGauss3D } from "../ui/PanelGauss3D";
import { RotuloGauss3D, TextosGauss3D } from "../ui/RotuloGauss3D";

function descripcionEscena(forma: string, nCargas: number, escenario: string): string {
  const nombre: Record<string, string> = {
    parche: "un parche plano",
    esfera: "una esfera",
    cubo: "un cubo",
    cilindro: "un cilindro",
  };
  return `Escena 3D: ${nombre[forma] ?? forma} como superficie gaussiana, con ${nCargas === 1 ? "una carga" : "dos cargas"}. Escenario: ${escenario}. Arrastra una carga para moverla o usa las flechas del teclado.`;
}

export function LeyDeGauss() {
  useTituloDocumento("Ley de Gauss · ExpoFísica");
  const controladorRef = useRef<ControladorGauss3D | null>(null);
  const [anuncio, setAnuncio] = useState("");
  const idAyuda = useId();
  const forma = useGauss3dStore((s) => s.forma);
  const nCargas = useGauss3dStore((s) => s.cargas.length);
  const escenarioId = useGauss3dStore((s) => s.escenarioId);
  const seleccionada = useGauss3dStore((s) => s.seleccionada);
  const carga = useGauss3dStore((s) => s.cargas[s.seleccionada]);
  const setZ = useGauss3dStore((s) => s.setZ);

  function anunciar(texto: string) {
    setAnuncio((previo) => (previo === texto ? `${texto} ` : texto));
  }

  const alturaTexto = carga ? (carga.z === 0 ? "0 cm" : formatDistancia(uAMetros(carga.z))) : "";
  const soltar = () => controladorRef.current?.soltar();

  return (
    // --reserva-v/--reserva-lateral: cabecera + instrucciones + rótulo bajo el lienzo + margen.
    <main
      className="pagina-simulador"
      style={{ ["--reserva-v" as string]: "176px", ["--reserva-lateral" as string]: "150px" }}
    >
      <header className="cabecera-simulador">
        <Link to="/" className="volver">
          ← Estaciones
        </Link>
        <h1>Ley de Gauss</h1>
      </header>
      <p className="instrucciones instrucciones-estable instrucciones-larga">
        Una superficie imaginaria y una o dos cargas: arrastra las cargas por el suelo, súbelas o bájalas con el deslizador
        vertical y mira cuánto campo atraviesa la superficie (el flujo, Φ).
      </p>
      <p className="instrucciones instrucciones-estable instrucciones-corta">
        Arrastra las cargas por el suelo y mira cuánto campo atraviesa la superficie.
      </p>
      <p className="sr-only" aria-live="polite">
        {anuncio}
      </p>
      <div className="simulador">
        <div className="simulador-lienzo">
          <div className="gauss3d-marco">
            <CanvasGauss3D
              controladorRef={controladorRef}
              descripcion={descripcionEscena(forma, nCargas, ESCENARIOS[escenarioId - 1].nombre)}
              idAyuda={idAyuda}
              anunciar={anunciar}
            />
            <label className="gauss3d-altura">
              <span className="gauss3d-altura-etiqueta">
                Altura z{nCargas > 1 ? ` carga ${seleccionada + 1}` : ""}
              </span>
              <input
                type="range"
                className="gauss3d-altura-barra"
                min={Z_MIN}
                max={Z_MAX}
                step={Z_PASO}
                value={carga?.z ?? 0}
                aria-orientation="vertical"
                aria-label={`Altura z de la carga ${seleccionada + 1}, entre ${formatDistancia(uAMetros(RANGOS.carga.z.min))} y ${formatDistancia(uAMetros(RANGOS.carga.z.max))}`}
                aria-valuetext={`${alturaTexto} sobre el suelo`}
                onChange={(e) => setZ(Number(e.target.value))}
                onPointerUp={soltar}
                onPointerCancel={soltar}
                onKeyUp={soltar}
                onBlur={soltar}
              />
              <output className="gauss3d-altura-valor">{alturaTexto}</output>
            </label>
          </div>
          <RotuloGauss3D />
          <TextosGauss3D clase="gauss3d-textos-ancho" />
        </div>
        <div className="simulador-lateral gauss3d-lateral">
          <PanelGauss3D
            controladorRef={controladorRef}
            anunciar={anunciar}
            idAyuda={idAyuda}
            bajoEscenarios={<TextosGauss3D clase="gauss3d-textos-movil" />}
          />
        </div>
      </div>
    </main>
  );
}
