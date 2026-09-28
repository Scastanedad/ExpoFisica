/**
 * Exportación a CSV de las gráficas dinámicas (E4.1 §5), generada en el
 * cliente (sin backend, coherente con el resto de la app).
 *
 * Formato de columnas: se reutiliza el formato "largo/tidy" que YA expone
 * `datos/series.ts` (`seriesACSV`/`serieAFilaCSV`, T4.1, ya probado con 33
 * tests) en vez del formato "ancho" de columnas fijas del ejemplo de E4.1
 * §5.2 -- decisión explícita del orquestador (ver informe de la tarea):
 * reutilizar la API ya construida y probada es preferible a duplicar lógica
 * de formato de CSV. La curva teórica de la gráfica de distancia se modela
 * como dos series más ("E_teorico", "V_teorico") dentro de la MISMA
 * colección/exportación, con muestras en los mismos `r` que la curva medida
 * (para poder comparar fila a fila) -- ver `construirCSVDistancia`.
 *
 * Precisión numérica: `seriesACSV` usa `toFixed(6)` (6 decimales fijos), NO
 * el `toPrecision(6)` con notación exponencial automática que pide E4.1 §5.1
 * -- otra consecuencia de no tocar `series.ts` (ya probado). Es una diferencia
 * de formato, no de contenido: los números son igual de honestos, solo con
 * más dígitos en valores muy grandes o muy pequeños en vez de notación "e+7".
 */
import {
  serieAFilaCSV,
  seriesACSV,
  type ColeccionSeries,
  type FilaCSV,
} from "../datos/series";
import { K_VISUAL } from "../fisica/coulomb";
import type { CurvaDistancia, PuntoCurvaTeorica } from "../fisica/muestreoDistancia";

const SALTO = "\r\n";

export interface CargaParaMetadatos {
  id: string;
  /** Unidades (µC). */
  q: number;
  x: number;
  y: number;
}

function lineaCargas(cargas: readonly CargaParaMetadatos[]): string {
  return cargas.map((c) => `${c.id},${c.q},${c.x.toFixed(1)},${c.y.toFixed(1)}`).join("; ");
}

/** Comentarios `#` comunes a todas las gráficas (E4.1 §5.3). */
function metadatosBase(estacion: string, cargas: readonly CargaParaMetadatos[], nota: string): string {
  const lineas = [
    "# ExpoFisica -- exportacion de graficas",
    `# generado: ${new Date().toISOString()}`,
    `# estacion: ${estacion}`,
    "# escala: 1 cuadro = 50 px = 1 cm; 1 unidad de carga = 1 microC (ver E0-escala-unidades)",
    `# K_VISUAL: ${K_VISUAL}`,
    `# cargas (id,q_uC,x_px,y_px): ${lineaCargas(cargas)}`,
    `# nota: ${nota}`,
  ];
  return lineas.join(SALTO) + SALTO;
}

/** Nombre de archivo con marca de tiempo (segura para el sistema de archivos: sin `:`). */
export function nombreArchivoCSV(base: string, estacion: string): string {
  const marca = new Date().toISOString().replace(/[:.]/g, "-");
  return `expofisica_${base}_${estacion}_${marca}.csv`;
}

/** CSV de K/U/E vs. tiempo ("Cargas en movimiento", E4.1 §5.2). */
export function construirCSVEnergia(coleccion: ColeccionSeries, cargas: readonly CargaParaMetadatos[]): string {
  const meta = metadatosBase(
    "cargas-en-movimiento",
    cargas,
    "energias en escala del modelo (softening dinamico incluido); no son julios de laboratorio",
  );
  const filas: FilaCSV[] = ["K", "U", "E"]
    .map((clave) => coleccion.serie(clave))
    .filter((s): s is NonNullable<typeof s> => s !== undefined)
    .map((s) => serieAFilaCSV(s));
  return meta + seriesACSV(filas, { factorTiempo: 1 });
}

/** CSV de |E|/V/|F| en q₀ vs. tiempo ("Cargas en reposo", E4.1 §5.2). */
export function construirCSVQ0(coleccion: ColeccionSeries, cargas: readonly CargaParaMetadatos[]): string {
  const meta = metadatosBase(
    "cargas-en-reposo",
    cargas,
    "lectura de q0 con el mismo suavizado que las curvas dibujadas (SOFTENING2_ESTATICO); coincide con el panel en vivo",
  );
  const filas: FilaCSV[] = ["moduloE", "v", "moduloF"]
    .map((clave) => coleccion.serie(clave))
    .filter((s): s is NonNullable<typeof s> => s !== undefined)
    .map((s) => serieAFilaCSV(s));
  return meta + seriesACSV(filas, { factorTiempo: 1 });
}

