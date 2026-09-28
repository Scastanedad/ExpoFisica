/**
 * Canvas de la Estación 04 (Conductores y aislantes): dos lienzos (conductor y
 * aislante) con un ÚNICO `requestAnimationFrame` propio, totalmente separado
 * del ciclo de renderizado de React, igual que `CanvasDipolo.tsx`.
 *
 * Sin Web Worker (decisión de arquitectura, spec E5.2 §4.4): 140 electrones por
 * material es O(N²) = ~40 000 pares por paso, una fracción de milisegundo. Las
 * posiciones viven en `parchesRef` (arrays tipados de `fisica/materiales.ts`),
 * nunca en `useState`/Zustand; solo la LECTURA (campo dentro, razón,
 * desplazamiento) se publica al store a ~10 Hz.
 *
 * Con `prefers-reduced-motion` no hay animación continua: cada vez que cambia
 * el campo externo (o al reiniciar) los materiales se asientan de golpe en su
 * nuevo estado de equilibrio (unos milisegundos de cálculo, oculto). Mientras
 * el visitante arrastra el deslizador de voltaje se espera a que lo suelte.
 */
import { useEffect, useRef, type ReactNode, type RefObject } from "react";
import { K_VISUAL } from "../fisica/coulomb";
import { factoresSim } from "../fisica/escala";
import {
  DT_SUB,
  SUBPASOS_MAX,
  avanzarParche,
  campoExternoMateriales,
  campoInterior,
  crearParcheEnReposo,
  desplazamientoMedio,
  type ParcheMaterial,
} from "../fisica/materiales";
import { useEscalaCss } from "../hooks/useEscalaCss";
import { useMaterialesStore, type LecturaMaterial, type LecturaMateriales } from "../store/materialesStore";
import { ALTO_LIENZO_MATERIAL, ANCHO_LIENZO_MATERIAL, dibujarMaterial } from "./dibujarMateriales";

/** Cadencia de publicación de la lectura al store: ~10 Hz. */
const INTERVALO_LECTURA_MS = 100;
/** Recorte del tiempo real por frame (pestañas dormidas). */
const MAX_DT_FRAME_S = 0.05;
/** Tiempo de simulación que se asienta de golpe con `prefers-reduced-motion`. */
const ASENTAMIENTO_S = 4;

export interface ControladorMateriales {
  /** Devuelve ambos materiales a su estado de reposo (sin campo) pre-equilibrado. */
  reiniciar(): void;
}

interface Props {
  controladorRef?: RefObject<ControladorMateriales | null>;
  cabeceraConductor?: ReactNode;
  pieConductor?: ReactNode;
  cabeceraAislante?: ReactNode;
  pieAislante?: ReactNode;
}

interface Parches {
  conductor: ParcheMaterial;
  aislante: ParcheMaterial;
}

const CAMPO_A_SI = factoresSim(K_VISUAL).campo;

function leerMaterial(p: ParcheMaterial, e0: readonly [number, number]): LecturaMaterial {
  const [ex, ey] = campoInterior(p, e0);
  const mag = Math.hypot(ex, ey);
  const mag0 = Math.hypot(e0[0], e0[1]);
  return {
    eInteriorSI: mag * CAMPO_A_SI,
    razon: mag0 > 0 ? mag / mag0 : 0,
    desplazamientoPx: desplazamientoMedio(p, e0),
  };
}

function asentar(p: ParcheMaterial, e0: readonly [number, number]): void {
  const bloque = SUBPASOS_MAX * DT_SUB;
  const n = Math.ceil(ASENTAMIENTO_S / bloque);
  for (let i = 0; i < n; i++) avanzarParche(p, e0, bloque);
}

function textoOrientacion(o: "vertical" | "horizontal"): string {
  return o === "vertical" ? "placas arriba y abajo" : "placas a izquierda y derecha";
}

