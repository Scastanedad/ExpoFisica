/**
 * Canvas de la Estación 03 (Campo continuo): su propio `requestAnimationFrame`,
 * totalmente separado del ciclo de renderizado de React -- mismo principio
 * que `CanvasRenderer.tsx`/`CanvasRendererDinamico.tsx`.
 *
 * Un "objeto en el campo" a la vez (`objeto` del store): el dipolo
 * (`fisica/dipolo.ts`) o una carga puntual libre (`fisica/cargaLibre.ts`).
 * Solo se integra y dibuja el objeto activo; el otro conserva su estado en su
 * ref (congelado) hasta que se vuelva a elegir. El fondo (placas o carga
 * fuente) es el mismo para los dos.
 *
 * Decisión de arquitectura (ver cabecera de `fisica/dipolo.ts`): NO hay Web
 * Worker aquí. El estado del dipolo (`EstadoDipolo`), el de la carga libre
 * (`EstadoCargaLibre`) y la posición de la carga fuente arrastrable viven en
 * refs, actualizados directamente por este bucle y por los manejadores de
 * puntero/teclado -- nunca pasan por `useState`/Zustand. Solo la LECTURA
 * derivada del objeto activo se publica al store a ~10 Hz, para que el panel
 * la muestre sin re-renderizar el canvas.
 * La selección (`seleccionStore`) y las opciones de UI se copian a refs para
 * que el bucle de dibujo las lea sin pasar por React.
 */
import { useEffect, useRef, type RefObject } from "react";
import { campoPlacas, campoUniformeASim } from "../fisica/campoExterno";
import type { PuntoCarga } from "../fisica/coulomb";
import {
  calcularLecturaCargaLibre,
  estadoInicialCargaLibre,
  MASA_CARGA_LIBRE,
  pasoAvanceCargaLibre,
  type EstadoCargaLibre,
  type LimitesCargaLibre,
  type ParametrosCargaLibre,
} from "../fisica/cargaLibre";
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
import { useCampoContinuoStore } from "../store/campoContinuoStore";
import { useSeleccionStore } from "../store/seleccionStore";
import { useEscalaCss } from "../hooks/useEscalaCss";
import { dibujarCargas } from "./dibujarCargas";
import { dibujarAsaDipolo, dibujarVarillaDipolo } from "./dibujarDipolo";
import { dibujarCuadricula } from "./dibujarCuadricula";
import { dibujarFuerzas } from "./dibujarFuerzas";
import { dibujarLineasCampo } from "./dibujarLineasCampo";
import { dibujarPlacas, grosorPlacas } from "./dibujarPlacas";
import { ALTO_ESCENA, ANCHO_ESCENA } from "./dimensiones";
import { emitirCargaColocada } from "./eventosEscena";
import { fuerzaCargaLibreParaDibujar } from "./fuerzasCargaLibre";
import { fuerzasDipoloParaDibujar } from "./fuerzasDipolo";
import { radioAgarre, radioVisualCarga } from "./geometriaCargas";
import { ID_CARGA_FUENTE, ID_CARGA_LIBRE, ID_DIPOLO, type ControladorCampoContinuo } from "./controladorCampoContinuo";
import { limitarPosicion, type Posicion } from "./controladorEscena";

/** Cadencia de publicación de la lectura (dipolo: p, τ, F_neta, U; carga libre: v, F, K, U) al store: ~10 Hz, igual que q₀/fuerza. */
const INTERVALO_LECTURA_MS = 100;
/** Recorte del tiempo real por frame (pestañas dormidas): mismo espíritu que `MAX_DT_REAL_S` de dinamica.ts. */
const MAX_DT_FRAME_S = 0.05;
/** Un toque que se desplaza más que esto (px CSS) es un gesto, no un "toque para colocar". */
const UMBRAL_TOQUE_CSS = 10;
/** Líneas de campo de la carga fuente: pocas, para que el dipolo siga siendo lo que se ve (0.5 µC: 5; 5 µC: 24). */
const PRESUPUESTO_LINEAS_FUENTE = 24;