/**
 * CSV de la gráfica vs. distancia ("Cargas en reposo", E4.1 §5.2): medida y
 * teórica intercaladas -- aquí, como series propias dentro de la misma
 * exportación (formato largo), en vez de columnas separadas. La teórica se
 * re-evalúa en los MISMOS `r` de la curva medida (fila a fila comparable) y
 * ADEMÁS se incluye una vez con sus propios `N_PUNTOS_TEORICOS` puntos
 * log-espaciados (serie "E_teorico_puro"/"V_teorico_puro"), para quien
 * prefiera graficar "la teoría" como una curva continua aparte.
 */
export function construirCSVDistancia(
  curva: CurvaDistancia,
  curvaTeoricaEnRMedidos: PuntoCurvaTeorica[],
  curvaTeoricaPura: readonly PuntoCurvaTeorica[],
  cargas: readonly CargaParaMetadatos[],
  linea: { a: { x: number; y: number }; b: { x: number; y: number } },
): string {
  const ref = cargas.find((c) => c.id === curva.cargaRefId);
  const metaExtra = [
    `# carga_referencia: id=${curva.cargaRefId}, q_uC=${curva.cargaRefQ}${
      ref ? `, x_px=${ref.x.toFixed(1)}, y_px=${ref.y.toFixed(1)}` : ""
    }`,
    `# linea: A=(${linea.a.x.toFixed(1)},${linea.a.y.toFixed(1)}) px, B=(${linea.b.x.toFixed(1)},${linea.b.y.toFixed(1)}) px`,
    `# linea_radial: ${curva.esLineaRadial}`,
  ].join(SALTO) + SALTO;

  const meta =
    metadatosBase(
      "cargas-en-reposo",
      cargas,
      "curva medida: superposicion exacta de todas las cargas, sin suavizado; curva teorica: SOLO la carga de referencia, aislada",
    ) + metaExtra;

  const filaR = (r: number) => r; // r ya en metros
  const medidaE: FilaCSV = {
    clave: "E_medido",
    etiqueta: "Campo medido |E|",
    unidad: "N/C",
    muestras: curva.muestras
      .filter((m) => m.eModulo !== null)
      .map((m) => ({ t: filaR(m.r), valor: m.eModulo! })),
  };
  const medidaV: FilaCSV = {
    clave: "V_medido",
    etiqueta: "Potencial medido V",
    unidad: "V",
    muestras: curva.muestras.filter((m) => m.v !== null).map((m) => ({ t: filaR(m.r), valor: m.v! })),
  };
  const teoricaE: FilaCSV = {
    clave: "E_teorico",
    etiqueta: "Campo teorico |E| (misma r que la medida)",
    unidad: "N/C",
    muestras: curvaTeoricaEnRMedidos.map((p) => ({ t: filaR(p.r), valor: p.eTeorico })),
  };
  const teoricaV: FilaCSV = {
    clave: "V_teorico",
    etiqueta: "Potencial teorico V (misma r que la medida)",
    unidad: "V",
    muestras: curvaTeoricaEnRMedidos.map((p) => ({ t: filaR(p.r), valor: p.vTeorico })),
  };
  const teoricaEPura: FilaCSV = {
    clave: "E_teorico_puro",
    etiqueta: "Campo teorico |E| (curva continua, log-espaciada)",
    unidad: "N/C",
    muestras: curvaTeoricaPura.map((p) => ({ t: filaR(p.r), valor: p.eTeorico })),
  };
  const teoricaVPura: FilaCSV = {
    clave: "V_teorico_puro",
    etiqueta: "Potencial teorico V (curva continua, log-espaciada)",
    unidad: "V",
    muestras: curvaTeoricaPura.map((p) => ({ t: filaR(p.r), valor: p.vTeorico })),
  };

  return (
    meta +
    seriesACSV([medidaE, medidaV, teoricaE, teoricaV, teoricaEPura, teoricaVPura], {
      factorTiempo: 1,
      columnaTiempo: "r_m",
    })
  );
}

/** Dispara la descarga de `contenido` como archivo `nombreArchivo` (solo navegador). */
export function descargarTexto(nombreArchivo: string, contenido: string): void {
  const blob = new Blob([contenido], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = nombreArchivo;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
