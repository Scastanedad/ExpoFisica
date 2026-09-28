/**
 * Dibujo Canvas 2D de las gráficas dinámicas (E4.1 §6): un canvas PROPIO,
 * más simple que el de la escena principal (`render/dibujarEscena.ts`) --
 * no comparte su `requestAnimationFrame`, aunque SÍ ajusta su resolución al
 * `devicePixelRatio` (ver `ajustarDprCanvas.ts`, corrección post revisión UI:
 * versión simplificada de `useEscalaCss.ts`, sin `ResizeObserver`, porque
 * estos canvas nunca se estiran por CSS más allá de su tamaño lógico; en un
 * módulo aparte para no tener que depender de tipos DOM aquí -- ver la nota
 * de `ContextoGrafica` más abajo). Redibuja bajo demanda (llamado desde el
 * componente cuando llega una muestra nueva), nunca en un bucle propio: con
 * 80/200 puntos el costo es trivial, así que no compite por el presupuesto de
 * fotograma del canvas principal (criterio de aceptación §6.4, ≥ 50 fps con
 * 30 cargas).
 *
 * Estilo "instrumento de laboratorio" (ver decisiones.md): las curvas de
 * datos se distinguen por trazo (sólido/discontinuo) y una paleta neutra,
 * NO por el cian (`--accent`), reservado a lo interactivo -- salvo en la
 * gráfica de q₀, donde la única curva visible a la vez es "la variable
 * activa" (coherente con usar cian para resaltar la selección vigente).
 *
 * `COLOR_SECUNDARIO` (verde pálido, corrección post revisión UI): antes,
 * tanto la curva "Total" del panel de energía como la curva teórica del
 * panel de distancia usaban el mismo `#c4b5fd` que `render/dibujarFuerzas.ts`
 * (vector de fuerza) -- y sí coexisten en pantalla: `PanelGraficaEnergia` y
 * `LecturaFuerza` comparten la columna lateral en "Cargas en movimiento";
 * `PanelGraficaDistancia` y `LecturaFuerza` comparten la de "Cargas en
 * reposo". Verde pálido (~13.9:1 de contraste sobre el fondo del canvas,
 * fórmula de luminancia relativa WCAG) no choca con cian/rojo/azul/ámbar (ya
 * reservados) ni con el violeta ya asignado a la fuerza; ambas curvas nunca
 * comparten pantalla entre sí (páginas distintas), así que reusar el mismo
 * verde en las dos no crea un nuevo duplicado visible.
 */
export const COLOR_EJE = "rgba(148, 163, 184, 0.35)";
export const COLOR_TEXTO = "#8b93a7";
export const COLOR_CERO = "rgba(148, 163, 184, 0.5)";

export const COLOR_K = "#e5e7eb";
export const COLOR_U = "#94a3b8";
export const COLOR_SECUNDARIO = "#86efac";
export const COLOR_E = COLOR_SECUNDARIO;
export const COLOR_ACTIVO = "#22d3ee";
export const COLOR_MEDIDO = "#e5e7eb";
export const COLOR_TEORICO = COLOR_SECUNDARIO;

/**
 * Subconjunto de `CanvasRenderingContext2D` que usan las funciones de dibujo
 * de este módulo -- mismo patrón que `render/ctx2d.ts#Contexto2D`: se declara
 * localmente para no depender de los tipos DOM (`tsconfig.test.json` no
 * incluye la librería DOM) y así poder probar `insertarCortesPorHueco` con
 * Vitest en Node. El contexto real del canvas cumple esta interfaz de forma
 * estructural, sin necesidad de conversión.
 */
export interface ContextoGrafica {
  strokeStyle: unknown;
  fillStyle: unknown;
  lineWidth: number;
  lineJoin: string;
  font: string;
  textAlign: string;
  textBaseline: string;
  save(): void;
  restore(): void;
  translate(x: number, y: number): void;
  rotate(angulo: number): void;
  beginPath(): void;
  moveTo(x: number, y: number): void;
  lineTo(x: number, y: number): void;
  arc(x: number, y: number, radio: number, ini: number, fin: number): void;
  stroke(): void;
  fill(): void;
  clearRect(x: number, y: number, w: number, h: number): void;
  strokeRect(x: number, y: number, w: number, h: number): void;
  fillText(texto: string, x: number, y: number): void;
  setLineDash(segmentos: number[]): void;
}

interface PuntoPx {
  x: number;
  y: number;
}

/** Una muestra en el dominio de datos (t/valor), igual forma que `datos/series.ts#Muestra`. */
interface MuestraHueco {
  readonly t: number;
  readonly valor: number;
}

