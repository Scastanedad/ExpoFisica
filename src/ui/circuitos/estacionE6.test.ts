import { beforeEach, describe, expect, it } from "vitest";
import {
  MAX_ELEMENTOS,
  PRESETS_E6,
  contarHojas,
  e,
  equivalente,
  lecturasElementos,
  paralelo,
  potenciaBateria,
  reducirPasoAPaso,
  serie,
} from "../../fisica/circuitos";
import { arbolDePuente, estadoDC, estadoPuente } from "../../render/circuitos/estado";
import {
  MENSAJE_PUENTE,
  PERSONALIZADO,
  R_INTERNA,
  useCircuitosStore,
  type LecturasCircuito,
} from "../../store/circuitosStore";
import { PRESETS_UI_E6 } from "./presetsUI";
import { vistaReduccion } from "./reduccionVista";
import { resumenE6, textosAvisos } from "./resumenE6";
import { formaDelCircuito, sentidoPuente, textoEducativoE6 } from "./textosE6";

const s = () => useCircuitosStore.getState();

function lecturasDe(arbol: Parameters<typeof estadoDC>[0], E: number, rInt = 0): LecturasCircuito {
  const { net, r } = estadoDC(arbol, E, rInt);
  return { elementos: lecturasElementos(net, r), iBat: r.iBat, pBat: potenciaBateria(net, r) };
}

describe("presets de la interfaz", () => {
  it("son los 7 de la spec, en orden, con ids únicos y topología correcta", () => {
    expect(PRESETS_UI_E6.map((p) => p.id)).toEqual(PRESETS_E6.map((p) => p.id));
    expect(PRESETS_UI_E6).toHaveLength(7);
    expect(new Set(PRESETS_UI_E6.map((p) => p.id)).size).toBe(7);
    expect(PRESETS_UI_E6.filter((p) => p.topologia === "puente").map((p) => p.id)).toEqual([
      "wheatstoneEq",
      "wheatstoneDes",
    ]);
  });

  it("los cinco primeros respetan el tope de 6 y el puente trae R1..R5", () => {
    for (const p of PRESETS_UI_E6) {
      expect(contarHojas(p.arbol)).toBeLessThanOrEqual(MAX_ELEMENTOS);
      if (p.topologia === "puente") expect(contarHojas(p.arbol)).toBe(5);
    }
  });

  it("cada preset reproduce su R_eq de la spec en pantalla (E / I_bat)", () => {
    for (const p of PRESETS_UI_E6) {
      const spec = PRESETS_E6.find((x) => x.id === p.id)!;
      const est = p.topologia === "puente" ? estadoPuente(p.arbol, p.E) : estadoDC(p.arbol, p.E);
      expect(p.E / est.r.iBat).toBeCloseTo(spec.esperado.rEq, 1);
    }
  });
});

describe("store: puente y batería real", () => {
  beforeEach(() => {
    s().iniciar("R", serie(e("R1", 1000), e("R2", 2000)), "demo");
  });

  it("iniciar apaga la batería real y fija la topología", () => {
    s().setBateriaReal(true);
    s().iniciar("R", arbolDePuente(PRESETS_E6[5].puente!), "wheatstoneEq", 12, "puente");
    expect(s().bateriaReal).toBe(false);
    expect(s().topologia).toBe("puente");
    expect(s().seleccion).toBe("R1");
  });

  it("en el puente no se puede añadir ni quitar; sí cambiar valores", () => {
    s().iniciar("R", arbolDePuente(PRESETS_E6[5].puente!), "wheatstoneEq", 12, "puente");
    const antes = s().arbol;
    s().agregarEnSerie();
    s().agregarEnParalelo();
    s().quitarSeleccionado();
    expect(s().arbol).toBe(antes);
    expect(s().mensaje).toBe(MENSAJE_PUENTE);
    s().setValorElemento("R4", 4500);
    expect(s().arbol).not.toBe(antes);
  });

  it("elegir un preset de árbol después del puente vuelve a la topología de árbol", () => {
    s().elegirPreset("wheatstoneEq", arbolDePuente(PRESETS_E6[5].puente!), undefined, "puente");
    expect(s().topologia).toBe("puente");
    s().elegirPreset("serie3", serie(e("R1", 1), e("R2", 1)));
    expect(s().topologia).toBe("arbol");
    expect(s().presetId).not.toBe(PERSONALIZADO);
  });

  it("la batería real usa r_int de 2 Ω", () => {
    expect(R_INTERNA).toBe(2);
  });
});