const DIPOLO_INICIAL = { cx: ANCHO_ESCENA / 2, cy: ALTO_ESCENA / 2 + 70, theta: 0.3 };
const FUENTE_INICIAL: Posicion = { x: ANCHO_ESCENA / 2, y: 120 };
/** A un lado y por debajo de la fuente: en los dos modos tiene recorrido libre antes de chocar con algo. */
const CARGA_LIBRE_INICIAL: Posicion = { x: ANCHO_ESCENA / 2 - 150, y: ALTO_ESCENA / 2 };

interface RefsObjetos {
  dipoloRef: RefObject<EstadoDipolo>;
  cargaLibreRef: RefObject<EstadoCargaLibre>;
  fuenteRef: RefObject<Posicion>;
}

/** Coloca el dipolo o la carga libre (en reposo) o la carga fuente en (x, y), limitado a la zona de arrastre. */
function colocarEn({ dipoloRef, cargaLibreRef, fuenteRef }: RefsObjetos, id: string, x: number, y: number): void {
  const p = limitarPosicion(x, y, ANCHO_ESCENA, ALTO_ESCENA);
  if (id === ID_DIPOLO) {
    dipoloRef.current = { ...dipoloRef.current, cx: p.x, cy: p.y, vx: 0, vy: 0 };
  } else if (id === ID_CARGA_LIBRE) {
    cargaLibreRef.current = estadoInicialCargaLibre(p.x, p.y);
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
  controladorRef?: RefObject<ControladorCampoContinuo | null>;
}

export function CanvasCampoContinuo({ controladorRef }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { escalaCssRef, factorResolucionRef } = useEscalaCss(canvasRef, ANCHO_ESCENA, ALTO_ESCENA);

  const dipoloRef = useRef<EstadoDipolo>(estadoInicialDipolo(DIPOLO_INICIAL.cx, DIPOLO_INICIAL.cy, DIPOLO_INICIAL.theta));
  const cargaLibreRef = useRef<EstadoCargaLibre>(estadoInicialCargaLibre(CARGA_LIBRE_INICIAL.x, CARGA_LIBRE_INICIAL.y));
  const fuenteRef = useRef<Posicion>({ ...FUENTE_INICIAL });
  const refsObjetos: RefsObjetos = { dipoloRef, cargaLibreRef, fuenteRef };
  const ultimoTiempoRef = useRef(performance.now());
  /**
   * true mientras el puntero arrastra el objeto activo (dipolo o carga libre;
   * mismo espíritu que `anclada` en `fisica/dinamica.ts`): el bucle de física
   * deja de integrarlo para no "pelear" con cada `pointermove`. Compartido
   * entre el efecto de interacción y el de física+dibujo.
   */
  const arrastrandoObjetoRef = useRef(false);
  /** Líneas de campo de la carga fuente, recalculadas solo cuando ella cambia (posición o carga). */
  const lineasFuenteRef = useRef<{ clave: string; lineas: LineaCampo[] }>({ clave: "", lineas: [] });

  // Copias en ref del estado de UI (Zustand) para leerlas dentro del rAF sin causar re-render por frame.
  const objetoRef = useRef(useCampoContinuoStore.getState().objeto);
  const modoCampoRef = useRef(useCampoContinuoStore.getState().modoCampo);
  const orientacionRef = useRef(useCampoContinuoStore.getState().orientacionPlacas);
  const polaridadRef = useRef(useCampoContinuoStore.getState().polaridadPlacas);
  const voltajeKVRef = useRef(useCampoContinuoStore.getState().voltajeKV);
  const qUCRef = useRef(useCampoContinuoStore.getState().qUC);
  const dPxRef = useRef(useCampoContinuoStore.getState().dPx);
  const qCargaLibreUCRef = useRef(useCampoContinuoStore.getState().qCargaLibreUC);
  const signoCargaLibreRef = useRef(useCampoContinuoStore.getState().signoCargaLibre);
  const qFuenteUCRef = useRef(useCampoContinuoStore.getState().qFuenteUC);
  const signoFuenteRef = useRef(useCampoContinuoStore.getState().signoFuente);
  const mostrarFuerzasRef = useRef(useCampoContinuoStore.getState().mostrarFuerzas);
  const enPausaRef = useRef(useCampoContinuoStore.getState().enPausa);
  const seleccionRef = useRef<string | null>(useSeleccionStore.getState().seleccionadaId);

  const objeto = useCampoContinuoStore((s) => s.objeto);
  const modoCampo = useCampoContinuoStore((s) => s.modoCampo);
  const orientacionPlacas = useCampoContinuoStore((s) => s.orientacionPlacas);
  const polaridadPlacas = useCampoContinuoStore((s) => s.polaridadPlacas);
  const voltajeKV = useCampoContinuoStore((s) => s.voltajeKV);
  const qUC = useCampoContinuoStore((s) => s.qUC);
  const dPx = useCampoContinuoStore((s) => s.dPx);
  const qCargaLibreUC = useCampoContinuoStore((s) => s.qCargaLibreUC);
  const signoCargaLibre = useCampoContinuoStore((s) => s.signoCargaLibre);
  const qFuenteUC = useCampoContinuoStore((s) => s.qFuenteUC);
  const signoFuente = useCampoContinuoStore((s) => s.signoFuente);
  const mostrarFuerzas = useCampoContinuoStore((s) => s.mostrarFuerzas);
  const enPausa = useCampoContinuoStore((s) => s.enPausa);
  const publicarLectura = useCampoContinuoStore((s) => s.publicarLectura);
  const publicarLecturaCargaLibre = useCampoContinuoStore((s) => s.publicarLecturaCargaLibre);
  const seleccionadaId = useSeleccionStore((s) => s.seleccionadaId);

  useEffect(() => {
    objetoRef.current = objeto;
  }, [objeto]);
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
    qCargaLibreUCRef.current = qCargaLibreUC;
  }, [qCargaLibreUC]);
  useEffect(() => {
    signoCargaLibreRef.current = signoCargaLibre;
  }, [signoCargaLibre]);
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

  /**
   * Parámetros de la carga libre: el MISMO campo (placas o fuente) que el dipolo, con su propia q y
   * masa. El contacto con la fuente es la suma de los radios DIBUJADOS (crecen con |q|), y V = 0 se
   * pone en la placa negativa (solo cambia la lectura de U, no la dinámica).
   */
  function parametrosCargaLibre(pd: ParametrosDipolo): ParametrosCargaLibre {
    const q = signoCargaLibreRef.current * qCargaLibreUCRef.current;
    const escalaCss = escalaCssRef.current;
    const vertical = orientacionRef.current === "vertical";
    const negativaAbajoDerecha = polaridadRef.current === 1; // polaridad 1: + arriba/izquierda
    const origenPotencial = vertical
      ? { x: 0, y: negativaAbajoDerecha ? ALTO_ESCENA : 0 }
      : { x: negativaAbajoDerecha ? ANCHO_ESCENA : 0, y: 0 };
    return {
      q,
      masa: MASA_CARGA_LIBRE,
      modoCampo: pd.modoCampo,
      externoSim: pd.externoSim,
      cargaFuente: pd.cargaFuente,
      distMinFuente: pd.cargaFuente
        ? radioVisualCarga(pd.cargaFuente.q, escalaCss) + radioVisualCarga(q, escalaCss)
        : undefined,
      origenPotencial,
    };
  }

  /** Paredes de la carga libre: los bordes del lienzo, o la cara interior de las placas si se dibujan. */
  function limitesCargaLibre(params: ParametrosCargaLibre): LimitesCargaLibre {
    const escalaCss = escalaCssRef.current;
    const r = radioVisualCarga(params.q, escalaCss);
    const conPlaca = r + grosorPlacas(escalaCss);
    const placasVerticales = params.modoCampo === "uniforme" && orientacionRef.current === "vertical";
    const placasHorizontales = params.modoCampo === "uniforme" && orientacionRef.current === "horizontal";
    return {
      ancho: ANCHO_ESCENA,
      alto: ALTO_ESCENA,
      margenes: {
        izquierda: placasHorizontales ? conPlaca : r,
        derecha: placasHorizontales ? conPlaca : r,
        arriba: placasVerticales ? conPlaca : r,
        abajo: placasVerticales ? conPlaca : r,
      },
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

  // Controlador publicado para el teclado (PanelCampoContinuo): mismo contrato que ControladorEscena
  // (posicion/mover), con `girar`/`anguloDeg`/`reiniciar` añadidos -- ver render/controladorCampoContinuo.ts.
  useEffect(() => {
    if (!controladorRef) return;
    controladorRef.current = {
      ancho: ANCHO_ESCENA,
      alto: ALTO_ESCENA,
      posicion: (id) => {
        if (id === ID_DIPOLO) return { x: dipoloRef.current.cx, y: dipoloRef.current.cy };
        if (id === ID_CARGA_LIBRE) return { x: cargaLibreRef.current.x, y: cargaLibreRef.current.y };
        if (id === ID_CARGA_FUENTE) return { ...fuenteRef.current };
        return undefined;
      },
      mover: (id, x, y) => colocarEn(refsObjetos, id, x, y),
      girar: (deltaRad) => {
        dipoloRef.current = { ...dipoloRef.current, theta: dipoloRef.current.theta + deltaRad, omega: 0 };
      },
      anguloDeg: () => (((dipoloRef.current.theta * 180) / Math.PI) % 360 + 360) % 360,
      reiniciar: () => {
        dipoloRef.current = estadoInicialDipolo(DIPOLO_INICIAL.cx, DIPOLO_INICIAL.cy, DIPOLO_INICIAL.theta);
        cargaLibreRef.current = estadoInicialCargaLibre(CARGA_LIBRE_INICIAL.x, CARGA_LIBRE_INICIAL.y);
        fuenteRef.current = { ...FUENTE_INICIAL };
      },
    };
    return () => {
      controladorRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `refsObjetos` solo agrupa refs estables.
  }, [controladorRef]);

  // Interacción de puntero: arrastrar la carga fuente (modo "puntual") o el objeto activo (el
  // cuerpo del dipolo -- cualquiera de sus cargas, la varilla o el centro -- o la carga libre), o
  // "colocar tocando el recuadro" con el objeto/fuente armados desde el panel (alternativa de un
  // solo puntero, WCAG 2.5.7). Solo TRASLADA -- girar el dipolo es siempre por botones
  // (PanelCampoContinuo), así que no hace falta distinguir "qué parte" del cuerpo se agarró.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    let arrastrandoObjeto = false;
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
    /** El objeto activo (dipolo XOR carga libre) bajo el puntero: el otro no está en pantalla, no se puede agarrar. */
    function sobreObjeto(p: Posicion): boolean {
      if (objetoRef.current === "carga") {
        const c = cargaLibreRef.current;
        return Math.hypot(p.x - c.x, p.y - c.y) <= radioAgarre(escalaCssRef.current);
      }
      const ext = extremosDipolo(dipoloRef.current, dPxRef.current);
      return distanciaASegmento(p.x, p.y, ext.masX, ext.masY, ext.menosX, ext.menosY) <= radioAgarre(escalaCssRef.current);
    }
    function idObjeto(): string {
      return objetoRef.current === "carga" ? ID_CARGA_LIBRE : ID_DIPOLO;
    }
    /** ¿Se puede colocar `id` tocando el recuadro con la configuración actual? */
    function colocable(id: string | null): boolean {
      return id === idObjeto() || (id === ID_CARGA_FUENTE && modoCampoRef.current === "puntual");
    }
    /** Cursor según lo que hay bajo el puntero: agarrando > sobre un objeto > listo para colocar > normal. */
    function actualizarCursor(p: Posicion | null) {
      let cursor = "default";
      const s = useSeleccionStore.getState();
      const armado = s.colocarConToque && colocable(s.seleccionadaId);
      if (arrastrandoObjeto || arrastrandoFuente) cursor = "grabbing";
      else if (p && (sobreFuente(p) || sobreObjeto(p))) cursor = "grab";
      else if (armado) cursor = "crosshair";
      canvas!.style.cursor = cursor;
    }
    /** Termina el arrastre y devuelve la selección previa (el anillo solo se muestra mientras se agarra). */
    function terminarArrastre() {
      if (!arrastrandoObjeto && !arrastrandoFuente) return;
      arrastrandoObjeto = false;
      arrastrandoFuente = false;
      arrastrandoObjetoRef.current = false;
      const previa = seleccionPrevia;
      seleccionPrevia = null;
      useSeleccionStore.getState().seleccionar(previa?.id ?? null, previa?.armada ?? false);
    }

    function onTouchStart(e: TouchEvent) {
      if (e.touches.length !== 1) return;
      const t = e.touches[0];
      const p = aLogicas(t.clientX, t.clientY);
      if ((sobreFuente(p) || sobreObjeto(p)) && e.cancelable) e.preventDefault();
    }
    function onPointerDown(e: PointerEvent) {
      if (e.pointerType === "mouse" && e.button !== 0) return;
      const p = aLogicas(e.clientX, e.clientY);
      const enFuente = sobreFuente(p);
      const enObjeto = !enFuente && sobreObjeto(p);
      if (enFuente || enObjeto) {
        const s = useSeleccionStore.getState();
        seleccionPrevia = { id: s.seleccionadaId, armada: s.colocarConToque };
        toque = null;
        const centro = enFuente
          ? fuenteRef.current
          : objetoRef.current === "carga"
            ? cargaLibreRef.current
            : { x: dipoloRef.current.cx, y: dipoloRef.current.cy };
        const cx = centro.x;
        const cy = centro.y;
        desfase = { x: cx - p.x, y: cy - p.y };
        if (enFuente) arrastrandoFuente = true;
        else {
          arrastrandoObjeto = true;
          arrastrandoObjetoRef.current = true;
        }
        canvas!.setPointerCapture(e.pointerId);
        s.seleccionar(enFuente ? ID_CARGA_FUENTE : idObjeto(), false); // muestra el anillo mientras se agarra
        actualizarCursor(p);
        return;
      }
      toque = { pointerId: e.pointerId, clientX: e.clientX, clientY: e.clientY };
    }
    function onPointerMove(e: PointerEvent) {
      const bruto = aLogicas(e.clientX, e.clientY);
      if (arrastrandoObjeto || arrastrandoFuente) {
        const destino = limitar({ x: bruto.x + desfase.x, y: bruto.y + desfase.y });
        colocarEn(refsObjetos, arrastrandoFuente ? ID_CARGA_FUENTE : idObjeto(), destino.x, destino.y);
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
      if (arrastrandoObjeto || arrastrandoFuente) {
        terminarArrastre();
        actualizarCursor(p);
        return;
      }
      if (toque && toque.pointerId === e.pointerId) {
        toque = null;
        const { seleccionadaId: id, colocarConToque } = useSeleccionStore.getState();
        if (id && colocarConToque && colocable(id)) {
          const destino = limitar(p);
          colocarEn(refsObjetos, id, destino.x, destino.y);
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
      if (!arrastrandoObjeto && !arrastrandoFuente) actualizarCursor(null);
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
      arrastrandoObjetoRef.current = false;
      // El store de selección es compartido con las otras estaciones: no dejar aquí ids que no les corresponden.
      useSeleccionStore.getState().seleccionar(null);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `refsObjetos` solo agrupa refs estables.
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
      const esCarga = objetoRef.current === "carga";
      const paramsCarga = parametrosCargaLibre(params);
      if (!enPausaRef.current && !arrastrandoObjetoRef.current) {
        // Solo el objeto activo se integra: el otro queda congelado donde estaba.
        if (esCarga) cargaLibreRef.current = pasoAvanceCargaLibre(cargaLibreRef.current, paramsCarga, dt, limitesCargaLibre(paramsCarga));
        else dipoloRef.current = pasoAvanceDipolo(dipoloRef.current, params, dt);
      }

      if (ahora - ultimaPublicacionMs >= INTERVALO_LECTURA_MS) {
        ultimaPublicacionMs = ahora;
        if (esCarga) publicarLecturaCargaLibre(calcularLecturaCargaLibre(cargaLibreRef.current, paramsCarga));
        else publicarLectura(calcularLecturaDipolo(dipoloRef.current, params));
      }

      dibujar(ctx, params, esCarga ? paramsCarga : null);
      idFrame = requestAnimationFrame(frame);
    }

    /** `paramsCarga` no nulo = el objeto activo es la carga libre; nulo = el dipolo. */
    function dibujar(ctx: CanvasRenderingContext2D, params: ParametrosDipolo, paramsCarga: ParametrosCargaLibre | null) {
      const escalaCss = escalaCssRef.current;
      const seleccion = seleccionRef.current;

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

      if (paramsCarga) {
        // Carga libre: una carga real con masa (se dibuja como cualquier carga, nunca como la sonda q₀).
        const { punto, fuerza } = fuerzaCargaLibreParaDibujar(cargaLibreRef.current, paramsCarga);
        dibujarCargas(ctx, [punto], {
          escalaCss,
          indiceSeleccionada: seleccion === ID_CARGA_LIBRE ? 0 : -1,
          ancho: ANCHO_ESCENA,
        });
        if (mostrarFuerzasRef.current) dibujarFuerzas(ctx, [punto], [fuerza], escalaCss);
        return;
      }

      const estado = dipoloRef.current;
      const ext = extremosDipolo(estado, params.d);
      const { puntos, fuerzas } = fuerzasDipoloParaDibujar(estado, params);
      dibujarVarillaDipolo(ctx, ext, params.q, escalaCss, seleccion === ID_DIPOLO);
      dibujarCargas(ctx, puntos, { escalaCss, ancho: ANCHO_ESCENA });
      if (mostrarFuerzasRef.current) dibujarFuerzas(ctx, puntos, fuerzas, escalaCss);
      dibujarAsaDipolo(ctx, estado.cx, estado.cy, escalaCss);
    }

    idFrame = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(idFrame);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- lee la configuración vía refs, no como dependencia de efecto.
  }, [escalaCssRef, factorResolucionRef, publicarLectura, publicarLecturaCargaLibre]);

  return (
    <canvas
      ref={canvasRef}
      className="lienzo"
      width={ANCHO_ESCENA}
      height={ALTO_ESCENA}
      role="img"
      aria-label={`${
        objeto === "carga"
          ? `Una carga puntual libre ${signoCargaLibre === 1 ? "positiva" : "negativa"}, que se mueve y rebota en los bordes,`
          : "Un dipolo eléctrico (dos cargas opuestas unidas por una varilla rígida)"
      } en ${
        modoCampo === "uniforme" ? "un campo uniforme, entre dos placas paralelas" : "el campo de una carga puntual arrastrable"
      }.`}
      style={{
        aspectRatio: `${ANCHO_ESCENA} / ${ALTO_ESCENA}`,
        ["--lienzo-ratio" as string]: ANCHO_ESCENA / ALTO_ESCENA,
      }}
    />
  );
}
