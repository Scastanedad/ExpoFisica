/**
 * Controles de la Estación 04 (Conductores y aislantes): voltaje entre las
 * placas, orientación y polaridad (mismo campo externo E5.0 que la Estación
 * 03), pausa y reinicio. Todo lo que se cambia aquí es estado de UI
 * (`store/materialesStore.ts`); las posiciones de los electrones no pasan por
 * este panel (`ControladorMateriales` solo expone `reiniciar`).
 *
 * Accesibilidad: todo es operable con teclado (sliders y botones nativos, el
 * selector de orientación es el `radiogroup` con flechas de `SelectorSegmentado`),
 * cada control mide >= 44 px y el foco es visible (`:focus-visible` global).
 * Hay DOS regiones `aria-live="polite"` separadas:
 *  - confirmación: responde de inmediato al gesto (polaridad, orientación,
 *    pausa, reinicio) y, para el deslizador, ~0,6 s después del último paso;
 *  - resultado: el porcentaje de campo dentro de cada material, solo cuando
 *    las lecturas se estabilizan (no en cada frame) y nunca en pausa.
 *
 * El control de voltaje ({@link ControlVoltaje}) se monta dos veces: en este
 * panel (pantalla ancha) y en una barra fija al pie del viewport sobre los
 * lienzos (pantalla angosta). CSS muestra solo una de las dos.
 */
import { useEffect, useId, useRef, useState, type KeyboardEvent, type RefObject } from "react";
import type { OrientacionPlacas } from "../fisica/campoExterno";
import { formatSI } from "../fisica/escala";
import {
  SEPARACION_PLACAS_M,
  VOLTAJE_MAX_KV,
  VOLTAJE_MIN_KV,
  VOLTAJE_PASO_KV,
} from "../fisica/materiales";
import type { ControladorMateriales } from "../render/CanvasMateriales";
import { useMaterialesStore } from "../store/materialesStore";
import { SelectorSegmentado, type OpcionSegmentada } from "./SelectorSegmentado";

/** Espera sin mover el deslizador antes de confirmarlo en voz alta. */
const RETARDO_VOLTAJE_MS = 600;
/** El resultado no se anuncia antes de esto (que la confirmación vaya primero)... */
const RESULTADO_MIN_MS = 900;
/** ...ni después de esto, aunque las lecturas sigan moviéndose un poco. */
const RESULTADO_MAX_MS = 3000;
/** Lecturas estables: |Δ(|E_int|/E0)| por debajo de 0,5 % en 3 publicaciones seguidas. */
const UMBRAL_ESTABLE = 0.005;
const LECTURAS_ESTABLES = 3;

const ORIENTACIONES: readonly OpcionSegmentada<OrientacionPlacas>[] = [
  { valor: "vertical", etiqueta: "Arriba y abajo", descripcion: "placas horizontales, una arriba y otra abajo: el campo apunta en vertical" },
  { valor: "horizontal", etiqueta: "A los lados", descripcion: "placas verticales, una a cada lado: el campo apunta en horizontal" },
];

/** Dónde queda la placa positiva, en texto completo y abreviado (según orientación y polaridad). */
function lugarPlacaPositiva(o: OrientacionPlacas, polaridad: 1 | -1): { largo: string; corto: string } {
  if (o === "vertical") {
    return polaridad === 1 ? { largo: "arriba", corto: "arriba" } : { largo: "abajo", corto: "abajo" };
  }
  return polaridad === 1
    ? { largo: "a la izquierda", corto: "izq." }
    : { largo: "a la derecha", corto: "der." };
}

function porcentaje(razon: number): string {
  const p = razon * 100;
  return `${p < 10 ? p.toFixed(1) : p.toFixed(0)} %`;
}

/** Coma decimal para el texto que lee un lector de pantalla. */
function coma(texto: string): string {
  return texto.replace(".", ",");
}

/** E₀ = U / d con d = 10 cm: cada 100 kV son 1 MV/m. */
function campoHablado(voltajeKV: number): string {
  const mv = voltajeKV / 100;
  return `${coma(mv.toFixed(1).replace(/\.0$/, ""))} ${mv === 1 ? "megavoltio" : "megavoltios"} por metro`;
}

/** Si el texto no cambia entre dos anuncios seguidos, un lector de pantalla no lo repite: se le añade un espacio duro. */
function siguienteAnuncio(previo: string, texto: string): string {
  return previo === texto ? `${texto} ` : texto;
}

const TECLAS_DESLIZADOR = new Set(["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End", "PageUp", "PageDown"]);

