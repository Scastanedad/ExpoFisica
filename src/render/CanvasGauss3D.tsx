/**
 * Canvas de la estación 5 (Ley de Gauss): dibuja un escenario 3D de forma estática y bajo demanda (sin bucle continuo:
 * un solo `requestAnimationFrame` por cambio de props o de tamaño). Las posiciones de las cargas no pasan por estado de
 * React: el padre las pasa como props de solo lectura y el motor (`render/gauss3d/motor.ts`) las copia a su geometría.
 * La interacción (arrastre, sliders) es de la fase 3; aquí solo hay dibujo.
 */
import { useEffect, useRef } from "react";
import type { Carga3D, Superficie } from "../fisica/gauss3d/tipos";
import { DPR_MAXIMO } from "./dimensiones";
import { crearMotorGauss3D, type EntradaMotor, type LecturaGauss3D, type MotorGauss3D } from "./gauss3d/motor";

export interface PropsCanvasGauss3D {
  superficie: Superficie;
  cargas: readonly Carga3D[];
  mostrar: { lineas: boolean; flujo: boolean; campo: boolean };
  /** Radianes. */
  azimut: number;
  /** Radianes, 15°–85°. */
  inclinacion: number;
  zoom?: number;
  /** 0.2…1 (opacidad de las caras de la superficie). */
  opacidad?: number;
  /** Descripción para lectores de pantalla. */
  descripcion: string;
  /** Se llama tras recalcular la geometría (no por cuadro). */
  alLeer?: (l: LecturaGauss3D) => void;
}

export function CanvasGauss3D({
  superficie,
  cargas,
  mostrar,
  azimut,
  inclinacion,
  zoom = 1,
  opacidad = 1,
  descripcion,
  alLeer,
}: PropsCanvasGauss3D) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const motorRef = useRef<MotorGauss3D | null>(null);
  const propsRef = useRef({ superficie, cargas, mostrar, azimut, inclinacion, zoom, opacidad, alLeer });
  const tamRef = useRef({ ancho: 0, alto: 0, dpr: 1 });
  const idFrameRef = useRef(0);
  const forzarRef = useRef(true);
  const pedirRef = useRef<() => void>(() => {});

  useEffect(() => {
    propsRef.current = { superficie, cargas, mostrar, azimut, inclinacion, zoom, opacidad, alLeer };
    pedirRef.current();
  });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    if (!motorRef.current) motorRef.current = crearMotorGauss3D();
    const motor = motorRef.current;

    function pintar() {
      idFrameRef.current = 0;
      const cv = canvasRef.current;
      const ctx = cv?.getContext("2d", { alpha: false });
      const { ancho, alto, dpr } = tamRef.current;
      if (!cv || !ctx || ancho < 2 || alto < 2) return;
      const p = propsRef.current;
      const entrada: EntradaMotor = {
        escenario: { superficie: p.superficie, cargas: p.cargas, calidad: motor.calidad() as 0 | 1 | 2 },
        camara: { azimut: p.azimut, inclinacion: p.inclinacion, zoom: p.zoom },
        ancho,
        alto,
        dpr,
        mostrar: p.mostrar,
        opacidad: p.opacidad,
        unidad: Math.min(1.6, Math.max(1, ancho / 900)),
      };
      const cambio = motor.actualizar(entrada);
      if (cambio === "igual" && !forzarRef.current) return;
      forzarRef.current = false;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      motor.dibujar(ctx, entrada);
      const g = motor.geometria();
      if (g) cv.dataset.calidad = g.malla.tipo + ":" + g.calidad;
      if (cambio === "geometria") {
        const l = motor.lectura();
        if (l) p.alLeer?.(l);
      }
    }

    function pedir() {
      if (idFrameRef.current === 0) idFrameRef.current = requestAnimationFrame(pintar);
    }
    pedirRef.current = pedir;

    function medir() {
      const cv = canvasRef.current;
      if (!cv) return;
      const r = cv.getBoundingClientRect();
      if (r.width <= 0 || r.height <= 0) return;
      const dpr = Math.min(window.devicePixelRatio || 1, DPR_MAXIMO);
      const bw = Math.round(r.width * dpr);
      const bh = Math.round(r.height * dpr);
      if (cv.width !== bw || cv.height !== bh) {
        cv.width = bw;
        cv.height = bh;
      }
      tamRef.current = { ancho: r.width, alto: r.height, dpr };
      forzarRef.current = true;
      pedir();
    }
    medir();
    const observador = new ResizeObserver(medir);
    observador.observe(canvas);
    return () => {
      observador.disconnect();
      if (idFrameRef.current) cancelAnimationFrame(idFrameRef.current);
      idFrameRef.current = 0;
      pedirRef.current = () => {};
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="lienzo lienzo-gauss3d"
      role="img"
      aria-label={descripcion}
    />
  );
}