/**
 * Corte honesto por hueco temporal (hallazgo Crítico de `fisico-revisor`,
 * E4.1 §1.3/§2.2): `serie.leer()` (`datos/series.ts`) nunca produce `NaN` --
 * su `push()` descarta valores no finitos, correctamente, para no fabricar
 * datos -- así que un hueco real (pausa de la gráfica, o lectura `null` de
 * q₀ cerca de una carga) no deja ningún rastro en el arreglo de muestras:
 * `dibujarTrazo` conectaría el punto anterior y el siguiente con una línea
 * recta, exactamente la interpolación que la spec prohíbe.
 *
 * Esta función NO fabrica ningún valor: solo inserta un punto marcador
 * (`valor: NaN`, con un `t` intermedio válido) entre dos muestras consecutivas
 * cuyo salto de tiempo excede `1.5×intervaloEsperadoS` -- el mismo `NaN` que
 * `dibujarTrazo` ya interpreta como corte de trazo. Se llama en el wiring de
 * cada panel, justo después de `serie.leer()` y antes de mapear a píxeles.
 */
export function insertarCortesPorHueco<T extends MuestraHueco>(
  muestras: readonly T[],
  intervaloEsperadoS: number,
): MuestraHueco[] {
  if (muestras.length < 2) return [...muestras];
  const umbral = intervaloEsperadoS * 1.5;
  const salida: MuestraHueco[] = [muestras[0]];
  for (let i = 1; i < muestras.length; i++) {
    const anterior = muestras[i - 1];
    const actual = muestras[i];
    if (actual.t - anterior.t > umbral) {
      salida.push({ t: (anterior.t + actual.t) / 2, valor: NaN });
    }
    salida.push(actual);
  }
  return salida;
}

/** Limpia y dibuja el marco del panel. */
export function limpiarLienzo(ctx: ContextoGrafica, ancho: number, alto: number): void {
  ctx.clearRect(0, 0, ancho, alto);
}

/** Rango [min, max] con margen relativo; incluye 0 si `incluirCero`. */
export function autoescala(valores: readonly number[], margen = 0.1, incluirCero = false): [number, number] {
  const finitos = valores.filter((v) => Number.isFinite(v));
  let min = finitos.length ? Math.min(...finitos) : -1;
  let max = finitos.length ? Math.max(...finitos) : 1;
  if (incluirCero) {
    min = Math.min(min, 0);
    max = Math.max(max, 0);
  }
  if (min === max) {
    min -= 1;
    max += 1;
  }
  const m = (max - min) * margen;
  return [min - m, max + m];
}

/** Mapeo lineal de un dominio [d0, d1] a un rango de píxeles [r0, r1] (r1 puede ser < r0: eje Y invertido). */
export function mapeoLineal(dominio: [number, number], rango: [number, number]): (v: number) => number {
  const [d0, d1] = dominio;
  const [r0, r1] = rango;
  const den = d1 - d0 || 1;
  return (v: number) => r0 + ((v - d0) / den) * (r1 - r0);
}

export interface MargenGrafica {
  izq: number;
  der: number;
  arriba: number;
  abajo: number;
}

export const MARGEN_DEFECTO: MargenGrafica = { izq: 56, der: 10, arriba: 10, abajo: 22 };

/** Área de dibujo (px) tras aplicar el margen. */
export function areaGrafica(ancho: number, alto: number, margen: MargenGrafica = MARGEN_DEFECTO) {
  return {
    x0: margen.izq,
    x1: ancho - margen.der,
    y0: margen.arriba,
    y1: alto - margen.abajo,
  };
}

