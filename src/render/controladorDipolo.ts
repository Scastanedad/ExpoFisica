/**
 * Extensión ADITIVA de `ControladorEscena` para la Estación 03 (Dipolos): no
 * modifica `controladorEscena.ts` (archivo compartido con las otras
 * estaciones), solo añade `girar`/`reiniciar` sobre el mismo contrato
 * `posicion`/`mover` -- así `moverPorTeclado`/`esTeclaDeMovimiento` (funciones
 * puras ya existentes) se reutilizan sin cambios para mover el centro de masa
 * del dipolo o la carga fuente con las flechas del teclado.
 *
 * Ids reservados (nunca colisionan con `ID_SONDA_Q0` de las otras
 * estaciones, que no se usa aquí): `ID_DIPOLO` (centro de masa, siempre
 * presente) e `ID_CARGA_FUENTE` (solo relevante en modo "puntual").
 */
import type { ControladorEscena } from "./controladorEscena";

export const ID_DIPOLO = "__dipolo__";
export const ID_CARGA_FUENTE = "__carga_fuente__";

export interface ControladorDipolo extends ControladorEscena {
  /** Gira el dipolo `deltaRad` (positivo = sentido horario en pantalla, y hacia abajo); pone omega en 0. */
  girar(deltaRad: number): void;
  /** Ángulo actual del eje (de − a +), grados en [0, 360), misma convención que `LecturaDipolo.anguloDeg`. */
  anguloDeg(): number;
  /** Restablece el dipolo y la carga fuente a su posición/ángulo inicial. */
  reiniciar(): void;
}
