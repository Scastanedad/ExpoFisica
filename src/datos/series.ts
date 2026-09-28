/**
 * Series temporales para las gráficas dinámicas de la Fase 4 (T4.1 del plan
 * v2). Buffer circular tipado, standalone (sin React, sin DOM): lo muestrea
 * `ingeniero-frontend` desde fuera del render (un `useEffect` con `rAF` o
 * `setInterval`), nunca desde el cuerpo de un componente. Este módulo no
 * decide QUÉ se grafica ni CÓMO se dibuja (eso es Canvas 2D / `uPlot` en
 * `src/render` o el panel "Gráficas" de T4.3): solo guarda los números y los
 * exporta a CSV.
 *
 * ## Supuestos documentados (no hay `E4.1-graficas.md` todavía)
 *
 * - **Unidad de `t`**: la misma que use el reloj del llamador. Se recomienda
 *   milisegundos de `performance.now()`, igual que el resto de la app
 *   (`worker/motorFisico.worker.ts` publica energía cada `INTERVALO_ENERGIA_MS
 *   = 250`; `fisica/empujon.ts` usa `MuestraPuntero.t` también en ms). Este
 *   módulo no impone la unidad: es un número monótono no decreciente.
 * - **Cadencias esperadas** (de la tarea, a confirmar por `fisico-revisor` en
 *   E4.1): energía K/U/Total ~4 Hz, lecturas de q₀/fuerza ~10 Hz. Por eso la
 *   capacidad por defecto se calcula para 10 Hz (`MUESTREO_MAX_HZ_SUPUESTO`),
 *   el peor caso de las dos.
 * - **Ventana de retención por defecto**: 120 s (`VENTANA_RETENCION_S_DEFECTO`),
 *   un valor razonable para una gráfica de exposición que no se deja corriendo
 *   horas. Es solo el valor por defecto de `capacidad`; cada serie puede pedir
 *   la suya con `capacidadParaVentana(hz, segundos)`.
 *
 * ## Decisión: capacidad fija (ring buffer) + ventana de lectura no destructiva
 *
 * El buffer NO descarta muestras por tiempo al hacer `push`: tiene una
 * capacidad fija en número de muestras (`Float64Array`, sin reallocar nunca) y,
 * al llenarse, sobrescribe la más antigua -- el criterio clásico de ring
 * buffer. Con una capacidad elegida para la frecuencia de muestreo esperada
 * (`capacidadParaVentana`), esto aproxima una ventana de tiempo fija sin tener
 * que mover ni reasignar memoria en cada `push` (coste O(1) siempre).
 *
 * La "ventana visible" que pida la UI (p. ej. "últimos 10 s" en un selector)
 * se aplica SOLO al leer, con `leer(ventanaS?)`: filtra una copia del
 * contenido actual sin tocar el buffer. Así la UI puede cambiar la ventana
 * visible libremente sin perder historia ya capturada (mientras siga dentro de
 * la capacidad), y `exportarCSV`/`aCSV` siempre puede volcar todo lo retenido
 * aunque la gráfica solo muestre una ventana corta.
 *
 * ## Formato CSV
 *
 * Las series pueden tener cadencias distintas (4 Hz vs. 10 Hz) y no comparten
 * necesariamente los mismos `t`. En vez de inventar una interpolación/alineado
 * sin especificación física, `seriesACSV` usa formato "largo" (tidy data): una
 * fila por muestra, con columnas `t_s, serie, etiqueta, unidad, valor` -- así
 * cada serie conserva sus propios instantes exactos y el CSV se abre sin
 * ambigüedad en cualquier hoja de cálculo. Cuando el llamador sabe que varias
 * series comparten exactamente los mismos `t` (p. ej. K/U/Total, publicadas
 * juntas por el Worker con `pushLote`), `seriesACSVAncho` ofrece el formato
 * "ancho" (una columna por serie) como comodidad opcional.
 */

// ---- Tipos base ----

/** Una muestra de una serie: instante `t` (unidad del llamador) y su valor. */
export interface Muestra {
  readonly t: number;
  readonly valor: number;
}

/** Metadatos + capacidad de una serie individual. */
export interface ConfigSerie {
  /** Identificador estable (p. ej. "K", "U", "total", "moduloE", "moduloF"). */
  clave: string;
  /** Nombre para mostrar en el selector/leyenda (p. ej. "Energía cinética"). */
  etiqueta: string;
  /** Unidad para mostrar y para el CSV (p. ej. "J", "N/C", "V", "N"). */
  unidad: string;
  /** Muestras máximas retenidas. Por defecto, `CAPACIDAD_DEFECTO`. */
  capacidad?: number;
}

