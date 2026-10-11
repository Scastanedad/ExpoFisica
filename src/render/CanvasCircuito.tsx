/**
 * Canvas de las estaciones de circuitos (E6 resistencias / E7 capacitores) con un ÚNICO
 * `requestAnimationFrame` propio, separado del ciclo de React, igual que `CanvasMateriales.tsx`.
 *
 * Sin Web Worker (red de ≤ 7 elementos): el estado eléctrico lo entrega `obtenerEstado(dt)` (en E6 un
 * resultado DC ya resuelto; en E7 el transitorio avanza ahí dentro). Aquí viven, en refs y NUNCA en
 * React/Zustand: la geometría, las partículas (arrays tipados), las velocidades y la posición de la
 * sonda mientras se arrastra. A Zustand solo se publica la LECTURA (tabla + sonda) a ~10 Hz.
 *
 * Interacción: tocar un elemento (o su cable corto) lo selecciona y pone la sonda ahí; arrastrar mueve la
 * sonda por cualquier punto del cable. Teclado (lienzo enfocable): ↑/↓ cambia de tramo, ←/→ desliza la
 * sonda, Esc la quita.
 */
import { useCallback, useEffect, useId, useRef, useState, type KeyboardEvent, type PointerEvent, type ReactNode } from "react";
import {
  cargasEnPlaca,
  formatearSI,
  lecturasElementos,
  potenciaBateria,
  type Bloque,
  type Dominio,
} from "../fisica/circuitos";
import { useEscalaCss } from "../hooks/useEscalaCss";
import { useCircuitosStore } from "../store/circuitosStore";
import { crearAnunciador } from "../ui/anunciosGauss3D";
import { tamanoLienzo, type TamanoLienzo } from "./circuitos/formatos";
import { dibujarCircuito, type DatosDibujo } from "./circuitos/dibujarCircuito";
import { distribuirCircuito, distribuirPuente, tramoCercano, type GeometriaCircuito } from "./circuitos/distribucion";
import type { EstadoElectrico } from "./circuitos/estado";
import {
  avanzarParticulas,
  corrientesTramos,
  crearParticulas,
  velocidadesTramos,
  type Particulas,
} from "./circuitos/particulas";
import { leerSonda, tramoVecino, type LecturaSondaCircuito, type PosicionSonda } from "./circuitos/sonda";
import {
  anuncioElemento,
  anuncioSonda,
  textoValorElemento,
  textosElementos,
} from "./circuitos/textos";

/** Cadencia de publicación de la lectura al store: ~10 Hz. */
const INTERVALO_LECTURA_MS = 100;
/** Recorte del tiempo real por frame (pestañas dormidas). */
const MAX_DT_FRAME_S = 0.05;
/** Radio de captura de la sonda alrededor del puntero [px CSS]. */
const RADIO_CAPTURA_CSS = 26;
/** Paso de la sonda con ← / → [fracción del tramo]. */
const PASO_TECLADO = 0.1;


export interface PropsCanvasCircuito {
  arbol: Bloque;
  /** R = resistores (E6), C = capacitores (E7). */
  dominio: Dominio;
  /** E7: dibuja el resistor de carga fijo «Rc» antes del árbol. */
  conRCarga?: boolean;
  /**
   * `arbol` (por defecto): serie-paralelo distribuido automáticamente. `puente`: puente de Wheatstone con
   * disposición fija (el `arbol` solo aporta los valores de R1..R5).
   */
  disposicion?: "arbol" | "puente";
  /**
   * Estado eléctrico vigente; se llama una vez por fotograma con el tiempo real transcurrido [s].
   * Debe ser barato (no resolver sistemas nuevos aquí). `null` = circuito no válido.
   */
  obtenerEstado: (dtS: number) => EstadoElectrico | null;
  /** Nombre accesible del lienzo (descripción corta del circuito). */
  etiqueta: string;
  pie?: ReactNode;
}

const claveSonda = (s: PosicionSonda | null) => (s ? `${s.tramo}|${s.t.toFixed(3)}` : "");

/**
 * Alto que la página deja al lienzo: el valor de `--alto-lienzo` (definido en `.pagina-circuitos`, p. ej.
 * `calc(100svh - 150px)` o `44svh`) resuelto a píxeles con un elemento de medida temporal.
 */
