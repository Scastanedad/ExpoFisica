/**
 * Reloj y registro del transitorio RC de E7 (puro, sin DOM ni React). Envuelve al `Transitorio` del motor y
 * añade lo que la estación necesita y el motor no tiene:
 *
 * - tiempo dilatado: la pantalla avanza `dtVisual` y el circuito `dtVisual / F` (F = τ_vis/τ_real, spec §6);
 * - reinicio a descargado al cambiar un C o la topología (el motor lo hace; aquí se avisa), y continuidad al
 *   cambiar E, R_carga o el interruptor (se conserva v_ab de cada capacitor);
 * - historial de V(t) e I(t) en TIEMPO REAL, con decimación (nunca crece sin límite) para la gráfica;
 * - energías acumuladas desde el último reinicio y fase («cargando», «cargado», «descargando»…).
 *
 * Vive en un ref de la página: ni las muestras ni el estado del circuito pasan por React ni Zustand.
 */
import {
  ID_R_CARGA,
  equivalente,
  factorTiempo,
  tauRC,
  tauVisual,
  transitorioDeArbol,
  type Bloque,
  type Transitorio,
} from "../../fisica/circuitos";
import { estadoTransitorio, type EstadoElectrico } from "./estado";

/** Posiciones del interruptor que se exponen (el modo «abierto» existe en el motor pero no se muestra). */
export type ModoInterruptor = "cargar" | "descargar";

export interface ParametrosRC {
  arbol: Bloque;
  modo: ModoInterruptor;
  /** Voltaje de la batería [V]. */
  E: number;
  /** Resistor de carga [Ω]. */
  rCarga: number;
}

export type FaseRC = "descargado" | "cargando" | "cargado" | "descargando";

/** Capacidad del historial (muestras). Al llenarse se decima a la mitad y se duplica el intervalo. */
export const CAPACIDAD_HISTORIAL = 600;
/** Muestras iniciales por constante de tiempo. */
export const MUESTRAS_POR_TAU = 80;
/** Fracción de E a la que se considera «terminó de cargar» / «terminó de descargar». */
export const UMBRAL_FASE = 0.01;
/** Carga mínima (fracción de E) para decir que «hay carga acumulada». */
const UMBRAL_HAY_CARGA = 1e-6;

export interface HistorialRC {
  /** Tiempo real acumulado [s]. */
  t: Float64Array;
  /** Voltaje del conjunto de capacitores [V]. */
  v: Float32Array;
  /** Corriente por R_carga con signo (negativa = sentido invertido) [A]. */
  i: Float32Array;
  n: number;
}

export interface ResumenRC {
  /** Capacitancia equivalente de la red [F]. */
  cEq: number;
  tauReal: number;
  /** τ en pantalla [s]. */
  tauPantalla: number;
  factor: number;
  /** Voltaje de todo el conjunto de capacitores [V]. */
  vRed: number;
  /** Corriente con signo (a favor del sentido de carga) [A]. */
  i: number;
  /** Carga del capacitor equivalente [C]. */
  q: number;
  /** Energía almacenada ½·C_eq·V² [J]. */
  uAlmacenada: number;
  /** Energía entregada por la batería desde el último reinicio [J]. */
  eEntregada: number;
  /** Energía disipada en R_carga desde el último reinicio [J]. */
  eDisipada: number;
  fase: FaseRC;
  /** Tiempo real simulado desde el último reinicio [s]. */
  tiempoReal: number;
}

export interface ResultadoConfiguracion {
  /** Se creó un transitorio nuevo (cambió algo). */
  cambio: boolean;
  /** Había carga acumulada y se perdió: se cambió un C o la topología. */
  reiniciado: boolean;
}

function mismosParametros(a: ParametrosRC | null, b: ParametrosRC): boolean {
  return a !== null && a.arbol === b.arbol && a.modo === b.modo && a.E === b.E && a.rCarga === b.rCarga;
}

export class SimulacionRC {
  private tr: Transitorio | null = null;
  private params: ParametrosRC | null = null;
  private tau = 0;
  private factor = 1;
  private offset = 0;
  private eBatPrev = 0;
  private eDisPrev = 0;
  private intervalo = 0;
  private ultimaMuestra = -Infinity;
  private pasosVistos = 0;
  readonly historial: HistorialRC = {
    t: new Float64Array(CAPACIDAD_HISTORIAL),
    v: new Float32Array(CAPACIDAD_HISTORIAL),
    i: new Float32Array(CAPACIDAD_HISTORIAL),
    n: 0,
  };

