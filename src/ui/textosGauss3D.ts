/**
 * Textos educativos de la estación 5 (Ley de Gauss), en español y como funciones puras del estado: qué mirar, qué
 * pasa y por qué. Cada frase se decide con lo que hay en pantalla (carga dentro/fuera, signo, forma, tamaño), de modo
 * que cambia al arrastrar y nunca afirma algo que no se cumple en ese momento.
 *
 * Reglas físicas que respetan (contrato `docs-gauss/contrato-gauss3d.md`, §5, §8 y §11):
 *  - Φ = q_enc/ε₀ solo para superficies CERRADAS; el parche (abierta) es un contraste y no encierra carga.
 *  - Flujo ≠ campo: Φ = 0 no significa campo cero.
 *  - La superficie es imaginaria: no frena ni cambia el campo.
 *  - Φ no depende de la forma ni del tamaño ni de dónde esté la carga dentro; depende de la carga encerrada.
 *  - Una carga fuera aporta flujo local (entra por un lado, sale por otro) pero neto cero.
 *  - Los conteos de líneas son reales, nunca «= q·20» salvo carga única en calidad alta; Φ sale de `calcularFlujo`.
 */
import { formatDistancia, formatSI } from "../fisica/escala";
import { LINEAS_POR_UC } from "../fisica/gauss3d/constantes";
import type { TipoSuperficie } from "../fisica/gauss3d/tipos";
import { campoSI3D, uAMetros } from "../fisica/gauss3d/unidades";

export interface CargaTexto {
  /** µC con signo. */
  q: number;
  dentro: boolean;
  /** En el centro de la superficie (origen), con una pequeña tolerancia. */
  centrada: boolean;
}

export interface EntradaTexto {
  /** 1…9 */
  escenario: number;
  forma: TipoSuperficie;
  /** Radio (esfera, cilindro) o lado (cubo, parche) en u. */
  tamano: number;
  thetaDeg: number;
  cargas: readonly CargaTexto[];
  /** Φ calculado (µC/ε₀); null mientras no hay lectura. */
  phi: number | null;
}

export interface TextoGauss {
  titulo: string;
  /** Qué mirar. */
  mirar: string;
  /** Qué pasa ahora (depende del estado). */
  pasa: string;
  /** Por qué. */
  porque: string;
}

const TITULOS: Record<number, string> = {
  1: "Un parche y su ángulo",
  2: "Una superficie cerrada",
  3: "Carga dentro o fuera",
  4: "Cambiar el tamaño",
  5: "Cubo, cilindro y esfera",
  6: "Una carga que cruza",
  7: "Un dipolo",
  8: "Una superficie abierta",
  9: "Gauss como herramienta",
};

const FORMA: Record<TipoSuperficie, string> = {
  parche: "el parche",
  esfera: "la esfera",
  cubo: "el cubo",
  cilindro: "el cilindro",
};

const EPS = 1e-9;

/** Decimal con coma y signo menos tipográfico. */
function num(v: number, d = 2): string {
  const t = Math.abs(v) < 0.5 * 10 ** -d ? (0).toFixed(d) : Math.abs(v).toFixed(d);
  return `${v < 0 && Math.abs(v) >= 0.5 * 10 ** -d ? "−" : ""}${t.replace(".", ",")}`;
}

/** «+3 µC» / «−2,5 µC». */
function fmtQ(q: number): string {
  const a = Math.abs(q);
  const t = Number.isInteger(a) ? String(a) : num(a, 1);
  return `${q < 0 ? "−" : "+"}${t} µC`;
}

/** Con coma decimal a las cifras de `formatSI`. */
const coma = (t: string) => t.replace(/(\d)\.(\d)/g, "$1,$2");

interface Resumen {
  cerrada: boolean;
  nDentro: number;
  nFuera: number;
  qEnc: number;
}

function resumir(e: EntradaTexto): Resumen {
  const cerrada = e.forma !== "parche";
  let nDentro = 0;
  let qEnc = 0;
  if (cerrada) {
    for (const c of e.cargas) {
      if (c.dentro) {
        nDentro++;
        qEnc += c.q;
      }
    }
  }
  return { cerrada, nDentro, nFuera: e.cargas.length - nDentro, qEnc };
}

type Caso = "fuera" | "neta0" | "neta";

function caso(r: Resumen): Caso {
  if (r.nDentro === 0) return "fuera";
  return Math.abs(r.qEnc) < EPS ? "neta0" : "neta";
}

