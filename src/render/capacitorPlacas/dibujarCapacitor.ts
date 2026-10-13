/**
 * Dibujo de la estación 08 sobre un contexto 2D mínimo (`Contexto2D`), sin DOM: se prueba con `ctxFalso`.
 * Orden: fondo → cables y batería → lámina → líneas de campo → dipolos → placas → cargas libres y ligadas →
 * regla de d → rótulos. Rojo/azul SOLO para la polaridad (⊕ rojo claro, ⊖ azul claro); el campo va en cian y
 * el aviso de rigidez en ámbar.
 */
import { UMBRAL_AVISO } from "../../fisica/capacitorPlacas/constantes";
import { formatearSI } from "../../fisica/circuitos/formato";
import type { Dielectrico, Estado, Parametros } from "../../fisica/capacitorPlacas/tipos";
import type { Contexto2D } from "../ctx2d";
import {
  ALTO_PLACAS,
  ANCHO_PLACAS,
  GROSOR_PLACA,
  X_BATERIA,
  X_CABLE,
  YC,
  Y_TERMINAL_INF,
  Y_TERMINAL_SUP,
  anguloAleatorio,
  calcularGeometria,
  numeroCargas,
  numeroLineas,
  posicionesCargas,
  type Geometria,
  type Zona,
} from "./geometria";

export const FONDO = "#0b1020";
const PLACA = "#cbd5e1";
const CABLE = "#94a3b8";
const TEXTO = "#f1f5f9";
const TEXTO_SUAVE = "#cbd5e1";
const CAMPO = "#22d3ee";
const AVISO = "#fbbf24";
export const POSITIVA = "#fca5a5";
export const NEGATIVA = "#93c5fd";

/** Color propio de la lámina de cada material (ni rojo ni azul: esos son de la polaridad). */
export const COLOR_LAMINA: Record<string, string> = {
  aire: "#94a3b8",
  teflon: "#f8fafc",
  silicona: "#fde047",
  poliestireno: "#c4b5fd",
  mylar: "#a7f3d0",
  pvc: "#fdba74",
  papel: "#e7d9b6",
  pyrex: "#99f6e4",
  porcelana: "#d6d3d1",
  neopreno: "#78716c",
  titanato: "#f0abfc",
};

export interface DatosDibujo {
  p: Parametros;
  estado: Estado;
  material: Dielectrico;
  /** Fracción de alineación de los dipolos dentro del campo (0 desordenados, 1 alineados), animada. */
  polarizacion: number;
  hover: Zona | null;
}

export interface OpcionesDibujo {
  escalaCss: number;
}

/** Tamaño de fuente lógico para que el texto no baje de ~12 px CSS reales. */
export function fuenteLogica(escalaCss: number): number {
  const f = 12 / (escalaCss > 0 ? escalaCss : 1);
  return Math.round(Math.min(22, Math.max(13, f)) * 2) / 2;
}

function linea(ctx: Contexto2D, x1: number, y1: number, x2: number, y2: number) {
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
}

/** Marca ⊕ / ⊖: círculo con fondo oscuro, signo y borde de color. */
function marca(ctx: Contexto2D, x: number, y: number, r: number, signo: 1 | -1, color: string) {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fillStyle = FONDO;
  ctx.fill();
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.5;
  ctx.stroke();
  const k = r * 0.55;
  linea(ctx, x - k, y, x + k, y);
  if (signo > 0) linea(ctx, x, y - k, x, y + k);
}

function triangulo(ctx: Contexto2D, x: number, y: number, dx: number, dy: number, s: number, color: string) {
  // Triángulo apuntando en (dx, dy) con tamaño s.
  const px = -dy;
  const py = dx;
  ctx.beginPath();
  ctx.moveTo(x + dx * s, y + dy * s);
  ctx.lineTo(x - dx * s * 0.2 + px * s * 0.7, y - dy * s * 0.2 + py * s * 0.7);
  ctx.lineTo(x - dx * s * 0.2 - px * s * 0.7, y - dy * s * 0.2 - py * s * 0.7);
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
}

