/**
 * Dibujo Canvas 2D de la escena Gauss 3D en las 4 pasadas (ver `pasadas.ts`). Sin `shadowBlur`, un trazo por lote
 * (pasada × banda de alfa) y sin asignaciones por cuadro. Estilo de la app: fondo `#0b1020`, líneas de campo blanco
 * hielo, cian solo para lo interactivo (no se usa aquí), rojo/azul para polaridad de carga y para el flujo
 * que sale/entra (parches), ámbar para las flechas del campo E (se separa visualmente campo de flujo).
 */
import { formatCarga } from "../../fisica/unidades";
import type { Ctx3D } from "./ctx3d";
import { N_BANDAS_FLUJO, type GeometriaGauss3D } from "./geometria";
import { alfaHalo, radioVisualCarga } from "../geometriaCargas";
import { proyectarPunto, type CamaraProy } from "./camara";
import { N_BANDAS_PROF, PASADA_DELANTE, PASADA_DETRAS, type BufferPuntas, type BufferSegmentos, type Pasadas } from "./pasadas";

export const COLOR_FONDO = "#0b1020";
const RGB_ROJO = "220, 38, 38";
const RGB_AZUL = "37, 99, 235";
const RGB_ROJO_CLARO = "248, 113, 113";
const RGB_AZUL_CLARO = "96, 165, 250";
const ROJO = "#dc2626";
const AZUL = "#2563eb";
const RGB_NEUTRO = "148, 163, 184";
const RGB_HIELO = "226, 232, 240";
const RGB_AMBAR = "251, 191, 36";
const COLOR_SELECCION = "#22d3ee";
const COLOR_TEXTO = "#e5e7eb";
const COLOR_TEXTO_TENUE = "#8b93a7";
const HALO_TEXTO = "rgba(5, 7, 13, 0.9)";
const FUENTE = 'ui-monospace, "Cascadia Code", "SFMono-Regular", Consolas, monospace';

export interface OpcionesDibujo3D {
  ancho: number;
  alto: number;
  /** Unidad de tamaño (≥ 1): 1 px CSS en móvil, crece en pantallas grandes/proyector (grosores y textos). */
  unidad: number;
  /** Si false, las caras se pintan neutras (el flujo siempre se calcula). */
  mostrarFlujo: boolean;
  /** 0.2…1: opacidad global de las caras de la superficie. */
  opacidad: number;
  /** Cuadrícula y sombras del suelo. */
  mostrarSuelo: boolean;
  /** Índice de la carga seleccionada (anillo cian: lo interactivo); -1 o ausente = ninguna. */
  seleccion?: number;
}

/** Tablas de estilos que dependen de la opacidad (se rehacen solo si cambia). */
interface Paleta {
  opacidad: number;
  /** Índice = código de banda + N_BANDAS_FLUJO (−6…+6). */
  frente: string[];
  atras: string[];
}

function rgbaCodigo(codigo: number, trasera: boolean, opacidad: number): string {
  const b = Math.abs(codigo);
  const rgb = codigo === 0 ? RGB_NEUTRO : codigo > 0 ? RGB_ROJO : RGB_AZUL;
  let alfa: number;
  if (codigo === 0) alfa = trasera ? 0.05 : 0.09;
  else {
    const a = 0.14 + 0.32 * (b / N_BANDAS_FLUJO);
    alfa = trasera ? a * 0.6 : a;
  }
  return `rgba(${rgb}, ${(alfa * opacidad).toFixed(3)})`;
}

let paletaCache: Paleta | null = null;
function paleta(opacidad: number): Paleta {
  if (paletaCache && paletaCache.opacidad === opacidad) return paletaCache;
  const frente: string[] = [];
  const atras: string[] = [];
  for (let c = -N_BANDAS_FLUJO; c <= N_BANDAS_FLUJO; c++) {
    frente.push(rgbaCodigo(c, false, opacidad));
    atras.push(rgbaCodigo(c, true, opacidad));
  }
  paletaCache = { opacidad, frente, atras };
  return paletaCache;
}