/** Sentido neto del flujo de una carga neta encerrada. */
function sentidoNeto(qEnc: number): string {
  return qEnc > 0 ? "En neto, el campo sale por la superficie." : "En neto, el campo entra por la superficie.";
}

function pasaCerrada(e: EntradaTexto, r: Resumen): string {
  const forma = FORMA[e.forma];
  switch (caso(r)) {
    case "fuera":
      return `${e.cargas.length === 1 ? "La carga está fuera" : "Las cargas están fuera"} de ${forma}. Φ = 0. El campo la atraviesa, pero lo que entra por un lado sale por el otro.`;
    case "neta0":
      return `Dentro de ${forma} hay cargas que suman 0 µC. Φ = 0.${r.nFuera > 0 ? " La carga de fuera no cambia el Φ total (sí el flujo local, zona a zona)." : ""}`;
    case "neta":
      return `Dentro de ${forma} hay ${fmtQ(r.qEnc)}. Φ = ${num(r.qEnc)} µC/ε₀. ${sentidoNeto(r.qEnc)}${r.nFuera > 0 ? " La carga de fuera no cambia el Φ total (sí el flujo local, zona a zona)." : ""}`;
  }
}

function porqueCerrada(r: Resumen): string {
  switch (caso(r)) {
    case "fuera":
      return "Cada línea que entra vuelve a salir: entra tanto como sale, y el flujo neto es cero.";
    case "neta0":
      return "Ley de Gauss: Φ = q_enc/ε₀, y la carga encerrada suma cero. Φ = 0 no significa que no haya campo: hay campo en la superficie, pero entra tanto como sale.";
    case "neta":
      return "Ley de Gauss: Φ = q_enc/ε₀. Solo cuenta la carga encerrada: no importa la forma, el tamaño ni dónde esté dentro.";
  }
}

function pasaParche(e: EntradaTexto): string {
  const aviso = "El parche no encierra carga: aquí Φ no es q/ε₀.";
  if (e.phi === null) return aviso;
  if (Math.abs(e.phi) < 0.005) {
    return `Φ ≈ 0: casi nada de campo atraviesa el parche (lo roza), o lo cruza en un sentido y en el otro por igual. ${aviso}`;
  }
  const sentido = e.phi > 0 ? "en el sentido de su normal" : "en sentido contrario a su normal";
  return `Φ = ${num(e.phi)} µC/ε₀: en neto, el campo cruza el parche ${sentido}. ${aviso}`;
}

const PORQUE_PARCHE =
  "Φ solo cuenta la parte del campo que atraviesa el parche, no la que lo roza. Por eso depende de cómo está inclinado y de dónde está la carga.";

/** E (N/C) en la superficie de una esfera de radio `radioU` con una carga `q` (µC) en el centro: kq/R² = Φ/(4πR²). */
function campoEnEsfera(q: number, radioU: number): number {
  return campoSI3D(Math.abs(q), radioU);
}

function esfera1Centrada(e: EntradaTexto): boolean {
  return e.forma === "esfera" && e.cargas.length === 1 && e.cargas[0].dentro && e.cargas[0].centrada;
}

