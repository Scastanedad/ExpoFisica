/**
 * Carga de prueba q₀ (especificación E3.1): sondea el campo/potencial de las
 * demás cargas ("Cargas en reposo") sin entrar nunca a la lista de cargas
 * fuente. Sin masa ni dinámica: su posición es puramente cinemática (la fija
 * el arrastre o "Marcar A/B" en la UI, no una ecuación de movimiento).
 *
 * Softening de las lecturas (E3.1 §2, decisión ya confirmada): E, V (y por
 * tanto F, ΔV, W) usan `SOFTENING2_ESTATICO` — la MISMA combinación que las
 * equipotenciales/líneas/vectores — y NO el `campoSI`/`potencialSI` exacto de
 * escala.ts. q₀ sondea un punto arbitrario del plano, igual que la malla de
 * equipotenciales; por eso conviene coherencia con lo que se dibuja en vez de
 * con la ley exacta (que sí se usa para la fuerza carga-a-carga de fuerzas.ts).
 *
 * Convención de signos: igual que `campoSI`/`potencialSI` (escala.ts), los
 * vectores devueltos están en la convención de LECTURA (y hacia arriba), no en
 * la de canvas (y hacia abajo): `ey = -eyCanvas`.
 *
 * Funciones puras, sin DOM: las usa el store/UI de "Cargas en reposo".
 */
import { K_VISUAL, campoEn, potencialEn, type PuntoCarga } from "./coulomb";
import { ESCALA, type ConfigEscala, RADIO_MIN_LECTURA_PX, SOFTENING2_ESTATICO, factoresSim, unidadesACoulomb } from "./escala";

/** Magnitud fija de la carga de prueba (µC). No editable (E3.1 §9.1): solo el signo. */
export const Q0_MAGNITUD_UC = 1;

/** Evita devolver -0 (mismo criterio que escala.ts). */
function sinCeroNegativo(v: number): number {
  return v + 0;
}

/** Distancia (px) de (xPx, yPx) a la carga fuente más cercana; Infinity si no hay ninguna. */
function distanciaMinima(xPx: number, yPx: number, cargasFuente: readonly PuntoCarga[]): number {
  let minimo = Infinity;
  for (const c of cargasFuente) {
    const d = Math.hypot(xPx - c.x, yPx - c.y);
    if (d < minimo) minimo = d;
  }
  return minimo;
}

export interface CampoQ0SI {
  ex: number;
  ey: number;
  modulo: number;
}

/**
 * Campo eléctrico "coherente con el dibujo" (softened, en SI, convención de
 * lectura y-arriba): la MISMA combinación que usan las equipotenciales,
 * líneas y vectores. NO excluye por cercanía: quien necesite la exclusión usa
 * `lecturaQ0`/`trabajoCampoTraza`, que sí la aplican.
 */
export function campoQ0SI(
  xPx: number,
  yPx: number,
  cargasFuente: readonly PuntoCarga[],
  esc: ConfigEscala = ESCALA,
): CampoQ0SI {
  const [exSim, eySim] = campoEn(xPx, yPx, cargasFuente as PuntoCarga[], SOFTENING2_ESTATICO);
  const factor = factoresSim(K_VISUAL, esc).campo;
  const ex = sinCeroNegativo(exSim * factor);
  const ey = sinCeroNegativo(-eySim * factor);
  return { ex, ey, modulo: Math.hypot(ex, ey) };
}

/** Potencial "coherente con el dibujo" (softened, en SI); mismo criterio que `campoQ0SI`. */
export function potencialQ0SI(
  xPx: number,
  yPx: number,
  cargasFuente: readonly PuntoCarga[],
  esc: ConfigEscala = ESCALA,
): number {
  const vSim = potencialEn(xPx, yPx, cargasFuente as PuntoCarga[], SOFTENING2_ESTATICO);
  return sinCeroNegativo(vSim * factoresSim(K_VISUAL, esc).potencial);
}

export interface LecturaQ0 {
  ex: number;
  ey: number;
  moduloE: number; // N/C
  v: number; // V
  fx: number;
  fy: number;
  moduloF: number; // N
}

/**
 * Lectura de E, V y F = q₀E en (xPx, yPx). `null` si el punto está a
 * `< RADIO_MIN_LECTURA_PX` de alguna carga fuente (mismo criterio que el
 * resto de la app: la lectura ahí no tiene sentido físico razonable).
 */
