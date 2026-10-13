/**
 * Canvas de la estación 08 (capacitor de placas) con su PROPIO `requestAnimationFrame`, fuera del ciclo de
 * React (igual que `CanvasMateriales.tsx` y `CanvasCircuito.tsx`).
 *
 * Los parámetros llegan por props y se leen en un ref (el bucle no se reinicia). Lo único que anima este
 * componente es la alineación de los dipolos (un escalar en un ref). Arrastres: la lámina (fracción f),
 * cualquiera de las placas (d) y el interruptor (modo). Todo cambio pasa por `onCambiar`, que en la página
 * llama a `ajustar` (límite por rigidez): la placa se detiene en d_mín y el dibujo sale siempre de los
 * parámetros ya ajustados. Teclado: ↑/↓ cambia d, ←/→ mete o saca la lámina, Espacio conecta o desconecta.
 */
import { useCallback, useEffect, useId, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { D_MAX, D_MIN, calcularEstado, dielectricoPorId, type Modo, type Parametros } from "../fisica/capacitorPlacas";
import { formatearSI } from "../fisica/circuitos/formato";
import { useEscalaCss } from "../hooks/useEscalaCss";
import { dibujarCapacitor } from "./capacitorPlacas/dibujarCapacitor";
import {
  ALTO_PLACAS,
  ANCHO_PLACAS,
  GROSOR_PLACA,
  YC,
  calcularGeometria,
  dDesdeHuecoPx,
  fDesdeBordeLamina,
  zonaEn,
  type Zona,
} from "./capacitorPlacas/geometria";

/** Radio de captura extra alrededor de las placas [px CSS]: con la placa (≈ 7 px) da un objetivo táctil ≥ 44 px. */
const MARGEN_CSS = 20;
const PASO_F = 0.05;
const FACTOR_D = 1.12;
/** Tiempo de asentamiento de los dipolos [s]. */
const TAU_POLARIZACION = 0.18;

export interface PropsCanvasCapacitorPlacas {
  p: Parametros;
  onCambiar: (cambio: Partial<Parametros>) => void;
  onModo: (modo: Modo) => void;
}

interface Arrastre {
  zona: "placa-sup" | "placa-inf" | "lamina";
  /** Distancia entre el puntero y el borde izquierdo de la lámina al agarrarla [px lógicos]. */
  agarre: number;
}

const COMANDO_CURSOR: Record<Zona, string> = {
  "placa-sup": "ns-resize",
  "placa-inf": "ns-resize",
  lamina: "grab",
  interruptor: "pointer",
};

export function CanvasCapacitorPlacas({ p, onCambiar, onModo }: PropsCanvasCapacitorPlacas) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const escala = useEscalaCss(canvasRef, ANCHO_PLACAS, ALTO_PLACAS);
  const idAyuda = useId();
  const [cursor, setCursor] = useState("default");

  const propsRef = useRef({ p, onCambiar, onModo });
  useEffect(() => {
    propsRef.current = { p, onCambiar, onModo };
  }, [p, onCambiar, onModo]);

  const hoverRef = useRef<Zona | null>(null);
  const arrastreRef = useRef<Arrastre | null>(null);
  const polarizacionRef = useRef(0);

  // Bucle de dibujo propio.
  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const consulta = window.matchMedia("(prefers-reduced-motion: reduce)");
    let menosMovimiento = consulta.matches;
    const alCambiar = () => {
      menosMovimiento = consulta.matches;
    };
    consulta.addEventListener("change", alCambiar);

    let ultimo = performance.now();
    let id = 0;
    const frame = () => {
      const ahora = performance.now();
      const dt = Math.min(Math.max((ahora - ultimo) / 1000, 0), 0.05);
      ultimo = ahora;
      const { p: pp } = propsRef.current;
      const estado = calcularEstado(pp);
      const material = dielectricoPorId(pp.materialId);
      const objetivo = estado.E > 0 ? 1 - 1 / material.kappa : 0;
      polarizacionRef.current = menosMovimiento
        ? objetivo
        : polarizacionRef.current + (objetivo - polarizacionRef.current) * (1 - Math.exp(-dt / TAU_POLARIZACION));
      dibujarCapacitor(
        ctx as unknown as Parameters<typeof dibujarCapacitor>[0],
        { p: pp, estado, material, polarizacion: polarizacionRef.current, hover: hoverRef.current },
        { escalaCss: escala.escalaCssRef.current || 1 },
      );
      id = requestAnimationFrame(frame);
    };
    id = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(id);
      consulta.removeEventListener("change", alCambiar);
    };
  }, [escala.escalaCssRef]);

  const aLogico = useCallback((clientX: number, clientY: number) => {
    const c = canvasRef.current;
    if (!c) return null;
    const r = c.getBoundingClientRect();
    if (r.width <= 0) return null;
    return { x: ((clientX - r.left) / r.width) * ANCHO_PLACAS, y: ((clientY - r.top) / r.height) * ALTO_PLACAS };
  }, []);

  const margenLogico = () => MARGEN_CSS / (escala.escalaCssRef.current || 1);

  // Gesto táctil: la página se desplaza salvo que el dedo empiece sobre algo arrastrable.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const alTocar = (e: TouchEvent) => {
      const t = e.touches[0];
      if (!t || !e.cancelable) return;
      const pt = aLogico(t.clientX, t.clientY);
      if (!pt) return;
      const g = calcularGeometria(propsRef.current.p);
      if (zonaEn(g, pt.x, pt.y, MARGEN_CSS / (escala.escalaCssRef.current || 1), propsRef.current.p.materialId !== "aire")) {
        e.preventDefault();
      }
    };
    canvas.addEventListener("touchstart", alTocar, { passive: false });
    return () => canvas.removeEventListener("touchstart", alTocar);
  }, [aLogico, escala.escalaCssRef]);

  const alBajar = (e: PointerEvent<HTMLCanvasElement>) => {
    if (e.button !== 0 && e.pointerType === "mouse") return;
    const pt = aLogico(e.clientX, e.clientY);
    if (!pt) return;
    const g = calcularGeometria(propsRef.current.p);
    const zona = zonaEn(g, pt.x, pt.y, margenLogico(), propsRef.current.p.materialId !== "aire");
    if (!zona) return;
    if (zona === "interruptor") {
      const modo = propsRef.current.p.modo;
      propsRef.current.onModo(modo === "conectado" ? "aislado" : "conectado");
      return;
    }
    e.currentTarget.setPointerCapture(e.pointerId);
    arrastreRef.current = { zona, agarre: zona === "lamina" ? pt.x - g.lamina.x : 0 };
    setCursor(zona === "lamina" ? "grabbing" : "ns-resize");
  };

  const alMover = (e: PointerEvent<HTMLCanvasElement>) => {
    const pt = aLogico(e.clientX, e.clientY);
    if (!pt) return;
    const a = arrastreRef.current;
    const { p: pp, onCambiar: cambiar } = propsRef.current;
    if (!a) {
      const zona = zonaEn(calcularGeometria(pp), pt.x, pt.y, margenLogico(), pp.materialId !== "aire");
      if (zona !== hoverRef.current) {
        hoverRef.current = zona;
        setCursor(zona ? COMANDO_CURSOR[zona] : "default");
      }
      return;
    }
    const g = calcularGeometria(pp);
    if (a.zona === "lamina") {
      cambiar({ f: fDesdeBordeLamina(pt.x - a.agarre, g.L) });
    } else {
      const huecoPx = a.zona === "placa-sup" ? 2 * (YC - pt.y) - GROSOR_PLACA : 2 * (pt.y - YC) - GROSOR_PLACA;
      cambiar({ d: dDesdeHuecoPx(huecoPx) });
    }
  };

  const alSoltar = (e: PointerEvent<HTMLCanvasElement>) => {
    if (!arrastreRef.current) return;
    arrastreRef.current = null;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
    setCursor(hoverRef.current ? COMANDO_CURSOR[hoverRef.current] : "default");
  };

  const alSalir = () => {
    if (arrastreRef.current) return;
    hoverRef.current = null;
    setCursor("default");
  };

  const alTeclear = (e: KeyboardEvent<HTMLCanvasElement>) => {
    const { p: pp, onCambiar: cambiar, onModo: modo } = propsRef.current;
    switch (e.key) {
      case "ArrowUp":
        cambiar({ d: Math.min(D_MAX, pp.d * FACTOR_D) });
        break;
      case "ArrowDown":
        cambiar({ d: Math.max(D_MIN, pp.d / FACTOR_D) });
        break;
      case "ArrowRight":
        cambiar({ f: Math.min(1, pp.f + PASO_F) });
        break;
      case "ArrowLeft":
        cambiar({ f: Math.max(0, pp.f - PASO_F) });
        break;
      case " ":
      case "Enter":
        modo(pp.modo === "conectado" ? "aislado" : "conectado");
        break;
      default:
        return;
    }
    e.preventDefault();
  };

  const estado = calcularEstado(p);
  const material = dielectricoPorId(p.materialId);
  const etiqueta =
    `Capacitor de placas paralelas ${p.modo === "conectado" ? "conectado a una batería" : "aislado"}, ` +
    `separación ${formatearSI(p.d, "m")}, ` +
    (material.id === "aire"
      ? "con aire entre las placas. "
      : `con ${material.nombre} insertado al ${Math.round(p.f * 100)} %. `) +
    `Capacitancia ${formatearSI(estado.C, "F")}, carga ${formatearSI(estado.Q, "C")}, tensión ${formatearSI(estado.V, "V")}, ` +
    `campo ${formatearSI(estado.E, "V/m")}, al ${Math.round(estado.ratioRigidez * 100)} % de la rigidez dieléctrica.`;

  return (
    <figure className="capacitor-figura">
      <canvas
        ref={canvasRef}
        className="lienzo capacitor-lienzo"
        width={ANCHO_PLACAS}
        height={ALTO_PLACAS}
        role="img"
        tabIndex={0}
        aria-label={etiqueta}
        aria-describedby={idAyuda}
        style={{
          aspectRatio: `${ANCHO_PLACAS} / ${ALTO_PLACAS}`,
          cursor,
          ["--lienzo-ratio" as string]: ANCHO_PLACAS / ALTO_PLACAS,
        }}
        onPointerDown={alBajar}
        onPointerMove={alMover}
        onPointerUp={alSoltar}
        onPointerCancel={alSoltar}
        onPointerLeave={alSalir}
        onKeyDown={alTeclear}
      />
      <p id={idAyuda} className="sr-only">
        Arrastra una placa hacia arriba o abajo para cambiar la separación, arrastra el bloque de dieléctrico para
        meterlo o sacarlo y toca el interruptor para conectar o desconectar la batería. Con teclado: flechas arriba y
        abajo cambian la separación, flechas izquierda y derecha mueven el dieléctrico y Espacio conecta o desconecta
        la batería.
      </p>
    </figure>
  );
}