const ALFA_LINEA = [0.34, 0.5, 0.68, 0.9];
const ANCHO_LINEA = [1.1, 1.3, 1.5, 1.8];
const ALFA_CAMPO = [0.5, 0.72, 0.95];
const FILL_LINEA: string[] = ALFA_LINEA.map((a) => `rgba(${RGB_HIELO}, ${a})`);
const STROKE_CAMPO: string[] = ALFA_CAMPO.map((a) => `rgba(${RGB_AMBAR}, ${a})`);

// círculo unitario para las sombras (16 puntos)
const N_CIRC = 16;
const COS_C = new Float64Array(N_CIRC);
const SIN_C = new Float64Array(N_CIRC);
for (let i = 0; i < N_CIRC; i++) {
  COS_C[i] = Math.cos((2 * Math.PI * i) / N_CIRC);
  SIN_C[i] = Math.sin((2 * Math.PI * i) / N_CIRC);
}
const tmp = new Float32Array(4);

/** Radio (px) del disco de una carga: crece con |q| (∝ q^{1/3}, como en el resto de la app) y con la unidad. */
export function radioCarga3D(q: number, unidad: number): number {
  return 0.8 * radioVisualCarga(q, 1) * unidad;
}

export function dibujarSuelo(ctx: Ctx3D, G: number, cam: CamaraProy, u: number): void {
  ctx.save();
  ctx.lineCap = "butt";
  ctx.lineJoin = "round";
  for (let pasada = 0; pasada < 2; pasada++) {
    const mayor = pasada === 1;
    ctx.beginPath();
    for (let k = -G; k <= G; k++) {
      if ((k % 5 === 0) !== mayor) continue;
      proyectarPunto(cam, k, -G, 0, tmp, 0);
      ctx.moveTo(tmp[0], tmp[1]);
      proyectarPunto(cam, k, G, 0, tmp, 0);
      ctx.lineTo(tmp[0], tmp[1]);
      proyectarPunto(cam, -G, k, 0, tmp, 0);
      ctx.moveTo(tmp[0], tmp[1]);
      proyectarPunto(cam, G, k, 0, tmp, 0);
      ctx.lineTo(tmp[0], tmp[1]);
    }
    ctx.lineWidth = (mayor ? 1.3 : 1) * u;
    ctx.strokeStyle = mayor ? "rgba(120, 170, 255, 0.3)" : "rgba(120, 170, 255, 0.15)";
    ctx.stroke();
  }
  ctx.restore();
}