function soltarDeslizador(): void {
  useMaterialesStore.getState().setAjustandoVoltaje(false);
}

/** Deslizador de voltaje con su valor. Marca "ajustando" mientras se sostiene (movimiento reducido: asentar al soltar). */
export function ControlVoltaje() {
  const voltajeKV = useMaterialesStore((s) => s.voltajeKV);
  const setVoltajeKV = useMaterialesStore((s) => s.setVoltajeKV);
  const setAjustandoVoltaje = useMaterialesStore((s) => s.setAjustandoVoltaje);

  function alAgarrar() {
    setAjustandoVoltaje(true);
    // Red de seguridad: soltar fuera del deslizador también termina el ajuste.
    window.addEventListener("pointerup", soltarDeslizador, { once: true });
    window.addEventListener("pointercancel", soltarDeslizador, { once: true });
  }

  function alPulsarTecla(e: KeyboardEvent<HTMLInputElement>) {
    if (TECLAS_DESLIZADOR.has(e.key)) setAjustandoVoltaje(true);
  }

  return (
    <label className="materiales-deslizador">
      <span>Voltaje entre las placas (U)</span>
      <output>{voltajeKV} kV</output>
      <input
        type="range"
        min={VOLTAJE_MIN_KV}
        max={VOLTAJE_MAX_KV}
        step={VOLTAJE_PASO_KV}
        value={voltajeKV}
        aria-valuetext={`${voltajeKV} kilovoltios`}
        onChange={(e) => setVoltajeKV(Number(e.target.value))}
        onPointerDown={alAgarrar}
        onKeyDown={alPulsarTecla}
        onKeyUp={soltarDeslizador}
        onBlur={soltarDeslizador}
      />
    </label>
  );
}

interface Props {
  controladorRef: RefObject<ControladorMateriales | null>;
}

