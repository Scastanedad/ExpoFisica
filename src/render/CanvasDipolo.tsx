/**
 * Canvas de la Estación 03 (Dipolos): su propio `requestAnimationFrame`,
 * totalmente separado del ciclo de renderizado de React -- mismo principio
 * que `CanvasRenderer.tsx`/`CanvasRendererDinamico.tsx`.
 *
 * Decisión de arquitectura (ver cabecera de `fisica/dipolo.ts`): NO hay Web
 * Worker aquí. El estado del cuerpo rígido (`EstadoDipolo`) y la posición de
 * la carga fuente arrastrable viven en refs, actualizados directamente por
 * este bucle y por los manejadores de puntero/teclado -- nunca pasan por
 * `useState`/Zustand. Solo la LECTURA derivada (p, τ, F_neta, U) se publica al
 * store a ~10 Hz, para que el panel la muestre sin re-renderizar el canvas.
 * La selección (`seleccionStore`) y las opciones de UI se copian a refs para
 * que el bucle de dibujo las lea sin pasar por React.
 */
import { useEffect, useRef, type RefObject } from "react";
import { campoPlacas, campoUniformeASim } from "../fisica/campoExterno";
import type { PuntoCarga } from "../fisica/coulomb";
import {
  calcularLecturaDipolo,
  estadoInicialDipolo,
  extremosDipolo,
  pasoAvanceDipolo,
  ZETA_RECOMENDADO,
  type EstadoDipolo,
  type ParametrosDipolo,
} from "../fisica/dipolo";
import { pxAMetros } from "../fisica/escala";
import { trazarLineasCampo, type LineaCampo } from "../fisica/lineasCampo";
import { useDipoloStore } from "../store/dipoloStore";
import { useSeleccionStore } from "../store/seleccionStore";
import { useEscalaCss } from "../hooks/useEscalaCss";
import { dibujarCargas } from "./dibujarCargas";
import { dibujarAsaDipolo, dibujarVarillaDipolo } from "./dibujarDipolo";
import { dibujarCuadricula } from "./dibujarCuadricula";
import { dibujarFuerzas } from "./dibujarFuerzas";
import { dibujarLineasCampo } from "./dibujarLineasCampo";
import { dibujarPlacas } from "./dibujarPlacas";
import { ALTO_ESCENA, ANCHO_ESCENA } from "./dimensiones";
import { emitirCargaColocada } from "./eventosEscena";
import { fuerzasDipoloParaDibujar } from "./fuerzasDipolo";
import { radioAgarre } from "./geometriaCargas";
import { ID_CARGA_FUENTE, ID_DIPOLO, type ControladorDipolo } from "./controladorDipolo";
import { limitarPosicion, type Posicion } from "./controladorEscena";

/** Cadencia de publicación de la lectura (p, τ, F_neta, U) al store: ~10 Hz, igual que q₀/fuerza. */
const INTERVALO_LECTURA_MS = 100;
/** Recorte del tiempo real por frame (pestañas dormidas): mismo espíritu que `MAX_DT_REAL_S` de dinamica.ts. */
const MAX_DT_FRAME_S = 0.05;
/** Un toque que se desplaza más que esto (px CSS) es un gesto, no un "toque para colocar". */
const UMBRAL_TOQUE_CSS = 10;
/** Líneas de campo de la carga fuente: pocas, para que el dipolo siga siendo lo que se ve (0.5 µC: 5; 5 µC: 24). */
const PRESUPUESTO_LINEAS_FUENTE = 24;

const DIPOLO_INICIAL = { cx: ANCHO_ESCENA / 2, cy: ALTO_ESCENA / 2 + 70, theta: 0.3 };
const FUENTE_INICIAL: Posicion = { x: ANCHO_ESCENA / 2, y: 120 };

