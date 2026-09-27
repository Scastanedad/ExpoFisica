/**
 * Gestiona el Worker del motor físico dinámico: lo crea una sola vez, le
 * manda altas/bajas y cambios de magnitud de cargas de forma incremental (sin
 * recrearlo), y expone `posicionesRef` -- actualizado directamente por el
 * listener del Worker, nunca por setState -- para que el componente de
 * renderizado lo lea en su propio requestAnimationFrame (ver
 * .claude/skills/arquitectura-simulaciones-web/references/gestion_estado.md).
 */
import { useEffect, useRef } from "react";
import type { CargaConfig } from "../store/simulacionDinamicaStore";
import { useSimulacionDinamicaStore } from "../store/simulacionDinamicaStore";
import type { MensajeAlWorker, MensajeDelWorker } from "../worker/protocolo";

interface Posicion {
  x: number;
  y: number;
}

interface FuerzaSim {
  fx: number;
  fy: number;
}

export function useSimulacionWorker(cargas: CargaConfig[], ancho: number, alto: number) {
  const workerRef = useRef<Worker | null>(null);
  const posicionesRef = useRef<Record<string, Posicion>>({});
  /**
   * Fuerza neta sobre cada carga (E3.2 §3), en unidades de SIMULACIÓN, tal
   * como la publica el Worker cada ~100 ms (mensaje "fuerzas"): una LECTURA
   * de `SistemaDinamico.fx/fy`, no un cálculo nuevo. `render/CanvasRendererDinamico.tsx`
   * la convierte a N con `factoresSim(K_VISUAL).fuerza` al dibujar/leer.
   */
  const fuerzasRef = useRef<Record<string, FuerzaSim>>({});
  const ordenIdsRef = useRef<string[]>([]);
  const cargasAnterioresRef = useRef<Map<string, CargaConfig>>(new Map());

  const enPausa = useSimulacionDinamicaStore((s) => s.enPausa);
  const velocidadSimulacion = useSimulacionDinamicaStore((s) => s.velocidadSimulacion);
  const actualizarEnergia = useSimulacionDinamicaStore((s) => s.actualizarEnergia);

  function enviar(mensaje: MensajeAlWorker) {
    workerRef.current?.postMessage(mensaje);
  }

  // Crear el Worker una sola vez.
  useEffect(() => {
    const worker = new Worker(new URL("../worker/motorFisico.worker.ts", import.meta.url), {
      type: "module",
    });
    workerRef.current = worker;

    worker.onmessage = (evento: MessageEvent<MensajeDelWorker>) => {
      const datos = evento.data;
      if (datos.tipo === "orden") {
        ordenIdsRef.current = datos.ids;
      } else if (datos.tipo === "frame") {
        const ids = ordenIdsRef.current;
        const pos = datos.posiciones;
        const nuevo: Record<string, Posicion> = {};
        for (let i = 0; i < ids.length; i++) {
          nuevo[ids[i]] = { x: pos[i * 2], y: pos[i * 2 + 1] };
        }
        posicionesRef.current = nuevo;
      } else if (datos.tipo === "fuerzas") {
        const ids = ordenIdsRef.current;
        const f = datos.fuerzasSim;
        const nuevo: Record<string, FuerzaSim> = {};
        for (let i = 0; i < ids.length; i++) {
          nuevo[ids[i]] = { fx: f[i * 2], fy: f[i * 2 + 1] };
        }
        fuerzasRef.current = nuevo;
      } else {
        // Un solo objeto por mensaje (~4 Hz): un solo re-render del panel de energía.
        actualizarEnergia(datos);
      }
    };

    worker.postMessage({ tipo: "init", ancho, alto, cargas } satisfies MensajeAlWorker);
    cargasAnterioresRef.current = new Map(cargas.map((c) => [c.id, c]));

    return () => worker.terminate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // el Worker se crea una sola vez, igual que en la plantilla de la skill

  // Diff incremental de altas/bajas y cambios de magnitud -- no recrea el Worker.
  useEffect(() => {
    const worker = workerRef.current;
    if (!worker) return;
    const anteriores = cargasAnterioresRef.current;
    const actuales = new Map(cargas.map((c) => [c.id, c]));

    for (const [id] of anteriores) {
      if (!actuales.has(id)) enviar({ tipo: "quitarCarga", id });
    }
    for (const [id, c] of actuales) {
      const previa = anteriores.get(id);
      if (!previa) enviar({ tipo: "agregarCarga", id, q: c.q, masa: c.masa });
      else if (previa.q !== c.q) enviar({ tipo: "cambiarCarga", id, q: c.q });
    }
    cargasAnterioresRef.current = actuales;
  }, [cargas]);

  useEffect(() => {
    enviar({ tipo: "pausa", valor: enPausa });
  }, [enPausa]);

  useEffect(() => {
    enviar({ tipo: "velocidad", valor: velocidadSimulacion });
  }, [velocidadSimulacion]);

  /** Coloca la carga con v = 0 SIN anclarla (teclado, "tocar el destino", muestras del arrastre). */
  function moverCarga(id: string, x: number, y: number) {
    enviar({ tipo: "moverCarga", id, x, y });
    // Feedback visual inmediato mientras el worker confirma en el próximo frame.
    posicionesRef.current[id] = { x, y };
  }

  /** El puntero sujeta la carga: queda anclada (v = 0) y sigue empujando a las demás. */
  function agarrarCarga(id: string) {
    enviar({ tipo: "agarrarCarga", id });
  }

  /** Suelta la carga con la velocidad del puntero (px lógicos/s de pantalla; el Worker aplica tope y ÷σ). */
  function soltarCarga(id: string, vx: number, vy: number) {
    enviar({ tipo: "soltarCarga", id, vx, vy });
  }

  return { posicionesRef, fuerzasRef, moverCarga, agarrarCarga, soltarCarga };
}
