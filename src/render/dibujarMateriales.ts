/**
 * Dibujo de un parche de la Estación 04 (conductor o aislante) ampliado.
 *
 * El parche real mide 45 x 33 px lógicos (14 x 10 átomos con 3 px de
 * separación); aquí se AMPLÍA `ZOOM_PARCHE` veces para que se vea: es un
 * recorte microscópico, no el objeto completo (decisión del usuario, con la
 * etiqueta de honestidad en la página). Se amplían las posiciones, no los
 * desplazamientos: un electrón corrido 1.2 px del parche se ve corrido 1.2 x
 * `ZOOM_PARCHE` px del lienzo, sin exagerar nada más allá del zoom.
 *
 * Orden: placas con sus líneas de campo (`dibujarPlacas`, importado tal cual
 * de la Estación 03) -> recuadro del material (opaco: por dentro se dibuja el
 * campo interior, no las líneas externas) -> líneas de campo interiores, en
 * las MISMAS coordenadas que las exteriores que caen dentro del recuadro (así
 * la línea de fuera continúa por dentro); su número/opacidad es proporcional a
 * |E_int|/E0: pocas o ninguna = campo apartado -> brillo de los bordes (carga
 * que se acumula en la superficie) -> átomos y electrones -> zona de medida ->
 * signos +/− repetidos a lo largo de los bordes iluminados.
 *
 * Colores: rojo = carga positiva (iones) y azul = negativa (electrones), como en
 * el resto del sitio; el cian no se usa (aquí nada es interactivo en el lienzo).
 */
import { N_LINEAS_PLACAS, dibujarPlacas } from "./dibujarPlacas";
import { unidadTexto } from "./geometriaCargas";
import {
  ESPACIADO_PX,
  MEDIDOR_SEMILADO_PX,
  SEMIALTO_PARED_PX,
  SEMIANCHO_PARED_PX,
  desplazamientoMedio,
  type ParcheMaterial,
} from "../fisica/materiales";
import type { OrientacionPlacas } from "../fisica/campoExterno";

export const ANCHO_LIENZO_MATERIAL = 480;
export const ALTO_LIENZO_MATERIAL = 360;
/** Aumento del parche en el lienzo (nunca se dice que es a escala real). */
export const ZOOM_PARCHE = 8;

const ROJO = "#dc2626";
const RGB_ROJO = "220, 38, 38";
const RGB_AZUL = "37, 99, 235";
const FONDO_MATERIAL = "#0f1830";
const BORDE_MATERIAL = "rgba(148, 163, 184, 0.55)";
const COLOR_ATOMO = "rgba(148, 163, 184, 0.4)";
const COLOR_ZONA = "rgba(226, 232, 240, 0.55)";
const FUENTE = 'ui-monospace, "Cascadia Code", "SFMono-Regular", Consolas, monospace';

/** Radios en px lógicos del lienzo (antes de que CSS lo escale). */
const RADIO_ELECTRON = 5.6;
const RADIO_ION = 2.8;
/** Las líneas interiores no se dibujan pegadas al borde del recuadro (px lógicos). */
const MARGEN_LINEA_INTERIOR_PX = 4;
/** Líneas de campo interiores: más gruesas y luminosas que los contornos (se leen en el proyector). */
const COLOR_LINEA_INTERIOR = "#f8fafc";
const GROSOR_LINEA_INTERIOR_CSS = 2.5;
const FLECHA_INTERIOR_CSS = 13;
/** Separación aproximada entre signos +/− del borde iluminado (px lógicos). */
const SEPARACION_GLIFOS_PX = 60;
const GLIFO_BORDE_CSS = 20;
/** Desplazamiento (px del parche) al que el brillo de borde llega al ~63 % de su máximo. */
const ESCALA_BRILLO_PX = 0.5;
const ALFA_BRILLO_MAX = 0.6;
const GROSOR_BRILLO_CSS = 22;

export interface EscenaMaterial {
  parche: ParcheMaterial;
  e0: readonly [number, number];
  orientacion: OrientacionPlacas;
  polaridad: 1 | -1;
  /** |E_int|/|E0| más reciente (se refresca ~10 Hz); gobierna las líneas interiores. */
  razon: number;
}

function flecha(ctx: CanvasRenderingContext2D, x0: number, y0: number, x1: number, y1: number, tam: number): void {
  ctx.beginPath();
  ctx.moveTo(x0, y0);
  ctx.lineTo(x1, y1);
  ctx.stroke();
  const dx = x1 - x0;
  const dy = y1 - y0;
  const l = Math.hypot(dx, dy) || 1;
  const ux = dx / l;
  const uy = dy / l;
  const mx = (x0 + x1) / 2;
  const my = (y0 + y1) / 2;
  const px = -uy;
  const py = ux;
  ctx.beginPath();
  ctx.moveTo(mx + ux * tam * 0.6, my + uy * tam * 0.6);
  ctx.lineTo(mx - ux * tam * 0.4 + px * tam * 0.35, my - uy * tam * 0.4 + py * tam * 0.35);
  ctx.lineTo(mx - ux * tam * 0.4 - px * tam * 0.35, my - uy * tam * 0.4 - py * tam * 0.35);
  ctx.closePath();
  ctx.fill();
}

