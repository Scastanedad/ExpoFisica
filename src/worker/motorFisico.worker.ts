/**
 * Motor físico N-cuerpos electrostático en un Web Worker. Toda la física está
 * en `fisica/dinamica.ts` (funciones puras, con tests); este archivo solo
 * conserva el estado, atiende los mensajes de la UI y lleva el reloj.
 *
 * Reloj (E2.2 §4): un acumulador con `performance.now()` en segundos de
 * SIMULACIÓN. `setInterval(8 ms)` solo despierta el bucle; la física no depende
 * de su frecuencia real (en Windows puede dispararse a ~64 Hz). Cada tick se
 * ejecutan los sub-pasos de `DT_SUB` que corresponden al tiempo real
 * transcurrido × σ × velocidad, con recorte del tiempo real y un presupuesto de
 * CPU por tick. Cada sub-paso es un `pasoAvance` (dinamica.ts): velocity Verlet
 * con sub-división automática cerca de las paredes y con cargas grandes, que no
 * cambia el reloj (el contador sigue siendo de `DT_SUB`).
 *
 * Solo el mensaje "frame" cruza el hilo con un Float32Array transferible; el
 * estado usa arrays planos de JS (decisión vigente en EFmem/decisiones.md).
 * Protocolo de mensajes: `worker/protocolo.ts`.
 */
import {
  DT_SUB,
  VELOCIDAD_MAX,
  VELOCIDAD_MIN,
  agarrarCarga,
  agregarCarga,
  aplicarCambioCarga,
  crearSistema,
  derivaNormalizada,
  energias,
  evaluarAviso,
  inicializarSistema,
  moverCarga,
  pasoAvance,
  planificarSubpasos,
  quitarCarga,
  soltarConVelocidadPuntero,
} from "../fisica/dinamica";
import type { MensajeAlWorker, MensajeDelWorker } from "./protocolo";

// Anula la firma de postMessage heredada de lib.dom (pensada para
// Window.postMessage con targetOrigin) por la firma real de un Worker.
declare const postMessage: (message: unknown, transfer?: Transferable[]) => void;

const INTERVALO_TICK_MS = 8; // despertador; la física NO depende de él
const INTERVALO_ENERGIA_MS = 250; // ~4 Hz, medido con performance.now()
const PRESUPUESTO_TICK_MS = 12; // salvaguarda de CPU: si se supera, se descarta el remanente

const sis = crearSistema(700, 500);
let enPausa = false;
let velocidad = 1;
let acumSim = 0;
let sucio = true;
let ultimoTickMs = performance.now();
let ultimaEnergiaMs = ultimoTickMs;
/** Rearmado tras cada intervención: la referencia de energía cambió (evaluarAviso). */
let aviso = { armado: true };
// Contadores de diagnóstico (?debug) desde el último mensaje de energía.
let ticksDesdeEnergia = 0;
let subpasosDesdeEnergia = 0;

function enviar(mensaje: MensajeDelWorker, transfer?: Transferable[]) {
  postMessage(mensaje, transfer);
}

function enviarOrden() {
  enviar({ tipo: "orden", ids: [...sis.ids] });
}

function enviarFrame() {
  const n = sis.x.length;
  const posiciones = new Float32Array(n * 2);
  for (let i = 0; i < n; i++) {
    posiciones[i * 2] = sis.x[i];
    posiciones[i * 2 + 1] = sis.y[i];
  }
  enviar({ tipo: "frame", posiciones }, [posiciones.buffer]);
}

