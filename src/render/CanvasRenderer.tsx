/**
 * Dibuja la escena en un <canvas> con su propio requestAnimationFrame,
 * totalmente separado del ciclo de renderizado de React (ver
 * .claude/skills/arquitectura-simulaciones-web/references/gestion_estado.md
 * y scripts/CanvasRenderer.tsx).
 *
 * `cargas` (la lista, agregar/quitar) y `modoVista` sí son estado de React
 * vía el store de Zustand -- cambian poco. Las POSICIONES de cada carga, en
 * cambio, viven en `posicionesRef` y nunca pasan por setState: tanto el
 * arrastre con mouse/touch como (en fases futuras) el Worker de física
 * dinámica escriben directo a ese ref, y el bucle de dibujo lee de ahí cada
 * frame.
 */
import { useEffect, useRef } from "react";
import { useSimulacionStore } from "../store/simulacionStore";
import type { PuntoCarga } from "../fisica/coulomb";
import { dibujarCargas, RADIO_CARGA } from "./dibujarCargas";
import { dibujarVectores } from "./dibujarVectores";
import { dibujarLineasCampo } from "./dibujarLineasCampo";
import { dibujarMapaPotencial } from "./dibujarMapaPotencial";

interface Posicion {
  x: number;
  y: number;
}

const RADIO_ARRASTRE = RADIO_CARGA + 6;

function posicionesIniciales(n: number, ancho: number, alto: number): Posicion[] {
  const cx = ancho / 2;
  const cy = alto / 2;
  const radio = Math.min(ancho, alto) * 0.25;
  return Array.from({ length: n }, (_, i) => {
    const angulo = (i / Math.max(n, 1)) * Math.PI * 2 - Math.PI / 2;
    return { x: cx + Math.cos(angulo) * radio, y: cy + Math.sin(angulo) * radio };
  });
}

interface Props {
  ancho?: number;
  alto?: number;
}

export function CanvasRenderer({ ancho = 700, alto = 500 }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const posicionesRef = useRef<Record<string, Posicion>>({});
  const arrastrandoIdRef = useRef<string | null>(null);

  const cargas = useSimulacionStore((s) => s.cargas);
  const modoVista = useSimulacionStore((s) => s.modoVista);

  // Sincroniza posicionesRef con altas/bajas de cargas. No pasa por setState.
  useEffect(() => {
    const idsActuales = new Set(cargas.map((c) => c.id));
    for (const id of Object.keys(posicionesRef.current)) {
      if (!idsActuales.has(id)) delete posicionesRef.current[id];
    }
    const faltan = cargas.some((c) => !(c.id in posicionesRef.current));
    if (faltan) {
      const iniciales = posicionesIniciales(cargas.length, ancho, alto);
      cargas.forEach((c, i) => {
        if (!(c.id in posicionesRef.current)) posicionesRef.current[c.id] = iniciales[i];
      });
    }
  }, [cargas, ancho, alto]);

  // Bucle de dibujo propio.
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
  }, [cargas, modoVista, ancho, alto]);

  function coordenadasDesdeEvento(e: React.PointerEvent<HTMLCanvasElement>): Posicion {
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
    posicionesRef.current[id] = {
      x: Math.max(20, Math.min(ancho - 20, p.x)),
      y: Math.max(20, Math.min(alto - 20, p.y)),
    };
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
