import { calcularEstado, comparar, dielectricoPorId, type Cambio, type Estado, type Parametros, type Referencia } from "../../fisica/capacitorPlacas";
import {
  fmtArea,
  fmtC,
  fmtDensidad,
  fmtE,
  fmtMetros,
  fmtQ,
  fmtU,
  fmtV,
  porcentaje,
} from "./textosCapacitor";

interface Fila {
  clave: string;
  nombre: string;
  ref: number;
  act: number;
  formato: (v: number) => string;
}

const palabra: Record<Cambio["tipo"], string> = { sube: "sube", baja: "baja", igual: "igual" };

function filas(ref: Estado, act: Estado, p: Parametros): Fila[] {
  const A = p.A * p.d;
  const base: Fila[] = [
    { clave: "C", nombre: "C · capacitancia", ref: ref.C, act: act.C, formato: fmtC },
    { clave: "Q", nombre: "Q · carga", ref: ref.Q, act: act.Q, formato: fmtQ },
    { clave: "V", nombre: "V · tensión", ref: ref.V, act: act.V, formato: fmtV },
    { clave: "E", nombre: "E · campo", ref: ref.E, act: act.E, formato: fmtE },
    { clave: "U", nombre: "U · energía", ref: ref.U, act: act.U, formato: fmtU },
    { clave: "u", nombre: "u · energía por volumen", ref: ref.U / A, act: act.U / A, formato: fmtDensidad },
  ];
  const parcial = p.f > 0 && p.f < 1 && p.materialId !== "aire";
  if (parcial) {
    base.push(
      { clave: "uAire", nombre: "u en la zona de aire", ref: ref.uAire, act: act.uAire, formato: fmtDensidad },
      { clave: "uDiel", nombre: "u en la zona del dieléctrico", ref: ref.uAire, act: act.uDiel, formato: fmtDensidad },
    );
  }
  base.push({
    clave: "ratio",
    nombre: "E / E máx · margen",
    ref: ref.ratioRigidez,
    act: act.ratioRigidez,
    formato: porcentaje,
  });
  return base;
}

/**
 * Tabla accesible: para cada magnitud, valor de referencia (aire), valor actual y cambio. El cambio lleva
 * flecha y texto (no solo color) y una versión larga para lectores de pantalla. «(= κ)» indica que el cociente
 * coincide con la constante dieléctrica del material.
 */
export function TablaCapacitorPlacas({ p, referencia }: { p: Parametros; referencia: Referencia }) {
  const act = calcularEstado(p);
  const kappa = dielectricoPorId(p.materialId).kappa;
  const refP = referencia.p;
  const textoRef = `${referencia.fijada ? "fijada" : "con aire"}: ${refP.modo === "conectado" ? "conectado" : "aislado"}, A = ${fmtArea(refP.A)}, d = ${fmtMetros(refP.d)}${
    refP.materialId === "aire" ? "" : `, ${dielectricoPorId(refP.materialId).nombre}`
  }`;
  return (
    <div className="tabla-circuito-caja">
      <table className="tabla-circuito tabla-capacitor-placas">
        <caption>
          Referencia y valores actuales <span className="tabla-capacitor-ref">(referencia {textoRef})</span>
        </caption>
        <thead>
          <tr>
            <th scope="col">Magnitud</th>
            <th scope="col">Referencia</th>
            <th scope="col">Actual</th>
            <th scope="col">Cambio</th>
          </tr>
        </thead>
        <tbody>
          {filas(referencia.estado, act, p).map((f) => {
            const c = comparar(f.ref, f.act, kappa);
            return (
              <tr key={f.clave}>
                <th scope="row">{f.nombre}</th>
                <td>{f.formato(f.ref)}</td>
                <td>{f.formato(f.act)}</td>
                <td className={`cambio-${c.tipo}`}>
                  <span aria-hidden="true">{c.etiqueta}</span>
                  <span className="sr-only">
                    {palabra[c.tipo]}
                    {c.tipo === "igual" ? "" : ` ${c.etiqueta.replace(/^[↑↓]\s*/, "")}`}
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