/** Frecuencia de muestreo máxima para la que está pensado este módulo (T4.1). */
export const MUESTREO_MAX_HZ_SUPUESTO = 10;
/** Ventana de retención por defecto, en segundos (supuesto documentado arriba). */
export const VENTANA_RETENCION_S_DEFECTO = 120;

/** Capacidad (nº de muestras) para retener `segundos` a `hz`, con un 20 % de margen. */
export function capacidadParaVentana(hz: number, segundos: number): number {
  if (!(hz > 0) || !(segundos > 0)) return 1;
  return Math.max(1, Math.ceil(hz * segundos * 1.2));
}

/** Capacidad por defecto de una serie si no se especifica `ConfigSerie.capacidad`. */
export const CAPACIDAD_DEFECTO = capacidadParaVentana(
  MUESTREO_MAX_HZ_SUPUESTO,
  VENTANA_RETENCION_S_DEFECTO,
);

// ---- Serie individual (ring buffer) ----

/** Serie temporal con capacidad fija; ver decisiones de diseño arriba. */
export interface Serie {
  readonly clave: string;
  readonly etiqueta: string;
  readonly unidad: string;
  /** Nº máximo de muestras retenidas (fijo, no cambia tras crear la serie). */
  readonly capacidad: number;
  /** Añade una muestra. Ignora `t`/`valor` no finitos (NaN, ±Infinity). */
  push(t: number, valor: number): void;
  /** Nº de muestras retenidas actualmente (`0 <= longitud() <= capacidad`). */
  longitud(): number;
  /** Última muestra añadida, o `null` si la serie está vacía. */
  ultimo(): Muestra | null;
  /**
   * Copia de las muestras retenidas, en orden cronológico. Si se pasa
   * `ventanaS`, solo las que caen dentro de `[último.t - ventanaS, último.t]`
   * (no destructivo: el buffer no cambia). Asume que `push` se llamó con `t`
   * no decreciente.
   */
  leer(ventanaS?: number): Muestra[];
  /** Vacía la serie (mismos `clave`/`etiqueta`/`unidad`/`capacidad`). */
  vaciar(): void;
}

/** Crea una serie temporal con capacidad fija (`Float64Array`, sin reallocar). */
export function crearSerie(config: ConfigSerie): Serie {
  const capacidad = Math.max(1, Math.floor(config.capacidad ?? CAPACIDAD_DEFECTO));
  const tiempos = new Float64Array(capacidad);
  const valores = new Float64Array(capacidad);

  // `inicio`: índice físico de la muestra más antigua. `cuenta`: nº de
  // muestras válidas (<= capacidad). `siguiente`: índice físico donde se
  // escribirá el próximo `push`.
  let inicio = 0;
  let cuenta = 0;
  let siguiente = 0;

  function push(t: number, valor: number): void {
    if (!Number.isFinite(t) || !Number.isFinite(valor)) return;
    tiempos[siguiente] = t;
    valores[siguiente] = valor;
    if (cuenta < capacidad) {
      cuenta++;
    } else {
      // Buffer lleno: `siguiente` sobrescribe justo la muestra más antigua;
      // avanzar `inicio` es lo que "descarta" esa muestra.
      inicio = (inicio + 1) % capacidad;
    }
    siguiente = (siguiente + 1) % capacidad;
  }

  /** Índice físico de la i-ésima muestra en orden cronológico (0 = más antigua). */
  function indiceFisico(i: number): number {
    return (inicio + i) % capacidad;
  }

  function longitud(): number {
    return cuenta;
  }

  function ultimo(): Muestra | null {
    if (cuenta === 0) return null;
    const idx = (siguiente - 1 + capacidad) % capacidad;
    return { t: tiempos[idx], valor: valores[idx] };
  }

  function leer(ventanaS?: number): Muestra[] {
    if (cuenta === 0) return [];
    const desde =
      ventanaS !== undefined && Number.isFinite(ventanaS)
        ? tiempos[(siguiente - 1 + capacidad) % capacidad] - ventanaS
        : -Infinity;
    const salida: Muestra[] = [];
    for (let i = 0; i < cuenta; i++) {
      const idx = indiceFisico(i);
      const t = tiempos[idx];
      if (t >= desde) salida.push({ t, valor: valores[idx] });
    }
    return salida;
  }

  function vaciar(): void {
    inicio = 0;
    cuenta = 0;
    siguiente = 0;
  }

  return {
    clave: config.clave,
    etiqueta: config.etiqueta,
    unidad: config.unidad,
    capacidad,
    push,
    longitud,
    ultimo,
    leer,
    vaciar,
  };
}

