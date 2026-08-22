/**
 * Gestiona el Worker del motor físico dinámico: lo crea una sola vez, le
 * manda altas/bajas de cargas de forma incremental (sin recrearlo), y
 * expone `posicionesRef` -- actualizado directamente por el listener del
 * Worker, nunca por setState -- para que el componente de renderizado lo
 * lea en su propio requestAnimationFrame (ver
 * .claude/skills/arquitectura-simulaciones-web/references/gestion_estado.md).
 */
import { useEffect, useRef } from "react";
import type { CargaConfig } from "../store/simulacionDinamicaStore";
import { useSimulacionDinamicaStore } from "../store/simulacionDinamicaStore";

interface Posicion {
  x: number;
  y: number;
}

export function useSimulacionWorker(cargas: CargaConfig[], ancho: number, alto: number) {
  const workerRef = useRef<Worker | null>(null);
  const posicionesRef = useRef<Record<string, Posicion>>({});
  const ordenIdsRef = useRef<string[]>([]);
  const cargasAnterioresRef = useRef<Map<string, CargaConfig>>(new Map());

  const enPausa = useSimulacionDinamicaStore((s) => s.enPausa);
  const velocidadSimulacion = useSimulacionDinamicaStore((s) => s.velocidadSimulacion);
  const actualizarEnergiaTotal = useSimulacionDinamicaStore((s) => s.actualizarEnergiaTotal);

  // Crear el Worker una sola vez.
  useEffect(() => {
    const worker = new Worker(new URL("../worker/motorFisico.worker.ts", import.meta.url), {
      type: "module",
    });
    workerRef.current = worker;

    worker.onmessage = (evento: MessageEvent) => {
      const datos = evento.data;
      if (datos.tipo === "orden") {
        ordenIdsRef.current = datos.ids;
      } else if (datos.tipo === "frame") {
        const ids: string[] = ordenIdsRef.current;
        const pos: Float32Array = datos.posiciones;
        const nuevo: Record<string, Posicion> = {};
        for (let i = 0; i < ids.length; i++) {
          nuevo[ids[i]] = { x: pos[i * 2], y: pos[i * 2 + 1] };
        }
        posicionesRef.current = nuevo;
      } else if (datos.tipo === "energia") {
        actualizarEnergiaTotal(datos.valor);
      }
    };

    worker.postMessage({ tipo: "init", ancho, alto, cargas });
    cargasAnterioresRef.current = new Map(cargas.map((c) => [c.id, c]));

    return () => worker.terminate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // el Worker se crea una sola vez, igual que en la plantilla de la skill

  // Diff incremental de altas/bajas de cargas -- no recrea el Worker.
  useEffect(() => {
    const worker = workerRef.current;
    if (!worker) return;
    const anteriores = cargasAnterioresRef.current;
    const actuales = new Map(cargas.map((c) => [c.id, c]));

    for (const [id] of anteriores) {
      if (!actuales.has(id)) worker.postMessage({ tipo: "quitarCarga", id });
    }
    for (const [id, c] of actuales) {
      if (!anteriores.has(id)) worker.postMessage({ tipo: "agregarCarga", id, q: c.q, masa: c.masa });
    }
    cargasAnterioresRef.current = actuales;
  }, [cargas]);

  useEffect(() => {
    workerRef.current?.postMessage({ tipo: "pausa", valor: enPausa });
  }, [enPausa]);

  useEffect(() => {
    workerRef.current?.postMessage({ tipo: "velocidad", valor: velocidadSimulacion });
  }, [velocidadSimulacion]);

  function moverCarga(id: string, x: number, y: number) {
    workerRef.current?.postMessage({ tipo: "moverCarga", id, x, y });
    // Feedback visual inmediato mientras el worker confirma en el próximo frame.
    posicionesRef.current[id] = { x, y };
  }

  return { posicionesRef, moverCarga };
}
