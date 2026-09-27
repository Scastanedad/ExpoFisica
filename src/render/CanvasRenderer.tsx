/**
 * Dibuja la escena en un <canvas> con su propio requestAnimationFrame,
 * totalmente separado del ciclo de renderizado de React (ver
 * .claude/skills/arquitectura-simulaciones-web/references/gestion_estado.md
 * y scripts/CanvasRenderer.tsx).
 *
 * `cargas` (la lista, agregar/quitar) y `modoVista` sí son estado de React
 * vía el store de Zustand -- cambian poco. Las POSICIONES de cada carga, en
 * cambio, viven en `posicionesRef` y nunca pasan por setState: el arrastre
 * (hooks/useInteraccionEscena.ts) y el teclado (vía `controladorRef`) escriben
 * directo a ese ref, y el bucle de dibujo lee de ahí cada frame.
 *
 * Por defecto lee `cargas` y `modoVista` del store compartido de la estación
 * "Cargas en reposo". El hero de Home pasa las suyas por props para quedar
 * aislado: así no refleja las cargas que el visitante añade en la estación.
 */
import { useEffect, useRef, useState, type RefObject } from "react";
import { useSimulacionStore } from "../store/simulacionStore";
import { useSeleccionStore } from "../store/seleccionStore";
import type { PuntoCarga } from "../fisica/coulomb";
import type { CargaMeta, ModoVista, UnidadCarga } from "../types/simulacion";
import { useEscalaCss } from "../hooks/useEscalaCss";
import { useInteraccionEscena } from "../hooks/useInteraccionEscena";
import { describirEscena } from "../ui/textosEscena";
import type { ControladorEscena, Posicion } from "./controladorEscena";
import { SEPARACION_OBJETIVO_EN_RADIOS, elegirPosicionNueva, posicionesEnAnillo } from "./colocacion";
import { radioAgarre } from "./geometriaCargas";
import { ALTO_ESCENA, ANCHO_ESCENA } from "./dimensiones";
import { crearCapaCampo } from "./capaCampo";
import { dibujarEscena } from "./dibujarEscena";
import { crearDibujanteLeyenda } from "./dibujarLeyendaEscala";

interface Props {
  ancho?: number;
  alto?: number;
  /** Dibuja la barra de escala (la cuadrícula siempre se dibuja). Por defecto sí. */
  mostrarEscala?: boolean;
  /** Cargas propias (aisladas del store). Por defecto, las de la estación "Cargas en reposo". */
  cargas?: CargaMeta[];
  /** Modo de vista propio (aislado del store). */
  modoVista?: ModoVista;
  /** Ref donde publicar el controlador (leer/mover cargas) para el teclado y el panel. */
  controladorRef?: RefObject<ControladorEscena | null>;
}

export function CanvasRenderer({
  ancho = ANCHO_ESCENA,
  alto = ALTO_ESCENA,
  mostrarEscala = true,
  cargas: cargasProp,
  modoVista: modoVistaProp,
  controladorRef,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const escalaCssRef = useEscalaCss(canvasRef, ancho);
  const posicionesRef = useRef<Record<string, Posicion>>({});
  const seleccionRef = useRef<string | null>(null);
  const editandoRef = useRef<string | null>(null);
  const unidadRef = useRef<UnidadCarga>("microC");
  // Capa en caché (cuadrícula + campo) propia de este canvas; conserva su calidad medida entre cambios de cargas.
  const [capa] = useState(() => crearCapaCampo());

  const cargasStore = useSimulacionStore((s) => s.cargas);
  const modoVistaStore = useSimulacionStore((s) => s.modoVista);
  const unidadCarga = useSimulacionStore((s) => s.unidadCarga);
  const seleccionadaId = useSeleccionStore((s) => s.seleccionadaId);
  const colocarConToque = useSeleccionStore((s) => s.colocarConToque);
  const arrastrando = useSeleccionStore((s) => s.arrastrando);
  const editandoId = useSeleccionStore((s) => s.editandoId);
  const cargas = cargasProp ?? cargasStore;
  const modoVista = modoVistaProp ?? modoVistaStore;

  useEffect(() => {
    seleccionRef.current = seleccionadaId;
  }, [seleccionadaId]);
  useEffect(() => {
    editandoRef.current = editandoId;
  }, [editandoId]);
  useEffect(() => {
    unidadRef.current = unidadCarga;
  }, [unidadCarga]);

  // Sincroniza posicionesRef con altas/bajas de cargas. No pasa por setState.
  useEffect(() => {
    const idsActuales = new Set(cargas.map((c) => c.id));
    for (const id of Object.keys(posicionesRef.current)) {
      if (!idsActuales.has(id)) delete posicionesRef.current[id];
    }
    const nuevas = cargas.filter((c) => !(c.id in posicionesRef.current));
    if (nuevas.length === 0) return;
    if (Object.keys(posicionesRef.current).length === 0) {
      // Primer lote (recuadro vacío): reparto simétrico en anillo.
      const anillo = posicionesEnAnillo(cargas.length, ancho, alto);
      cargas.forEach((c, i) => {
        posicionesRef.current[c.id] = anillo[i];
      });
    } else {
      // Con cargas ya colocadas (quizá arrastradas): cada nueva va al hueco más despejado.
      const distanciaObjetivo = SEPARACION_OBJETIVO_EN_RADIOS * radioAgarre(escalaCssRef.current);
      for (const c of nuevas) {
        posicionesRef.current[c.id] = elegirPosicionNueva(
          Object.values(posicionesRef.current),
          ancho,
          alto,
          distanciaObjetivo,
        );
      }
    }
  }, [cargas, ancho, alto, escalaCssRef]);

  useInteraccionEscena({
    canvasRef,
    ancho,
    alto,
    escalaCssRef,
    ids: cargas.map((c) => c.id),
    posicion: (id) => posicionesRef.current[id],
    colocar: (id, x, y) => {
      posicionesRef.current[id] = { x, y };
    },
    controladorRef,
  });

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

    const leyenda = mostrarEscala ? crearDibujanteLeyenda() : null;

    let idFrame: number;
    function frame() {
      if (!ctx) return;
      dibujarEscena(ctx, {
        puntos: puntosCarga(),
        modoVista,
        ancho,
        alto,
        escalaCss: escalaCssRef.current,
        capa,
        leyenda,
        indiceSeleccionada: cargas.findIndex((c) => c.id === seleccionRef.current),
        indiceEditada: cargas.findIndex((c) => c.id === editandoRef.current),
        unidadCarga: unidadRef.current,
      });
      idFrame = requestAnimationFrame(frame);
    }
    idFrame = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(idFrame);
  }, [cargas, modoVista, ancho, alto, mostrarEscala, escalaCssRef, capa]);

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
        // Proporción numérica para que `.lienzo` calcule el ancho máximo desde la altura del viewport.
        ["--lienzo-ratio" as string]: ancho / alto,
        cursor: arrastrando ? "grabbing" : colocarConToque ? "crosshair" : "grab",
      }}
    />
  );
}
