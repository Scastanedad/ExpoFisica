import { useEffect, useRef, useState } from "react";
import { ajustarDprCanvas } from "../../graficas/ajustarDprCanvas";
import {
  ALTO_GRAFICA_RC,
  ALTO_GRAFICA_RC_SALA,
  ANCHO_GRAFICA_RC,
  ANCHO_GRAFICA_RC_SALA,
  dibujarGraficaRC,
  pieGraficaRC,
} from "../../graficas/dibujoGraficaRC";
import { COLOR_K, COLOR_SECUNDARIO } from "../../graficas/dibujoGrafica";
import type { ModoInterruptor, SimulacionRC } from "../../render/circuitos/simulacionRC";
import { rotuloCorriente } from "./textosE7";

interface Props {
  sim: SimulacionRC;
  modo: ModoInterruptor;
}

/**
 * Gráfica V(t) e I(t) en TIEMPO REAL. Canvas propio con su propio `requestAnimationFrame` (como el lienzo del
 * circuito); lee el historial del `SimulacionRC` (un ref fuera de React) y solo redibuja cuando llega una
 * muestra nueva o cambia algo visible. A React solo sube el texto del pie (cuando cambia la escala).
 */
export function GraficaRC({ sim, modo }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [pie, setPie] = useState("");
  // En sala (≥ 1600 px) el lienzo se redibuja más grande en vez de estirarse.
  const [sala, setSala] = useState(() => window.matchMedia("(min-width: 1600px)").matches);
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1600px)");
    const alCambiar = () => setSala(mq.matches);
    mq.addEventListener("change", alCambiar);
    return () => mq.removeEventListener("change", alCambiar);
  }, []);
  const ancho = sala ? ANCHO_GRAFICA_RC_SALA : ANCHO_GRAFICA_RC;
  const alto = sala ? ALTO_GRAFICA_RC_SALA : ALTO_GRAFICA_RC;
  const modoRef = useRef(modo);
  useEffect(() => {
    modoRef.current = modo;
  }, [modo]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let id = 0;
    let firma = "";
    let pieActual = "";
    const frame = () => {
      const p = sim.parametros;
      const h = sim.historial;
      if (p) {
        const tUlt = h.n > 0 ? h.t[h.n - 1] : 0;
        const rotuloI = `Corriente ${rotuloCorriente(modoRef.current, h.n > 0 ? h.i[h.n - 1] : 0)}`;
        const f = `${ancho}|${h.n}|${tUlt}|${p.E}|${p.rCarga}|${rotuloI}`;
        if (f !== firma) {
          firma = f;
          const ctx = ajustarDprCanvas(canvas, ancho, alto);
          if (ctx) {
            dibujarGraficaRC(ctx, ancho, alto, {
              t: h.t,
              v: h.v,
              i: h.i,
              n: h.n,
              tau: sim.tauReal,
              E: p.E,
              iRef: p.E / p.rCarga,
              rotuloI,
            });
          }
          const nuevoPie = pieGraficaRC(sim.tauReal, tUlt);
          if (nuevoPie !== pieActual) {
            pieActual = nuevoPie;
            setPie(nuevoPie);
          }
        }
      }
      id = requestAnimationFrame(frame);
    };
    id = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(id);
  }, [sim, ancho, alto]);

  return (
    <section className="panel-grafica grafica-rc" aria-label="Gráfica de voltaje y corriente contra el tiempo">
      <h3 className="panel-circuito-titulo">Voltaje y corriente en el tiempo</h3>
      <canvas
        ref={canvasRef}
        width={ancho}
        height={alto}
        className="lienzo-grafica lienzo-grafica-rc"
        role="img"
        aria-label="Gráfica del voltaje de los capacitores y de la corriente contra el tiempo real. Los mismos valores están en los totales y en la tabla."
      />
      <ul className="panel-grafica-leyenda">
        <li>
          <span className="muestra-color" style={{ backgroundColor: COLOR_K, color: COLOR_K }} /> Voltaje
        </li>
        <li>
          <span className="muestra-color" style={{ backgroundColor: COLOR_SECUNDARIO, color: COLOR_SECUNDARIO }} /> Corriente
        </li>
      </ul>
      <p className="panel-grafica-nota">{pie}</p>
    </section>
  );
}