// ---- Colección de series (selección de activas + push por lote) ----

export interface OpcionesColeccion {
  /** Claves activas al crear la colección. Por defecto: todas las de `configs`. */
  activasIniciales?: readonly string[];
}

/** Varias series simultáneas + qué subconjunto está "activo" (visible) en la UI. */
export interface ColeccionSeries {
  /** Añade una muestra a una serie por su clave. No-op si la clave no existe. */
  push(clave: string, t: number, valor: number): void;
  /**
   * Añade una muestra con el MISMO `t` a varias series a la vez (p. ej. K, U y
   * total publicadas juntas por el Worker). Ignora las claves desconocidas.
   */
  pushLote(t: number, valores: Readonly<Record<string, number>>): void;
  /** La serie con esa clave, o `undefined` si no existe. */
  serie(clave: string): Serie | undefined;
  /** Todas las claves configuradas, en el orden en que se crearon. */
  claves(): string[];
  /** Claves actualmente activas (subconjunto de `claves()`). */
  activas(): string[];
  esActiva(clave: string): boolean;
  /** Activa/desactiva una serie. No-op si la clave no existe. */
  setActiva(clave: string, activa: boolean): void;
  /** Reemplaza el conjunto de activas (se ignoran las claves desconocidas). */
  setActivas(claves: readonly string[]): void;
  /** Vacía una serie (`clave`) o todas si se omite. */
  vaciar(clave?: string): void;
}

/** Crea una colección de series a partir de sus configuraciones. */
export function crearColeccionSeries(
  configs: readonly ConfigSerie[],
  opciones: OpcionesColeccion = {},
): ColeccionSeries {
  const orden = configs.map((c) => c.clave);
  const series = new Map<string, Serie>(configs.map((c) => [c.clave, crearSerie(c)]));
  const activas = new Set<string>(
    (opciones.activasIniciales ?? orden).filter((clave) => series.has(clave)),
  );

  function push(clave: string, t: number, valor: number): void {
    series.get(clave)?.push(t, valor);
  }

  function pushLote(t: number, valores: Readonly<Record<string, number>>): void {
    for (const clave of Object.keys(valores)) {
      series.get(clave)?.push(t, valores[clave]);
    }
  }

  function serie(clave: string): Serie | undefined {
    return series.get(clave);
  }

  function claves(): string[] {
    return [...orden];
  }

  function activasFn(): string[] {
    return orden.filter((clave) => activas.has(clave));
  }

  function esActiva(clave: string): boolean {
    return activas.has(clave);
  }

  function setActiva(clave: string, activa: boolean): void {
    if (!series.has(clave)) return;
    if (activa) activas.add(clave);
    else activas.delete(clave);
  }

  function setActivas(claves: readonly string[]): void {
    activas.clear();
    for (const clave of claves) {
      if (series.has(clave)) activas.add(clave);
    }
  }

  function vaciar(clave?: string): void {
    if (clave !== undefined) {
      series.get(clave)?.vaciar();
      return;
    }
    for (const s of series.values()) s.vaciar();
  }

  return {
    push,
    pushLote,
    serie,
    claves,
    activas: activasFn,
    esActiva,
    setActiva,
    setActivas,
    vaciar,
  };
}

// ---- Exportación a CSV (lógica pura; la descarga del archivo es de la UI) ----

/** Una serie ya "leída" (snapshot de muestras), lista para exportar. */
export interface FilaCSV {
  clave: string;
  etiqueta: string;
  unidad: string;
  muestras: readonly Muestra[];
}

export interface OpcionesCSV {
  /** Separador de columnas. Por defecto `,` (coherente con el resto de la app: decimales con punto). */
  separador?: string;
  /** Cifras decimales de las columnas numéricas. Por defecto 6. */
  decimales?: number;
  /** Si se da, solo exporta estas claves (p. ej. las series activas). */
  soloClaves?: readonly string[];
  /**
   * Factor por el que se multiplica `t` antes de escribirlo en la columna de
   * tiempo. Por defecto `0.001`: asume `t` en ms (la convención recomendada
   * arriba) y exporta segundos, más legibles en una hoja de cálculo.
   */
  factorTiempo?: number;
  /** Nombre de la columna de tiempo. Por defecto `"t_s"` (coherente con `factorTiempo` por defecto). */
  columnaTiempo?: string;
}

const SALTO_LINEA_CSV = "\r\n";

