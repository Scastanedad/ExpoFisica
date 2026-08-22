/**
 * Motor físico N-cuerpos electrostático: fuerza de Coulomb mutua entre todas
 * las cargas, integrada con velocity Verlet + softening (ver
 * .claude/skills/electromagnetismo-computacional/references/metodos_numericos.md).
 * Corre en un Web Worker para no competir con el hilo principal (mouse,
 * scroll, renderizado de React) -- ver
 * .claude/skills/arquitectura-simulaciones-web/references/motor_fisico_worker.md.
 *
 * A esta escala (decenas de cargas, no miles) unos arrays planos de JS son
 * más simples de mutar (agregar/quitar) que gestionar un Float32Array
 * redimensionable, y O(n²) por par sigue siendo trivial -- la skill de
 * arquitectura pide explícitamente no complicar la arquitectura de más hasta
 * que el perfilado lo exija. Solo el mensaje "frame" usa un Float32Array
 * transferible, que es lo que de verdad cruza el límite del hilo cada tick.
 */
import { K_VISUAL, SOFTENING2 } from "../fisica/coulomb";

// Anula la firma de postMessage heredada de lib.dom (pensada para
// Window.postMessage con targetOrigin) por la firma real de un Worker.
declare const postMessage: (message: unknown, transfer?: Transferable[]) => void;

const DT_FISICA = 1 / 120; // timestep fijo, independiente del framerate de pantalla
const INTERVALO_MS = 1000 / 120;
const INTERVALO_ENERGIA_MS = 250; // ~4Hz
const RADIO_CARGA = 14; // debe calzar con render/dibujarCargas.ts
const UMBRAL_DERIVA_ENERGIA = 0.08; // 8% de deriva relativa => señal de inestabilidad numérica

interface CargaEntrante {
  id: string;
  q: number;
  masa: number;
}

let ids: string[] = [];
let x: number[] = [];
let y: number[] = [];
let vx: number[] = [];
let vy: number[] = [];
let q: number[] = [];
let masa: number[] = [];

let ancho = 700;
let alto = 500;
let enPausa = false;
let velocidad = 1;
let energiaInicial: number | null = null;
let acumuladorEnergiaMs = 0;

function posicionAleatoria(): { x: number; y: number } {
  const margen = 60;
  return {
    x: margen + Math.random() * Math.max(1, ancho - margen * 2),
    y: margen + Math.random() * Math.max(1, alto - margen * 2),
  };
}

function calcularFuerzas(): { fx: number[]; fy: number[] } {
  const n = x.length;
  const fx = new Array<number>(n).fill(0);
  const fy = new Array<number>(n).fill(0);
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const dx = x[i] - x[j];
      const dy = y[i] - y[j];
      const r2 = dx * dx + dy * dy + SOFTENING2;
      const r = Math.sqrt(r2);
      const factor = (K_VISUAL * q[i] * q[j]) / (r2 * r);
      fx[i] += factor * dx;
      fy[i] += factor * dy;
      fx[j] -= factor * dx;
      fy[j] -= factor * dy;
    }
  }
  return { fx, fy };
}

/** Contención elástica en los bordes -- decisión de producto, no de las
 * skills: sin paredes, cargas del mismo signo saldrían del encuadre por
 * repulsión pura y no volverían nunca. */
function reflejarEnBordes(i: number) {
  const r = RADIO_CARGA;
  if (x[i] < r) {
    x[i] = r;
    vx[i] = Math.abs(vx[i]);
  } else if (x[i] > ancho - r) {
    x[i] = ancho - r;
    vx[i] = -Math.abs(vx[i]);
  }
  if (y[i] < r) {
    y[i] = r;
    vy[i] = Math.abs(vy[i]);
  } else if (y[i] > alto - r) {
    y[i] = alto - r;
    vy[i] = -Math.abs(vy[i]);
  }
}

