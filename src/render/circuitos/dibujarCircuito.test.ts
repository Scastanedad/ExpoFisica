import { describe, expect, it } from "vitest";
import { PRESETS_E6, type Bloque } from "../../fisica/circuitos";
import { crearCtxFalso } from "../ctxFalso";
import { dibujarCircuito, puntosZigzag, type DatosDibujo, type VistaDibujo } from "./dibujarCircuito";
import { distribuirCircuito } from "./distribucion";
import { estadoDC } from "./estado";
import { corrientesTramos, crearParticulas } from "./particulas";
import { textosElementos, textoValorElemento } from "./textos";
import { lecturasElementos } from "../../fisica/circuitos";

const arbol = PRESETS_E6.find((p) => p.id === "serieParalelo")!.arbol as Bloque;
const geom = distribuirCircuito(arbol, "R", { ancho: 960, alto: 540 });
const est = estadoDC(arbol, 12);

function datos(extra: Partial<DatosDibujo> = {}): DatosDibujo {
  const lect = lecturasElementos(est.net, est.r);
  return {
    textos: textosElementos(lect),
    valores: Object.fromEntries(est.net.elementos.filter((e) => e.tipo === "R").map((e) => [e.id, textoValorElemento("R", e.valor)])),
    corrientes: corrientesTramos(geom, est.r),
    iRef: est.iRef,
    particulas: crearParticulas(geom),
    seleccion: null,
    textoBateria: "12 V",
    sonda: null,
    textoSeleccion: null,
    ...extra,
  };
}
const vista = (v: Partial<VistaDibujo> = {}): VistaDibujo => ({ verElectrones: false, movimientoReducido: false, escalaCss: 1, ...v });

describe("dibujarCircuito", () => {
  it("dibuja puntos y flechas con movimiento, y deja los puntos fuera con movimiento reducido", () => {
    const conMov = crearCtxFalso();
    dibujarCircuito(conMov, geom, datos(), vista());
    const sinMov = crearCtxFalso();
    dibujarCircuito(sinMov, geom, datos(), vista({ movimientoReducido: true }));
    expect(conMov.llamadas.arc).toBeGreaterThan(20);
    // Sin movimiento solo quedan los círculos de las cargas de las placas (⊕/⊖) y la sonda: ninguna partícula.
    expect((conMov.llamadas.arc ?? 0) - (sinMov.llamadas.arc ?? 0)).toBeGreaterThan(20);
    // Las flechas estáticas siguen presentes (triángulos rellenos) en ambos casos.
    expect(sinMov.llamadas.closePath).toBeGreaterThan(3);
    expect(sinMov.llamadas.closePath).toBe(conMov.llamadas.closePath);
  });

  it("escribe nombre+valor, V e I de cada elemento, y el rótulo de la batería", () => {
    const c = crearCtxFalso();
    dibujarCircuito(c, geom, datos(), vista());
    // 3 elementos × 3 líneas + rótulo de la batería.
    expect(c.llamadas.fillText).toBe(3 * 3 + 1);
  });

  it("sin lecturas solo escribe el nombre de cada elemento", () => {
    const c = crearCtxFalso();
    dibujarCircuito(c, geom, datos({ textos: null }), vista());
    expect(c.llamadas.fillText).toBe(3 + 1);
  });

  it("la vista de electrones no cambia la cantidad de dibujo, solo el color de los puntos", () => {
    const a = crearCtxFalso();
    const b = crearCtxFalso();
    dibujarCircuito(a, geom, datos(), vista());
    dibujarCircuito(b, geom, datos(), vista({ verElectrones: true }));
    expect(b.llamadas).toEqual(a.llamadas);
  });

  it("corriente nula: no hay flechas y los puntos se atenúan", () => {
    const d = datos({ corrientes: new Float64Array(geom.tramos.length) });
    const c = crearCtxFalso();
    dibujarCircuito(c, geom, d, vista());
    expect(c.llamadas.closePath ?? 0).toBe(0);
  });

  it("la sonda añade solo un marcador (su lectura va fuera del lienzo y no tapa rótulos)", () => {
    const sin = crearCtxFalso();
    dibujarCircuito(sin, geom, datos(), vista());
    const con = crearCtxFalso();
    dibujarCircuito(con, geom, datos({ sonda: { x: 100, y: 100 } }), vista());
    expect(con.llamadas.arc - sin.llamadas.arc).toBe(2);
    expect(con.llamadas.fillText).toBe(sin.llamadas.fillText);
  });

  it("nivel reducido: solo V e I de cada elemento y el rótulo del seleccionado en la franja", () => {
    const g = distribuirCircuito(arbol, "R", { ancho: 360, alto: 300 }, { fuenteMin: 16 });
    expect(g.nivel).toBe("reducido");
    const c = crearCtxFalso();
    dibujarCircuito(c, g, datos({ corrientes: corrientesTramos(g, est.r), particulas: crearParticulas(g), seleccion: "R2", textoSeleccion: "R2 2 kΩ · 6 V · 3 mA" }), vista());
    // 3 elementos × (V + I) + franja + rótulo de la batería: sin nombres.
    expect(c.llamadas.fillText).toBe(3 * 2 + 1 + 1);
  });

  it("nivel mínimo: ni V ni I en los elementos, solo la franja y la batería", () => {
    const g = distribuirCircuito(arbol, "R", { ancho: 360, alto: 640 }, { fuenteMin: 40 });
    expect(g.nivel).toBe("minimo");
    const c = crearCtxFalso();
    dibujarCircuito(c, g, datos({ corrientes: corrientesTramos(g, est.r), particulas: crearParticulas(g), seleccion: "R2", textoSeleccion: "R2 · 6 V · 3 mA" }), vista());
    expect(c.llamadas.fillText).toBe(1 + 1);
  });

  it("capacitor: dibuja las cargas de las placas según el signo y la cantidad", () => {
    const gc = distribuirCircuito(arbol, "C", { ancho: 960, alto: 540 });
    const base = crearCtxFalso();
    dibujarCircuito(base, gc, datos({ corrientes: corrientesTramos(gc, est.r), particulas: null }), vista());
    const cargado = crearCtxFalso();
    dibujarCircuito(cargado, gc, datos({ corrientes: corrientesTramos(gc, est.r), particulas: null, placas: { R1: 4, R2: -2 } }), vista());
    expect(cargado.llamadas.stroke).toBeGreaterThan(base.llamadas.stroke);
  });

  it("puntosZigzag: empieza y termina sobre el eje y sube y baja alternadamente", () => {
    const p = puntosZigzag(10, 50, 100, 20, 6);
    expect(p[0]).toBe(10);
    expect(p[1]).toBe(50);
    expect(p[p.length - 2]).toBe(110);
    expect(p[p.length - 1]).toBe(50);
    const ys = p.filter((_, k) => k % 2 === 1).slice(2, -2);
    expect(ys).toEqual([42, 58, 42, 58, 42, 58]);
  });
});
