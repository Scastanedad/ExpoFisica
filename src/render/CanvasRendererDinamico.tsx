/**
 * Igual que CanvasRenderer.tsx (mismo bucle de dibujo propio, mismo
 * principio de posiciones fuera de React), pero las posiciones vienen del
 * Worker de física dinámica vía useSimulacionWorker en vez de un ref
 * sincronizado solo por arrastre. El arrastre y la alternativa por teclado /
 * toque comparten hooks/useInteraccionEscena.ts; aquí "colocar" es
 * `moverCarga` del Worker (fija la velocidad en 0 SIN anclar: teclado y "tocar
 * el destino" recolocan en reposo). El arrastre con puntero, en cambio, usa
 * `agarrarCarga` (la carga queda anclada al puntero, sigue empujando a las
 * demás) y `soltarCarga` (sale con la velocidad del puntero, con tope).
 */
import { useEffect, useRef, useState, type RefObject } from "react";
import { useSimulacionStore } from "../store/simulacionStore";
import { useSimulacionDinamicaStore } from "../store/simulacionDinamicaStore";
import { useSeleccionStore } from "../store/seleccionStore";
import { useLecturasStore } from "../store/lecturasStore";
import { useSimulacionWorker } from "../hooks/useSimulacionWorker";
import type { PuntoCarga } from "../fisica/coulomb";
import { K_VISUAL } from "../fisica/coulomb";
import { factoresSim } from "../fisica/escala";
import type { VectorFuerzaSI } from "../fisica/fuerzas";
import { useEscalaCss } from "../hooks/useEscalaCss";
import { useInteraccionEscena } from "../hooks/useInteraccionEscena";
import type { UnidadCarga } from "../types/simulacion";
import { describirEscena } from "../ui/textosEscena";
import type { ControladorEscena } from "./controladorEscena";
import { ALTO_ESCENA, ANCHO_ESCENA } from "./dimensiones";
import { crearCapaCampo } from "./capaCampo";
import { dibujarEscena } from "./dibujarEscena";
import { crearDibujanteLeyenda } from "./dibujarLeyendaEscala";

/** Intervalo mínimo entre recálculos del campo en la dinámica (≈ 30 Hz, E2.3 §8). */
const INTERVALO_CAPA_MS = 33;
/** Cadencia de publicación de la lectura de fuerza de la carga elegida (E3.2 §3): ~10 Hz. */
const INTERVALO_LECTURAS_MS = 100;

/**
 * Convierte la fuerza que YA calculó el Worker (unidades de simulación,
 * convención de CANVAS: fy crece hacia abajo, igual que `calcularFuerzas` en
 * dinamica.ts) a newtons en la convención de LECTURA (y hacia arriba, igual
 * que `fuerzaNetaSI`/`campoSI`): solo unidades, ninguna física nueva (E3.2 §3).
 */
