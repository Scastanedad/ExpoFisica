/**
 * Protocolo de mensajes entre el hilo principal y el Worker del motor físico
 * (tabla documentada en EFmem/00-Proyecto/arquitectura.md). Solo tipos: lo
 * importan el Worker y `hooks/useSimulacionWorker.ts`.
 */
import type { EnergiaDinamica } from "../types/simulacion";

export interface CargaInicial {
  id: string;
  q: number;
  masa: number;
}

/** UI -> Worker. */
export type MensajeAlWorker =
  | { tipo: "init"; ancho: number; alto: number; cargas: CargaInicial[] }
  | { tipo: "agregarCarga"; id: string; q: number; masa: number }
  | { tipo: "quitarCarga"; id: string }
  /** Coloca la carga (px lógicos) con v = 0, sin anclarla: teclado, "tocar el destino" y cada muestra del arrastre. */
  | { tipo: "moverCarga"; id: string; x: number; y: number }
  /** El puntero sujeta la carga: queda anclada con v = 0 (sigue empujando a las demás). */
  | { tipo: "agarrarCarga"; id: string }
  /** Suelta la carga con la velocidad del puntero en px lógicos/s de PANTALLA, sin tope: el Worker aplica zona muerta, tope y ÷σ. */
  | { tipo: "soltarCarga"; id: string; vx: number; vy: number }
  /** Cambia la magnitud (el signo no se edita); ver fisica/dinamica.ts `aplicarCambioCarga`. */
  | { tipo: "cambiarCarga"; id: string; q: number }
  | { tipo: "pausa"; valor: boolean }
  | { tipo: "velocidad"; valor: number };

/** Worker -> UI. */
export type MensajeDelWorker =
  | { tipo: "orden"; ids: string[] }
  | { tipo: "frame"; posiciones: Float32Array }
  | ({ tipo: "energia" } & EnergiaDinamica)
  /**
   * Fuerza neta sobre cada carga (E3.2 §3), alineada con el último mensaje
   * "orden": `[fx0,fy0,fx1,fy1,…]` en unidades de SIMULACIÓN (K_VISUAL,
   * SOFTENING2). Es una LECTURA de `SistemaDinamico.fx/fy` ya calculada por
   * `calcularFuerzas`: no se computa nada nuevo. Cada ~100 ms (10 Hz), igual
   * que "energia" pero sin esperar su intervalo de 250 ms.
   */
  | { tipo: "fuerzas"; fuerzasSim: Float32Array };