/** Texto educativo del escenario `e.escenario` según el estado. */
export function textoEscenario(e: EntradaTexto): TextoGauss {
  const r = resumir(e);
  const titulo = TITULOS[e.escenario] ?? TITULOS[2];
  const base = (mirar: string): TextoGauss =>
    r.cerrada
      ? { titulo, mirar, pasa: pasaCerrada(e, r), porque: porqueCerrada(r) }
      : { titulo, mirar, pasa: pasaParche(e), porque: PORQUE_PARCHE };

  // Con una forma distinta de la del escenario, la lección propia deja de aplicar: texto genérico y veraz.
  const mirarGenerico = r.cerrada
    ? "Mira cómo las líneas salen o entran por la superficie, y el color de sus caras."
    : "Mira las líneas que cruzan el parche y su color.";

  switch (e.escenario) {
    case 1:
      if (r.cerrada) return base(mirarGenerico);
      return {
        titulo,
        mirar: "Mira el parche y las líneas que lo cruzan. Inclínalo con θ, en «Avanzado».",
        pasa: pasaParche(e),
        porque: PORQUE_PARCHE,
      };
    case 2:
      return base(
        r.cerrada
          ? "Mira cómo las líneas atraviesan la superficie. La superficie es imaginaria: no frena ni cambia el campo."
          : mirarGenerico,
      );
    case 3: {
      const t = base(r.cerrada ? "Saca la carga de la superficie y vuelve a meterla: arrástrala o usa el botón." : mirarGenerico);
      if (r.cerrada && caso(r) === "neta") {
        t.porque = "Ley de Gauss: Φ = q_enc/ε₀. Da igual en qué punto de dentro esté la carga: lo que cuenta es que esté dentro.";
      }
      return t;
    }
    case 4: {
      const t = base(
        r.cerrada
          ? "Cambia el tamaño de la superficie. Φ no cambia mientras la carga siga dentro."
          : mirarGenerico,
      );
      if (esfera1Centrada(e)) {
        const R = e.tamano;
        const E = campoEnEsfera(e.cargas[0].q, R);
        t.pasa = `${t.pasa} Con radio ${formatDistancia(uAMetros(R))}, el campo en la superficie vale ≈ ${coma(formatSI(E, "N/C"))}.`;
        t.porque =
          "Si agrandas la esfera, el campo en su superficie baja (como 1/R²) pero el área sube (como R²). Su producto, Φ, no cambia.";
      }
      return t;
    }
    case 5: {
      const t = base(r.cerrada ? "Prueba esfera, cubo y cilindro con la misma carga dentro." : mirarGenerico);
      if (r.cerrada && caso(r) === "neta") {
        t.pasa = `Con ${FORMA[e.forma]}: Φ = ${num(r.qEnc)} µC/ε₀. Es el mismo valor con cualquier forma que rodee la carga.`;
        t.porque = "Φ depende de la carga encerrada, no de la forma. Cambian los parches de color; el total, no.";
      }
      return t;
    }
    case 6: {
      const t = base(r.cerrada ? "Sube y baja la carga con el deslizador de altura y hazla cruzar la superficie." : mirarGenerico);
      if (r.cerrada && caso(r) === "fuera") {
        t.porque =
          "Fuera, cada línea que entra vuelve a salir. En cuanto la carga cruza la superficie y queda dentro, Φ cambia de golpe: pasa de 0 a q/ε₀.";
      } else if (r.cerrada && caso(r) === "neta") {
        t.porque =
          r.nDentro === 1 && r.nFuera === 0
            ? "Ley de Gauss: Φ = q_enc/ε₀. Si la carga sale, Φ cambia de golpe a 0: lo que cuenta es si está dentro, no cuánto se aleja."
            : "Ley de Gauss: Φ = q_enc/ε₀. Si una carga cruza la superficie, Φ cambia de golpe en q/ε₀ (la de esa carga): lo que cuenta es si está dentro, no cuánto se aleja.";
      }
      return t;
    }
    case 7: {
      const hayPos = e.cargas.some((c) => c.q > 0);
      const hayNeg = e.cargas.some((c) => c.q < 0);
      const t = base(
        r.cerrada
          ? hayPos && hayNeg
            ? "Mira las líneas que van de la carga + a la − y las zonas rojas y azules."
            : "Mira las líneas y las zonas rojas y azules. Con cargas del mismo signo ya no es un dipolo."
          : mirarGenerico,
      );
      if (r.cerrada && caso(r) === "neta0") {
        t.pasa = `Dentro hay ${fmtQ(Math.max(...e.cargas.map((c) => c.q)))} y ${fmtQ(Math.min(...e.cargas.map((c) => c.q)))}: suman 0 y Φ = 0. Aun así, hay zonas donde el campo sale y zonas donde entra.`;
        t.porque = "Flujo no es campo: Φ = 0 no significa campo cero. El flujo que sale en una zona compensa el que entra en otra.";
      }
      return t;
    }
    case 8: {
      if (r.cerrada) return base(mirarGenerico);
      return {
        titulo,
        mirar: "Compara con la esfera del escenario 2: aquí la superficie no rodea la carga.",
        pasa: pasaParche(e),
        porque:
          "La ley de Gauss solo vale para superficies cerradas. Un parche no encierra nada y solo mide el campo que lo atraviesa.",
      };
    }
    case 9: {
      if (!r.cerrada || e.forma !== "esfera") {
        return {
          titulo,
          mirar: "Elige la esfera y pon la carga en el centro.",
          pasa: base("").pasa,
          porque: "Gauss da el campo de forma sencilla solo si hay simetría, por ejemplo una esfera con la carga en el centro.",
        };
      }
      const mirar = "Con la carga en el centro, el campo es igual en toda la esfera. ¿Cuánto vale?";
      const t = base(mirar);
      const R = e.tamano;
      const Rtxt = formatDistancia(uAMetros(R));
      if (esfera1Centrada(e)) {
        const E = coma(formatSI(campoEnEsfera(r.qEnc, R), "N/C"));
        t.pasa = `Φ = ${num(r.qEnc)} µC/ε₀. Entonces E = Φ/(4πR²) ≈ ${E} a ${Rtxt} del centro${r.qEnc < 0 ? " (apunta hacia dentro)" : ""}.`;
        t.porque =
          "Por simetría, E es igual y perpendicular en toda la esfera, así que Φ = E · 4πR². Despejando, E = Φ/(4πR²), que coincide con k·q/R².";
      } else if (r.nDentro > 0 && Math.abs(r.qEnc) >= EPS) {
        t.pasa = `${t.pasa} Sin simetría, Φ/(4πR²) = ${coma(formatSI(campoEnEsfera(r.qEnc, R), "N/C"))} es solo el valor medio de E perpendicular a la superficie${r.qEnc < 0 ? " (hacia dentro)" : ""}, no E en cada punto.`;
        t.porque = "Gauss da E fácilmente solo cuando hay simetría. Deja una sola carga en el centro para verlo.";
      }
      return t;
    }
    default:
      return base(mirarGenerico);
  }
}