function avanzarPaso(dt: number) {
  const n = x.length;
  if (n === 0) return;

  const f1 = calcularFuerzas();
  for (let i = 0; i < n; i++) {
    vx[i] += (f1.fx[i] / masa[i]) * (dt / 2);
    vy[i] += (f1.fy[i] / masa[i]) * (dt / 2);
  }
  for (let i = 0; i < n; i++) {
    x[i] += vx[i] * dt;
    y[i] += vy[i] * dt;
    reflejarEnBordes(i);
  }
  const f2 = calcularFuerzas();
  for (let i = 0; i < n; i++) {
    vx[i] += (f2.fx[i] / masa[i]) * (dt / 2);
    vy[i] += (f2.fy[i] / masa[i]) * (dt / 2);
  }
}

function energiaTotal(): number {
  const n = x.length;
  let cinetica = 0;
  for (let i = 0; i < n; i++) {
    cinetica += 0.5 * masa[i] * (vx[i] * vx[i] + vy[i] * vy[i]);
  }
  let potencial = 0;
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const dx = x[i] - x[j];
      const dy = y[i] - y[j];
      const r = Math.sqrt(dx * dx + dy * dy + SOFTENING2);
      potencial += (K_VISUAL * q[i] * q[j]) / r;
    }
  }
  return cinetica + potencial;
}

function enviarOrden() {
  postMessage({ tipo: "orden", ids: [...ids] });
}

function enviarFrame() {
  const n = x.length;
  const posiciones = new Float32Array(n * 2);
  for (let i = 0; i < n; i++) {
    posiciones[i * 2] = x[i];
    posiciones[i * 2 + 1] = y[i];
  }
  postMessage({ tipo: "frame", posiciones }, [posiciones.buffer]);
}

addEventListener("message", (evento: MessageEvent) => {
  const datos = evento.data;

  switch (datos.tipo) {
    case "init": {
      ancho = datos.ancho;
      alto = datos.alto;
      ids = [];
      x = [];
      y = [];
      vx = [];
      vy = [];
      q = [];
      masa = [];
      for (const c of datos.cargas as CargaEntrante[]) {
        const p = posicionAleatoria();
        ids.push(c.id);
        x.push(p.x);
        y.push(p.y);
        vx.push(0);
        vy.push(0);
        q.push(c.q);
        masa.push(c.masa);
      }
      energiaInicial = energiaTotal();
      enviarOrden();
      break;
    }
    case "agregarCarga": {
      const p = posicionAleatoria();
      ids.push(datos.id);
      x.push(p.x);
      y.push(p.y);
      vx.push(0);
      vy.push(0);
      q.push(datos.q);
      masa.push(datos.masa);
      // Agregar una carga cambia la energía "de referencia" a propósito --
      // recalibramos el punto de partida de la deriva desde aquí.
      energiaInicial = energiaTotal();
      enviarOrden();
      break;
    }
    case "quitarCarga": {
      const i = ids.indexOf(datos.id);
      if (i !== -1) {
        ids.splice(i, 1);
        x.splice(i, 1);
        y.splice(i, 1);
        vx.splice(i, 1);
        vy.splice(i, 1);
        q.splice(i, 1);
        masa.splice(i, 1);
        energiaInicial = energiaTotal();
        enviarOrden();
      }
      break;
    }
    case "moverCarga": {
      const i = ids.indexOf(datos.id);
      if (i !== -1) {
        x[i] = datos.x;
        y[i] = datos.y;
        vx[i] = 0;
        vy[i] = 0;
      }
      break;
    }
    case "pausa":
      enPausa = datos.valor;
      break;
    case "velocidad":
      velocidad = datos.valor;
      break;
  }
});

setInterval(() => {
  if (!enPausa) avanzarPaso(DT_FISICA * velocidad);
  enviarFrame();

  acumuladorEnergiaMs += INTERVALO_MS;
  if (acumuladorEnergiaMs >= INTERVALO_ENERGIA_MS) {
    acumuladorEnergiaMs = 0;
    const e = energiaTotal();
    postMessage({ tipo: "energia", valor: e });

    if (energiaInicial !== null && Math.abs(energiaInicial) > 1e-6) {
      const deriva = Math.abs(e - energiaInicial) / Math.abs(energiaInicial);
      if (deriva > UMBRAL_DERIVA_ENERGIA) {
        console.warn(
          `[motorFisico] deriva de energía ${(deriva * 100).toFixed(1)}% -- posible inestabilidad numérica`,
        );
      }
    }
  }
}, INTERVALO_MS);