/** Coloca el dipolo (en reposo) o la carga fuente en (x, y), limitado a la zona de arrastre. */
function colocarEn(
  dipoloRef: RefObject<EstadoDipolo>,
  fuenteRef: RefObject<Posicion>,
  id: string,
  x: number,
  y: number,
): void {
  const p = limitarPosicion(x, y, ANCHO_ESCENA, ALTO_ESCENA);
  if (id === ID_DIPOLO) {
    dipoloRef.current = { ...dipoloRef.current, cx: p.x, cy: p.y, vx: 0, vy: 0 };
  } else if (id === ID_CARGA_FUENTE) {
    fuenteRef.current = p;
  }
}

/** Distancia de un punto al segmento a—b. */
function distanciaASegmento(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const abx = bx - ax;
  const aby = by - ay;
  const l2 = abx * abx + aby * aby;
  const t = l2 > 0 ? Math.max(0, Math.min(1, ((px - ax) * abx + (py - ay) * aby) / l2)) : 0;
  return Math.hypot(px - (ax + t * abx), py - (ay + t * aby));
}

interface Props {
  controladorRef?: RefObject<ControladorDipolo | null>;
}

export function CanvasDipolo({ controladorRef }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { escalaCssRef, factorResolucionRef } = useEscalaCss(canvasRef, ANCHO_ESCENA, ALTO_ESCENA);

  const dipoloRef = useRef<EstadoDipolo>(estadoInicialDipolo(DIPOLO_INICIAL.cx, DIPOLO_INICIAL.cy, DIPOLO_INICIAL.theta));
  const fuenteRef = useRef<Posicion>({ ...FUENTE_INICIAL });
  const ultimoTiempoRef = useRef(performance.now());
  /**
   * true mientras el puntero arrastra el cuerpo del dipolo (mismo espíritu que
   * `anclada` en `fisica/dinamica.ts`): el bucle de física deja de integrar la
   * traslación/rotación para no "pelear" con cada `pointermove`. Compartido
   * entre el efecto de interacción y el de física+dibujo.
   */
  const arrastrandoDipoloRef = useRef(false);
  /** Líneas de campo de la carga fuente, recalculadas solo cuando ella cambia (posición o carga). */
  const lineasFuenteRef = useRef<{ clave: string; lineas: LineaCampo[] }>({ clave: "", lineas: [] });

  // Copias en ref del estado de UI (Zustand) para leerlas dentro del rAF sin causar re-render por frame.
  const modoCampoRef = useRef(useDipoloStore.getState().modoCampo);
  const orientacionRef = useRef(useDipoloStore.getState().orientacionPlacas);
  const polaridadRef = useRef(useDipoloStore.getState().polaridadPlacas);
  const voltajeKVRef = useRef(useDipoloStore.getState().voltajeKV);
  const qUCRef = useRef(useDipoloStore.getState().qUC);
  const dPxRef = useRef(useDipoloStore.getState().dPx);
  const qFuenteUCRef = useRef(useDipoloStore.getState().qFuenteUC);
  const signoFuenteRef = useRef(useDipoloStore.getState().signoFuente);
  const mostrarFuerzasRef = useRef(useDipoloStore.getState().mostrarFuerzas);
  const enPausaRef = useRef(useDipoloStore.getState().enPausa);
  const seleccionRef = useRef<string | null>(useSeleccionStore.getState().seleccionadaId);

  const modoCampo = useDipoloStore((s) => s.modoCampo);
  const orientacionPlacas = useDipoloStore((s) => s.orientacionPlacas);
  const polaridadPlacas = useDipoloStore((s) => s.polaridadPlacas);
  const voltajeKV = useDipoloStore((s) => s.voltajeKV);
  const qUC = useDipoloStore((s) => s.qUC);
  const dPx = useDipoloStore((s) => s.dPx);
  const qFuenteUC = useDipoloStore((s) => s.qFuenteUC);
  const signoFuente = useDipoloStore((s) => s.signoFuente);
  const mostrarFuerzas = useDipoloStore((s) => s.mostrarFuerzas);
  const enPausa = useDipoloStore((s) => s.enPausa);
  const publicarLectura = useDipoloStore((s) => s.publicarLectura);
  const seleccionadaId = useSeleccionStore((s) => s.seleccionadaId);

  useEffect(() => {
    modoCampoRef.current = modoCampo;
  }, [modoCampo]);
  useEffect(() => {
    orientacionRef.current = orientacionPlacas;
  }, [orientacionPlacas]);
  useEffect(() => {
    polaridadRef.current = polaridadPlacas;
  }, [polaridadPlacas]);
  useEffect(() => {
    voltajeKVRef.current = voltajeKV;
  }, [voltajeKV]);
  useEffect(() => {
    qUCRef.current = qUC;
  }, [qUC]);
  useEffect(() => {
    dPxRef.current = dPx;
  }, [dPx]);
  useEffect(() => {
    qFuenteUCRef.current = qFuenteUC;
  }, [qFuenteUC]);
  useEffect(() => {
    signoFuenteRef.current = signoFuente;
  }, [signoFuente]);
  useEffect(() => {
    mostrarFuerzasRef.current = mostrarFuerzas;
  }, [mostrarFuerzas]);
  useEffect(() => {
    enPausaRef.current = enPausa;
  }, [enPausa]);
  useEffect(() => {
    seleccionRef.current = seleccionadaId;
  }, [seleccionadaId]);

  /** Parámetros físicos del instante actual, derivados de la configuración de UI (nunca del estado del cuerpo). */
  function construirParametros(): ParametrosDipolo {
    const modo = modoCampoRef.current;
    let externoSim: [number, number] | null = null;
    if (modo === "uniforme") {
      const separacionM = pxAMetros(orientacionRef.current === "vertical" ? ALTO_ESCENA : ANCHO_ESCENA);
      const e0SI = campoPlacas(orientacionRef.current, polaridadRef.current, voltajeKVRef.current * 1000, separacionM);
      externoSim = campoUniformeASim(e0SI);
    }
    const cargaFuente: PuntoCarga | null =
      modo === "puntual" ? { x: fuenteRef.current.x, y: fuenteRef.current.y, q: signoFuenteRef.current * qFuenteUCRef.current } : null;
    return {
      q: qUCRef.current,
      d: dPxRef.current,
      modoCampo: modo,
      externoSim,
      cargaFuente,
      // Decisión confirmada (ver decisiones.md): amortiguamiento apagado en campo uniforme
      // (conserva energía, el dipolo OSCILA sin detenerse) y encendido en campo de una carga
      // puntual (si no, el dipolo nunca se asienta y la atracción es difícil de leer).
      zeta: modo === "uniforme" ? 0 : ZETA_RECOMENDADO,
    };
  }

  /** Líneas de campo de la carga fuente; solo se retrazan si ella se movió o cambió su carga. */
  function lineasDeLaFuente(fuente: PuntoCarga): LineaCampo[] {
    const clave = `${fuente.x.toFixed(1)}|${fuente.y.toFixed(1)}|${fuente.q}`;
    if (lineasFuenteRef.current.clave !== clave) {
      lineasFuenteRef.current = {
        clave,
        lineas: trazarLineasCampo([fuente], ANCHO_ESCENA, ALTO_ESCENA, { presupuesto: PRESUPUESTO_LINEAS_FUENTE }),
      };
    }
    return lineasFuenteRef.current.lineas;
  }

  // Controlador publicado para el teclado (PanelDipolo): mismo contrato que ControladorEscena
  // (posicion/mover), con `girar`/`anguloDeg`/`reiniciar` añadidos -- ver render/controladorDipolo.ts.
  useEffect(() => {
    if (!controladorRef) return;
    controladorRef.current = {
      ancho: ANCHO_ESCENA,
      alto: ALTO_ESCENA,
      posicion: (id) => {
        if (id === ID_DIPOLO) return { x: dipoloRef.current.cx, y: dipoloRef.current.cy };
        if (id === ID_CARGA_FUENTE) return { ...fuenteRef.current };
        return undefined;
      },
      mover: (id, x, y) => colocarEn(dipoloRef, fuenteRef, id, x, y),
      girar: (deltaRad) => {
        dipoloRef.current = { ...dipoloRef.current, theta: dipoloRef.current.theta + deltaRad, omega: 0 };
      },
      anguloDeg: () => (((dipoloRef.current.theta * 180) / Math.PI) % 360 + 360) % 360,
      reiniciar: () => {
        dipoloRef.current = estadoInicialDipolo(DIPOLO_INICIAL.cx, DIPOLO_INICIAL.cy, DIPOLO_INICIAL.theta);
        fuenteRef.current = { ...FUENTE_INICIAL };
      },
    };
    return () => {
      controladorRef.current = null;
    };
  }, [controladorRef]);

  // Interacción de puntero: arrastrar la carga fuente (modo "puntual") o el cuerpo del dipolo
  // (cualquiera de sus cargas, la varilla o el centro), o "colocar tocando el recuadro" con el
  // dipolo/fuente armados desde el panel (alternativa de un solo puntero, WCAG 2.5.7).
  // Solo TRASLADA -- girar el dipolo es siempre por botones (PanelDipolo), así que no hace
  // falta distinguir "qué parte" del cuerpo se agarró.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    let arrastrandoDipolo = false;
    let arrastrandoFuente = false;
    /** centro − puntero al agarrar: el objeto no "salta" al puntero (agarrar por una carga extrema). */
    let desfase: Posicion = { x: 0, y: 0 };
    let seleccionPrevia: { id: string | null; armada: boolean } | null = null;
    let toque: { pointerId: number; clientX: number; clientY: number } | null = null;

    function aLogicas(clientX: number, clientY: number): Posicion {
      const rect = canvas!.getBoundingClientRect();
      return { x: (clientX - rect.left) * (ANCHO_ESCENA / rect.width), y: (clientY - rect.top) * (ALTO_ESCENA / rect.height) };
    }
    function limitar(p: Posicion): Posicion {
      return limitarPosicion(p.x, p.y, ANCHO_ESCENA, ALTO_ESCENA);
    }
    function sobreFuente(p: Posicion): boolean {
      if (modoCampoRef.current !== "puntual") return false;
      return Math.hypot(p.x - fuenteRef.current.x, p.y - fuenteRef.current.y) <= radioAgarre(escalaCssRef.current);
    }
    function sobreDipolo(p: Posicion): boolean {
      const ext = extremosDipolo(dipoloRef.current, dPxRef.current);
      return distanciaASegmento(p.x, p.y, ext.masX, ext.masY, ext.menosX, ext.menosY) <= radioAgarre(escalaCssRef.current);
    }
    /** Cursor según lo que hay bajo el puntero: agarrando > sobre un objeto > listo para colocar > normal. */
    function actualizarCursor(p: Posicion | null) {
      let cursor = "default";
      const s = useSeleccionStore.getState();
      const armado =
        s.colocarConToque &&
        (s.seleccionadaId === ID_DIPOLO || (s.seleccionadaId === ID_CARGA_FUENTE && modoCampoRef.current === "puntual"));
      if (arrastrandoDipolo || arrastrandoFuente) cursor = "grabbing";
      else if (p && (sobreFuente(p) || sobreDipolo(p))) cursor = "grab";
      else if (armado) cursor = "crosshair";
      canvas!.style.cursor = cursor;
    }
    /** Termina el arrastre y devuelve la selección previa (el anillo solo se muestra mientras se agarra). */
    function terminarArrastre() {
      if (!arrastrandoDipolo && !arrastrandoFuente) return;
      arrastrandoDipolo = false;
      arrastrandoFuente = false;
      arrastrandoDipoloRef.current = false;
      const previa = seleccionPrevia;
      seleccionPrevia = null;
      useSeleccionStore.getState().seleccionar(previa?.id ?? null, previa?.armada ?? false);
    }

    function onTouchStart(e: TouchEvent) {
      if (e.touches.length !== 1) return;
      const t = e.touches[0];
      const p = aLogicas(t.clientX, t.clientY);
      if ((sobreFuente(p) || sobreDipolo(p)) && e.cancelable) e.preventDefault();
    }
    function onPointerDown(e: PointerEvent) {
      if (e.pointerType === "mouse" && e.button !== 0) return;
      const p = aLogicas(e.clientX, e.clientY);
      const enFuente = sobreFuente(p);
      const enDipolo = !enFuente && sobreDipolo(p);
      if (enFuente || enDipolo) {
        const s = useSeleccionStore.getState();
        seleccionPrevia = { id: s.seleccionadaId, armada: s.colocarConToque };
        toque = null;
        const cx = enFuente ? fuenteRef.current.x : dipoloRef.current.cx;
        const cy = enFuente ? fuenteRef.current.y : dipoloRef.current.cy;
        desfase = { x: cx - p.x, y: cy - p.y };
        if (enFuente) arrastrandoFuente = true;
        else {
          arrastrandoDipolo = true;
          arrastrandoDipoloRef.current = true;
        }
        canvas!.setPointerCapture(e.pointerId);
        s.seleccionar(enFuente ? ID_CARGA_FUENTE : ID_DIPOLO, false); // muestra el anillo mientras se agarra
        actualizarCursor(p);
        return;
      }
      toque = { pointerId: e.pointerId, clientX: e.clientX, clientY: e.clientY };
    }
    function onPointerMove(e: PointerEvent) {
      const bruto = aLogicas(e.clientX, e.clientY);
      if (arrastrandoDipolo || arrastrandoFuente) {
        const destino = limitar({ x: bruto.x + desfase.x, y: bruto.y + desfase.y });
        colocarEn(dipoloRef, fuenteRef, arrastrandoFuente ? ID_CARGA_FUENTE : ID_DIPOLO, destino.x, destino.y);
        return;
      }
      if (
        toque &&
        toque.pointerId === e.pointerId &&
        Math.hypot(e.clientX - toque.clientX, e.clientY - toque.clientY) > UMBRAL_TOQUE_CSS
      ) {
        toque = null; // se desplazó: es un gesto, no un toque
      }
      actualizarCursor(bruto);
    }
    function onPointerUp(e: PointerEvent) {
      const p = aLogicas(e.clientX, e.clientY);
      if (arrastrandoDipolo || arrastrandoFuente) {
        terminarArrastre();
        actualizarCursor(p);
        return;
      }
      if (toque && toque.pointerId === e.pointerId) {
        toque = null;
        const { seleccionadaId: id, colocarConToque } = useSeleccionStore.getState();
        const aplicable = id === ID_DIPOLO || (id === ID_CARGA_FUENTE && modoCampoRef.current === "puntual");
        if (id && colocarConToque && aplicable) {
          const destino = limitar(p);
          colocarEn(dipoloRef, fuenteRef, id, destino.x, destino.y);
          emitirCargaColocada({ id, x: destino.x, y: destino.y });
        }
      }
    }
    // Gesto cancelado o captura perdida: el objeto queda donde estaba.
    function onPointerCancel() {
      terminarArrastre();
      toque = null;
    }
    function onPointerLeave() {
      if (!arrastrandoDipolo && !arrastrandoFuente) actualizarCursor(null);
    }

    canvas.style.cursor = "default";
    canvas.addEventListener("touchstart", onTouchStart, { passive: false });
    canvas.addEventListener("pointerdown", onPointerDown);
    canvas.addEventListener("pointermove", onPointerMove);
    canvas.addEventListener("pointerup", onPointerUp);
    canvas.addEventListener("pointercancel", onPointerCancel);
    canvas.addEventListener("lostpointercapture", onPointerCancel);
    canvas.addEventListener("pointerleave", onPointerLeave);
    return () => {
      canvas.removeEventListener("touchstart", onTouchStart);
      canvas.removeEventListener("pointerdown", onPointerDown);
      canvas.removeEventListener("pointermove", onPointerMove);
      canvas.removeEventListener("pointerup", onPointerUp);
      canvas.removeEventListener("pointercancel", onPointerCancel);
      canvas.removeEventListener("lostpointercapture", onPointerCancel);
      canvas.removeEventListener("pointerleave", onPointerLeave);
      arrastrandoDipoloRef.current = false;
      // El store de selección es compartido con las otras estaciones: no dejar aquí ids que no les corresponden.
      useSeleccionStore.getState().seleccionar(null);
    };
  }, [escalaCssRef]);

  // Bucle de física + dibujo propio.
  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;

    let ultimaPublicacionMs = -Infinity;
    let idFrame: number;

    function frame() {
      if (!ctx) return;
      const ahora = performance.now();
      const dt = Math.min(Math.max((ahora - ultimoTiempoRef.current) / 1000, 0), MAX_DT_FRAME_S);
      ultimoTiempoRef.current = ahora;

      const params = construirParametros();
      if (!enPausaRef.current && !arrastrandoDipoloRef.current) {
        dipoloRef.current = pasoAvanceDipolo(dipoloRef.current, params, dt);
      }

      if (ahora - ultimaPublicacionMs >= INTERVALO_LECTURA_MS) {
        ultimaPublicacionMs = ahora;
        publicarLectura(calcularLecturaDipolo(dipoloRef.current, params));
      }

      dibujar(ctx, params);
      idFrame = requestAnimationFrame(frame);
    }

    function dibujar(ctx: CanvasRenderingContext2D, params: ParametrosDipolo) {
      const escalaCss = escalaCssRef.current;
      const seleccion = seleccionRef.current;
      const estado = dipoloRef.current;
      const ext = extremosDipolo(estado, params.d);
      const { puntos, fuerzas } = fuerzasDipoloParaDibujar(estado, params);

      ctx.clearRect(0, 0, ANCHO_ESCENA, ALTO_ESCENA);
      dibujarCuadricula(ctx, ANCHO_ESCENA, ALTO_ESCENA, escalaCss);

      if (params.modoCampo === "uniforme") {
        dibujarPlacas(ctx, ANCHO_ESCENA, ALTO_ESCENA, orientacionRef.current, polaridadRef.current, escalaCss);
      } else if (params.cargaFuente) {
        // Campo de la fuente (solo ella: las cargas del dipolo también lo perturban, pero no se dibuja) y la fuente encima.
        dibujarLineasCampo(ctx, lineasDeLaFuente(params.cargaFuente), [params.cargaFuente], escalaCss);
        dibujarCargas(ctx, [params.cargaFuente], {
          escalaCss,
          indiceSeleccionada: seleccion === ID_CARGA_FUENTE ? 0 : -1,
          ancho: ANCHO_ESCENA,
        });
      }

      dibujarVarillaDipolo(ctx, ext, params.q, escalaCss, seleccion === ID_DIPOLO);
      dibujarCargas(ctx, puntos, { escalaCss, ancho: ANCHO_ESCENA });
      if (mostrarFuerzasRef.current) dibujarFuerzas(ctx, puntos, fuerzas, escalaCss);
      dibujarAsaDipolo(ctx, estado.cx, estado.cy, escalaCss);
    }

    idFrame = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(idFrame);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- lee la configuración vía refs, no como dependencia de efecto.
  }, [escalaCssRef, factorResolucionRef, publicarLectura]);

  return (
    <canvas
      ref={canvasRef}
      className="lienzo"
      width={ANCHO_ESCENA}
      height={ALTO_ESCENA}
      role="img"
      aria-label={`Un dipolo eléctrico (dos cargas opuestas unidas por una varilla rígida) en ${
        modoCampo === "uniforme" ? "un campo uniforme, entre dos placas paralelas" : "el campo de una carga puntual arrastrable"
      }.`}
      style={{
        aspectRatio: `${ANCHO_ESCENA} / ${ALTO_ESCENA}`,
        ["--lienzo-ratio" as string]: ANCHO_ESCENA / ALTO_ESCENA,
      }}
    />
  );
}
