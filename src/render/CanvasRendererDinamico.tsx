/**
 * Igual que CanvasRenderer.tsx (mismo bucle de dibujo propio, mismo
 * principio de posiciones fuera de React), pero las posiciones vienen del
 * Worker de física dinámica vía useSimulacionWorker en vez de un ref
 * sincronizado solo por arrastre.
 */
import { useEffect, useRef } from "react";
import { useSimulacionStore } from "../store/simulacionStore";
import { useSimulacionDinamicaStore } from "../store/simulacionDinamicaStore";
import { useSimulacionWorker } from "../hooks/useSimulacionWorker";
import type { PuntoCarga } from "../fisica/coulomb";
import { dibujarCargas, RADIO_CARGA } from "./dibujarCargas";
import { dibujarVectores } from "./dibujarVectores";
import { dibujarLineasCampo } from "./dibujarLineasCampo";
import { dibujarMapaPotencial } from "./dibujarMapaPotencial";

const RADIO_ARRASTRE = RADIO_CARGA + 6;

interface Props {
  ancho?: number;
  alto?: number;
}

export function CanvasRendererDinamico({ ancho = 700, alto = 500 }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const arrastrandoIdRef = useRef<string | null>(null);

  const cargas = useSimulacionDinamicaStore((s) => s.cargas);
  const modoVista = useSimulacionStore((s) => s.modoVista);
  const { posicionesRef, moverCarga } = useSimulacionWorker(cargas, ancho, alto);

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

    let idFrame: number;
    function frame() {
      if (!ctx) return;
      const puntos = puntosCarga();

      if (modoVista === "potencial") {
        dibujarMapaPotencial(ctx, puntos, ancho, alto);
      } else {
        ctx.clearRect(0, 0, ancho, alto);
        if (modoVista === "vectores") dibujarVectores(ctx, puntos, ancho, alto);
        else if (modoVista === "lineas") dibujarLineasCampo(ctx, puntos, ancho, alto);
      }
      dibujarCargas(ctx, puntos);

      idFrame = requestAnimationFrame(frame);
    }
    idFrame = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(idFrame);
  }, [cargas, modoVista, ancho, alto, posicionesRef]);

  function coordenadasDesdeEvento(e: React.PointerEvent<HTMLCanvasElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const escalaX = ancho / rect.width;
    const escalaY = alto / rect.height;
    return { x: (e.clientX - rect.left) * escalaX, y: (e.clientY - rect.top) * escalaY };
  }

  function onPointerDown(e: React.PointerEvent<HTMLCanvasElement>) {
    const p = coordenadasDesdeEvento(e);
    for (const c of cargas) {
      const pos = posicionesRef.current[c.id];
      if (pos && Math.hypot(p.x - pos.x, p.y - pos.y) < RADIO_ARRASTRE) {
        arrastrandoIdRef.current = c.id;
        e.currentTarget.setPointerCapture(e.pointerId);
        break;
      }
    }
  }

  function onPointerMove(e: React.PointerEvent<HTMLCanvasElement>) {
    const id = arrastrandoIdRef.current;
    if (!id) return;
    const p = coordenadasDesdeEvento(e);
    moverCarga(id, Math.max(20, Math.min(ancho - 20, p.x)), Math.max(20, Math.min(alto - 20, p.y)));
  }

  function onPointerUp() {
    arrastrandoIdRef.current = null;
  }

  return (
    <canvas
      ref={canvasRef}
      width={ancho}
      height={alto}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      style={{
        width: "100%",
        maxWidth: ancho,
        height: "auto",
        aspectRatio: `${ancho} / ${alto}`,
        display: "block",
        background: "#0b1020",
        borderRadius: 8,
        touchAction: "none",
        cursor: "grab",
      }}
    />
  );
}