/** Caras de la superficie de una pasada (traseras o delanteras): rellenos por banda de flujo y aristas. */
export function dibujarCaras(ctx: Ctx3D, geom: GeometriaGauss3D, p: Pasadas, delanteras: boolean, o: OpcionesDibujo3D): void {
  const malla = geom.malla;
  const nT = malla.triangulos.length / 3;
  const esParche = geom.superficie.tipo === "parche";
  if (esParche && !delanteras) return; // el parche es una sola lámina: va en la pasada 3
  const T = malla.triangulos;
  const par = malla.parcheDeTriangulo;
  const banda = geom.bandaParche;
  const pal = paleta(o.opacidad);
  const colores = delanteras ? pal.frente : pal.atras;
  const vx = p.vx;
  const vy = p.vy;
  const u = o.unidad;
  const frenteBuscado = delanteras ? 1 : 0;

  ctx.save();
  for (let code = -N_BANDAS_FLUJO; code <= N_BANDAS_FLUJO; code++) {
    let hay = false;
    ctx.beginPath();
    for (let k = 0; k < nT; k++) {
      if (p.frente[k] !== frenteBuscado) continue;
      const b = o.mostrarFlujo ? banda[par[k]] : 0;
      if (b !== code) continue;
      const a = T[3 * k];
      const bb = T[3 * k + 1];
      const c = T[3 * k + 2];
      ctx.moveTo(vx[a], vy[a]);
      ctx.lineTo(vx[bb], vy[bb]);
      ctx.lineTo(vx[c], vy[c]);
      ctx.closePath();
      hay = true;
    }
    if (hay) {
      ctx.fillStyle = colores[code + N_BANDAS_FLUJO];
      ctx.fill();
    }
  }

  // aristas: contorno fino de los parches de flujo y trazo reforzado en bordes duros y en la silueta
  const A = geom.aristas;
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  for (let fuerte = 0; fuerte < 2; fuerte++) {
    ctx.beginPath();
    let hay = false;
    for (let e = 0; e < A.n; e++) {
      const t0 = A.tri[2 * e];
      const t1 = A.tri[2 * e + 1];
      const f0 = p.frente[t0];
      const f1 = t1 >= 0 ? p.frente[t1] : f0;
      const silueta = f0 !== f1;
      const esFuerte = A.dura[e] === 1 || silueta;
      if ((fuerte === 1) !== esFuerte) continue;
      // la arista pertenece a esta pasada si alguna de sus caras lo es (la silueta, a las dos)
      if (!esParche && f0 !== frenteBuscado && f1 !== frenteBuscado) continue;
      const a = A.v[2 * e];
      const b = A.v[2 * e + 1];
      ctx.moveTo(vx[a], vy[a]);
      ctx.lineTo(vx[b], vy[b]);
      hay = true;
    }
    if (!hay) continue;
    if (fuerte === 1) {
      ctx.lineWidth = (delanteras ? 1.6 : 1.1) * u;
      ctx.strokeStyle = `rgba(${RGB_HIELO}, ${delanteras ? 0.7 : 0.3})`;
    } else {
      ctx.lineWidth = 0.9 * u;
      ctx.strokeStyle = `rgba(${RGB_HIELO}, ${delanteras ? 0.16 : 0.07})`;
    }
    ctx.stroke();
  }
  ctx.restore();
}

function trazarSegmentos(ctx: Ctx3D, b: BufferSegmentos, clave: number): boolean {
  const i0 = b.inicio[clave];
  const i1 = b.inicio[clave + 1];
  if (i1 <= i0) return false;
  ctx.beginPath();
  for (let j = i0; j < i1; j++) {
    const i = b.orden[j];
    ctx.moveTo(b.x0[i], b.y0[i]);
    ctx.lineTo(b.x1[i], b.y1[i]);
  }
  return true;
}

function rellenarPuntas(ctx: Ctx3D, b: BufferPuntas, clave: number, tam: number): boolean {
  const i0 = b.inicio[clave];
  const i1 = b.inicio[clave + 1];
  if (i1 <= i0) return false;
  ctx.beginPath();
  const punta = tam * 0.62;
  const base = tam * 0.38;
  const ancho = tam * 0.36;
  for (let j = i0; j < i1; j++) {
    const i = b.orden[j];
    const x = b.x[i];
    const y = b.y[i];
    const dx = b.dx[i];
    const dy = b.dy[i];
    const px = -dy;
    const py = dx;
    ctx.moveTo(x + dx * punta, y + dy * punta);
    ctx.lineTo(x - dx * base + px * ancho, y - dy * base + py * ancho);
    ctx.lineTo(x - dx * base - px * ancho, y - dy * base - py * ancho);
    ctx.closePath();
  }
  return true;
}

/** Radio (px, ×u) del disco de un marcador de cruce. */
export const RADIO_MARCA = 4.2;

/**
 * Cruces línea–superficie: SALE = disco relleno (rojo claro), ENTRA = anillo hueco (azul claro); los dos llevan una
 * punta que sigue el sentido de E sobre la línea. La forma (relleno/anillo) basta sin el color.
 */
