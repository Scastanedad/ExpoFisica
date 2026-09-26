/**
 * Igual que CanvasRenderer.tsx (mismo bucle de dibujo propio, mismo
 * principio de posiciones fuera de React), pero las posiciones vienen del
 * Worker de física dinámica vía useSimulacionWorker en vez de un ref
 * sincronizado solo por arrastre. El arrastre y la alternativa por teclado /
 * toque comparten hooks/useInteraccionEscena.ts; aquí "colocar" es
 * `moverCarga` del Worker (fija la velocidad en 0).
 */
import { useEffect, useRef, type RefObject } from "react";
import { useSimulacionStore } from "../store/simulacionStore";
import { useSimulacionDinamicaStore } from "../store/simulacionDinamicaStore";
import { useSeleccionStore } from "../store/seleccionStore";
import { useSimulacionWorker } from "../hooks/useSimulacionWorker";
import type { PuntoCarga } from "../fisica/coulomb";
import { useEscalaCss } from "../hooks/useEscalaCss";
import { useInteraccionEscena } from "../hooks/useInteraccionEscena";
import { describirEscena } from "../ui/textosEscena";
import type { ControladorEscena } from "./controladorEscena";
import { ALTO_ESCENA, ANCHO_ESCENA } from "./dimensiones";
import { dibujarEscena } from "./dibujarEscena";
import { crearDibujanteLeyenda } from "./dibujarLeyendaEscala";

interface Props {
  ancho?: number;
  alto?: number;
  /** Ref donde publicar el controlador (leer/mover cargas) para el teclado y el panel. */
  controladorRef?: RefObject<ControladorEscena | null>;
}

export function CanvasRendererDinamico({
  ancho = ANCHO_ESCENA,
  alto = ALTO_ESCENA,
  controladorRef,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const escalaCssRef = useEscalaCss(canvasRef, ancho);
  const seleccionRef = useRef<string | null>(null);

  const cargas = useSimulacionDinamicaStore((s) => s.cargas);
  const modoVista = useSimulacionStore((s) => s.modoVista);
  const unidadCarga = useSimulacionStore((s) => s.unidadCarga);
  const seleccionadaId = useSeleccionStore((s) => s.seleccionadaId);
  const colocarConToque = useSeleccionStore((s) => s.colocarConToque);
  const { posicionesRef, moverCarga } = useSimulacionWorker(cargas, ancho, alto);

  useEffect(() => {
    seleccionRef.current = seleccionadaId;
  }, [seleccionadaId]);

  useInteraccionEscena({
    canvasRef,
    ancho,
    alto,
    escalaCssRef,
    ids: cargas.map((c) => c.id),
    posicion: (id) => posicionesRef.current[id],
    colocar: moverCarga,
    controladorRef,
  });

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;

    function puntosCarga(): PuntoCarga[] {
      return cargas.map((c) => {
        const p = posicionesRef.current[c.id] ?? { x: ancho / 2, y: alto / 2 };
        return { x: p.x, y: p.y, q: c.q };
      });
    }

    const leyenda = crearDibujanteLeyenda();

    let idFrame: number;
    function frame() {
      if (!ctx) return;
      dibujarEscena(ctx, {
        puntos: puntosCarga(),
        modoVista,
        ancho,
        alto,
        escalaCss: escalaCssRef.current,
        leyenda,
        indiceSeleccionada: cargas.findIndex((c) => c.id === seleccionRef.current),
      });
      idFrame = requestAnimationFrame(frame);
    }
    idFrame = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(idFrame);
  }, [cargas, modoVista, ancho, alto, posicionesRef, escalaCssRef]);

  return (
    <canvas
      ref={canvasRef}
      className="lienzo"
      width={ancho}
      height={alto}
      role="img"
      aria-label={describirEscena(cargas, unidadCarga, modoVista)}
      style={{
        aspectRatio: `${ancho} / ${alto}`,
        ["--lienzo-ratio" as string]: ancho / alto,
        cursor: colocarConToque ? "crosshair" : "grab",
      }}
    />
  );
}