function altoDisponibleCss(zona: HTMLElement): number {
  const sonda = document.createElement("div");
  sonda.style.cssText = "position:absolute;visibility:hidden;pointer-events:none;width:0;height:var(--alto-lienzo, 60svh)";
  zona.appendChild(sonda);
  const alto = sonda.getBoundingClientRect().height;
  sonda.remove();
  return alto > 0 ? alto : window.innerHeight * 0.6;
}

export function CanvasCircuito({ arbol, dominio, conRCarga = false, disposicion = "arbol", obtenerEstado, etiqueta, pie }: PropsCanvasCircuito) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const zonaRef = useRef<HTMLDivElement>(null);
  const [tam, setTam] = useState<TamanoLienzo>({ ancho: 960, alto: 540 });
  const { ancho, alto } = tam;
  const escala = useEscalaCss(canvasRef, ancho, alto);
  const [anuncio, setAnuncio] = useState("");
  const idAyuda = useId();

  // Últimos valores de las props, leídos por el bucle sin reiniciarlo.
  const propsRef = useRef({ arbol, dominio, conRCarga, disposicion, obtenerEstado, ancho, alto });
  useEffect(() => {
    propsRef.current = { arbol, dominio, conRCarga, disposicion, obtenerEstado, ancho, alto };
  }, [arbol, dominio, conRCarga, disposicion, obtenerEstado, ancho, alto]);

  // Todo lo que cambia por fotograma vive aquí, fuera de React.
  const geomRef = useRef<GeometriaCircuito | null>(null);
  const particulasRef = useRef<Particulas | null>(null);
  const bufRef = useRef({ corr: new Float64Array(0), vel: new Float32Array(0) });
  const claveGeomRef = useRef("");
  const arbolVistoRef = useRef<Bloque | null>(null);
  const firmaArbolRef = useRef("");
  const sondaRef = useRef<PosicionSonda | null>(null);
  const arrastrandoRef = useRef(false);
  const ultimaLecturaRef = useRef<{ r: object | null; sonda: string }>({ r: null, sonda: "" });
  const ultimaPublicacionRef = useRef(-Infinity);

  const seleccionar = useCircuitosStore((s) => s.seleccionar);
  const setSonda = useCircuitosStore((s) => s.setSonda);
  const publicarLecturas = useCircuitosStore((s) => s.publicarLecturas);

  // Tamaño del lienzo = espacio disponible (estado de UI: cambia solo al cambiar la ventana, nunca por
  // fotograma ni por el circuito: así no salta al cambiar de preset).
  const recalcularTamano = useCallback(() => {
    const zona = zonaRef.current;
    if (!zona) return;
    const anchoZona = zona.getBoundingClientRect().width;
    if (anchoZona <= 0) return;
    const nuevo = tamanoLienzo(anchoZona, altoDisponibleCss(zona), window.innerWidth);
    setTam((t) => (t.ancho === nuevo.ancho && t.alto === nuevo.alto ? t : nuevo));
  }, []);

  useEffect(() => {
    const zona = zonaRef.current;
    if (!zona) return;
    const obs = new ResizeObserver(recalcularTamano);
    obs.observe(zona);
    window.addEventListener("resize", recalcularTamano);
    return () => {
      obs.disconnect();
      window.removeEventListener("resize", recalcularTamano);
    };
  }, [recalcularTamano]);

  // Gesto táctil: la página se desplaza (touch-action pan-y) salvo cuando el dedo empieza sobre el circuito,
  // que es donde se arrastra la sonda (mismo patrón que `useInteraccionEscena`).
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const alTocar = (e: TouchEvent) => {
      const g = geomRef.current;
      const t = e.touches[0];
      if (!g || !t || !e.cancelable) return;
      const r = canvas.getBoundingClientRect();
      if (r.width <= 0) return;
      const x = ((t.clientX - r.left) / r.width) * g.ancho;
      const y = ((t.clientY - r.top) / r.height) * g.alto;
      if (tramoCercano(g, x, y, RADIO_CAPTURA_CSS / (escala.escalaCssRef.current || 1))) e.preventDefault();
    };
    canvas.addEventListener("touchstart", alTocar, { passive: false });
    return () => canvas.removeEventListener("touchstart", alTocar);
  }, [escala.escalaCssRef]);

  // La sonda también cambia desde fuera (editar el árbol la borra): el store manda salvo mientras se arrastra.
  useEffect(() => {
    sondaRef.current = useCircuitosStore.getState().sonda;
    return useCircuitosStore.subscribe((s, previo) => {
      if (s.sonda === previo.sonda || arrastrandoRef.current) return;
      if (claveSonda(s.sonda) !== claveSonda(sondaRef.current)) sondaRef.current = s.sonda;
    });
  }, []);

  // Región viva: se anuncia lo que el visitante hace (selección, sonda), nunca cada tic de la simulación.
  useEffect(() => {
    const anunciador = crearAnunciador({
      emitir: setAnuncio,
      ahora: () => performance.now(),
      fijar: (cb, ms) => window.setTimeout(cb, ms),
      cancelar: (id) => window.clearTimeout(id),
    });
    let pendiente = 0;
    const unsub = useCircuitosStore.subscribe((s, previo) => {
      const cambioSonda = s.sonda !== previo.sonda && s.sonda !== null;
      const cambioSel = s.seleccion !== previo.seleccion && s.seleccion !== null;
      if (!cambioSonda && !cambioSel) return;
      window.clearTimeout(pendiente);
      // Espera un momento a que el lienzo publique la lectura de la nueva posición.
      pendiente = window.setTimeout(() => {
        const e = useCircuitosStore.getState();
        if (cambioSonda && e.lecturaSonda) anunciador.proponer(anuncioSonda(e.lecturaSonda));
        else if (cambioSel && e.seleccion) {
          const hoja = e.lecturas?.elementos[e.seleccion];
          const tipo = e.dominio;
          const valor = hojasValor(e.arbol, e.seleccion);
          if (valor !== null) anunciador.proponer(anuncioElemento(e.seleccion, tipo, valor, hoja));
        }
      }, 180);
    });
    return () => {
      unsub();
      window.clearTimeout(pendiente);
      anunciador.destruir();
    };
  }, []);

  // Bucle de simulación + dibujo propio.
  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;

    const consultaMovimiento = window.matchMedia("(prefers-reduced-motion: reduce)");
    let menosMovimiento = consultaMovimiento.matches;
    const alCambiarMovimiento = () => {
      menosMovimiento = consultaMovimiento.matches;
    };
    consultaMovimiento.addEventListener("change", alCambiarMovimiento);

    let textos: DatosDibujo["textos"] = null;
    let valores: Record<string, string> = {};
    let placas: Record<string, number> = {};
    let textoBateria = "";
    let textoSel: Record<string, string> = {};
    let ultimo = performance.now();
    let idFrame = 0;

    function asegurarGeometria(): GeometriaCircuito {
      const p = propsRef.current;
      const escalaCss = escala.escalaCssRef.current || 1;
      // ≥ 12 px CSS reales: nunca se encoge el texto por debajo; si no cabe se reduce el contenido.
      const fuenteMin = Math.round(Math.min(24, Math.max(12, 12 / escalaCss)) * 2) / 2;
      if (p.arbol !== arbolVistoRef.current) {
        arbolVistoRef.current = p.arbol;
        // Solo la estructura cambia la geometría; editar un valor crea otro árbol pero no la mueve.
        firmaArbolRef.current = JSON.stringify(p.arbol, (k, v) => (k === "valor" ? undefined : v));
      }
      const clave = `${p.disposicion}|${p.dominio}|${p.conRCarga}|${p.ancho}x${p.alto}|${fuenteMin}|${firmaArbolRef.current}`;
      if (clave !== claveGeomRef.current || !geomRef.current) {
        claveGeomRef.current = clave;
        const rect = { ancho: p.ancho, alto: p.alto };
        const g =
          p.disposicion === "puente"
            ? distribuirPuente(rect, { fuenteMin })
            : distribuirCircuito(p.arbol, p.dominio, rect, { rCarga: p.conRCarga, fuenteMin });
        geomRef.current = g;
        particulasRef.current = crearParticulas(g);
        bufRef.current = { corr: new Float64Array(g.tramos.length), vel: new Float32Array(g.tramos.length) };
        ultimaLecturaRef.current = { r: null, sonda: "" };
        ultimaPublicacionRef.current = -Infinity;
      }
      return geomRef.current;
    }

    function frame() {
      const ahora = performance.now();
      const dt = Math.min(Math.max((ahora - ultimo) / 1000, 0), MAX_DT_FRAME_S);
      ultimo = ahora;
      const g = asegurarGeometria();
      const estado = propsRef.current.obtenerEstado(dt);
      const { verElectrones, seleccion } = useCircuitosStore.getState();

      let sondaLect: LecturaSondaCircuito | null = null;
      let corr: Float64Array = bufRef.current.corr;
      let iRef = 0;

      if (estado) {
        iRef = estado.iRef;
        corr = corrientesTramos(g, estado.r, bufRef.current.corr);
        const vel = velocidadesTramos(g, corr, estado.iRef, estado.suelo, bufRef.current.vel);
        if (!menosMovimiento && particulasRef.current) {
          avanzarParticulas(particulasRef.current, g, vel, dt, verElectrones ? -1 : 1);
        }
        if (sondaRef.current) sondaLect = leerSonda(g, estado.net, estado.r, sondaRef.current);

        const clave = claveSonda(sondaRef.current);
        const cambio = ultimaLecturaRef.current.r !== estado.r || ultimaLecturaRef.current.sonda !== clave;
        if (cambio && ahora - ultimaPublicacionRef.current >= INTERVALO_LECTURA_MS) {
          ultimaPublicacionRef.current = ahora;
          ultimaLecturaRef.current = { r: estado.r, sonda: clave };
          const lect = lecturasElementos(estado.net, estado.r);
          textos = textosElementos(lect);
          valores = {};
          placas = {};
          for (const el of estado.net.elementos) {
            if (el.tipo === "V") continue;
            valores[el.id] = textoValorElemento(el.tipo, el.valor);
            const q = estado.q?.[el.id];
            if (el.tipo === "C" && q !== undefined && estado.qRef) {
              placas[el.id] = Math.sign(q) * cargasEnPlaca(q, estado.qRef);
            }
          }
          const fuente = estado.net.elementos.find((x) => x.tipo === "V");
          textoBateria = fuente ? formatearSI(fuente.valor, "V") : "";
          textoSel = {};
          for (const [id, t] of Object.entries(textos)) textoSel[id] = `${id} ${valores[id] ?? ""} · ${t.v} · ${t.i}`;
          publicarLecturas({ elementos: lect, iBat: estado.r.iBat, pBat: potenciaBateria(estado.net, estado.r) }, sondaLect);
        }
      }

      const datos: DatosDibujo = {
        textos,
        valores,
        corrientes: corr,
        iRef,
        particulas: particulasRef.current,
        seleccion,
        placas,
        textoBateria,
        sonda: sondaLect ? { x: sondaLect.x, y: sondaLect.y } : null,
        textoSeleccion: seleccion ? (textoSel[seleccion] ?? null) : null,
      };
      dibujarCircuito(ctx as CanvasRenderingContext2D, g, datos, {
        verElectrones,
        movimientoReducido: menosMovimiento,
        escalaCss: escala.escalaCssRef.current || 1,
      });
      idFrame = requestAnimationFrame(frame);
    }

    idFrame = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(idFrame);
      consultaMovimiento.removeEventListener("change", alCambiarMovimiento);
    };
  }, [escala.escalaCssRef, publicarLecturas]);

  // ---- Puntero y teclado --------------------------------------------------------------------------------
  const aLogico = useCallback((e: PointerEvent<HTMLCanvasElement>) => {
    const c = canvasRef.current;
    const p = propsRef.current;
    if (!c) return null;
    const r = c.getBoundingClientRect();
    if (r.width <= 0) return null;
    return { x: ((e.clientX - r.left) / r.width) * p.ancho, y: ((e.clientY - r.top) / r.height) * p.alto };
  }, []);

  const colocarSonda = useCallback(
    (e: PointerEvent<HTMLCanvasElement>, inicio: boolean) => {
      const g = geomRef.current;
      const pt = aLogico(e);
      if (!g || !pt) return;
      const hit = tramoCercano(g, pt.x, pt.y, RADIO_CAPTURA_CSS / (escala.escalaCssRef.current || 1));
      if (hit) {
        sondaRef.current = { tramo: hit.tramo.id, t: hit.t };
        if (inicio && hit.tramo.elemento) seleccionar(hit.tramo.elemento);
        return;
      }
      if (!inicio) return;
      const dentro = g.elementos.find(
        (el) => pt.x >= el.celda.x && pt.x <= el.celda.x + el.celda.w && pt.y >= el.celda.y && pt.y <= el.celda.y + el.celda.h,
      );
      if (dentro) seleccionar(dentro.id);
      else sondaRef.current = null;
    },
    [aLogico, escala.escalaCssRef, seleccionar],
  );

  const alBajar = (e: PointerEvent<HTMLCanvasElement>) => {
    if (e.button !== 0 && e.pointerType === "mouse") return;
    e.currentTarget.setPointerCapture(e.pointerId);
    arrastrandoRef.current = true;
    colocarSonda(e, true);
    setSonda(sondaRef.current);
  };
  const alMover = (e: PointerEvent<HTMLCanvasElement>) => {
    if (arrastrandoRef.current) colocarSonda(e, false);
  };
  const alSoltar = (e: PointerEvent<HTMLCanvasElement>) => {
    if (!arrastrandoRef.current) return;
    arrastrandoRef.current = false;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
    setSonda(sondaRef.current);
  };

  const alTeclear = (e: KeyboardEvent<HTMLCanvasElement>) => {
    const g = geomRef.current;
    if (!g) return;
    const actual = sondaRef.current;
    let nueva: PosicionSonda | null | undefined;
    switch (e.key) {
      case "ArrowDown":
      case "ArrowUp": {
        const id = tramoVecino(g, actual?.tramo ?? null, e.key === "ArrowDown" ? 1 : -1);
        nueva = id ? { tramo: id, t: 0.5 } : null;
        break;
      }
      case "ArrowRight":
      case "ArrowLeft": {
        const base = actual ?? (g.tramos[0] ? { tramo: g.tramos[0].id, t: 0.5 } : null);
        if (!base) return;
        const t = Math.min(1, Math.max(0, base.t + (e.key === "ArrowRight" ? PASO_TECLADO : -PASO_TECLADO)));
        nueva = { tramo: base.tramo, t };
        break;
      }
      case "Escape":
        nueva = null;
        break;
      default:
        return;
    }
    e.preventDefault();
    sondaRef.current = nueva ?? null;
    setSonda(nueva ?? null);
    const dueno = nueva ? g.tramos.find((t) => t.id === nueva.tramo)?.elemento : undefined;
    if (dueno) seleccionar(dueno);
  };

  // Lógico = CSS: ancho fijo en px (acotado por la zona) y proporción de los atributos.
  const estilo = { width: `${ancho}px`, maxWidth: "100%", aspectRatio: `${ancho} / ${alto}` };

  return (
    <figure className="circuito-figura">
      <div ref={zonaRef} className="circuito-zona">
        <canvas
          ref={canvasRef}
          className="lienzo circuito-lienzo"
          width={ancho}
          height={alto}
          role="img"
          tabIndex={0}
          aria-label={etiqueta}
          aria-describedby={idAyuda}
          style={estilo}
          onPointerDown={alBajar}
          onPointerMove={alMover}
          onPointerUp={alSoltar}
          onPointerCancel={alSoltar}
          onKeyDown={alTeclear}
        />
      </div>
      <p id={idAyuda} className="sr-only">
        Toca un elemento para ver sus datos y arrastra para medir con la sonda en cualquier punto del cable. Con
        teclado: flechas arriba y abajo cambian de tramo, flechas izquierda y derecha deslizan la sonda y Escape la quita.
      </p>
      <div className="sr-only" role="status" aria-live="polite">
        {anuncio}
      </div>
      {pie}
    </figure>
  );
}

function hojasValor(arbol: Bloque, id: string): number | null {
  if (arbol.t === "e") return arbol.id === id ? arbol.valor : null;
  for (const h of arbol.hijos) {
    const v = hojasValor(h, id);
    if (v !== null) return v;
  }
  return null;
}