function marcasDeCruce(ctx: Ctx3D, p: Pasadas, pasada: number, u: number): void {
  const M = p.marcas;
  if (M.n === 0) return;
  const r = RADIO_MARCA * u;
  for (let sentido = 1; sentido >= -1; sentido -= 2) {
    const sale = sentido === 1;
    const rgb = sale ? RGB_ROJO_CLARO : RGB_AZUL_CLARO;
    let hay = false;
    // discos (sale: rellenos; entra: fondo oscuro + anillo)
    ctx.beginPath();
    for (let i = 0; i < M.n; i++) {
      if (M.pasada[i] !== pasada || M.sentido[i] !== sentido) continue;
      ctx.moveTo(M.x[i] + r, M.y[i]);
      ctx.arc(M.x[i], M.y[i], r, 0, Math.PI * 2);
      hay = true;
    }
    if (!hay) continue;
    ctx.fillStyle = sale ? `rgb(${rgb})` : HALO_TEXTO;
    ctx.fill();
    ctx.lineWidth = (sale ? 1.2 : 2) * u;
    ctx.strokeStyle = sale ? "rgba(5, 7, 13, 0.85)" : `rgb(${rgb})`;
    ctx.stroke();
    // puntas orientadas (siempre rellenas, a un lado del disco)
    ctx.beginPath();
    const base = r + 1.5 * u;
    const largo = 6.5 * u;
    const ancho = 3.6 * u;
    for (let i = 0; i < M.n; i++) {
      if (M.pasada[i] !== pasada || M.sentido[i] !== sentido) continue;
      const dx = M.dx[i];
      const dy = M.dy[i];
      if (dx === 0 && dy === 0) continue;
      const bx = M.x[i] + dx * base;
      const by = M.y[i] + dy * base;
      ctx.moveTo(bx + dx * largo, by + dy * largo);
      ctx.lineTo(bx - dy * ancho, by + dx * ancho);
      ctx.lineTo(bx + dy * ancho, by - dx * ancho);
      ctx.closePath();
    }
    ctx.fillStyle = `rgb(${rgb})`;
    ctx.fill();
  }
}

function dibujarSombra(ctx: Ctx3D, geom: GeometriaGauss3D, p: Pasadas, cam: CamaraProy, i: number, u: number): void {
  const c = geom.cargas[i];
  const rho = 0.55;
  ctx.beginPath();
  for (let k = 0; k < N_CIRC; k++) {
    proyectarPunto(cam, c.x + rho * COS_C[k], c.y + rho * SIN_C[k], 0, tmp, 0);
    if (k === 0) ctx.moveTo(tmp[0], tmp[1]);
    else ctx.lineTo(tmp[0], tmp[1]);
  }
  ctx.closePath();
  ctx.fillStyle = `rgba(${c.q > 0 ? RGB_ROJO_CLARO : RGB_AZUL_CLARO}, 0.4)`;
  ctx.fill();
  ctx.lineWidth = 1.1 * u;
  ctx.strokeStyle = `rgba(${RGB_HIELO}, 0.55)`;
  ctx.stroke();
  // marca del punto exacto bajo la carga
  const s = 2.2 * u;
  ctx.beginPath();
  ctx.moveTo(p.sx[i] - s, p.sy[i]);
  ctx.lineTo(p.sx[i] + s, p.sy[i]);
  ctx.moveTo(p.sx[i], p.sy[i] - s);
  ctx.lineTo(p.sx[i], p.sy[i] + s);
  ctx.stroke();
}