function dibujarBateria(ctx: Contexto2D, g: Geometria, conectado: boolean, V: number, fuente: number) {
  const color = conectado ? CABLE : "#64748b";
  ctx.strokeStyle = color;
  ctx.lineWidth = 2.5;
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  // Cables: batería → interruptor → bajada → placa superior; batería → placa inferior.
  ctx.setLineDash([]);
  linea(ctx, X_BATERIA, Y_TERMINAL_SUP, X_BATERIA + 20, Y_TERMINAL_SUP);
  linea(ctx, X_CABLE - 10, Y_TERMINAL_SUP, X_CABLE, Y_TERMINAL_SUP);
  linea(ctx, X_CABLE, Y_TERMINAL_SUP, X_CABLE, g.yPlacaSup);
  linea(ctx, X_CABLE, g.yPlacaSup, g.x0, g.yPlacaSup);
  linea(ctx, X_BATERIA, Y_TERMINAL_INF, X_CABLE, Y_TERMINAL_INF);
  linea(ctx, X_CABLE, Y_TERMINAL_INF, X_CABLE, g.yPlacaInf);
  linea(ctx, X_CABLE, g.yPlacaInf, g.x0, g.yPlacaInf);
  // Celdas: raya larga (+) arriba, corta (−) abajo.
  linea(ctx, X_BATERIA, Y_TERMINAL_SUP, X_BATERIA, YC - 8);
  linea(ctx, X_BATERIA, YC + 8, X_BATERIA, Y_TERMINAL_INF);
  ctx.lineWidth = 4;
  linea(ctx, X_BATERIA - 18, YC - 8, X_BATERIA + 18, YC - 8);
  linea(ctx, X_BATERIA - 10, YC + 8, X_BATERIA + 10, YC + 8);
  // Interruptor: contactos y palanca (cerrada = horizontal; abierta = levantada).
  ctx.lineWidth = 2.5;
  const hx = X_BATERIA + 20;
  const cx = X_CABLE - 10;
  if (conectado) linea(ctx, hx, Y_TERMINAL_SUP, cx, Y_TERMINAL_SUP);
  else linea(ctx, hx, Y_TERMINAL_SUP, hx + (cx - hx) * 0.86, Y_TERMINAL_SUP - (cx - hx) * 0.5);
  for (const x of [hx, cx]) {
    ctx.beginPath();
    ctx.arc(x, Y_TERMINAL_SUP, 3.5, 0, Math.PI * 2);
    ctx.fillStyle = TEXTO;
    ctx.fill();
  }
  ctx.fillStyle = TEXTO;
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  ctx.font = `${fuente}px system-ui, sans-serif`;
  ctx.fillText(conectado ? formatearSI(V, "V") : "Aislado", X_BATERIA, Y_TERMINAL_INF + fuente + 8);
  ctx.fillStyle = TEXTO_SUAVE;
  ctx.fillText(conectado ? "Batería" : "Sin batería", X_BATERIA, Y_TERMINAL_SUP - 36);
  ctx.textAlign = "start";
}

