import { useMemo } from "react";
import { Link } from "react-router-dom";
import {
  A_MAX,
  A_MIN,
  D_MAX,
  D_MIN,
  calcularEstado,
  dMinima,
  dielectricoPorId,
  qMaxima,
  vMaxima,
  type Modo,
} from "../fisica/capacitorPlacas";
import { useTituloDocumento } from "../hooks/useTituloDocumento";
import { CanvasCapacitorPlacas } from "../render/CanvasCapacitorPlacas";
import { useCapacitorPlacasStore } from "../store/capacitorPlacasStore";
import { EditorValor } from "../ui/circuitos/EditorValor";
import { LeyendaCapacitorPlacas } from "../ui/capacitorPlacas/LeyendaCapacitorPlacas";
import { MedidorRigidez } from "../ui/capacitorPlacas/MedidorRigidez";
import { SelectorDielectrico } from "../ui/capacitorPlacas/SelectorDielectrico";
import { TablaCapacitorPlacas } from "../ui/capacitorPlacas/TablaCapacitorPlacas";
import {
  fmtArea,
  fmtE,
  fmtMetros,
  fmtQ,
  fmtV,
  textoBloqueo,
  textoEstado,
  textoFuerza,
  textoRigidez,
  textoTrabajo,
} from "../ui/capacitorPlacas/textosCapacitor";
import { SelectorSegmentado } from "../ui/SelectorSegmentado";

const Q_MIN = 1e-10;