function publicarEnergia(ahora: number) {
  const e = energias(sis);
  const deriva = derivaNormalizada(sis);
  const segundos = Math.max(1e-3, (ahora - ultimaEnergiaMs) / 1000);
  enviar({
    tipo: "energia",
    cinetica: e.cinetica,
    potencial: e.potencial,
    total: e.total,
    escala: e.escala,
    deriva,
    trabajoExterno: sis.trabajoExterno,
    intervenciones: sis.intervenciones,
    ticksPorS: ticksDesdeEnergia / segundos,
    subpasosPorS: subpasosDesdeEnergia / segundos,
  });
  ticksDesdeEnergia = 0;
  subpasosDesdeEnergia = 0;

  // Con la corrección de bordes de E2.2 no debería dispararse (máx. medido
  // 1.5 % en una hora): si ocurre es un defecto, no algo que el visitante pueda
  // resolver, así que solo se avisa por consola (una vez por episodio).
  const r = evaluarAviso(aviso, deriva);
  aviso = { armado: r.armado };
  if (r.disparar) {
    console.warn(
      `[motorFisico] deriva de energía ${(deriva * 100).toFixed(1)} % (${sis.ids.length} cargas, ×${velocidad}) -- posible inestabilidad numérica`,
    );
  }
}

function tick() {
  const ahora = performance.now();
  const dtReal = (ahora - ultimoTickMs) / 1000;
  ultimoTickMs = ahora; // se actualiza SIEMPRE, también en pausa
  ticksDesdeEnergia++;

  let n = 0;
  if (!enPausa) {
    const plan = planificarSubpasos(acumSim, dtReal, velocidad);
    acumSim = plan.acum;
    n = plan.n;
    let hechos = 0;
    for (let k = 0; k < n; k++) {
      pasoAvance(sis, DT_SUB);
      hechos++;
      if ((k & 15) === 15 && performance.now() - ahora > PRESUPUESTO_TICK_MS) {
        acumSim = 0;
        break;
      }
    }
    subpasosDesdeEnergia += hechos;
  } else {
    acumSim = 0;
  }

  // Frame solo si algo cambió (en pausa se sigue enviando si el visitante mueve o cambia cargas).
  if (n > 0 || sucio) {
    enviarFrame();
    sucio = false;
  }
  if (ahora - ultimaEnergiaMs >= INTERVALO_ENERGIA_MS) {
    publicarEnergia(ahora);
    ultimaEnergiaMs = ahora;
  }
}

/** Tras cualquier intervención del visitante: frame nuevo y aviso de deriva rearmado. */
function alIntervenir() {
  sucio = true;
  aviso = { armado: true };
}

addEventListener("message", (evento: MessageEvent<MensajeAlWorker>) => {
  const datos = evento.data;

  switch (datos.tipo) {
    case "init": {
      sis.ancho = datos.ancho;
      sis.alto = datos.alto;
      inicializarSistema(sis, datos.cargas);
      acumSim = 0;
      ultimoTickMs = performance.now();
      alIntervenir();
      enviarOrden();
      break;
    }
    case "agregarCarga":
      if (agregarCarga(sis, datos.id, datos.q, datos.masa)) {
        alIntervenir();
        enviarOrden();
      }
      break;
    case "quitarCarga":
      if (quitarCarga(sis, datos.id)) {
        alIntervenir();
        enviarOrden();
      }
      break;
    case "moverCarga":
      if (moverCarga(sis, datos.id, datos.x, datos.y)) alIntervenir();
      break;
    case "agarrarCarga":
      if (agarrarCarga(sis, datos.id)) alIntervenir();
      break;
    case "soltarCarga":
      if (soltarConVelocidadPuntero(sis, datos.id, datos.vx, datos.vy)) alIntervenir();
      break;
    case "cambiarCarga":
      if (aplicarCambioCarga(sis, datos.id, datos.q)) alIntervenir();
      else console.warn(`[motorFisico] cambiarCarga ignorado (id ${datos.id}, q ${datos.q})`);
      break;
    case "pausa":
      enPausa = datos.valor;
      break;
    case "velocidad":
      if (Number.isFinite(datos.valor)) {
        velocidad = Math.min(VELOCIDAD_MAX, Math.max(VELOCIDAD_MIN, datos.valor));
      }
      break;
  }
});

setInterval(tick, INTERVALO_TICK_MS);
