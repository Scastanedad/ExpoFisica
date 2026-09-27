/**
 * Contrato entre un canvas y los controles que viven fuera de él (p. ej. el
 * `PanelCargas`): permite LEER y MOVER cargas sin pasar posiciones por estado
 * de React. Cada canvas lo publica en un ref que le pasa la página:
 *  - estación estática: `mover` escribe en su `posicionesRef`;
 *  - estación dinámica: `mover` llama a `moverCarga` del Worker (velocidad 0).
 *
 * Es la alternativa al arrastre (WCAG 2.1.1 y 2.5.7): teclado (flechas) y
 * "seleccionar y tocar el destino". La Fase 2 puede ampliar esta interfaz
 * (magnitud, empujón con velocidad) sin cambiar a los consumidores.
 *
 * `ID_SONDA_Q0` (E3.1/T3.1, corrección post revisión UI): id reservado para
 * que la carga de prueba q₀ use el MISMO `posicion`/`mover` que las cargas
 * reales -- `useInteraccionEscena` enruta este id a `opciones.sonda` en vez
 * de a la lista de cargas. Así q₀ gana teclado y "tocar el destino" sin
 * duplicar la lógica de `moverPorTeclado`. Ninguna carga real puede tener
 * este id: los stores generan `carga-0`, `carga-1`, ... (`simulacionStore.ts`
 * / `simulacionDinamicaStore.ts`), nunca `__q0__`.
 */
import { PX_POR_CUADRO } from "../fisica/escala";

export const ID_SONDA_Q0 = "__q0__";

export interface Posicion {
  x: number;
  y: number;
}

export interface ControladorEscena {
  ancho: number;
  alto: number;
  /** Posición actual (px lógicos) de una carga, o undefined si no existe. */
  posicion(id: string): Posicion | undefined;
  /** Mueve una carga a (x, y); limita a la zona de arrastre. */
  mover(id: string, x: number, y: number): void;
}

/** Distancia mínima (px lógicos) entre una carga arrastrada y el borde del canvas. */
export const LIMITE_ARRASTRE = 20;
/** Paso de teclado: 1 cuadro; con Shift, 5 cuadros. */
export const PASO_TECLADO_CUADROS = 1;
export const PASO_TECLADO_MAYUS_CUADROS = 5;

export function limitarPosicion(x: number, y: number, ancho: number, alto: number): Posicion {
  return {
    x: Math.max(LIMITE_ARRASTRE, Math.min(ancho - LIMITE_ARRASTRE, x)),
    y: Math.max(LIMITE_ARRASTRE, Math.min(alto - LIMITE_ARRASTRE, y)),
  };
}

const DIRECCIONES: Record<string, Posicion> = {
  ArrowLeft: { x: -1, y: 0 },
  ArrowRight: { x: 1, y: 0 },
  ArrowUp: { x: 0, y: -1 },
  ArrowDown: { x: 0, y: 1 },
};

export function esTeclaDeMovimiento(tecla: string): boolean {
  return tecla in DIRECCIONES;
}

/**
 * Mueve la carga `id` según una tecla de flecha. Devuelve la posición final
 * (ya limitada) o `null` si la tecla no es de movimiento o la carga no existe.
 */
export function moverPorTeclado(
  controlador: ControladorEscena,
  id: string,
  tecla: string,
  mayus: boolean,
): Posicion | null {
  const dir = DIRECCIONES[tecla];
  const actual = controlador.posicion(id);
  if (!dir || !actual) return null;
  const paso = (mayus ? PASO_TECLADO_MAYUS_CUADROS : PASO_TECLADO_CUADROS) * PX_POR_CUADRO;
  const destino = limitarPosicion(
    actual.x + dir.x * paso,
    actual.y + dir.y * paso,
    controlador.ancho,
    controlador.alto,
  );
  controlador.mover(id, destino.x, destino.y);
  return destino;
}