  /**
   * Aplica los parámetros vigentes. Si son los mismos, no hace nada. Si cambiaron: cambiar E, R_carga o el
   * interruptor conserva la carga; cambiar un C o la topología la deja en cero (y se avisa en `reiniciado`).
   * Cambiar R_carga cambia τ: el historial (en tiempo real) se vacía para no mezclar escalas.
   */
  configurar(p: ParametrosRC): ResultadoConfiguracion {
    if (mismosParametros(this.params, p)) return { cambio: false, reiniciado: false };
    const previo = this.tr;
    const hayCarga = previo !== null && Object.values(previo.estado).some((v) => Math.abs(v) > UMBRAL_HAY_CARGA * p.E);
    const nuevo = transitorioDeArbol(p.arbol, { modo: p.modo, E: p.E, rCarga: p.rCarga }, previo);
    const queda = Object.values(nuevo.estado).some((v) => Math.abs(v) > UMBRAL_HAY_CARGA * p.E);
    const reiniciado = hayCarga && !queda;

    const tau = tauRC(p.arbol, p.rCarga, 0, p.modo);
    if (reiniciado || previo === null) {
      this.reiniciarContadores();
    } else {
      this.eBatPrev += previo.eBateria;
      this.eDisPrev += previo.eDisipada;
      this.offset += previo.t;
      if (Math.abs(tau - this.tau) > 1e-12 * this.tau) this.vaciarHistorial();
    }
    this.tr = nuevo;
    this.params = p;
    this.tau = tau;
    this.factor = factorTiempo(tau);
    this.intervalo = Math.max(this.intervalo, tau / MUESTRAS_POR_TAU);
    if (this.historial.n === 0) this.intervalo = tau / MUESTRAS_POR_TAU;
    this.pasosVistos = 0;
    return { cambio: true, reiniciado };
  }

  private reiniciarContadores(): void {
    this.offset = 0;
    this.eBatPrev = 0;
    this.eDisPrev = 0;
    this.vaciarHistorial();
  }

  private vaciarHistorial(): void {
    this.historial.n = 0;
    this.ultimaMuestra = -Infinity;
    this.intervalo = 0;
  }

  /** Vuelve a descargado (conservando el interruptor y los valores) y vacía el historial. */
  reiniciar(): void {
    const p = this.params;
    if (!p) return;
    this.reiniciarContadores();
    this.tr = transitorioDeArbol(p.arbol, { modo: p.modo, E: p.E, rCarga: p.rCarga }, null);
    this.intervalo = this.tau / MUESTRAS_POR_TAU;
    this.pasosVistos = 0;
  }

  /** Avanza `dtVisual` segundos de PANTALLA (equivale a `dtVisual / F` segundos reales). */
  avanzar(dtVisual: number): void {
    const tr = this.tr;
    if (!tr) return;
    tr.avanzar(dtVisual / this.factor);
    if (tr.pasos !== this.pasosVistos) {
      this.pasosVistos = tr.pasos;
      this.muestrear(tr);
    }
  }

  private muestrear(tr: Transitorio): void {
    const t = this.offset + tr.t;
    if (t - this.ultimaMuestra < this.intervalo) return;
    const h = this.historial;
    if (h.n >= CAPACIDAD_HISTORIAL) {
      // Decimación: se conserva una de cada dos muestras y se duplica el intervalo.
      const m = h.n >> 1;
      for (let k = 0; k < m; k++) {
        h.t[k] = h.t[2 * k];
        h.v[k] = h.v[2 * k];
        h.i[k] = h.i[2 * k];
      }
      h.n = m;
      this.intervalo *= 2;
    }
    h.t[h.n] = t;
    h.v[h.n] = tr.ultimo.v[2] ?? 0;
    h.i[h.n] = tr.ultimo.i[ID_R_CARGA] ?? 0;
    h.n++;
    this.ultimaMuestra = t;
  }

  /** Estado eléctrico para el lienzo (null si aún no se configuró). */
  estado(): EstadoElectrico | null {
    if (!this.tr || !this.params) return null;
    return estadoTransitorio(this.tr, this.params.E, this.params.rCarga);
  }

  get tauReal(): number {
    return this.tau;
  }

  get factorTiempo(): number {
    return this.factor;
  }

  get tauPantalla(): number {
    return tauVisual(this.tau);
  }

  get parametros(): ParametrosRC | null {
    return this.params;
  }

  /** Resumen de totales (se consulta a ~10 Hz desde la interfaz). */
  resumen(): ResumenRC | null {
    const tr = this.tr;
    const p = this.params;
    if (!tr || !p) return null;
    const cEq = equivalente(p.arbol, "C");
    const vRed = tr.ultimo.v[2] ?? 0;
    const i = tr.ultimo.i[ID_R_CARGA] ?? 0;
    return {
      cEq,
      tauReal: this.tau,
      tauPantalla: tauVisual(this.tau),
      factor: this.factor,
      vRed,
      i,
      q: cEq * vRed,
      uAlmacenada: 0.5 * cEq * vRed * vRed,
      eEntregada: this.eBatPrev + tr.eBateria,
      eDisipada: this.eDisPrev + tr.eDisipada,
      fase: faseDe(p.modo, vRed, p.E),
      tiempoReal: this.offset + tr.t,
    };
  }
}

/**
 * Fase del transitorio. «cargado» cuando falta menos del 1 % de E (≈ 4,6 τ desde cero) y «descargado» cuando
 * queda menos del 1 % de E con el interruptor en «descargar». Con el interruptor en «cargar» y V por encima de E
 * (se bajó el voltaje de la batería) el capacitor se descarga hacia el nuevo E.
 */
export function faseDe(modo: ModoInterruptor, vRed: number, E: number): FaseRC {
  if (modo === "cargar") {
    if (Math.abs(E - vRed) <= UMBRAL_FASE * E) return "cargado";
    return vRed < E ? "cargando" : "descargando";
  }
  return Math.abs(vRed) <= UMBRAL_FASE * E ? "descargado" : "descargando";
}
