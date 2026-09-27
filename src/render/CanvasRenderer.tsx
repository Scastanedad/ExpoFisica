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
import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import { useSimulacionStore } from "../store/simulacionStore";
import { useSeleccionStore } from "../store/seleccionStore";
import { useCargaPruebaStore } from "../store/cargaPruebaStore";
import { useLecturasStore } from "../store/lecturasStore";
import type { PuntoCarga } from "../fisica/coulomb";
import { lecturaQ0, medirDeltaV, potencialQ0SI, trabajoCampoTraza, type LecturaQ0 } from "../fisica/cargaPrueba";
import { fuerzaNetaSI, fuerzasNetasSI, type VectorFuerzaSI } from "../fisica/fuerzas";
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

/** Cadencia de publicación de lecturas (q₀ y fuerza de la carga elegida) al store: ~10 Hz (E3.1/E3.2). */
const INTERVALO_LECTURAS_MS = 100;

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
  /**
   * Habilita la carga de prueba q₀ (E3.1): solo la estación "Cargas en
   * reposo" la pasa como `true`. Por defecto `false` (p. ej. el hero de Home,
   * que no tiene panel para controlarla ni persiste nada entre visitas).
   */
  conSondaQ0?: boolean;
}

export function CanvasRenderer({
  ancho = ANCHO_ESCENA,
  alto = ALTO_ESCENA,
  mostrarEscala = true,
  cargas: cargasProp,
  modoVista: modoVistaProp,
  controladorRef,
  conSondaQ0 = false,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { escalaCssRef, factorResolucionRef } = useEscalaCss(canvasRef, ancho, alto);
  const posicionesRef = useRef<Record<string, Posicion>>({});
  const seleccionRef = useRef<string | null>(null);
  const editandoRef = useRef<string | null>(null);
  const unidadRef = useRef<UnidadCarga>("microC");
  // Capa en caché (cuadrícula + campo) propia de este canvas; conserva su calidad medida entre cambios de cargas.
  const [capa] = useState(() => crearCapaCampo());

  // Carga de prueba q₀ (E3.1): posición puramente cinemática, fuera de React (nunca se integra).
  const sondaRef = useRef<Posicion>({ x: ancho * 0.82, y: alto * 0.16 });
  /** Traza en curso mientras se registra un camino (E3.1 §6, modo 2); vacía = sin traza que dibujar. */
  const trazaRef = useRef<Posicion[]>([]);
  const activoRef = useRef(false);
  const signoQ0Ref = useRef<1 | -1>(1);
  const mostrarFuerzasRef = useRef(false);
  const mostrarLineasRef = useRef(true);

  const cargasStore = useSimulacionStore((s) => s.cargas);
  const modoVistaStore = useSimulacionStore((s) => s.modoVista);
  const unidadCarga = useSimulacionStore((s) => s.unidadCarga);
  const mostrarFuerzas = useSimulacionStore((s) => s.mostrarFuerzas);
  const mostrarLineasEnEquipotenciales = useSimulacionStore((s) => s.mostrarLineasEnEquipotenciales);
  const seleccionadaId = useSeleccionStore((s) => s.seleccionadaId);
  const colocarConToque = useSeleccionStore((s) => s.colocarConToque);
  const arrastrando = useSeleccionStore((s) => s.arrastrando);
  const editandoId = useSeleccionStore((s) => s.editandoId);
  const activoQ0Store = useCargaPruebaStore((s) => s.activo);
  const signoQ0 = useCargaPruebaStore((s) => s.signoQ0);
  const publicarLectura = useCargaPruebaStore((s) => s.publicarLectura);
  const publicarFuerzaSeleccionada = useLecturasStore((s) => s.publicarFuerzaSeleccionada);
  const cargas = cargasProp ?? cargasStore;
  const modoVista = modoVistaProp ?? modoVistaStore;
  const activoQ0 = conSondaQ0 && activoQ0Store;

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
    activoRef.current = activoQ0;
  }, [activoQ0]);
  useEffect(() => {
    signoQ0Ref.current = signoQ0;
  }, [signoQ0]);
  useEffect(() => {
    mostrarFuerzasRef.current = mostrarFuerzas;
  }, [mostrarFuerzas]);
  useEffect(() => {
    mostrarLineasRef.current = mostrarLineasEnEquipotenciales;
  }, [mostrarLineasEnEquipotenciales]);

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

  /** Cargas fuente actuales (nunca incluye q₀): la lee tanto el dibujo como la interacción de la sonda. */
  const puntosCarga = useCallback((): PuntoCarga[] => {
    return cargas.map((c) => {
      const p = posicionesRef.current[c.id] ?? { x: ancho / 2, y: alto / 2 };
      return { x: p.x, y: p.y, q: c.q };
    });
  }, [cargas, ancho, alto]);

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
    sonda: activoQ0
      ? {
          posicion: () => sondaRef.current,
          colocar: (x, y) => {
            sondaRef.current = { x, y };
          },
          alMuestrear: (p) => {
            if (useCargaPruebaStore.getState().registrarTrayecto) trazaRef.current.push({ x: p.x, y: p.y });
          },
          alSoltar: () => {
            const estado = useCargaPruebaStore.getState();
            const traza = trazaRef.current;
            if (estado.registrarTrayecto && traza.length >= 2) {
              const fuente = puntosCarga();
              const wTraza = trabajoCampoTraza(traza, estado.signoQ0, fuente);
              let wTeorico: number | null;
              let teoricoFijo: boolean;
              if (estado.vA !== null && estado.vB !== null) {
                // A/B ya marcados: TODOS los caminos comparan contra el mismo objetivo fijo
                // (prueba real de independencia del camino, no autoconsistencia de la traza).
                wTeorico = medirDeltaV(estado.vA, estado.vB, estado.signoQ0)?.wCampo ?? null;
                teoricoFijo = true;
              } else {
                // Sin A/B marcados: fallback con los potenciales en los extremos de ESTA
                // traza (E3.1, decisión T3.1 nota 2). Solo verifica coherencia interna de
                // la medición, no independencia del camino entre distintos intentos.
                const vIni = potencialQ0SI(traza[0].x, traza[0].y, fuente);
                const vFin = potencialQ0SI(traza[traza.length - 1].x, traza[traza.length - 1].y, fuente);
                wTeorico = medirDeltaV(vIni, vFin, estado.signoQ0)?.wCampo ?? null;
                teoricoFijo = false;
              }
              estado.agregarCamino({ wTraza, wTeorico, teoricoFijo });
            }
            trazaRef.current = [];
          },
        }
      : undefined,
  });

  // Bucle de dibujo propio.
  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;

    const leyenda = mostrarEscala ? crearDibujanteLeyenda() : null;
    let ultimaPublicacionMs = -Infinity;

    let idFrame: number;
    function frame() {
      if (!ctx) return;
      const puntos = puntosCarga();
      const mostrarF = mostrarFuerzasRef.current;
      const fuerzas: (VectorFuerzaSI | null)[] | null = mostrarF ? fuerzasNetasSI(puntos) : null;
      const activo = activoRef.current;
      const lectura: LecturaQ0 | null = activo
        ? lecturaQ0(sondaRef.current.x, sondaRef.current.y, signoQ0Ref.current, puntos)
        : null;

      // Publicaciones a los stores (E3.1/E3.2): ~10 Hz, nunca por cada frame de rAF.
      const ahora = performance.now();
      if (ahora - ultimaPublicacionMs >= INTERVALO_LECTURAS_MS) {
        ultimaPublicacionMs = ahora;
        if (activo) publicarLectura(lectura);
        const idxSel = cargas.findIndex((c) => c.id === seleccionRef.current);
        publicarFuerzaSeleccionada(idxSel >= 0 ? fuerzaNetaSI(idxSel, puntos) : null);
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
        sonda: activo
          ? { x: sondaRef.current.x, y: sondaRef.current.y, signo: signoQ0Ref.current, traza: trazaRef.current }
          : null,
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
    mostrarEscala,
    escalaCssRef,
    factorResolucionRef,
    capa,
    puntosCarga,
    publicarLectura,
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
        // Proporción numérica para que `.lienzo` calcule el ancho máximo desde la altura del viewport.
        ["--lienzo-ratio" as string]: ancho / alto,
        cursor: arrastrando ? "grabbing" : colocarConToque ? "crosshair" : "grab",
      }}
    />
  );
}
