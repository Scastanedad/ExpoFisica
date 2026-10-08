/**
 * Textos para lectores de pantalla de la estación Ley de Gauss (sin DOM ni React):
 *  - `describirEscena`: descripción de la escena (forma, tamaño, cargas con signo, posición y dentro/fuera, Φ y q_enc),
 *    equivalente a `describirEscena` de las otras estaciones; se vincula al lienzo con `aria-describedby`.
 *  - `textoAnuncioFlujo`: lo que dice la región viva cuando cambian Φ o q_enc.
 *  - `crearAnunciador`: limita la frecuencia de la región viva (sin spam durante el arrastre).
 */
import type { TipoSuperficie } from "../fisica/gauss3d/tipos";
import { formatPhi } from "../fisica/gauss3d/unidades";

/** Sin cambios durante este tiempo (ms) se anuncia (el arrastre publica a ≤ 10 Hz, así que se anuncia al soltar). */
export const MS_REPOSO_ANUNCIO = 700;
/** Intervalo mínimo (ms) entre dos anuncios. */
export const MS_ENTRE_ANUNCIOS = 1000;

export const coma = (t: string) => t.replace(/(\d)\.(\d)/g, "$1,$2");
const residuo = (v: number) => (Math.abs(v) < 1e-9 ? 0 : v);
/** Longitud en cm SIEMPRE (1 u = 1 cm; sin cambiar de unidad entre mm y cm), coma decimal y menos tipográfico. */
export const cm = (u: number) => {
  const n = Math.round(u * 100) / 100;
  return `${coma(String(Math.abs(n) < 0.005 ? 0 : n)).replace("-", "−")} cm`;
};
const qTexto = (q: number) => coma(`${q < -0.005 ? "−" : q > 0.005 ? "+" : ""}${Math.abs(q).toFixed(2)}`);

export interface CargaDescrita {
  /** µC con signo. */
  q: number;
  /** Posición en u (1 u = 1 cm). */
  x: number;
  y: number;
  z: number;
  dentro: boolean;
}

export interface EntradaDescripcion {
  forma: TipoSuperficie;
  /** Radio (esfera, cilindro) o lado (cubo, plano) en u. */
  tamano: number;
  thetaDeg: number;
  cargas: readonly CargaDescrita[];
  /** null mientras no hay lectura. */
  phi: number | null;
  qEnc: number | null;
}

export function describirSuperficie(forma: TipoSuperficie, tamano: number, thetaDeg: number): string {
  switch (forma) {
    case "esfera":
      return `una esfera de radio ${cm(tamano)} centrada en el origen`;
    case "cubo":
      return `un cubo de lado ${cm(tamano)} centrado en el origen`;
    case "cilindro":
      return `un cilindro cerrado de radio ${cm(tamano)} y altura ${cm(2 * tamano)} centrado en el origen`;
    case "parche":
      return `un plano cuadrado de lado ${cm(tamano)}, inclinado ${Math.round(thetaDeg)}° respecto a la horizontal`;
  }
}

export function describirEscena(e: EntradaDescripcion): string {
  const partes: string[] = [`Escena 3D de la ley de Gauss. Superficie gaussiana: ${describirSuperficie(e.forma, e.tamano, e.thetaDeg)}.`];
  e.cargas.forEach((c, i) => {
    const lugar = e.forma === "parche" ? "" : c.dentro ? ", dentro de la superficie" : ", fuera de la superficie";
    partes.push(
      `Carga ${i + 1}: ${c.q > 0 ? "positiva" : "negativa"} de ${coma(Math.abs(c.q).toFixed(1))} µC${lugar}, en x = ${cm(c.x)}, y = ${cm(c.y)}, altura z = ${cm(c.z)}.`,
    );
  });
  if (e.phi !== null) {
    partes.push(`Flujo ${coma(formatPhi(residuo(e.phi)))}.`);
    partes.push(
      e.forma === "parche" || e.qEnc === null
        ? "Superficie abierta: no hay carga encerrada."
        : `Carga encerrada q_enc = ${qTexto(residuo(e.qEnc))} µC.`,
    );
  }
  return partes.join(" ");
}

/** Texto de la región viva: solo Φ y q_enc, redondeados como en pantalla (cambia solo si cambia lo que se ve). */
export function textoAnuncioFlujo(phi: number, qEnc: number, forma: TipoSuperficie): string {
  const f = coma(formatPhi(residuo(phi)));
  return forma === "parche"
    ? `${f}, a través del plano; sin carga encerrada.`
    : `${f}. Carga encerrada: ${qTexto(residuo(qEnc))} µC.`;
}

export interface DepsAnunciador {
  emitir: (texto: string) => void;
  ahora: () => number;
  fijar: (cb: () => void, ms: number) => number;
  cancelar: (id: number) => void;
}

export interface Anunciador {
  /** Propone un texto: se emite tras `MS_REPOSO_ANUNCIO` sin cambios y no antes de `MS_ENTRE_ANUNCIOS` del anuncio previo. */
  proponer(texto: string): void;
  destruir(): void;
}

export function crearAnunciador(deps: DepsAnunciador): Anunciador {
  let ultimoEmitido: string | null = null;
  let ultimaVez = -Infinity;
  let pendiente: string | null = null;
  let id = 0;

  function emitir() {
    id = 0;
    if (pendiente === null || pendiente === ultimoEmitido) return;
    ultimoEmitido = pendiente;
    ultimaVez = deps.ahora();
    deps.emitir(pendiente);
  }

  return {
    proponer(texto) {
      pendiente = texto;
      if (id) {
        deps.cancelar(id);
        id = 0;
      }
      if (texto === ultimoEmitido) return; // volvió al valor ya anunciado: nada que decir
      const espera = Math.max(MS_REPOSO_ANUNCIO, MS_ENTRE_ANUNCIOS - (deps.ahora() - ultimaVez));
      id = deps.fijar(emitir, espera);
    },
    destruir() {
      if (id) deps.cancelar(id);
      id = 0;
      pendiente = null;
    },
  };
}
