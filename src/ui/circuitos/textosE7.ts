/**
 * Textos de E7 «Capacitores» (spec E6-E7-circuitos-criterios §2). Puros y sin DOM. Los balances de energía se
 * anuncian «al terminar de cargar», nunca «a 5τ»: a 5τ la energía almacenada es 98,6 % del valor final.
 */
import { esCorrienteNula, formatearSI } from "../../fisica/circuitos";
import type { FaseRC, ModoInterruptor } from "../../render/circuitos/simulacionRC";
import { formaDelCircuito, type FormaCircuito } from "./textosE6";
import type { Bloque } from "../../fisica/circuitos";

export interface TextoEducativo {
  titulo: string;
  parrafos: string[];
}

const coma = (n: number, dec: number): string => n.toFixed(dec).replace(".", ",");

/** Separa los miles con espacio fino para que «100000» no se lea como «100 000 veces» sin querer. */
function enteroConMiles(n: number): string {
  return Math.round(n)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, " ");
}

/** Factor de dilatación legible: ×2,5 · ×30 · ×100 000. */
export function formatearFactor(f: number): string {
  if (f < 10) return coma(f, 1);
  return enteroConMiles(f);
}

/**
 * Rótulo SIEMPRE visible del tiempo dilatado (spec §6): «Tiempo ×30 más lento (τ real = 100 ms, en pantalla =
 * 3,0 s)». Si el circuito real sería más lento que la pantalla (τ de varios segundos) dice «más rápido».
 */
export function rotuloTiempo(tauReal: number, tauPantalla: number): string {
  const f = tauPantalla / tauReal;
  const detalle = `τ real = ${formatearSI(tauReal, "s")}, en pantalla = ${coma(tauPantalla, 1)} s`;
  if (Math.abs(f - 1) < 0.05) return `Tiempo real (τ = ${formatearSI(tauReal, "s")})`;
  return f > 1
    ? `Tiempo ×${formatearFactor(f)} más lento (${detalle})`
    : `Tiempo ×${formatearFactor(1 / f)} más rápido (${detalle})`;
}

/** Nota honesta sobre la escala del tiempo (spec §6). */
export const NOTA_ESCALA_TIEMPO =
  "Los circuitos reales tardan desde microsegundos hasta segundos; para verlos todos se ajusta la velocidad. A mayor τ real, más lento se ve, pero la proporción no es lineal. Las gráficas muestran siempre el tiempo real.";

/** Rótulo de la corriente: en la descarga va al revés que en la carga. */
export function rotuloCorriente(modo: ModoInterruptor, i: number): string {
  return modo === "descargar" || (i < 0 && !esCorrienteNula(i)) ? "I (sentido invertido)" : "I";
}

/** Aviso junto a la leyenda de sentido mientras se descarga: las flechas van al revés que al cargar. */
export const NOTA_SENTIDO_DESCARGA =
  "Al descargar, los capacitores son la fuente: la corriente sale de su placa + y vuelve por el resistor, al revés que al cargar. Por eso Rc marca voltaje y corriente con signo menos: solo indica que van al revés que al cargar; el valor es el que hay.";

export function textoFase(fase: FaseRC): string {
  switch (fase) {
    case "descargado":
      return "Descargado";
    case "cargando":
      return "Cargando";
    case "cargado":
      return "Cargado";
    case "descargando":
      return "Descargando";
  }
}

/** Anuncio para lectores de pantalla cuando cambia de fase (nunca en cada tic). */
export function anuncioFase(fase: FaseRC): string {
  switch (fase) {
    case "cargando":
      return "Cargando: la batería empuja carga hacia las placas.";
    case "cargado":
      return "Terminó de cargar: el voltaje de los capacitores es el de la batería y ya casi no pasa corriente.";
    case "descargando":
      return "Descargando: la corriente va al revés porque ahora los capacitores son la fuente.";
    case "descargado":
      return "Terminó de descargar: los capacitores quedaron sin carga.";
  }
}

export const MENSAJE_REINICIO =
  "La red cambió: los capacitores vuelven a empezar descargados, porque la carga guardada ya no correspondería.";
export const MENSAJE_REDUCCION_REINICIA =
  "Al reducir (o volver al circuito completo) la carga vuelve a empezar desde cero: el capacitor equivalente se carga igual que la red completa.";

export const TEXTO_GENERAL_E7 =
  "Los valores son los de un circuito ideal: batería y cables sin resistencia, capacitores sin fugas, sin inductancia. Solo hay un resistor, el de carga, en serie con la red.";

const BASE: string[] = [
  "Cada capacitor guarda cargas +Q y −Q en sus placas: la carga no atraviesa el aislante, los puntos del cable se acumulan en las placas.",
  "La corriente no «pasa por» el capacitor: es el flujo de cargas que lo carga, y se acaba cuando su voltaje es el de la batería.",
];

const POR_FORMA: Record<FormaCircuito, string> = {
  uno: "Un solo capacitor: añade otro en serie o en paralelo y compara cómo se reparten el voltaje y la carga.",
  serie:
    "En serie todos guardan la misma carga Q; el voltaje se reparte al revés que la capacitancia (V = Q/C): más voltaje en el más pequeño. La capacitancia total es menor que la menor.",
  paralelo:
    "En paralelo todos tienen el mismo voltaje y la carga se reparte en proporción a la capacitancia (Q = C·V). La capacitancia total es la suma.",
  mixto:
    "Los bloques en paralelo comparten voltaje y los bloques en serie comparten carga. Para hallar la capacitancia total se reduce de adentro hacia afuera: usa «Reducir un paso».",
  puente: "",
};

export const TEXTO_TAU =
  "τ = R·C total. En un τ la carga llega al 63 %; al terminar de cargar (unos 5τ) casi no pasa corriente.";

export const TEXTO_ENERGIA_CARGA =
  "Al terminar de cargar desde cero, la batería habrá entregado C·E²: la mitad queda almacenada (½·C·E²) y la otra mitad se disipa en el resistor, sea cual sea su resistencia.";

export const TEXTO_DESCARGA =
  "La corriente va al revés porque ahora el capacitor es la fuente. Toda la energía almacenada se disipa en el resistor.";

/** Interruptor en «Cargar» pero V de los capacitores por encima de E (se bajó el voltaje de la batería). */
export const TEXTO_BATERIA_BAJADA =
  "El voltaje de la batería quedó por debajo del de los capacitores: ellos empujan carga de vuelta hacia la batería (ideal, absorbe energía) hasta igualar su voltaje. Por eso la corriente es negativa y la energía «entregada» baja.";

export const TEXTO_DESCARGA_SIN_CARGA = "Primero carga los capacitores: no hay nada que descargar.";

export function textoEducativoE7(arbol: Bloque, modo: ModoInterruptor, fase: FaseRC): TextoEducativo {
  const forma = formaDelCircuito(arbol, "arbol");
  const titulo =
    forma === "serie"
      ? "Capacitores en serie"
      : forma === "paralelo"
        ? "Capacitores en paralelo"
        : forma === "mixto"
          ? "Serie y paralelo combinados"
          : "Un solo capacitor";
  const parrafos = [...BASE, POR_FORMA[forma], TEXTO_TAU];
  if (modo === "descargar") parrafos.push(fase === "descargado" ? TEXTO_DESCARGA_SIN_CARGA : TEXTO_DESCARGA);
  else parrafos.push(fase === "descargando" ? TEXTO_BATERIA_BAJADA : TEXTO_ENERGIA_CARGA);
  return { titulo, parrafos };
}
