/**
 * Estación 5 · Ley de Gauss (`/ley-de-gauss`). Una superficie fija en el origen y hasta dos cargas que se arrastran
 * por el suelo (la altura es el deslizador vertical junto al lienzo). Estado de UI en `store/gauss3dStore.ts`; las
 * posiciones x, y, el azimut en curso y la calidad de cálculo viven en el controlador (`render/controladorGauss3d.ts`).
 */
import { useEffect, useId, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { formatDistancia } from "../fisica/escala";
import { RANGOS } from "../fisica/gauss3d/constantes";
import { uAMetros } from "../fisica/gauss3d/unidades";
import { useTituloDocumento } from "../hooks/useTituloDocumento";
import { CanvasGauss3D } from "../render/CanvasGauss3D";
import type { ControladorGauss3D } from "../render/controladorGauss3d";
import { Z_MAX, Z_MIN, Z_PASO, useGauss3dStore } from "../store/gauss3dStore";
import { PanelGauss3D } from "../ui/PanelGauss3D";
import { crearAnunciador, describirEscena, textoAnuncioFlujo } from "../ui/anunciosGauss3D";
import { RotuloGauss3D, TextosGauss3D } from "../ui/RotuloGauss3D";

/** La descripción de la escena (para lectores de pantalla) se actualiza tras este reposo (ms): no cambia en cada cuadro del arrastre. */
const MS_DESCRIPCION = 500;

export function LeyDeGauss() {
  useTituloDocumento("Ley de Gauss · ExpoFísica");
  const controladorRef = useRef<ControladorGauss3D | null>(null);
  const [anuncio, setAnuncio] = useState("");
  const [anuncioFlujo, setAnuncioFlujo] = useState("");
  const [descripcion, setDescripcion] = useState("");
  const idAyuda = useId();
  const idDescripcion = useId();
  const forma = useGauss3dStore((s) => s.forma);
  const nCargas = useGauss3dStore((s) => s.cargas.length);
  const tamano = useGauss3dStore((s) => s.tamano);
  const thetaDeg = useGauss3dStore((s) => s.thetaDeg);
  const cargas = useGauss3dStore((s) => s.cargas);
  const lectura = useGauss3dStore((s) => s.lectura);
  const seleccionada = useGauss3dStore((s) => s.seleccionada);
  const carga = useGauss3dStore((s) => s.cargas[s.seleccionada]);
  const setZ = useGauss3dStore((s) => s.setZ);

  // Posición con el teclado: una pulsación por cuadro no debe leerse cada vez; solo la posición final (reposo ≥ 700 ms, ≥ 1 s entre anuncios).
  const anunciadorTeclado = useRef<ReturnType<typeof crearAnunciador> | null>(null);
  useEffect(() => {
    const an = crearAnunciador({
      emitir: (t) => setAnuncio((previo) => (previo === t ? `${t} ` : t)),
      ahora: () => performance.now(),
      fijar: (cb, ms) => window.setTimeout(cb, ms),
      cancelar: (id) => window.clearTimeout(id),
    });
    anunciadorTeclado.current = an;
    return () => {
      an.destruir();
      anunciadorTeclado.current = null;
    };
  }, []);

  function anunciar(texto: string) {
    setAnuncio((previo) => (previo === texto ? `${texto} ` : texto));
  }

  // Región viva de Φ y q_enc: solo cuando cambian los valores mostrados, tras reposo y con ≥ 1 s entre anuncios.
  const anunciador = useRef<ReturnType<typeof crearAnunciador> | null>(null);
  useEffect(() => {
    const an = crearAnunciador({
      emitir: setAnuncioFlujo,
      ahora: () => performance.now(),
      fijar: (cb, ms) => window.setTimeout(cb, ms),
      cancelar: (id) => window.clearTimeout(id),
    });
    anunciador.current = an;
    return () => {
      an.destruir();
      anunciador.current = null;
    };
  }, []);
  const textoFlujo = lectura ? textoAnuncioFlujo(lectura.phi, lectura.qEnc, lectura.tipo as typeof forma) : null;
  useEffect(() => {
    if (textoFlujo) anunciador.current?.proponer(textoFlujo);
  }, [textoFlujo]);

  // Descripción textual de la escena, vinculada al lienzo (aria-describedby) y actualizada tras un reposo.
  const textoEscena = describirEscena({
    forma,
    tamano,
    thetaDeg,
    cargas: cargas.map((c, i) => ({
      q: c.q,
      x: lectura?.xy[i]?.[0] ?? c.x0 ?? 0,
      y: lectura?.xy[i]?.[1] ?? c.y0 ?? 0,
      z: c.z,
      dentro: lectura?.cargas[i]?.dentro ?? false,
    })),
    phi: lectura ? lectura.phi : null,
    qEnc: lectura ? lectura.qEnc : null,
  });
  useEffect(() => {
    const id = window.setTimeout(() => setDescripcion(textoEscena), MS_DESCRIPCION);
    return () => window.clearTimeout(id);
  }, [textoEscena]);

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
      <p className="sr-only" aria-live="polite" aria-atomic="true">
        {anuncio}
      </p>
      <p className="sr-only" role="status" aria-live="polite" aria-atomic="true" data-region="flujo">
        {anuncioFlujo}
      </p>
      <p id={idDescripcion} className="sr-only">
        {descripcion || textoEscena}
      </p>
      <div className="simulador">
        <div className="simulador-lienzo">
          <div className="gauss3d-marco">
            <CanvasGauss3D
              controladorRef={controladorRef}
              descripcion="Escena 3D de la ley de Gauss: superficie y cargas"
              idDescripcion={idDescripcion}
              idAyuda={idAyuda}
              anunciar={(t) => anunciadorTeclado.current?.proponer(t)}
            />
            <label className="gauss3d-altura">
              <span className="gauss3d-altura-etiqueta">
                Altura z
                <br />
                {nCargas > 1 ? `carga ${seleccionada + 1}` : " "}
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
            bajoInterruptores={<TextosGauss3D clase="gauss3d-leyenda-lateral" solo="leyenda" />}
          />
        </div>
      </div>
    </main>
  );
}
