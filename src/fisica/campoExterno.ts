/**
 * Campo eléctrico externo uniforme (especificación E5.0): capacitor de placas
 * paralelas ideal, `E₀ = U/d`. Módulo compartido por la Estación 03 (Dipolos,
 * E5.1) y, más adelante, la Estación 04 (Conductores/aislantes, E5.2).
 *
 * Deliberadamente NO toca `coulomb.ts` ni `dinamica.ts`: un campo uniforme es
 * un simple sumando constante (no depende de x,y, no tiene singularidad, no
 * necesita softening), así que se compone por superposición con `campoEn`
 * (ver `sumarCampoExterno`) en vez de cambiar su firma.
 *
 * Convención de coordenadas: IGUAL que `campoEn`/`dinamica.ts` y el canvas (y
 * crece hacia abajo) -- DISTINTA de `escala.ts`/`campoSI` (y hacia arriba, para
 * mostrarle un número al visitante). Si un panel muestra "el campo apunta
 * hacia arriba/abajo", aplicar el mismo flip de signo que ya hace `campoSI`,
 * nunca antes de sumarlo a `campoEn`.
 */
import { K_VISUAL } from "./coulomb";
import { ESCALA, factoresSim, type ConfigEscala } from "./escala";

/** Campo uniforme en SI (N/C), convención de CANVAS (y hacia abajo). */
export interface CampoUniformeSI {
  ex: number;
  ey: number;
}

export type OrientacionPlacas = "horizontal" | "vertical";

/**
 * `E0 = U / d` (capacitor de placas paralelas ideal, sin efectos de borde).
 * `separacionM` es la separación de las placas en METROS (el llamador la
 * calcula desde la geometría del canvas con `pxAMetros`, p. ej. el alto o el
 * ancho de la escena). `polaridad = 1`: el campo apunta de la placa
 * "arriba/izquierda" a la placa "abajo/derecha" en coordenadas de canvas
 * (vertical/horizontal respectivamente); como el campo eléctrico sale de +
 * y entra en − (línea de campo = de + a −), eso hace que "arriba/izquierda"
 * sea la placa **+** y "abajo/derecha" la placa **−**. `-1` invierte el
 * sentido del campo (y por tanto cuál placa es + y cuál es −).
 *
 * (Nota de corrección, fisico-revisor: una versión anterior de este
 * comentario y de la especificación E5.0 §1 tenían las etiquetas +/−
 * invertidas en la prosa -- error de redacción, no del cálculo: esta
 * función nunca asignó una carga a ninguna placa, solo devuelve el vector
 * de campo. El render (`dibujarPlacas.ts`) y el texto de `PanelDipolo.tsx`
 * ya usaban la asignación físicamente correcta descrita arriba.)
 */
export function campoPlacas(
  orientacion: OrientacionPlacas,
  polaridad: 1 | -1,
  voltajeV: number,
  separacionM: number,
): CampoUniformeSI {
  const magnitud = separacionM > 0 ? voltajeV / separacionM : 0;
  const signo = polaridad;
  return orientacion === "vertical" ? { ex: 0, ey: signo * magnitud } : { ex: signo * magnitud, ey: 0 };
}

/** SI -> unidades de simulación (mismo factor que el resto de la app). */
export function campoUniformeASim(
  e0: CampoUniformeSI,
  kSim: number = K_VISUAL,
  esc: ConfigEscala = ESCALA,
): [number, number] {
  const f = factoresSim(kSim, esc).campo;
  return f > 0 ? [e0.ex / f, e0.ey / f] : [0, 0];
}

/**
 * Composición: el campo total es la suma vectorial (superposición, ley de
 * Coulomb + linealidad de Maxwell-Gauss). O(1), sin softening.
 */
export function sumarCampoExterno(
  campoBase: readonly [number, number],
  externoSim: readonly [number, number],
): [number, number] {
  return [campoBase[0] + externoSim[0], campoBase[1] + externoSim[1]];
}

/**
 * Potencial del campo uniforme (lineal en la posición): `V(r) = −E0·(r − origen)`,
 * consistente con `E = −∇V` (exacto, no una aproximación: es la solución
 * analítica de `∇²V = 0` con gradiente constante).
 */
export function potencialUniformeSim(
  x: number,
  y: number,
  externoSim: readonly [number, number],
  origen: { x: number; y: number } = { x: 0, y: 0 },
): number {
  return -(externoSim[0] * (x - origen.x) + externoSim[1] * (y - origen.y));
}