export function CanvasMateriales({ controladorRef, cabeceraConductor, pieConductor, cabeceraAislante, pieAislante }: Props) {
  const canvasConductorRef = useRef<HTMLCanvasElement>(null);
  const canvasAislanteRef = useRef<HTMLCanvasElement>(null);
  const escalaConductor = useEscalaCss(canvasConductorRef, ANCHO_LIENZO_MATERIAL, ALTO_LIENZO_MATERIAL);
  const escalaAislante = useEscalaCss(canvasAislanteRef, ANCHO_LIENZO_MATERIAL, ALTO_LIENZO_MATERIAL);
  const parchesRef = useRef<Parches | null>(null);
  /** |E_int|/E0 más reciente de cada material (~10 Hz): lo usa el dibujo de las líneas interiores. */
  const razonesRef = useRef({ conductor: 1, aislante: 1 });
  /** Clave (orientación|polaridad|voltaje) del último asentamiento instantáneo (solo movimiento reducido). */
  const claveAsentadaRef = useRef("");
  const ultimaPublicacionRef = useRef(-Infinity);

  const orientacionPlacas = useMaterialesStore((s) => s.orientacionPlacas);
  const publicarLectura = useMaterialesStore((s) => s.publicarLectura);

  // Controlador para el botón "Reiniciar" del panel.
  useEffect(() => {
    if (!controladorRef) return;
    controladorRef.current = {
      reiniciar: () => {
        parchesRef.current = {
          conductor: crearParcheEnReposo("conductor"),
          aislante: crearParcheEnReposo("aislante"),
        };
        razonesRef.current = { conductor: 1, aislante: 1 };
        // Fuerza el reasentamiento (movimiento reducido) y la publicación inmediata.
        claveAsentadaRef.current = "";
        ultimaPublicacionRef.current = -Infinity;
      },
    };
    return () => {
      controladorRef.current = null;
    };
  }, [controladorRef]);

  // Bucle de física + dibujo propio.
  useEffect(() => {
    const canvasC = canvasConductorRef.current;
    const canvasA = canvasAislanteRef.current;
    const ctxC = canvasC?.getContext("2d");
    const ctxA = canvasA?.getContext("2d");
    if (!canvasC || !canvasA || !ctxC || !ctxA) return;

    if (!parchesRef.current) {
      // Pre-equilibrado sin campo, una sola vez, antes de que el visitante pueda usar E0 (oculto).
      parchesRef.current = { conductor: crearParcheEnReposo("conductor"), aislante: crearParcheEnReposo("aislante") };
    }

    const consultaMovimiento = window.matchMedia("(prefers-reduced-motion: reduce)");
    let menosMovimiento = consultaMovimiento.matches;
    const alCambiarMovimiento = () => {
      menosMovimiento = consultaMovimiento.matches;
      claveAsentadaRef.current = "";
    };
    consultaMovimiento.addEventListener("change", alCambiarMovimiento);

    let ultimoTiempo = performance.now();
    let idFrame = 0;
    // Mismo array mientras la configuración no cambie (evita recalcular fuerzas por identidad distinta).
    let claveE0 = "";
    let e0: [number, number] = [0, 0];

    function frame() {
      const parches = parchesRef.current;
      if (!parches || !ctxC || !ctxA) return;
      const ahora = performance.now();
      const dt = Math.min(Math.max((ahora - ultimoTiempo) / 1000, 0), MAX_DT_FRAME_S);
      ultimoTiempo = ahora;

      const { orientacionPlacas: ori, polaridadPlacas: pol, voltajeKV, enPausa, ajustandoVoltaje } =
        useMaterialesStore.getState();
      // Con movimiento reducido, mientras el visitante arrastra el deslizador el campo aplicado no
      // cambia: el material se asienta una sola vez, al soltar (no 4 s de simulación por cada paso).
      const clave = menosMovimiento && ajustandoVoltaje ? claveE0 : `${ori}|${pol}|${voltajeKV}`;
      if (clave !== claveE0) {
        claveE0 = clave;
        e0 = campoExternoMateriales(ori, pol, voltajeKV);
      }

      if (!enPausa) {
        if (menosMovimiento) {
          if (claveAsentadaRef.current !== clave) {
            claveAsentadaRef.current = clave;
            asentar(parches.conductor, e0);
            asentar(parches.aislante, e0);
            ultimaPublicacionRef.current = -Infinity;
          }
        } else {
          avanzarParche(parches.conductor, e0, dt);
          avanzarParche(parches.aislante, e0, dt);
        }
      }

      if (ahora - ultimaPublicacionRef.current >= INTERVALO_LECTURA_MS) {
        ultimaPublicacionRef.current = ahora;
        const conductor = leerMaterial(parches.conductor, e0);
        const aislante = leerMaterial(parches.aislante, e0);
        razonesRef.current = { conductor: conductor.razon, aislante: aislante.razon };
        const lectura: LecturaMateriales = {
          e0SI: Math.hypot(e0[0], e0[1]) * CAMPO_A_SI,
          conductor,
          aislante,
        };
        publicarLectura(lectura);
      }

      dibujarMaterial(
        ctxC,
        { parche: parches.conductor, e0, orientacion: ori, polaridad: pol, razon: razonesRef.current.conductor },
        escalaConductor.escalaCssRef.current,
      );
      dibujarMaterial(
        ctxA,
        { parche: parches.aislante, e0, orientacion: ori, polaridad: pol, razon: razonesRef.current.aislante },
        escalaAislante.escalaCssRef.current,
      );
      idFrame = requestAnimationFrame(frame);
    }

    idFrame = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(idFrame);
      consultaMovimiento.removeEventListener("change", alCambiarMovimiento);
    };
  }, [escalaConductor.escalaCssRef, escalaAislante.escalaCssRef, publicarLectura]);

  const estilo = {
    aspectRatio: `${ANCHO_LIENZO_MATERIAL} / ${ALTO_LIENZO_MATERIAL}`,
    ["--lienzo-ratio" as string]: ANCHO_LIENZO_MATERIAL / ALTO_LIENZO_MATERIAL,
  };

  return (
    <div className="materiales-comparacion">
      <figure className="materiales-figura">
        {cabeceraConductor}
        <canvas
          ref={canvasConductorRef}
          className="lienzo materiales-lienzo"
          width={ANCHO_LIENZO_MATERIAL}
          height={ALTO_LIENZO_MATERIAL}
          role="img"
          aria-label={`Recorte microscópico ampliado de un conductor: una red de 14 por 10 átomos con sus electrones libres, entre ${textoOrientacion(orientacionPlacas)} con un campo eléctrico externo. Los electrones libres se corren hacia la placa positiva y el campo dentro del material casi desaparece.`}
          style={estilo}
        />
        {pieConductor}
      </figure>
      <figure className="materiales-figura">
        {cabeceraAislante}
        <canvas
          ref={canvasAislanteRef}
          className="lienzo materiales-lienzo"
          width={ANCHO_LIENZO_MATERIAL}
          height={ALTO_LIENZO_MATERIAL}
          role="img"
          aria-label={`Recorte microscópico ampliado de un aislante: una red de 14 por 10 átomos, cada uno con su electrón atado por un resorte, entre ${textoOrientacion(orientacionPlacas)} con el mismo campo eléctrico externo. Cada electrón se corre solo un poco hacia la placa positiva y el campo dentro del material se reduce poco.`}
          style={estilo}
        />
        {pieAislante}
      </figure>
    </div>
  );
}
