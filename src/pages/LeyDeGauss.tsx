/**
 * Estación 5 · Ley de Gauss — PÁGINA PROVISIONAL de la fase 2 (render estático): permite ver los escenarios 1–9 y
 * cambiar forma, capas y vista para verificar el dibujo. La UI final (store, arrastre, deslizadores reducidos) es de la
 * fase 3; aquí no hay interacción con el lienzo.
 */
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ESCENARIOS } from "../fisica/gauss3d/escenarios";
import { crearSuperficie } from "../fisica/gauss3d/superficies";
import type { TipoSuperficie } from "../fisica/gauss3d/tipos";
import { formatFlujoSI, formatPhi } from "../fisica/gauss3d/unidades";
import { useTituloDocumento } from "../hooks/useTituloDocumento";
import { CanvasGauss3D } from "../render/CanvasGauss3D";
import type { LecturaGauss3D } from "../render/gauss3d/motor";

const FORMAS: ReadonlyArray<{ id: TipoSuperficie; nombre: string }> = [
  { id: "parche", nombre: "Parche" },
  { id: "esfera", nombre: "Esfera" },
  { id: "cubo", nombre: "Cubo" },
  { id: "cilindro", nombre: "Cilindro" },
];

const aRad = (g: number) => (g * Math.PI) / 180;

export function LeyDeGauss() {
  useTituloDocumento("Ley de Gauss · ExpoFísica");
  const [id, setId] = useState(2);
  const [fuera, setFuera] = useState(false);
  const [forma, setForma] = useState<TipoSuperficie | "">("");
  const def = ESCENARIOS[id - 1];
  const [mostrar, setMostrar] = useState(def.mostrar);
  const [azimutDeg, setAzimutDeg] = useState(35);
  const [inclinacionDeg, setInclinacionDeg] = useState(30);
  const [lectura, setLectura] = useState<LecturaGauss3D | null>(null);

  const cargas = useMemo(() => (fuera && def.variante ? def.variante.cargas : def.cargas), [def, fuera]);
  const superficie = useMemo(() => (forma ? crearSuperficie(forma) : def.superficie), [def, forma]);

  function elegir(n: number) {
    const d = ESCENARIOS[n - 1];
    setId(n);
    setFuera(false);
    setForma("");
    setMostrar(d.mostrar);
    setAzimutDeg(Math.round((d.vista.azimut * 180) / Math.PI));
    setInclinacionDeg(Math.round((d.vista.inclinacion * 180) / Math.PI));
  }

  const descripcion = `Escena 3D de la superficie gaussiana (${superficie.tipo}) con ${cargas.length === 1 ? "una carga" : "dos cargas"}: ${def.nombre}.`;

  return (
    <main className="pagina-simulador">
      <header className="cabecera-simulador">
        <Link to="/" className="volver">
          ← Estaciones
        </Link>
        <h1>Ley de Gauss</h1>
      </header>
      <p className="instrucciones instrucciones-estable">
        Vista provisional (fase 2): elige un escenario para ver la superficie, las líneas de campo y el flujo.
      </p>
      <div className="simulador">
        <div className="simulador-lienzo">
          <CanvasGauss3D
            superficie={superficie}
            cargas={cargas}
            mostrar={mostrar}
            azimut={aRad(azimutDeg)}
            inclinacion={aRad(inclinacionDeg)}
            descripcion={descripcion}
            alLeer={setLectura}
          />
        </div>
        <div className="simulador-lateral gauss3d-lateral">
          <div className="gauss3d-escenarios" role="group" aria-label="Escenarios">
            {ESCENARIOS.map((e) => (
              <button
                key={e.id}
                type="button"
                className="gauss3d-boton"
                aria-pressed={e.id === id}
                aria-label={`Escenario ${e.id}: ${e.nombre}`}
                title={e.nombre}
                onClick={() => elegir(e.id)}
              >
                {e.id}
              </button>
            ))}
          </div>
          <p className="gauss3d-titulo">
            {def.id}. {def.nombre}
          </p>
          {def.variante && (
            <button type="button" className="gauss3d-boton gauss3d-ancho" aria-pressed={fuera} onClick={() => setFuera((v) => !v)}>
              {fuera ? "Carga fuera" : "Carga dentro"}
            </button>
          )}
          <label className="gauss3d-campo">
            Forma
            <select value={forma} onChange={(e) => setForma(e.target.value as TipoSuperficie | "")}>
              <option value="">Del escenario</option>
              {FORMAS.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.nombre}
                </option>
              ))}
            </select>
          </label>
          <fieldset className="gauss3d-capas">
            <legend>Capas</legend>
            {(
              [
                ["lineas", "Líneas de campo"],
                ["flujo", "Flujo (parches)"],
                ["campo", "Flechas del campo E"],
              ] as const
            ).map(([k, nombre]) => (
              <label key={k}>
                <input type="checkbox" checked={mostrar[k]} onChange={(e) => setMostrar({ ...mostrar, [k]: e.target.checked })} />
                {nombre}
              </label>
            ))}
          </fieldset>
          <label className="control-deslizador">
            Giro
            <input type="range" min={-180} max={180} step={5} value={azimutDeg} onChange={(e) => setAzimutDeg(Number(e.target.value))} />
            <output>{azimutDeg}°</output>
          </label>
          <label className="control-deslizador">
            Altura
            <input type="range" min={15} max={85} step={5} value={inclinacionDeg} onChange={(e) => setInclinacionDeg(Number(e.target.value))} />
            <output>{inclinacionDeg}°</output>
          </label>
          {lectura && (
            <dl className="gauss3d-lectura" aria-live="off">
              <div>
                <dt>Flujo</dt>
                <dd>{formatPhi(lectura.phi)}</dd>
              </div>
              <div>
                <dt>En SI</dt>
                <dd>{formatFlujoSI(lectura.phi)}</dd>
              </div>
              <div>
                <dt>Carga encerrada</dt>
                <dd>{lectura.qEnc.toFixed(2)} µC</dd>
              </div>
              {lectura.nLineas > 0 && lectura.tipo !== "parche" && (
                <div>
                  <dt>Líneas que salen / entran</dt>
                  <dd>
                    {lectura.salen} / {lectura.entran}
                  </dd>
                </div>
              )}
            </dl>
          )}
        </div>
      </div>
    </main>
  );
}
