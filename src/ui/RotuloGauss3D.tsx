/**
 * Bajo el lienzo de la estación 5: lectura de Φ y de la carga encerrada (en µC/ε₀ y en SI), conteo real de líneas
 * que salen / entran / netas, leyenda (color del flujo, marcadores de cruce y flechas de E) y los textos educativos
 * según figura y fuente (`textosGauss3D.ts`), que cambian con lo que hace el visitante.
 * Sin aria-live: la región viva limitada es de la fase 5.
 */
import { formatFlujoSI, formatPhi } from "../fisica/gauss3d/unidades";
import { distanciaConSigno } from "../fisica/gauss3d/superficies";
import type { TipoSuperficie } from "../fisica/gauss3d/tipos";
import { superficieDeUI, useGauss3dStore } from "../store/gauss3dStore";
import { textoConteo, textoGauss } from "./textosGauss3D";

/** Una carga está «cerca» si queda a menos de esta distancia (u) de una superficie cerrada: puede estar cruzándola. */
const DIST_CERCA = 1.5;

/** Coma decimal como el resto de la interfaz. */
const coma = (t: string) => t.replace(/(\d)\.(\d)/g, "$1,$2");

const qConSigno = (q: number) => coma(`${q < -0.005 ? "−" : q > 0.005 ? "+" : ""}${Math.abs(q).toFixed(2)}`);

/** Los residuos de redondeo (≈ 1e-12) no se muestran como flujo. */
const sinResiduo = (v: number) => (Math.abs(v) < 1e-9 ? 0 : v);

function useDatos() {
  const lectura = useGauss3dStore((s) => s.lectura);
  const tamano = useGauss3dStore((s) => s.tamano);
  const thetaDeg = useGauss3dStore((s) => s.thetaDeg);
  const fuente = useGauss3dStore((s) => s.fuente);
  const cargasUI = useGauss3dStore((s) => s.cargas);
  const flujo = useGauss3dStore((s) => s.mostrar.flujo);
  const campo = useGauss3dStore((s) => s.mostrar.campo);
  const lineas = useGauss3dStore((s) => s.mostrar.lineas);

  const forma = (lectura?.tipo ?? "esfera") as TipoSuperficie;
  const cerrada = lectura !== null && lectura.tipo !== "parche";
  const conteo = lectura
    ? textoConteo({
        salen: lectura.salen,
        entran: lectura.entran,
        calidad: lectura.calidad,
        forma,
        cargas: lectura.cargas,
        nLineas: lineas ? lectura.nLineas : 0,
      })
    : null;
  const texto = lectura
    ? textoGauss({
        forma,
        fuente,
        tamano,
        thetaDeg,
        cargas: lectura.cargas.map((c, i) => {
          const xy = lectura.xy[i];
          const z = cargasUI[i]?.z;
          if (!cerrada || !xy || z === undefined) return c;
          const d = distanciaConSigno(superficieDeUI(forma, tamano, thetaDeg), [xy[0], xy[1], z]);
          return { ...c, cerca: Math.abs(d) < DIST_CERCA };
        }),
        phi: sinResiduo(lectura.phi),
      })
    : null;

  return { lectura, conteo, texto, cerrada, flujo, campo, lineas };
}

export function RotuloGauss3D() {
  const { lectura, conteo, cerrada } = useDatos();
  return (
    <div className="gauss3d-rotulo">
      <p className="gauss3d-lectura-fila" aria-label="Lectura del flujo">
        {lectura ? (
          <>
            <strong>{coma(formatPhi(sinResiduo(lectura.phi)))}</strong>
            <span title="Φ en newton por metro cuadrado sobre culombio">= {coma(formatFlujoSI(sinResiduo(lectura.phi)))}</span>
            {cerrada ? (
              <span className="gauss3d-qenc" title="Carga encerrada por la superficie">
                q_enc = {qConSigno(lectura.qEnc)} µC
              </span>
            ) : (
              <span>sin carga encerrada</span>
            )}
          </>
        ) : (
          <span>Calculando…</span>
        )}
      </p>
      {conteo && (
        <p className="gauss3d-conteo" aria-label="Líneas de campo que cruzan la superficie">
          <span>{conteo.salen}</span>
          <span>{conteo.entran}</span>
          <strong>{conteo.netas}</strong>
          {conteo.nota && <span className="gauss3d-nota">{conteo.nota}</span>}
        </p>
      )}
    </div>
  );
}

/** Textos educativos y leyenda. `clase` decide dónde se muestra (junto al lienzo en pantalla ancha, arriba de los controles en móvil). */
export function TextosGauss3D({ clase, solo }: { clase: string; solo?: "leyenda" }) {
  const { texto, flujo, campo, lineas } = useDatos();
  return (
    <div className={`gauss3d-rotulo ${clase}`}>
      {texto && !solo && (
        <section className="gauss3d-texto" aria-label="Qué mirar y qué pasa">
          <h2 className="gauss3d-texto-titulo">{texto.titulo}</h2>
          <p>
            <b>Qué mirar.</b> {texto.mirar}
          </p>
          <p>
            <b>Qué pasa.</b> {texto.pasa}
          </p>
          <p>
            <b>Por qué.</b> {texto.porque}
          </p>
        </section>
      )}
      <ul className="gauss3d-leyenda" aria-label="Leyenda y unidades">
        {flujo && (
          <>
            <li>
              <i className="gauss3d-muestra gauss3d-muestra-sale" aria-hidden="true" />
              Rojo: el campo sale
            </li>
            <li>
              <i className="gauss3d-muestra gauss3d-muestra-entra" aria-hidden="true" />
              Azul: el campo entra
            </li>
          </>
        )}
        {lineas && (
          <>
            <li>
              <i className="gauss3d-marca gauss3d-marca-sale" aria-hidden="true" />
              Punto lleno: una línea sale
            </li>
            <li>
              <i className="gauss3d-marca gauss3d-marca-entra" aria-hidden="true" />
              Anillo: una línea entra
            </li>
          </>
        )}
        {campo && (
          <li>
            <i className="gauss3d-muestra gauss3d-muestra-campo" aria-hidden="true" />
            Flechas ámbar: dirección de E, su longitud no está a escala
          </li>
        )}
        <li className="gauss3d-nota gauss3d-pie-unidades">Φ se da en µC/ε₀ (carga dividida por ε₀) y en N·m²/C.</li>
      </ul>
    </div>
  );
}