function fuerzaSimAN(fxSim: number, fySim: number): VectorFuerzaSI {
  const factor = factoresSim(K_VISUAL).fuerza;
  const fx = fxSim * factor;
  const fy = -fySim * factor;
  return { fx, fy, modulo: Math.hypot(fx, fy) };
}

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
  const { escalaCssRef, factorResolucionRef } = useEscalaCss(canvasRef, ancho, alto);
  const seleccionRef = useRef<string | null>(null);
  const editandoRef = useRef<string | null>(null);
  const unidadRef = useRef<UnidadCarga>("microC");
  const mostrarFuerzasRef = useRef(false);
  const mostrarLineasRef = useRef(true);
  // Las cargas se mueven siempre: la capa recalcula el campo a ≤ 30 Hz y reutiliza la imagen el resto de frames.
  const [capa] = useState(() => crearCapaCampo({ intervaloMinMs: INTERVALO_CAPA_MS }));

  const cargas = useSimulacionDinamicaStore((s) => s.cargas);
  const modoVista = useSimulacionStore((s) => s.modoVista);
  const unidadCarga = useSimulacionStore((s) => s.unidadCarga);
  const mostrarFuerzas = useSimulacionStore((s) => s.mostrarFuerzas);
  const mostrarLineasEnEquipotenciales = useSimulacionStore((s) => s.mostrarLineasEnEquipotenciales);
  const seleccionadaId = useSeleccionStore((s) => s.seleccionadaId);
  const colocarConToque = useSeleccionStore((s) => s.colocarConToque);
  const arrastrando = useSeleccionStore((s) => s.arrastrando);
  const editandoId = useSeleccionStore((s) => s.editandoId);
  const publicarFuerzaSeleccionada = useLecturasStore((s) => s.publicarFuerzaSeleccionada);
  const { posicionesRef, fuerzasRef, moverCarga, agarrarCarga, soltarCarga } = useSimulacionWorker(
    cargas,
    ancho,
    alto,
  );

  useEffect(() => {
    seleccionRef.current = seleccionadaId;
  }, [seleccionadaId]);
  useEffect(() => {
    editandoRef.current = editandoId;
  }, [editandoId]);
  useEffect(() => {
    unidadRef.current = unidadCarga;
  }, [unidadCarga]);
  useEffect(() => {
    mostrarFuerzasRef.current = mostrarFuerzas;
  }, [mostrarFuerzas]);
  useEffect(() => {
    mostrarLineasRef.current = mostrarLineasEnEquipotenciales;
  }, [mostrarLineasEnEquipotenciales]);

  useInteraccionEscena({
    canvasRef,
    ancho,
    alto,
    escalaCssRef,
    ids: cargas.map((c) => c.id),
    posicion: (id) => posicionesRef.current[id],
    colocar: moverCarga,
    alAgarrar: agarrarCarga,
    alSoltar: (id, v) => soltarCarga(id, v.vx, v.vy),
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

    /**
     * Fuerza de cada carga, alineada con `cargas` (E3.2 §3): pura LECTURA del
     * mensaje "fuerzas" del Worker (ya convertida a N), `null` mientras no ha
     * llegado ninguna (recién montado). No se calcula nada nuevo aquí.
     */
    function fuerzasCarga(): (VectorFuerzaSI | null)[] {
      return cargas.map((c) => {
        const f = fuerzasRef.current[c.id];
        return f ? fuerzaSimAN(f.fx, f.fy) : null;
      });
    }

    const leyenda = crearDibujanteLeyenda();
    let ultimaPublicacionMs = -Infinity;

    let idFrame: number;
    function frame() {
      if (!ctx) return;
      const puntos = puntosCarga();
      const mostrarF = mostrarFuerzasRef.current;
      const fuerzas = fuerzasCarga();

      const ahora = performance.now();
      if (ahora - ultimaPublicacionMs >= INTERVALO_LECTURAS_MS) {
        ultimaPublicacionMs = ahora;
        const idxSel = cargas.findIndex((c) => c.id === seleccionRef.current);
        publicarFuerzaSeleccionada(idxSel >= 0 ? fuerzas[idxSel] : null);
      }

      dibujarEscena(ctx, {
        puntos,
        modoVista,
        ancho,
        alto,
        escalaCss: escalaCssRef.current,
        resolucion: factorResolucionRef.current,
        mostrarLineasEnEquipotenciales: mostrarLineasRef.current,
        capa,
        leyenda,
        indiceSeleccionada: cargas.findIndex((c) => c.id === seleccionRef.current),
        indiceEditada: cargas.findIndex((c) => c.id === editandoRef.current),
        unidadCarga: unidadRef.current,
        fuerzas,
        mostrarFuerzas: mostrarF,
      });
      idFrame = requestAnimationFrame(frame);
    }
    idFrame = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(idFrame);
  }, [
    cargas,
    modoVista,
    ancho,
    alto,
    posicionesRef,
    fuerzasRef,
    escalaCssRef,
    factorResolucionRef,
    capa,
    publicarFuerzaSeleccionada,
  ]);

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
        cursor: arrastrando ? "grabbing" : colocarConToque ? "crosshair" : "grab",
      }}
    />
  );
}