// ---------------------------------------------------------------------------------------------------------------

export interface EntradaConteo {
  salen: number;
  entran: number;
  /** Nombre de la calidad vigente: «alta» | «media» | «baja» (baja también durante el arrastre). */
  calidad: string;
  forma: TipoSuperficie;
  cargas: readonly CargaTexto[];
  /** Número de líneas dibujadas; 0 = líneas ocultas. */
  nLineas: number;
}

export interface TextoConteo {
  /** Etiqueta de los tres números, o null si no hay líneas. */
  salen: string;
  entran: string;
  netas: string;
  /** Nota bajo el conteo (equivalencia con la carga, solo si es veraz) o null. */
  nota: string | null;
}

/**
 * Conteo de cruces con la regla del fisico-revisor (§11): siempre los conteos REALES; la equivalencia «netas = q · N»
 * solo con una carga única en calidad alta (y solo si el número coincide); «netas = 0» cuando es una identidad
 * (ninguna carga dentro, o dipolo ±) en cualquier calidad; en calidad media/baja y durante el arrastre no se compara
 * con la carga. Φ nunca sale de este conteo.
 */
export function textoConteo(e: EntradaConteo): TextoConteo | null {
  if (e.nLineas <= 0) return null;
  const neto = e.salen - e.entran;
  if (e.forma === "parche") {
    return {
      salen: `a favor de la normal: ${e.salen}`,
      entran: `en contra: ${e.entran}`,
      netas: `netas: ${neto}`,
      nota: "Contar líneas es solo un dibujo: la medida del flujo es Φ.",
    };
  }
  const dentro = e.cargas.filter((c) => c.dentro);
  const qEnc = dentro.reduce((s, c) => s + c.q, 0);
  let nota: string | null = null;
  if (dentro.length === 0) {
    nota = "Netas = 0: cada línea que entra vuelve a salir.";
  } else if (dentro.length === 2 && Math.abs(qEnc) < EPS) {
    nota = "Netas = 0: salen tantas líneas como entran.";
  } else if (e.calidad !== "alta") {
    nota = "Vista simplificada: pueden dibujarse menos líneas que en calidad alta, así que su número no se compara con la carga.";
  } else if (e.cargas.length === 1 && dentro.length === 1) {
    const esperado = Math.round(Math.abs(qEnc) * LINEAS_POR_UC);
    if (Math.abs(neto) === esperado) {
      nota = `Aquí se dibujan ${LINEAS_POR_UC} líneas por µC: ${fmtQ(Math.abs(qEnc)).slice(1)} × ${LINEAS_POR_UC} = ${esperado} líneas ${qEnc > 0 ? "salen" : "entran"} en neto. Es una convención del dibujo.`;
    }
  }
  return { salen: `salen: ${e.salen}`, entran: `entran: ${e.entran}`, netas: `netas: ${neto}`, nota };
}
