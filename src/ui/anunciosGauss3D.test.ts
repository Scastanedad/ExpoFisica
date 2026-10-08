import { describe, expect, it } from "vitest";
import { MS_ENTRE_ANUNCIOS, MS_REPOSO_ANUNCIO, crearAnunciador, describirEscena, textoAnuncioFlujo } from "./anunciosGauss3D";

function reloj() {
  let t = 0;
  let sig = 1;
  const tareas = new Map<number, { en: number; cb: () => void }>();
  const emitidos: Array<{ t: number; texto: string }> = [];
  const a = crearAnunciador({
    emitir: (texto) => emitidos.push({ t, texto }),
    ahora: () => t,
    fijar: (cb, ms) => {
      tareas.set(sig, { en: t + ms, cb });
      return sig++;
    },
    cancelar: (id) => void tareas.delete(id),
  });
  function avanzar(ms: number) {
    const fin = t + ms;
    for (;;) {
      const prox = [...tareas.entries()].filter(([, v]) => v.en <= fin).sort((x, y) => x[1].en - y[1].en)[0];
      if (!prox) break;
      t = prox[1].en;
      tareas.delete(prox[0]);
      prox[1].cb();
    }
    t = fin;
  }
  return { a, avanzar, emitidos };
}

describe("anunciador de la región viva", () => {
  it("durante un arrastre (cambios cada 100 ms) no anuncia; anuncia solo el último valor al soltar", () => {
    const { a, avanzar, emitidos } = reloj();
    for (let k = 0; k < 30; k++) {
      a.proponer(`Φ = ${k}`);
      avanzar(100);
    }
    expect(emitidos).toHaveLength(0);
    avanzar(MS_REPOSO_ANUNCIO);
    expect(emitidos.map((e) => e.texto)).toEqual(["Φ = 29"]);
  });

  it("no repite el mismo texto y respeta ≥ 1 s entre anuncios", () => {
    const { a, avanzar, emitidos } = reloj();
    a.proponer("A");
    avanzar(MS_REPOSO_ANUNCIO);
    a.proponer("A");
    avanzar(2000);
    expect(emitidos).toHaveLength(1);
    a.proponer("B");
    avanzar(MS_REPOSO_ANUNCIO);
    avanzar(MS_ENTRE_ANUNCIOS);
    expect(emitidos).toHaveLength(2);
    expect(emitidos[1].t - emitidos[0].t).toBeGreaterThanOrEqual(MS_ENTRE_ANUNCIOS);
  });

  it("si el valor vuelve al ya anunciado antes de emitir, no dice nada", () => {
    const { a, avanzar, emitidos } = reloj();
    a.proponer("A");
    avanzar(MS_REPOSO_ANUNCIO);
    a.proponer("B");
    avanzar(100);
    a.proponer("A");
    avanzar(5000);
    expect(emitidos.map((e) => e.texto)).toEqual(["A"]);
  });
});

describe("descripción y anuncio", () => {
  const base = { forma: "esfera" as const, tamano: 5, thetaDeg: 0, phi: 3, qEnc: 3 };
  it("describe forma, tamaño, cargas con signo, posición y dentro/fuera, Φ y q_enc", () => {
    const t = describirEscena({
      ...base,
      cargas: [
        { q: 3, x: 0, y: 0, z: 2, dentro: true },
        { q: -2, x: 8, y: -4, z: 0, dentro: false },
      ],
    });
    expect(t).toContain("esfera de radio 5 cm");
    expect(t).toContain("Carga 1: positiva de 3,0 µC, dentro de la superficie, en x = 0 cm, y = 0 cm, altura z = 2 cm");
    expect(t).toContain("Carga 2: negativa de 2,0 µC, fuera de la superficie");
    expect(t).toContain("Flujo Φ = 3,00 µC/ε₀.");
    expect(t).toContain("q_enc = +3,00 µC");
  });
  it("plano: sin dentro/fuera y sin carga encerrada", () => {
    const t = describirEscena({ forma: "parche", tamano: 4, thetaDeg: 30, phi: 1.2, qEnc: 0, cargas: [{ q: 1, x: 0, y: 0, z: 3, dentro: false }] });
    expect(t).toContain("plano cuadrado de lado 4 cm, inclinado 30°");
    expect(t).not.toContain("dentro de la superficie");
    expect(t).toContain("no hay carga encerrada");
  });
  it("sin lectura no inventa Φ", () => {
    expect(describirEscena({ ...base, phi: null, qEnc: null, cargas: [] })).not.toContain("Φ");
  });
  it("anuncio: residuos de redondeo valen 0 y la coma es decimal", () => {
    expect(textoAnuncioFlujo(1e-12, -1e-13, "esfera")).toBe("Φ = 0,00 µC/ε₀. Carga encerrada: 0,00 µC.");
    expect(textoAnuncioFlujo(-2.5, -2.5, "cubo")).toBe("Φ = −2,50 µC/ε₀. Carga encerrada: −2,50 µC.");
  });
});