/** Estación 08 · Capacitor de placas: UN capacitor, su campo y su dieléctrico (E7 son redes RC). */
export function CapacitorPlacas() {
  useTituloDocumento("Capacitor de placas · ExpoFísica");
  const p = useCapacitorPlacasStore((s) => s.p);
  const referencia = useCapacitorPlacasStore((s) => s.referencia);
  const bloqueo = useCapacitorPlacasStore((s) => s.bloqueo);
  const cambiar = useCapacitorPlacasStore((s) => s.cambiar);
  const setModo = useCapacitorPlacasStore((s) => s.setModo);
  const fijarReferencia = useCapacitorPlacasStore((s) => s.fijarReferencia);
  const soltarReferencia = useCapacitorPlacasStore((s) => s.soltarReferencia);
  const reiniciar = useCapacitorPlacasStore((s) => s.reiniciar);

  const e = useMemo(() => calcularEstado(p), [p]);
  const mat = dielectricoPorId(p.materialId);
  const rigidez = textoRigidez(p, e);
  const hayLamina = mat.id !== "aire";
  const fuerza = textoFuerza(e);

  const textos = (clase: string) => (
    <section className={`panel-circuito capacitor-textos ${clase}`} aria-label="Qué está pasando">
      <p className="capacitor-texto-estado">{textoEstado(p, e)}</p>
      <p className={`capacitor-texto-rigidez nivel-${rigidez.nivel}`}>{rigidez.texto}</p>
      <p className="aviso-reinicio capacitor-aviso" role="status">
        {bloqueo ? textoBloqueo(bloqueo, p, e) : ""}
      </p>
    </section>
  );

  return (
    <main className="pagina-simulador pagina-capacitor-placas">
      <header className="cabecera-simulador">
        <Link to="/" className="volver">
          ← Estaciones
        </Link>
        <h1>Capacitor de placas</h1>
      </header>
      <p className="instrucciones instrucciones-larga">
        Arrastra una placa para acercarla o alejarla y arrastra el bloque de color para meterlo entre las placas. El
        interruptor conecta o desconecta la batería. Compara con la referencia (con aire) en la tabla.
      </p>
      <p className="instrucciones instrucciones-corta">Arrastra las placas y el bloque de color; toca el interruptor.</p>
      <div className="simulador">
        <div className="simulador-lienzo">
          <CanvasCapacitorPlacas p={p} onCambiar={cambiar} onModo={setModo} />
          <MedidorRigidez p={p} e={e} />
          {textos("capacitor-textos-lienzo")}
        </div>
        <div className="simulador-lateral">
          {textos("capacitor-textos-lateral")}

          <section className="panel-circuito" aria-label="Conexión">
            <h3 className="panel-circuito-titulo">Batería</h3>
            <SelectorSegmentado<Modo>
              etiquetaGrupo="Batería"
              opciones={[
                { valor: "conectado", etiqueta: "Conectado", descripcion: "La batería mantiene el voltaje fijo" },
                { valor: "aislado", etiqueta: "Aislado", descripcion: "Sin batería: la carga queda fija" },
              ]}
              valor={p.modo}
              alElegir={setModo}
            />
          </section>

          <SelectorDielectrico valor={p.materialId} alElegir={(id) => cambiar({ materialId: id })} />

          <section className="panel-circuito" aria-label="Controles del capacitor">
            <h3 className="panel-circuito-titulo">Medidas del capacitor</h3>
            <EditorValor
              etiqueta="Área de las placas"
              valor={p.A * 1e4}
              min={A_MIN * 1e4}
              max={A_MAX * 1e4}
              escala="lineal"
              paso={5}
              formato={(v) => fmtArea(v * 1e-4)}
              alCambiar={(v) => cambiar({ A: v * 1e-4 })}
              ayuda="C depende de A y d: C = κ·ε₀·A/d."
            />
            <EditorValor
              etiqueta="Separación entre placas"
              valor={p.d * 1e3}
              min={D_MIN * 1e3}
              max={D_MAX * 1e3}
              escala="log"
              formato={(v) => fmtMetros(v * 1e-3)}
              alCambiar={(v) => cambiar({ d: v * 1e-3 })}
              ayuda={
                p.modo === "conectado"
                  ? `Más cerca de ${fmtMetros(dMinima(e.V, e.eLim))}, con ${fmtV(e.V)} el campo superaría la rigidez.`
                  : "Aislado: el campo no depende de d (E = Q/κε₀A); lo limita la carga."
              }
            />
            {p.modo === "conectado" ? (
              <EditorValor
                etiqueta="Voltaje de la batería"
                valor={p.V}
                min={1}
                max={Math.max(2, vMaxima(p.d, e.eLim))}
                escala="log"
                formato={fmtV}
                alCambiar={(v) => cambiar({ V: v })}
                ayuda={`Con esta separación el máximo es ${fmtV(vMaxima(p.d, e.eLim))}. La carga Q = ${fmtQ(e.Q)} se deriva.`}
              />
            ) : (
              <EditorValor
                etiqueta="Carga del capacitor"
                valor={Math.max(Q_MIN, p.Q)}
                min={Q_MIN}
                max={Math.max(Q_MIN * 10, qMaxima(p))}
                escala="log"
                formato={fmtQ}
                alCambiar={(q) => cambiar({ Q: q })}
                ayuda={`El voltaje V = ${fmtV(e.V)} se deriva. Carga máxima aquí: ${fmtQ(qMaxima(p))}.`}
              />
            )}
            {hayLamina ? (
              <EditorValor
                etiqueta="Cuánto entra el dieléctrico"
                valor={Math.round(p.f * 100)}
                min={0}
                max={100}
                escala="lineal"
                paso={5}
                formato={(v) => `${v} %`}
                alCambiar={(v) => cambiar({ f: v / 100 })}
                ayuda="También puedes arrastrar el bloque de color. Con inserción parcial hay dos capacitores en paralelo."
              />
            ) : (
              <p className="panel-circuito-nota">Elige un dieléctrico para poder meterlo entre las placas.</p>
            )}
            {fuerza ? <p className="panel-circuito-nota">{fuerza}</p> : null}
            <p className="panel-circuito-nota">{textoTrabajo(p)}</p>
          </section>

          <section className="panel-circuito" aria-label="Referencia">
            <h3 className="panel-circuito-titulo">Referencia</h3>
            <div className="capacitor-referencia">
              <button type="button" className="boton-banco" onClick={fijarReferencia}>
                Fijar referencia
              </button>
              {referencia.fijada ? (
                <button type="button" className="boton-banco" onClick={soltarReferencia}>
                  Volver al aire
                </button>
              ) : null}
              <button type="button" className="boton-banco" onClick={reiniciar}>
                Volver a empezar
              </button>
            </div>
            <p className="panel-circuito-nota">
              La referencia se toma con aire mientras no haya dieléctrico y se congela al meterlo. «Fijar referencia» guarda
              los valores de ahora ({fmtV(e.V)}, {fmtQ(e.Q)}, {fmtE(e.E)}).
            </p>
          </section>
        </div>
      </div>

      <section className="panel-circuito capacitor-tabla" aria-label="Tabla de valores">
        <h3 className="panel-circuito-titulo">Referencia contra actual</h3>
        <TablaCapacitorPlacas p={p} referencia={referencia} />
      </section>
      <LeyendaCapacitorPlacas />
    </main>
  );
}