function formatNumeroCSV(valor: number, decimales: number): string {
  if (!Number.isFinite(valor)) return "";
  // `+ 0` evita "-0.000000" cuando `valor` es -0 o redondea a cero.
  return (valor + 0).toFixed(decimales);
}

/** Escapa un campo CSV según RFC 4180 (comillas si contiene separador, comillas o salto de línea). */
function escaparCampoCSV(campo: string, separador: string): string {
  if (campo.includes(separador) || campo.includes('"') || campo.includes("\n") || campo.includes("\r")) {
    return `"${campo.replace(/"/g, '""')}"`;
  }
  return campo;
}

/**
 * CSV "largo" (tidy): una fila por muestra, columnas
 * `t_s, serie, etiqueta, unidad, valor`. Ordenado por tiempo y luego por
 * clave. No requiere que las series comparten los mismos instantes.
 */
export function seriesACSV(entradas: readonly FilaCSV[], opciones: OpcionesCSV = {}): string {
  const separador = opciones.separador ?? ",";
  const decimales = opciones.decimales ?? 6;
  const factorTiempo = opciones.factorTiempo ?? 0.001;
  const columnaTiempo = opciones.columnaTiempo ?? "t_s";

  const filtradas = opciones.soloClaves
    ? entradas.filter((e) => opciones.soloClaves!.includes(e.clave))
    : entradas;

  interface FilaPlana {
    t: number;
    clave: string;
    etiqueta: string;
    unidad: string;
    valor: number;
  }
  const filas: FilaPlana[] = [];
  for (const e of filtradas) {
    for (const m of e.muestras) {
      filas.push({ t: m.t, clave: e.clave, etiqueta: e.etiqueta, unidad: e.unidad, valor: m.valor });
    }
  }
  filas.sort((a, b) => a.t - b.t || a.clave.localeCompare(b.clave));

  const cabecera = [columnaTiempo, "serie", "etiqueta", "unidad", "valor"].join(separador);
  const cuerpo = filas.map((f) =>
    [
      formatNumeroCSV(f.t * factorTiempo, decimales),
      escaparCampoCSV(f.clave, separador),
      escaparCampoCSV(f.etiqueta, separador),
      escaparCampoCSV(f.unidad, separador),
      formatNumeroCSV(f.valor, decimales),
    ].join(separador),
  );
  return [cabecera, ...cuerpo].join(SALTO_LINEA_CSV) + SALTO_LINEA_CSV;
}

/**
 * CSV "ancho": una columna por serie (cabecera `"etiqueta (unidad)"`), una fila
 * por instante compartido. Requiere que TODAS las entradas tengan exactamente
 * el mismo número de muestras y los mismos `t` en el mismo orden (p. ej. series
 * publicadas juntas con `pushLote`); devuelve `null` si no es así, para no
 * inventar una interpolación sin especificación física.
 */
export function seriesACSVAncho(
  entradas: readonly FilaCSV[],
  opciones: OpcionesCSV = {},
): string | null {
  if (entradas.length === 0) return null;
  const separador = opciones.separador ?? ",";
  const decimales = opciones.decimales ?? 6;
  const factorTiempo = opciones.factorTiempo ?? 0.001;
  const columnaTiempo = opciones.columnaTiempo ?? "t_s";

  const n = entradas[0].muestras.length;
  for (const e of entradas) {
    if (e.muestras.length !== n) return null;
  }
  for (let i = 0; i < n; i++) {
    const tRef = entradas[0].muestras[i].t;
    for (const e of entradas) {
      if (e.muestras[i].t !== tRef) return null;
    }
  }

  const cabecera = [
    columnaTiempo,
    ...entradas.map((e) => escaparCampoCSV(`${e.etiqueta} (${e.unidad})`, separador)),
  ].join(separador);
  const cuerpo: string[] = [];
  for (let i = 0; i < n; i++) {
    const fila = [
      formatNumeroCSV(entradas[0].muestras[i].t * factorTiempo, decimales),
      ...entradas.map((e) => formatNumeroCSV(e.muestras[i].valor, decimales)),
    ];
    cuerpo.push(fila.join(separador));
  }
  return [cabecera, ...cuerpo].join(SALTO_LINEA_CSV) + SALTO_LINEA_CSV;
}

/** Convierte una `Serie` (o su colección) en `FilaCSV`, leyendo `ventanaS` si se da. */
export function serieAFilaCSV(s: Serie, ventanaS?: number): FilaCSV {
  return { clave: s.clave, etiqueta: s.etiqueta, unidad: s.unidad, muestras: s.leer(ventanaS) };
}