/** Ejes lineales: caja + línea de 0 (si cae dentro del dominio Y) + un rótulo de rango en cada eje. */
export function dibujarEjesLineales(
  ctx: ContextoGrafica,
  ancho: number,
  alto: number,
  dominioX: [number, number],
  dominioY: [number, number],
  etiquetaY: string,
  margen: MargenGrafica = MARGEN_DEFECTO,
): { mapX: (v: number) => number; mapY: (v: number) => number } {
  const area = areaGrafica(ancho, alto, margen);
  const mapX = mapeoLineal(dominioX, [area.x0, area.x1]);
  const mapY = mapeoLineal(dominioY, [area.y1, area.y0]);

  ctx.save();
  ctx.strokeStyle = COLOR_EJE;
  ctx.lineWidth = 1;
  ctx.strokeRect(area.x0, area.y0, area.x1 - area.x0, area.y1 - area.y0);

  if (dominioY[0] < 0 && dominioY[1] > 0) {
    const y0 = mapY(0);
    ctx.strokeStyle = COLOR_CERO;
    ctx.setLineDash([3, 3]);
    ctx.beginPath();
    ctx.moveTo(area.x0, y0);
    ctx.lineTo(area.x1, y0);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  ctx.fillStyle = COLOR_TEXTO;
  ctx.font = "11px ui-monospace, monospace";
  ctx.textAlign = "right";
  ctx.textBaseline = "middle";
  ctx.fillText(dominioY[1].toPrecision(3), area.x0 - 4, area.y0 + 6);
  ctx.fillText(dominioY[0].toPrecision(3), area.x0 - 4, area.y1 - 6);
  ctx.save();
  ctx.translate(12, (area.y0 + area.y1) / 2);
  ctx.rotate(-Math.PI / 2);
  ctx.textAlign = "center";
  ctx.fillText(etiquetaY, 0, 0);
  ctx.restore();

  ctx.textAlign = "left";
  ctx.fillText(`${dominioX[0].toFixed(0)} s`, area.x0, area.y1 + 14);
  ctx.textAlign = "right";
  ctx.fillText(`${dominioX[1].toFixed(0)} s`, area.x1, area.y1 + 14);
  ctx.restore();

  return { mapX, mapY };
}

/** Traza una serie ya mapeada a px; corta el trazo en huecos (`NaN` en `y`). */
export function dibujarTrazo(
  ctx: ContextoGrafica,
  puntos: readonly PuntoPx[],
  color: string,
  opciones: { guion?: number[]; grosor?: number } = {},
): void {
  if (puntos.length === 0) return;
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = opciones.grosor ?? 1.6;
  ctx.lineJoin = "round";
  ctx.setLineDash(opciones.guion ?? []);
  ctx.beginPath();
  let enTrazo = false;
  for (const p of puntos) {
    if (!Number.isFinite(p.y)) {
      enTrazo = false;
      continue;
    }
    if (!enTrazo) {
      ctx.moveTo(p.x, p.y);
      enTrazo = true;
    } else {
      ctx.lineTo(p.x, p.y);
    }
  }
  ctx.stroke();
  ctx.restore();
}

/** Ejes log-log: rejilla en cada década de X e Y dentro del dominio dado (dominios en escala LOG10). */
export function dibujarEjesLogLog(
  ctx: ContextoGrafica,
  ancho: number,
  alto: number,
  dominioLogX: [number, number],
  dominioLogY: [number, number],
  etiquetaY: string,
  margen: MargenGrafica = MARGEN_DEFECTO,
): { mapLogX: (log10v: number) => number; mapLogY: (log10v: number) => number } {
  const area = areaGrafica(ancho, alto, margen);
  const mapLogX = mapeoLineal(dominioLogX, [area.x0, area.x1]);
  const mapLogY = mapeoLineal(dominioLogY, [area.y1, area.y0]);

  ctx.save();
  ctx.strokeStyle = COLOR_EJE;
  ctx.lineWidth = 1;
  ctx.strokeRect(area.x0, area.y0, area.x1 - area.x0, area.y1 - area.y0);

  ctx.fillStyle = COLOR_TEXTO;
  ctx.font = "10px ui-monospace, monospace";
  ctx.setLineDash([2, 4]);
  const decadaMinX = Math.ceil(dominioLogX[0]);
  const decadaMaxX = Math.floor(dominioLogX[1]);
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  for (let d = decadaMinX; d <= decadaMaxX; d++) {
    const x = mapLogX(d);
    ctx.strokeStyle = COLOR_EJE;
    ctx.beginPath();
    ctx.moveTo(x, area.y0);
    ctx.lineTo(x, area.y1);
    ctx.stroke();
    ctx.fillText(`10^${d}`, x, area.y1 + 3);
  }
  const decadaMinY = Math.ceil(dominioLogY[0]);
  const decadaMaxY = Math.floor(dominioLogY[1]);
  ctx.textAlign = "right";
  ctx.textBaseline = "middle";
  for (let d = decadaMinY; d <= decadaMaxY; d++) {
    const y = mapLogY(d);
    ctx.strokeStyle = COLOR_EJE;
    ctx.beginPath();
    ctx.moveTo(area.x0, y);
    ctx.lineTo(area.x1, y);
    ctx.stroke();
    ctx.fillText(`10^${d}`, area.x0 - 4, y);
  }
  ctx.setLineDash([]);

  ctx.save();
  ctx.translate(12, (area.y0 + area.y1) / 2);
  ctx.rotate(-Math.PI / 2);
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  ctx.fillText(etiquetaY, 0, 0);
  ctx.restore();
  ctx.restore();

  return { mapLogX, mapLogY };
}

/** Traza tramos ya en unidades reales (r, valor > 0): los convierte a log10 y a px. */
export function dibujarTramosLogLog(
  ctx: ContextoGrafica,
  tramos: readonly { r: number; valor: number }[][],
  mapLogX: (log10v: number) => number,
  mapLogY: (log10v: number) => number,
  color: string,
  opciones: { guion?: number[]; grosor?: number; puntos?: boolean } = {},
): void {
  for (const tramo of tramos) {
    const px = tramo
      .filter((p) => p.r > 0 && p.valor > 0)
      .map((p) => ({ x: mapLogX(Math.log10(p.r)), y: mapLogY(Math.log10(p.valor)) }));
    dibujarTrazo(ctx, px, color, opciones);
    if (opciones.puntos) {
      ctx.save();
      ctx.fillStyle = color;
      for (const p of px) {
        ctx.beginPath();
        ctx.arc(p.x, p.y, 1.4, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }
  }
}
