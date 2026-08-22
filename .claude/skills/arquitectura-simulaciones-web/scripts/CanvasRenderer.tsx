/**
 * Plantilla: componente React que dibuja el resultado de la simulación en un
 * <canvas>, leyendo los datos del Web Worker (motor_fisico.worker.ts) sin
 * pasar por el estado reactivo de React -- ver references/gestion_estado.md.
 *
 * El componente SÍ lee `modoVista` del store de Zustand (cambia poco, está
 * bien que dispare un re-render normal), pero las posiciones que se dibujan
 * cada frame nunca tocan el estado de React ni el store.
 *
 * Requiere: react, zustand (para el store de la plantilla store_simulacion.ts)
 */

import { useEffect, useRef } from "react";
import { useSimulacionStore } from "./store_simulacion";

interface Props {
  nCargas: number;
  valoresCarga: number[];
  valoresMasa: number[];
  ancho?: number;
  alto?: number;
}

export function CanvasRenderer({ nCargas, valoresCarga, valoresMasa, ancho = 700, alto = 500 }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const workerRef = useRef<Worker | null>(null);
  const posicionesActualesRef = useRef<Float32Array>(new Float32Array(nCargas * 2));

  // Esto SÍ es estado de React normal -- cambia poco, es correcto que
  // el componente se re-renderice cuando el usuario lo cambia.
  const modoVista = useSimulacionStore((s) => s.modoVista);
  const enPausa = useSimulacionStore((s) => s.enPausa);
  const actualizarEnergiaTotal = useSimulacionStore((s) => s.actualizarEnergiaTotal);

  // Crear el Worker una sola vez
  useEffect(() => {
    const worker = new Worker(new URL("./motor_fisico.worker.ts", import.meta.url), {
      type: "module",
    });
    workerRef.current = worker;

    worker.postMessage({
      tipo: "init",
      nCargas,
      cargas: valoresCarga,
      masas: valoresMasa,
    });

    worker.onmessage = (evento: MessageEvent) => {
      const { tipo } = evento.data;
      if (tipo === "frame") {
        // Actualiza el ref directamente -- NO dispara re-render de React.
        posicionesActualesRef.current = new Float32Array(evento.data.posiciones);
      } else if (tipo === "energia") {
        // Esta sí pasa por el store, pero a ~4Hz (throttled en el Worker),
        // no cada frame -- ver motor_fisico.worker.ts.
        actualizarEnergiaTotal(evento.data.valor);
      }
    };

    return () => worker.terminate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // intencionalmente solo al montar -- re-crear el Worker en cada cambio sería incorrecto

  // Avisar al Worker cuando el usuario pausa/reanuda
  useEffect(() => {
    workerRef.current?.postMessage({ tipo: "pausa", valor: enPausa });
  }, [enPausa]);

  // El bucle de dibujo: su propio requestAnimationFrame, totalmente separado
  // del ciclo de renderizado de React.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctxNullable = canvas.getContext("2d");
    if (!ctxNullable) return;
    const ctx: CanvasRenderingContext2D = ctxNullable; // narrowed to non-null for the closure below

    let id: number;
    function dibujar() {
      ctx.clearRect(0, 0, ancho, alto);
      const pos = posicionesActualesRef.current;

      // Escala simple de coordenadas de simulación (centradas en 0) a pixeles
      const escala = 80;
      const cx = ancho / 2;
      const cy = alto / 2;

      for (let i = 0; i < nCargas; i++) {
        const x = cx + pos[i * 2] * escala;
        const y = cy + pos[i * 2 + 1] * escala;
        ctx.beginPath();
        ctx.arc(x, y, 10, 0, Math.PI * 2);
        ctx.fillStyle = valoresCarga[i] > 0 ? "#ef4444" : "#3b82f6";
        ctx.fill();
      }

      // `modoVista` decide qué overlay adicional dibujar (vectores, líneas
      // de campo, mapa de potencial) -- cada modo es una función de dibujo
      // separada que lee las mismas posiciones actuales.
      if (modoVista === "vectores") {
        // dibujarVectoresDeCampo(ctx, pos, valoresCarga, ancho, alto, escala, cx, cy);
      } else if (modoVista === "lineas") {
        // dibujarLineasDeCampo(ctx, pos, valoresCarga, ancho, alto, escala, cx, cy);
      } else if (modoVista === "potencial") {
        // dibujarMapaPotencial(ctx, pos, valoresCarga, ancho, alto, escala, cx, cy);
      }

      id = requestAnimationFrame(dibujar);
    }
    id = requestAnimationFrame(dibujar);
    return () => cancelAnimationFrame(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modoVista, ancho, alto, nCargas, valoresCarga]); // el bucle se recrea si cambia el modo de vista, no en cada frame

  return <canvas ref={canvasRef} width={ancho} height={alto} style={{ background: "#0b1020", borderRadius: 8 }} />;
}