export function lecturaQ0(
  xPx: number,
  yPx: number,
  signoQ0: 1 | -1,
  cargasFuente: readonly PuntoCarga[],
  esc: ConfigEscala = ESCALA,
): LecturaQ0 | null {
  if (distanciaMinima(xPx, yPx, cargasFuente) < RADIO_MIN_LECTURA_PX) return null;
  const campo = campoQ0SI(xPx, yPx, cargasFuente, esc);
  const v = potencialQ0SI(xPx, yPx, cargasFuente, esc);
  const q0C = signoQ0 * unidadesACoulomb(Q0_MAGNITUD_UC, esc);
  const fx = sinCeroNegativo(q0C * campo.ex);
  const fy = sinCeroNegativo(q0C * campo.ey);
  return { ex: campo.ex, ey: campo.ey, moduloE: campo.modulo, v, fx, fy, moduloF: Math.hypot(fx, fy) };
}

export interface MedidaDeltaV {
  vA: number;
  vB: number;
  deltaV: number; // V
  wCampo: number; // J
  wExt: number; // J
}

/**
 * `W_campo = q₀(V_A − V_B) = −q₀ΔV`, `W_ext = −W_campo` (identidad exacta:
 * q₀ no tiene energía cinética, E3.1 §1/§3). `null` si `vA` o `vB` es `null`
 * (alguno de los puntos marcados estaba en zona excluida).
 */
export function medirDeltaV(vA: number | null, vB: number | null, signoQ0: 1 | -1): MedidaDeltaV | null {
  if (vA === null || vB === null) return null;
  const deltaV = vB - vA;
  const q0C = signoQ0 * unidadesACoulomb(Q0_MAGNITUD_UC);
  const wCampo = sinCeroNegativo(-q0C * deltaV);
  const wExt = sinCeroNegativo(-wCampo);
  return { vA, vB, deltaV, wCampo, wExt };
}

export interface PuntoTraza {
  x: number;
  y: number;
}

/** Longitud de arco (px lógicos) de cada sub-paso al integrar la traza numéricamente. */
export const PASO_INTEGRAL_TRAZA_PX = 4;

/**
 * `Σ q₀ E·dl` a lo largo de la polilínea `traza` (px lógicos), en julios, con
 * subdivisión de cada tramo en pasos de `paso` px y evaluación por punto medio
 * (regla del punto medio, E3.1 §5). `null` si `traza.length < 2` o si algún
 * punto de muestreo (vértices originales o intermedios) cae a
 * `< RADIO_MIN_LECTURA_PX` de una carga fuente.
 */
export function trabajoCampoTraza(
  traza: readonly PuntoTraza[],
  signoQ0: 1 | -1,
  cargasFuente: readonly PuntoCarga[],
  paso: number = PASO_INTEGRAL_TRAZA_PX,
  esc: ConfigEscala = ESCALA,
): number | null {
  if (traza.length < 2) return null;
  if (distanciaMinima(traza[0].x, traza[0].y, cargasFuente) < RADIO_MIN_LECTURA_PX) return null;

  const q0C = signoQ0 * unidadesACoulomb(Q0_MAGNITUD_UC, esc);
  const s = esc.mPorCuadro / esc.pxPorCuadro; // metros por px lógico
  let w = 0;

  for (let i = 0; i < traza.length - 1; i++) {
    const a = traza[i];
    const b = traza[i + 1];
    if (distanciaMinima(b.x, b.y, cargasFuente) < RADIO_MIN_LECTURA_PX) return null;
    const dxPx = b.x - a.x;
    const dyPx = b.y - a.y;
    const longitudPx = Math.hypot(dxPx, dyPx);
    if (longitudPx < 1e-9) continue;
    const nSub = Math.max(1, Math.ceil(longitudPx / paso));
    const dxSub = dxPx / nSub;
    const dySub = dyPx / nSub;
    for (let k = 0; k < nSub; k++) {
      const xMedPx = a.x + dxSub * (k + 0.5);
      const yMedPx = a.y + dySub * (k + 0.5);
      if (distanciaMinima(xMedPx, yMedPx, cargasFuente) < RADIO_MIN_LECTURA_PX) return null;
      const campo = campoQ0SI(xMedPx, yMedPx, cargasFuente, esc);
      // dl en la convención de LECTURA (y arriba): dy se invierte respecto al canvas.
      const dlxM = dxSub * s;
      const dlyM = -dySub * s;
      w += q0C * (campo.ex * dlxM + campo.ey * dlyM);
    }
  }
  return w;
}