function dibujarCargaDisco(ctx: Ctx3D, geom: GeometriaGauss3D, p: Pasadas, i: number, o: OpcionesDibujo3D): void {
  const c = geom.cargas[i];
  const u = o.unidad;
  const x = p.qx[i];
  const y = p.qy[i];
  const r = radioCarga3D(c.q, o.unidad);
  const positiva = c.q > 0;
  // halo de intensidad (disco translúcido: sin gradiente ni shadowBlur)
  const halo = Math.min(0.5, alfaHalo(c.q) * 0.7);
  ctx.beginPath();
  ctx.arc(x, y, r + 7 * u, 0, Math.PI * 2);
  ctx.fillStyle = `rgba(${positiva ? RGB_ROJO : RGB_AZUL}, ${halo.toFixed(3)})`;
  ctx.fill();
  // contorno oscuro + disco con aro claro (se separa del fondo y de los parches del mismo color)
  ctx.beginPath();
  ctx.arc(x, y, r + 2.2 * u, 0, Math.PI * 2);
  ctx.fillStyle = HALO_TEXTO;
  ctx.fill();
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fillStyle = positiva ? ROJO : AZUL;
  ctx.fill();
  ctx.lineWidth = 2 * u;
  ctx.strokeStyle = "#f8fafc";
  ctx.stroke();
  ctx.fillStyle = "#fff";
  ctx.font = `bold ${Math.max(13, r * 1.15)}px system-ui`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(positiva ? "+" : "−", x, y + 1);
  if (o.seleccion === i) {
    // anillo cian discontinuo: esta es la carga que mueven los controles
    ctx.beginPath();
    ctx.arc(x, y, r + 7 * u, 0, Math.PI * 2);
    ctx.setLineDash([5 * u, 3 * u]);
    ctx.lineWidth = 2 * u;
    ctx.strokeStyle = COLOR_SELECCION;
    ctx.stroke();
    ctx.setLineDash([]);
  }
}

/** Contenido de una pasada (2 = detrás de la cara delantera, 4 = delante): sombras, caídas, líneas, flechas y cargas. */
export function dibujarContenido(
  ctx: Ctx3D,
  geom: GeometriaGauss3D,
  p: Pasadas,
  cam: CamaraProy,
  pasada: number,
  o: OpcionesDibujo3D,
): void {
  const u = o.unidad;
  const base = pasada === PASADA_DELANTE ? N_BANDAS_PROF : 0;
  ctx.save();
  ctx.lineJoin = "round";
  ctx.lineCap = "round";

  if (o.mostrarSuelo) {
    for (let i = 0; i < p.nCargas; i++) if (p.pasadaSombra[i] === pasada) dibujarSombra(ctx, geom, p, cam, i, u);
    // líneas de caída: un trazo discontinuo por pasada
    ctx.setLineDash([4 * u, 4 * u]);
    ctx.lineWidth = 1.2 * u;
    ctx.strokeStyle = `rgba(${RGB_HIELO}, 0.6)`;
    let hay = false;
    ctx.beginPath();
    const c = p.caida;
    for (let i = 0; i < c.n; i++) {
      if (c.pasada[i] !== pasada) continue;
      ctx.moveTo(c.x0[i], c.y0[i]);
      ctx.lineTo(c.x1[i], c.y1[i]);
      hay = true;
    }
    if (hay) ctx.stroke();
    ctx.setLineDash([]);
  }

  // líneas de campo: un trazo por banda de alfa (de lejos a cerca)
  for (let b = 0; b < N_BANDAS_PROF; b++) {
    if (trazarSegmentos(ctx, p.lineas, base + b)) {
      ctx.lineWidth = ANCHO_LINEA[b] * u;
      ctx.strokeStyle = FILL_LINEA[b];
      ctx.stroke();
    }
    if (rellenarPuntas(ctx, p.puntas, base + b, (5.5 + b * 1.3) * u)) {
      ctx.fillStyle = FILL_LINEA[b];
      ctx.fill();
    }
  }

  marcasDeCruce(ctx, p, pasada, u);

  // flechas del campo E (ámbar): cuerpo y punta
  for (let b = 0; b < ALFA_CAMPO.length; b++) {
    if (trazarSegmentos(ctx, p.campo, base + b)) {
      ctx.lineWidth = 1.7 * u;
      ctx.strokeStyle = STROKE_CAMPO[b];
      ctx.stroke();
    }
    if (rellenarPuntas(ctx, p.puntasCampo, base + b, 8 * u)) {
      ctx.fillStyle = STROKE_CAMPO[b];
      ctx.fill();
    }
  }

  for (let i = 0; i < p.nCargas; i++) if (p.pasadaCarga[i] === pasada) dibujarCargaDisco(ctx, geom, p, i, o);
  ctx.restore();
}

