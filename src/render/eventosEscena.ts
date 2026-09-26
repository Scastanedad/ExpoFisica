/**
 * Aviso de "carga colocada con un toque en el recuadro" (alternativa al
 * arrastre). Es un evento puntual de DOM, no estado: así el panel puede
 * anunciarlo en su región `aria-live` sin que las posiciones pasen por React.
 */
export const EVENTO_CARGA_COLOCADA = "expofisica:carga-colocada";

export interface DetalleCargaColocada {
  id: string;
  x: number;
  y: number;
}

export function emitirCargaColocada(detalle: DetalleCargaColocada): void {
  window.dispatchEvent(new CustomEvent<DetalleCargaColocada>(EVENTO_CARGA_COLOCADA, { detail: detalle }));
}
