/**
 * Contexto 2D falso que GRABA lo que se dibuja (rellenos, trazos, textos, discos), para comprobar en Node que lo
 * dibujado coincide con lo calculado. Solo lo usan los tests.
 */
import type { Ctx3D } from "./ctx3d";

export interface RellenoGrabado {
  estilo: string;
  /** Subtrayectos cerrados (triángulos) del lote. */
  cerrados: number;
  subtrayectos: number;
}
export interface TrazoGrabado {
  estilo: string;
  subtrayectos: number;
  grosor: number;
}

export interface CtxGrabador extends Ctx3D {
  rellenos: RellenoGrabado[];
  trazos: TrazoGrabado[];
  textos: string[];
  discos: Array<{ x: number; y: number; r: number }>;
  /** Argumentos no finitos recibidos (debe quedar vacío). */
  anomalias: string[];
  llamadas: Record<string, number>;
}

export function crearCtxGrabador(): CtxGrabador {
  let moves = 0;
  let cierres = 0;
  const g: CtxGrabador = {
    rellenos: [],
    trazos: [],
    textos: [],
    discos: [],
    anomalias: [],
    llamadas: {},
    strokeStyle: "",
    fillStyle: "",
    lineWidth: 1,
    lineJoin: "miter",
    lineCap: "butt",
    globalAlpha: 1,
    font: "",
    textAlign: "start",
    textBaseline: "alphabetic",
    save() {
      cuenta("save");
    },
    restore() {
      cuenta("restore");
    },
    beginPath() {
      moves = 0;
      cierres = 0;
      cuenta("beginPath");
    },
    closePath() {
      cierres++;
    },
    moveTo(x, y) {
      moves++;
      fin("moveTo", x, y);
    },
    lineTo(x, y) {
      fin("lineTo", x, y);
    },
    arc(x, y, r) {
      fin("arc", x, y, r);
      g.discos.push({ x, y, r });
    },
    stroke() {
      g.trazos.push({ estilo: String(g.strokeStyle), subtrayectos: moves, grosor: g.lineWidth });
    },
    fill() {
      g.rellenos.push({ estilo: String(g.fillStyle), cerrados: cierres, subtrayectos: moves });
    },
    fillRect() {
      cuenta("fillRect");
    },
    clearRect() {
      cuenta("clearRect");
    },
    fillText(t, x, y) {
      fin("fillText", x, y);
      g.textos.push(t);
    },
    strokeText(_t, x, y) {
      fin("strokeText", x, y);
    },
    setLineDash() {
      cuenta("setLineDash");
    },
    measureText: (t) => ({ width: 7 * t.length }),
  };
  function cuenta(n: string) {
    g.llamadas[n] = (g.llamadas[n] ?? 0) + 1;
  }
  function fin(nombre: string, ...v: number[]) {
    cuenta(nombre);
    for (const x of v) if (!Number.isFinite(x)) g.anomalias.push(`${nombre}(${v.join(", ")})`);
  }
  return g;
}