/** Etiquetas de las cargas: siempre encima de todo para que se lean (halo oscuro). */
export function dibujarEtiquetas(ctx: Ctx3D, geom: GeometriaGauss3D, p: Pasadas, o: OpcionesDibujo3D): void {
  const u = o.unidad;
  const fuente = `600 ${12 * u}px ${FUENTE}`;
  ctx.save();
  ctx.font = fuente;
  ctx.textBaseline = "middle";
  ctx.lineJoin = "round";
  ctx.lineWidth = 4 * u;
  for (let i = 0; i < p.nCargas; i++) {
    const c = geom.cargas[i];
    const texto = formatCarga(c.q, "microC");
    const r = radioCarga3D(c.q, o.unidad);
    const w = ctx.measureText(texto).width;
    const sep = r + 6 * u;
    const aLaDerecha = p.qx[i] + sep + w <= o.ancho - 4;
    ctx.textAlign = aLaDerecha ? "left" : "right";
    const x = aLaDerecha ? p.qx[i] + sep : p.qx[i] - sep;
    ctx.strokeStyle = HALO_TEXTO;
    ctx.strokeText(texto, x, p.qy[i]);
    ctx.fillStyle = COLOR_TEXTO;
    ctx.fillText(texto, x, p.qy[i]);
  }
  ctx.restore();
}

/** Ejes discretos: tríada en la esquina inferior izquierda (x, y, z), solo rotación de la cámara. */
export function dibujarEjes(ctx: Ctx3D, cam: CamaraProy, o: OpcionesDibujo3D): void {
  const u = o.unidad;
  const L = 26 * u;
  const ox = 16 * u + L;
  const oy = o.alto - 16 * u - L;
  const R = cam.R;
  ctx.save();
  ctx.lineWidth = 1.4 * u;
  ctx.lineCap = "round";
  ctx.font = `600 ${11 * u}px ${FUENTE}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.strokeStyle = `rgba(${RGB_HIELO}, 0.5)`;
  ctx.fillStyle = COLOR_TEXTO_TENUE;
  ctx.beginPath();
  for (let e = 0; e < 3; e++) {
    ctx.moveTo(ox, oy);
    ctx.lineTo(ox + R[e] * L, oy - R[3 + e] * L);
  }
  ctx.stroke();
  const nombres = ["x", "y", "z"];
  for (let e = 0; e < 3; e++) ctx.fillText(nombres[e], ox + R[e] * (L + 8 * u), oy - R[3 + e] * (L + 8 * u));
  ctx.restore();
}

/** Dibuja la escena completa: fondo, suelo, y las 4 pasadas. */
export function dibujarEscenaGauss3D(ctx: Ctx3D, geom: GeometriaGauss3D, p: Pasadas, cam: CamaraProy, o: OpcionesDibujo3D): void {
  ctx.fillStyle = COLOR_FONDO;
  ctx.fillRect(0, 0, o.ancho, o.alto);
  const u = o.unidad;
  if (o.mostrarSuelo) dibujarSuelo(ctx, geom.mitadSuelo, cam, u);
  dibujarCaras(ctx, geom, p, false, o); // 1 caras traseras
  dibujarContenido(ctx, geom, p, cam, PASADA_DETRAS, o); // 2 contenido detrás de la cara delantera
  dibujarCaras(ctx, geom, p, true, o); // 3 caras delanteras translúcidas
  dibujarContenido(ctx, geom, p, cam, PASADA_DELANTE, o); // 4 contenido delante
  dibujarEtiquetas(ctx, geom, p, o);
  dibujarEjes(ctx, cam, o);
}