export function dibujarCapacitor(ctx: Contexto2D, d: DatosDibujo, opc: OpcionesDibujo): void {
  const { p, estado, material } = d;
  const g = calcularGeometria(p);
  const fuente = fuenteLogica(opc.escalaCss);
  const conectado = p.modo === "conectado";
  const hayLamina = material.id !== "aire";

  ctx.globalAlpha = 1;
  ctx.fillStyle = FONDO;
  ctx.fillRect(0, 0, ANCHO_PLACAS, ALTO_PLACAS);

  dibujarBateria(ctx, g, conectado, estado.V, fuente);

  // ---- Lámina de dieléctrico (bloque de color propio) ------------------------------------------------------
  const colorLamina = COLOR_LAMINA[material.id] ?? "#94a3b8";
  if (hayLamina) {
    ctx.globalAlpha = 0.42;
    ctx.fillStyle = colorLamina;
    ctx.fillRect(g.lamina.x, g.lamina.y, g.lamina.w, g.lamina.h);
    ctx.globalAlpha = 1;
    ctx.strokeStyle = colorLamina;
    ctx.lineWidth = d.hover === "lamina" ? 3 : 1.5;
    ctx.beginPath();
    ctx.moveTo(g.lamina.x, g.lamina.y);
    ctx.lineTo(g.lamina.x + g.lamina.w, g.lamina.y);
    ctx.lineTo(g.lamina.x + g.lamina.w, g.lamina.y + g.lamina.h);
    ctx.lineTo(g.lamina.x, g.lamina.y + g.lamina.h);
    ctx.closePath();
    ctx.stroke();
  }

  // ---- Líneas de campo: densidad ∝ E (igual en las dos zonas), hacia la placa − --------------------------------
  const nLineas = numeroLineas(estado.E);
  const enAviso = estado.ratioRigidez >= UMBRAL_AVISO;
  if (nLineas > 0) {
    ctx.strokeStyle = enAviso ? AVISO : CAMPO;
    ctx.fillStyle = enAviso ? AVISO : CAMPO;
    ctx.lineWidth = 1.6;
    const paso = (g.L - 24) / Math.max(1, nLineas - 1);
    for (let i = 0; i < nLineas; i++) {
      const x = nLineas === 1 ? g.x0 + g.L / 2 : g.x0 + 12 + i * paso;
      linea(ctx, x, g.yHuecoSup, x, g.yHuecoInf);
      if (g.g >= 24) triangulo(ctx, x, g.yHuecoSup + g.g * 0.55, 0, 1, 4.5, enAviso ? AVISO : CAMPO);
    }
  }

  // ---- Dipolos de la lámina: desordenados fuera, alineados dentro del campo --------------------------------
  if (hayLamina) {
    const cols = Math.max(1, Math.floor(g.L / 22));
    const filas = Math.max(1, Math.floor(g.g / 22));
    const celdaW = g.L / cols;
    const celdaH = g.g / filas;
    const mitad = Math.min(8, Math.max(3, Math.min(celdaW, celdaH) * 0.3));
    for (let r = 0; r < filas; r++) {
      for (let c = 0; c < cols; c++) {
        const cx = g.lamina.x + (c + 0.5) * celdaW;
        const cy = g.yHuecoSup + (r + 0.5) * celdaH;
        const dentroCampo = cx >= g.x0 && cx <= g.xDer;
        const th0 = anguloAleatorio(r * cols + c);
        const th = dentroCampo ? th0 * (1 - d.polarizacion) : th0;
        // θ = 0: el extremo + apunta hacia abajo (a favor del campo, hacia la placa −).
        const ux = Math.sin(th) * mitad;
        const uy = Math.cos(th) * mitad;
        ctx.strokeStyle = TEXTO_SUAVE;
        ctx.lineWidth = 2;
        linea(ctx, cx - ux, cy - uy, cx + ux, cy + uy);
        ctx.beginPath();
        ctx.arc(cx + ux, cy + uy, 2.4, 0, Math.PI * 2);
        ctx.fillStyle = POSITIVA;
        ctx.fill();
        ctx.beginPath();
        ctx.arc(cx - ux, cy - uy, 2.4, 0, Math.PI * 2);
        ctx.fillStyle = NEGATIVA;
        ctx.fill();
      }
    }
  }

  // ---- Placas ------------------------------------------------------------------------------------------------
  const nCargas = numeroCargas(estado.Q);
  for (const [rect, hov] of [
    [g.placaSup, d.hover === "placa-sup"],
    [g.placaInf, d.hover === "placa-inf"],
  ] as const) {
    ctx.fillStyle = hov ? "#f1f5f9" : PLACA;
    ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
  }
  if (nCargas > 0) {
    ctx.fillStyle = POSITIVA;
    ctx.fillRect(g.placaSup.x, g.yHuecoSup - 3, g.L, 3);
    ctx.fillStyle = NEGATIVA;
    ctx.fillRect(g.placaInf.x, g.yHuecoInf, g.L, 3);
  }

  // ---- Cargas libres (densidad ∝ σ de cada zona) y ligadas en las caras de la lámina -------------------------
  const xs = posicionesCargas(nCargas, p.f, g.L, estado.sigmaLibre, estado.sigmaLibreAire);
  for (const x of xs) {
    marca(ctx, g.x0 + x, g.yPlacaSup, 5, 1, POSITIVA);
    marca(ctx, g.x0 + x, g.yPlacaInf, 5, -1, NEGATIVA);
  }
  if (hayLamina && p.f > 0 && estado.sigmaLibre > 0) {
    const xsDiel = xs.filter((x) => x >= (1 - p.f) * g.L);
    const polar = 1 - 1 / material.kappa;
    const nLig = Math.round(xsDiel.length * polar);
    for (let i = 0; i < nLig; i++) {
      const x = g.x0 + xsDiel[Math.min(xsDiel.length - 1, Math.floor(((i + 0.5) / nLig) * xsDiel.length))];
      marca(ctx, x, g.yHuecoSup + 6.5, 3.5, -1, NEGATIVA);
      marca(ctx, x, g.yHuecoInf - 6.5, 3.5, 1, POSITIVA);
    }
  }

  // ---- Regla de d --------------------------------------------------------------------------------------------
  const xR = g.x0 - 20;
  ctx.strokeStyle = TEXTO_SUAVE;
  ctx.lineWidth = 1.5;
  linea(ctx, xR, g.yHuecoSup, xR, g.yHuecoInf);
  linea(ctx, xR - 5, g.yHuecoSup, xR + 5, g.yHuecoSup);
  linea(ctx, xR - 5, g.yHuecoInf, xR + 5, g.yHuecoInf);
  ctx.fillStyle = TEXTO;
  ctx.font = `${fuente}px system-ui, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  ctx.fillText(`d = ${formatearSI(p.d, "m")}`, g.x0 + g.L / 2, g.placaInf.y + GROSOR_PLACA + fuente + 18);

  // ---- Agarres (qué se puede arrastrar) --------------------------------------------------------------------
  const cxPlaca = g.x0 + g.L / 2;
  triangulo(ctx, cxPlaca, g.placaSup.y - 9, 0, -1, 5, TEXTO_SUAVE);
  triangulo(ctx, cxPlaca, g.placaInf.y + GROSOR_PLACA + 9, 0, 1, 5, TEXTO_SUAVE);
  if (hayLamina) {
    const mx = g.lamina.x + g.lamina.w / 2;
    if (p.f < 1) triangulo(ctx, mx - 12, g.yHuecoSup + g.g / 2, -1, 0, 5, TEXTO);
    if (p.f > 0) triangulo(ctx, mx + 12, g.yHuecoSup + g.g / 2, 1, 0, 5, TEXTO);
  }

  // ---- Rótulos -----------------------------------------------------------------------------------------------
  ctx.textAlign = "left";
  ctx.fillStyle = TEXTO;
  if (hayLamina) {
    const yRot = Math.min(g.placaSup.y, g.lamina.y) - 18;
    ctx.fillText(`${material.nombre} · κ = ${String(Number(material.kappa.toPrecision(3))).replace(".", ",")}`, Math.max(g.x0, g.lamina.x), yRot);
  }
  ctx.fillStyle = TEXTO_SUAVE;
  ctx.fillText("Dibujo no a escala · sin efectos de borde", 12, ALTO_PLACAS - 12);
  ctx.textAlign = "start";
}