export function PanelMateriales({ controladorRef }: Props) {
  const orientacionPlacas = useMaterialesStore((s) => s.orientacionPlacas);
  const polaridadPlacas = useMaterialesStore((s) => s.polaridadPlacas);
  const voltajeKV = useMaterialesStore((s) => s.voltajeKV);
  const enPausa = useMaterialesStore((s) => s.enPausa);
  const ajustandoVoltaje = useMaterialesStore((s) => s.ajustandoVoltaje);
  const setOrientacionPlacas = useMaterialesStore((s) => s.setOrientacionPlacas);
  const alternarPolaridadPlacas = useMaterialesStore((s) => s.alternarPolaridadPlacas);
  const togglePausa = useMaterialesStore((s) => s.togglePausa);

  const [confirmacion, setConfirmacion] = useState("");
  const [resultado, setResultado] = useState("");
  /** Cuenta de reinicios: forma parte de la "clave" que dispara un nuevo anuncio de resultado. */
  const [reinicios, setReinicios] = useState(0);
  const idPolaridad = useId();

  function confirmar(texto: string) {
    setConfirmacion((previo) => siguienteAnuncio(previo, texto));
  }

  // (a) Confirmación del deslizador, con retardo: no se anuncia cada paso mientras se arrastra.
  const voltajeConfirmadoRef = useRef(voltajeKV);
  useEffect(() => {
    if (voltajeConfirmadoRef.current === voltajeKV) return;
    const id = window.setTimeout(() => {
      voltajeConfirmadoRef.current = voltajeKV;
      setConfirmacion((previo) =>
        siguienteAnuncio(previo, `${voltajeKV} kilovoltios, campo externo ${campoHablado(voltajeKV)}.`),
      );
    }, RETARDO_VOLTAJE_MS);
    return () => window.clearTimeout(id);
  }, [voltajeKV]);

  // (b) Resultado: cuando las lecturas se estabilizan tras un cambio del campo (o un reinicio).
  const claveCampo = `${voltajeKV}|${orientacionPlacas}|${polaridadPlacas}|${reinicios}`;
  const claveAnunciadaRef = useRef(claveCampo);
  useEffect(() => {
    // Nada se anuncia en pausa (las lecturas no cambian) ni mientras se sostiene el deslizador.
    if (enPausa || ajustandoVoltaje) return;
    if (claveAnunciadaRef.current === claveCampo) return;
    const reducido = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const t0 = performance.now();
    let previo: [number, number] | null = null;
    let estables = 0;
    let hecho = false;

    const anunciar = () => {
      const l = useMaterialesStore.getState().lectura;
      if (hecho || !l) return;
      hecho = true;
      claveAnunciadaRef.current = claveCampo;
      const texto = `Con ${voltajeKV} kilovoltios, el campo dentro del conductor es el ${coma(porcentaje(l.conductor.razon))} del externo y dentro del aislante, el ${coma(porcentaje(l.aislante.razon))}.`;
      setResultado((anterior) => siguienteAnuncio(anterior, texto));
    };

    const cancelarSuscripcion = useMaterialesStore.subscribe((s, anterior) => {
      const l = s.lectura;
      if (!l || l === anterior.lectura) return;
      const razones: [number, number] = [l.conductor.razon, l.aislante.razon];
      if (previo && Math.abs(razones[0] - previo[0]) < UMBRAL_ESTABLE && Math.abs(razones[1] - previo[1]) < UMBRAL_ESTABLE) {
        estables++;
      } else {
        estables = 0;
      }
      previo = razones;
      if (estables >= LECTURAS_ESTABLES && performance.now() - t0 >= RESULTADO_MIN_MS) anunciar();
    });
    // Movimiento reducido: el material se asienta de golpe, así que el resultado ya es el definitivo.
    const idTope = window.setTimeout(anunciar, reducido ? RESULTADO_MIN_MS : RESULTADO_MAX_MS);
    return () => {
      cancelarSuscripcion();
      window.clearTimeout(idTope);
    };
  }, [claveCampo, voltajeKV, enPausa, ajustandoVoltaje]);

  function reiniciar() {
    controladorRef.current?.reiniciar();
    setReinicios((n) => n + 1);
    confirmar("Materiales reiniciados: cada electrón vuelve junto a su átomo y el campo se aplica de nuevo.");
  }

  function alPausar() {
    togglePausa();
    confirmar(enPausa ? "Simulación reanudada." : "Simulación en pausa.");
  }

  function elegirOrientacion(o: OrientacionPlacas) {
    if (o === orientacionPlacas) return;
    setOrientacionPlacas(o);
    confirmar(
      `Placas ${o === "vertical" ? "arriba y abajo" : "a los lados"}. La placa positiva queda ${lugarPlacaPositiva(o, polaridadPlacas).largo}.`,
    );
  }

  function cambiarPolaridad() {
    const siguiente = polaridadPlacas === 1 ? -1 : 1;
    alternarPolaridadPlacas();
    confirmar(`La placa positiva queda ${lugarPlacaPositiva(orientacionPlacas, siguiente).largo}.`);
  }

  const e0SI = (voltajeKV * 1000) / SEPARACION_PLACAS_M;
  const placaPositiva = lugarPlacaPositiva(orientacionPlacas, polaridadPlacas);

  return (
    <section className="materiales-panel" aria-label="Controles del campo externo">
      <p className="sr-only" aria-live="polite">
        {confirmacion}
      </p>
      <p className="sr-only" aria-live="polite">
        {resultado}
      </p>

      <div className="materiales-grupo materiales-acciones">
        <button type="button" className="boton-pausa" onClick={alPausar}>
          {enPausa ? "Reanudar" : "Pausar"}
        </button>
        <button type="button" className="boton-pausa" onClick={reiniciar}>
          Reiniciar
        </button>
      </div>

      <div className="materiales-grupo">
        {/* En pantalla angosta el deslizador vive en la barra fija sobre los lienzos (ver Materiales.tsx). */}
        <div className="materiales-voltaje-escritorio">
          <ControlVoltaje />
        </div>
        <p className="materiales-dato">
          Campo externo (E₀ = U / d): <strong>{formatSI(e0SI, "N/C")}</strong>
          <span className="materiales-dato-nota">Placas separadas {SEPARACION_PLACAS_M * 100} cm</span>
        </p>
      </div>

      <div className="materiales-grupo">
        <span className="materiales-etiqueta" aria-hidden="true">
          Dónde están las placas
        </span>
        <SelectorSegmentado
          etiquetaGrupo="Dónde están las placas"
          opciones={ORIENTACIONES}
          valor={orientacionPlacas}
          alElegir={elegirOrientacion}
        />
        <button
          type="button"
          className="boton-colocar"
          aria-pressed={polaridadPlacas === -1}
          aria-describedby={idPolaridad}
          onClick={cambiarPolaridad}
        >
          Invertir polaridad <span aria-hidden="true">· + {placaPositiva.corto}</span>
        </button>
        <span id={idPolaridad} className="sr-only">
          La placa positiva está {placaPositiva.largo}.
        </span>
        <p className="materiales-ayuda">
          Los electrones (círculos grandes azules) son empujados hacia la placa positiva. Los átomos fijos (puntos
          rojos pequeños) no se mueven.
        </p>
      </div>
    </section>
  );
}