export function dibujarMaterial(
  ctx: CanvasRenderingContext2D,
  escena: EscenaMaterial,
  escalaCss = 1,
): void {
  const { parche, e0, orientacion, polaridad, razon } = escena;
  const ancho = ANCHO_LIENZO_MATERIAL;
  const alto = ALTO_LIENZO_MATERIAL;
  const ut = unidadTexto(escalaCss);
  const cx = ancho / 2;
  const cy = alto / 2;
  const semiAncho = SEMIANCHO_PARED_PX * ZOOM_PARCHE;
  const semiAlto = SEMIALTO_PARED_PX * ZOOM_PARCHE;
  const izq = cx - semiAncho;
  const arr = cy - semiAlto;
  const anchoCaja = 2 * semiAncho;
  const altoCaja = 2 * semiAlto;
  const vertical = orientacion === "vertical";

  ctx.clearRect(0, 0, ancho, alto);
  dibujarPlacas(ctx, ancho, alto, orientacion, polaridad, escalaCss);

  // Recuadro del material.
  ctx.save();
  ctx.fillStyle = FONDO_MATERIAL;
  ctx.fillRect(izq, arr, anchoCaja, altoCaja);

  // Líneas de campo interiores: mismas coordenadas que las exteriores de `dibujarPlacas` que caen
  // dentro del recuadro, con el sentido de las externas (de la placa + a la placa −). La opacidad de cada una
  // = cuánto de |E_int|/E0 "le toca" (la del centro primero, luego las más cercanas al centro).
  const mag0 = Math.hypot(e0[0], e0[1]);
  if (mag0 > 0) {
    const sentido = polaridad;
    const desde = vertical ? izq : arr;
    const hasta = vertical ? izq + anchoCaja : arr + altoCaja;
    const centroEje = vertical ? cx : cy;
    const largoEje = vertical ? ancho : alto;
    const posiciones: number[] = [];
    for (let i = 1; i <= N_LINEAS_PLACAS; i++) {
      const p = (i / (N_LINEAS_PLACAS + 1)) * largoEje;
      if (p > desde + MARGEN_LINEA_INTERIOR_PX && p < hasta - MARGEN_LINEA_INTERIOR_PX) posiciones.push(p);
    }
    posiciones.sort((a, b) => Math.abs(a - centroEje) - Math.abs(b - centroEje) || a - b);
    const fraccion = Math.max(0, Math.min(1, razon)) * posiciones.length;
    ctx.strokeStyle = COLOR_LINEA_INTERIOR;
    ctx.fillStyle = COLOR_LINEA_INTERIOR;
    ctx.lineWidth = GROSOR_LINEA_INTERIOR_CSS * ut;
    const tam = FLECHA_INTERIOR_CSS * ut;
    posiciones.forEach((p, rango) => {
      const alfa = Math.max(0, Math.min(1, fraccion - rango));
      if (alfa <= 0.02) return;
      ctx.globalAlpha = alfa;
      if (vertical) {
        flecha(ctx, p, sentido === 1 ? arr : arr + altoCaja, p, sentido === 1 ? arr + altoCaja : arr, tam);
      } else {
        flecha(ctx, sentido === 1 ? izq : izq + anchoCaja, p, sentido === 1 ? izq + anchoCaja : izq, p, tam);
      }
    });
    ctx.globalAlpha = 1;
  }

  // Brillo de los bordes: donde se acumulan los electrones (azul, −) y donde quedan los iones
  // sin compensar (rojo, +). Intensidad según el desplazamiento medio real (no un valor decorativo).
  const despl = desplazamientoMedio(parche, e0);
  /** Signos +/− del borde iluminado: se dibujan al final, encima de átomos y electrones, para que se lean. */
  const glifos: { x: number; y: number; texto: string; color: string }[] = [];
  if (mag0 > 0 && despl > 0) {
    const alfa = ALFA_BRILLO_MAX * (1 - Math.exp(-despl / ESCALA_BRILLO_PX));
    const grosor = GROSOR_BRILLO_CSS * ut;
    // Los electrones se corren en el sentido de −E0.
    const ux = -e0[0] / mag0;
    const uy = -e0[1] / mag0;
    const lado = (signoX: number, signoY: number, rgb: string, glifo: string, colorGlifo: string) => {
      // (signoX, signoY) = normal exterior del borde.
      let x0 = izq;
      let y0 = arr;
      let w = anchoCaja;
      let h = grosor;
      let gx0: number;
      let gy0: number;
      let gx1: number;
      let gy1: number;
      if (signoY !== 0) {
        h = grosor;
        y0 = signoY < 0 ? arr : arr + altoCaja - grosor;
        gx0 = 0;
        gx1 = 0;
        gy0 = signoY < 0 ? arr : arr + altoCaja;
        gy1 = signoY < 0 ? arr + grosor : arr + altoCaja - grosor;
      } else {
        w = grosor;
        h = altoCaja;
        x0 = signoX < 0 ? izq : izq + anchoCaja - grosor;
        gy0 = 0;
        gy1 = 0;
        gx0 = signoX < 0 ? izq : izq + anchoCaja;
        gx1 = signoX < 0 ? izq + grosor : izq + anchoCaja - grosor;
      }
      const grad = ctx.createLinearGradient(gx0, gy0, gx1, gy1);
      grad.addColorStop(0, `rgba(${rgb}, ${alfa})`);
      grad.addColorStop(1, `rgba(${rgb}, 0)`);
      ctx.fillStyle = grad;
      ctx.fillRect(x0, y0, w, h);
      if (alfa > 0.08) {
        // Repetido a lo largo de todo el borde (cada ~60 px lógicos), no un solo signo en el centro.
        const horizontal = signoY !== 0;
        const largo = horizontal ? anchoCaja : altoCaja;
        const n = Math.max(1, Math.round(largo / SEPARACION_GLIFOS_PX));
        for (let j = 0; j < n; j++) {
          const a = ((j + 0.5) * largo) / n;
          glifos.push({
            x: horizontal ? izq + a : signoX < 0 ? izq + grosor * 0.5 : izq + anchoCaja - grosor * 0.5,
            y: horizontal ? (signoY < 0 ? arr + grosor * 0.5 : arr + altoCaja - grosor * 0.5) : arr + a,
            texto: glifo,
            color: colorGlifo,
          });
        }
      }
    };
    // Borde hacia el que se corren los electrones: normal exterior = (ux, uy) sobre el eje del campo.
    const nx = vertical ? 0 : Math.sign(ux);
    const ny = vertical ? Math.sign(uy) : 0;
    lado(nx, ny, RGB_AZUL, "−", "#dbeafe");
    lado(-nx, -ny, RGB_ROJO, "+", "#fee2e2");
  }

  // Contorno del material (la "superficie").
  ctx.strokeStyle = BORDE_MATERIAL;
  ctx.lineWidth = 1.5 * ut;
  ctx.strokeRect(izq, arr, anchoCaja, altoCaja);

  // Aislante: círculo tenue alrededor de cada átomo y un hilo ion-electrón (el resorte).
  if (parche.tipo === "aislante") {
    ctx.strokeStyle = COLOR_ATOMO;
    ctx.lineWidth = 1 * ut;
    const radioAtomo = 0.44 * ESPACIADO_PX * ZOOM_PARCHE;
    for (let i = 0; i < parche.n; i++) {
      ctx.beginPath();
      ctx.arc(cx + parche.ionX[i] * ZOOM_PARCHE, cy + parche.ionY[i] * ZOOM_PARCHE, radioAtomo, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.strokeStyle = "rgba(226, 232, 240, 0.7)";
    ctx.lineWidth = 1.5 * ut;
    ctx.beginPath();
    for (let i = 0; i < parche.n; i++) {
      ctx.moveTo(cx + parche.ionX[i] * ZOOM_PARCHE, cy + parche.ionY[i] * ZOOM_PARCHE);
      ctx.lineTo(cx + parche.x[i] * ZOOM_PARCHE, cy + parche.y[i] * ZOOM_PARCHE);
    }
    ctx.stroke();
  }

  // Electrones (−, azul, disco grande y algo translúcido) y encima los iones (+, rojo, punto).
  ctx.fillStyle = `rgba(${RGB_AZUL}, 0.78)`;
  ctx.strokeStyle = "#93c5fd";
  ctx.lineWidth = 1 * ut;
  for (let i = 0; i < parche.n; i++) {
    ctx.beginPath();
    ctx.arc(cx + parche.x[i] * ZOOM_PARCHE, cy + parche.y[i] * ZOOM_PARCHE, RADIO_ELECTRON, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }
  ctx.fillStyle = ROJO;
  ctx.strokeStyle = "#fecaca";
  for (let i = 0; i < parche.n; i++) {
    ctx.beginPath();
    ctx.arc(cx + parche.ionX[i] * ZOOM_PARCHE, cy + parche.ionY[i] * ZOOM_PARCHE, RADIO_ION, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }

  // Zona donde se mide el campo interior (4 x 4 átomos del centro).
  const medio = MEDIDOR_SEMILADO_PX * ZOOM_PARCHE;
  ctx.setLineDash([6 * ut, 5 * ut]);
  ctx.strokeStyle = COLOR_ZONA;
  ctx.lineWidth = 1.4 * ut;
  ctx.strokeRect(cx - medio, cy - medio, 2 * medio, 2 * medio);
  ctx.setLineDash([]);

  // Signos del borde iluminado, con contorno oscuro para que se lean sobre electrones y átomos.
  if (glifos.length > 0) {
    ctx.font = `700 ${GLIFO_BORDE_CSS * ut}px ${FUENTE}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.lineJoin = "round";
    ctx.lineWidth = 3 * ut;
    ctx.strokeStyle = "rgba(5, 7, 13, 0.85)";
    for (const g of glifos) {
      ctx.strokeText(g.texto, g.x, g.y);
      ctx.fillStyle = g.color;
      ctx.fillText(g.texto, g.x, g.y);
    }
  }

  ctx.restore();
}