describe("reducción paso a paso", () => {
  it("k = 0 es el circuito completo y k = total deja un solo resistor igual a R_eq", () => {
    for (const p of PRESETS_UI_E6.filter((x) => x.topologia === "arbol")) {
      const total = reducirPasoAPaso(p.arbol, "R").pasos.length;
      const v0 = vistaReduccion(p.arbol, "R", 0);
      expect(v0.arbolVista).toBe(p.arbol);
      expect(v0.aplicados).toHaveLength(0);
      expect(v0.terminada).toBe(total === 0);

      const vf = vistaReduccion(p.arbol, "R", total);
      expect(vf.terminada).toBe(true);
      expect(vf.arbolVista.t).toBe("e");
      expect(vf.equivalente).toBeCloseTo(equivalente(p.arbol, "R"), 9);
      expect(vf.arbolVista).toMatchObject({ valor: vf.equivalente });
    }
  });

  it("cada paso conserva la corriente de la batería (mismo R_eq en el árbol reducido)", () => {
    const p = PRESETS_UI_E6.find((x) => x.id === "mixto6")!;
    const iBat = estadoDC(p.arbol, 12).r.iBat;
    const total = vistaReduccion(p.arbol, "R", 0).total;
    expect(total).toBe(4);
    for (let k = 1; k <= total; k++) {
      expect(estadoDC(vistaReduccion(p.arbol, "R", k).arbolVista, 12).r.iBat).toBeCloseTo(iBat, 12);
    }
  });

  it("acota k fuera de rango y cada paso trae su fórmula", () => {
    const arbol = serie(e("R1", 1000), e("R2", 2000));
    expect(vistaReduccion(arbol, "R", 99).aplicados).toHaveLength(1);
    expect(vistaReduccion(arbol, "R", -3).aplicados).toHaveLength(0);
    expect(vistaReduccion(arbol, "R", 1).aplicados[0].formula).toContain("= 1 kΩ + 2 kΩ = 3 kΩ");
  });

  it("un solo resistor no tiene pasos", () => {
    expect(vistaReduccion(e("R1", 100), "R", 1)).toMatchObject({ total: 0, terminada: true, equivalente: 100 });
  });
});

describe("textos educativos de E6", () => {
  it("elige el texto por la forma del circuito, también tras editar", () => {
    expect(formaDelCircuito(e("R1", 1), "arbol")).toBe("uno");
    expect(formaDelCircuito(serie(e("R1", 1), e("R2", 1)), "arbol")).toBe("serie");
    expect(formaDelCircuito(paralelo(e("R1", 1), e("R2", 1)), "arbol")).toBe("paralelo");
    expect(formaDelCircuito(serie(paralelo(e("R1", 1), e("R2", 1)), e("R3", 1)), "arbol")).toBe("mixto");
    expect(formaDelCircuito(arbolDePuente(PRESETS_E6[5].puente!), "puente")).toBe("puente");
  });

  it("serie y paralelo traen las frases de la spec", () => {
    const sTxt = textoEducativoE6(serie(e("R1", 1), e("R2", 1)), "arbol").parrafos.join(" ");
    expect(sTxt).toContain("La misma corriente atraviesa todos");
    const pTxt = textoEducativoE6(paralelo(e("R1", 1), e("R2", 1)), "arbol").parrafos.join(" ");
    expect(pTxt).toContain("Añadir una rama en paralelo baja la resistencia total");
  });

  it("puente: equilibrado y desequilibrado se deciden por R1·R4 = R2·R3 y dan el sentido", () => {
    const eq = arbolDePuente(PRESETS_E6[5].puente!);
    const des = arbolDePuente(PRESETS_E6[6].puente!);
    expect(sentidoPuente(eq)).toBeNull();
    expect(sentidoPuente(des)).toBe("BaA"); // I(R5) < 0 en la spec: va de B hacia A
    expect(textoEducativoE6(eq, "puente").titulo).toContain("equilibrado");
    expect(textoEducativoE6(des, "puente").parrafos.join(" ")).toContain("de B hacia A");
  });

  it("el sentido del texto coincide con el signo de I(R5) del motor", () => {
    const base = PRESETS_E6[5].puente!;
    for (const R4 of [1000, 2000, 3000, 4500, 9000]) {
      const arbol = arbolDePuente({ ...base, R4 });
      const i5 = estadoPuente(arbol, 12).r.i.R5;
      const sentido = sentidoPuente(arbol);
      if (Math.abs(i5) < 1e-12) expect(sentido).toBeNull();
      else expect(sentido).toBe(i5 > 0 ? "AaB" : "BaA");
    }
  });
});

describe("resumen y avisos de E6", () => {
  it("R_eq de pantalla = R_eq del árbol y con batería real descuenta la interna", () => {
    const arbol = serie(e("R1", 1000), e("R2", 2000));
    const ideal = resumenE6(lecturasDe(arbol, 12), 12)!;
    expect(ideal.rEq).toBeCloseTo(3000, 6);
    expect(ideal.vBornes).toBeCloseTo(12, 9);
    const real = resumenE6(lecturasDe(arbol, 12, R_INTERNA), 12)!;
    expect(real.rEq).toBeCloseTo(3000, 6);
    expect(real.vBornes).toBeLessThan(12);
    expect(real.vBornes).toBeCloseTo(12 - R_INTERNA * real.iBat, 9);
  });

  it("sin lecturas no hay resumen", () => {
    expect(resumenE6(null, 12)).toBeNull();
  });

  it("avisa de pila real (> 1 A) y de resistor de ¼ W, sin contar r_int", () => {
    const arbol = paralelo(e("R1", 10), e("R2", 10), e("R3", 10), e("R4", 10), e("R5", 10), e("R6", 10));
    const r = resumenE6(lecturasDe(arbol, 12), 12)!;
    expect(r.iBat).toBeCloseTo(7.2, 9);
    expect(r.pilaReal).toBe(true);
    expect(r.quemados).toHaveLength(6);
    expect(textosAvisos(r)).toHaveLength(2);

    const tranquilo = resumenE6(lecturasDe(serie(e("R1", 1000), e("R2", 1000)), 12), 12)!;
    expect(textosAvisos(tranquilo)).toHaveLength(0);
  });

  it("todos los presets están por debajo de ¼ W", () => {
    for (const p of PRESETS_UI_E6.filter((x) => x.topologia === "arbol")) {
      expect(resumenE6(lecturasDe(p.arbol, 12), 12)!.quemados, p.id).toEqual([]);
    }
  });
});
