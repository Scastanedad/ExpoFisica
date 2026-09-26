import { describe, expect, it } from "vitest";
import { K_VISUAL, campoEn, potencialEn, type PuntoCarga } from "./coulomb";
import {
  C_POR_UNIDAD,
  ESCALA,
  K_COULOMB,
  M_POR_PX,
  PX_POR_CUADRO,
  RADIO_CARGA_PX,
  RADIO_MIN_LECTURA_PX,
  campoSI,
  cuadrosBarra,
  energiaParSI,
  energiaSimAJ,
  energiaSistemaSI,
  factoresSim,
  formatCientifica,
  formatDistancia,
  formatSI,
  fuerzaParSI,
  fuerzaSobrePruebaSI,
  geometriaLeyenda,
  metrosAPx,
  pasoAgradable,
  potencialSI,
  pxAMetros,
  trabajoCampoSI,
  unidadesACoulomb,
  type ConfigEscala,
} from "./escala";

/** Tolerancia relativa de la especificación E0 §5.1 (1e-9 por defecto). */
function cercano(real: number, esperado: number, tol = 1e-9) {
  expect(Math.abs(real - esperado)).toBeLessThanOrEqual(tol * Math.abs(esperado));
}

const origen: PuntoCarga[] = [{ x: 0, y: 0, q: 1 }];
const E1 = 8.98755179e7; // E de +1 µC a 1 cm, N/C
const MENOS = "−";

describe("constantes de escala", () => {
  it("1 cuadro = 50 px = 1 cm; 1 px = 0.2 mm; 1 unidad = 1 µC", () => {
    expect(PX_POR_CUADRO).toBe(50);
    expect(ESCALA.mPorCuadro).toBe(0.01);
    cercano(M_POR_PX, 2e-4);
    expect(C_POR_UNIDAD).toBe(1e-6);
  });

  it("el radio de carga (14 px) es la fuente única y el mínimo de lectura", () => {
    expect(RADIO_CARGA_PX).toBe(14);
    expect(RADIO_MIN_LECTURA_PX).toBe(RADIO_CARGA_PX);
  });

  it("conversiones geométricas y de carga", () => {
    cercano(pxAMetros(50), 0.01);
    cercano(pxAMetros(700), 0.14);
    cercano(metrosAPx(0.01), 50);
    cercano(unidadesACoulomb(2), 2e-6);
  });

  it("el canvas de 700x500 son exactamente 14x10 cuadros", () => {
    expect(700 / PX_POR_CUADRO).toBe(14);
    expect(500 / PX_POR_CUADRO).toBe(10);
  });
});

describe("lecturas en SI (Coulomb exacto)", () => {
  it("campoSI a 1 cm de +1 µC = 8.99e7 N/C, hacia fuera", () => {
    const c = campoSI(50, 0, origen);
    expect(c).not.toBeNull();
    cercano(c!.ex, E1);
    expect(c!.ey).toBe(0);
    cercano(c!.modulo, E1);
  });

  it("ey se da hacia arriba: un punto 50 px arriba en pantalla (y = -50) da ey > 0", () => {
    const c = campoSI(0, -50, origen);
    cercano(c!.ey, E1);
    expect(c!.ex).toBe(0);
  });

  it("devuelve null dentro de la carga dibujada (r = 5 px < 14 px)", () => {
    expect(campoSI(0, 0, [{ x: 3, y: 4, q: 1 }])).toBeNull();
    expect(potencialSI(0, 0, [{ x: 3, y: 4, q: 1 }])).toBeNull();
  });

  it("potencialSI: 899 kV a 1 cm, 180 kV a 5 cm, negativo para q < 0", () => {
    cercano(potencialSI(50, 0, origen)!, 8.98755179e5);
    cercano(potencialSI(250, 0, origen)!, 1.79751036e5);
    cercano(potencialSI(50, 0, [{ x: 0, y: 0, q: -1 }])!, -8.98755179e5);
  });

  it("punto medio de +1 y +1: campo nulo; de +1 y -1: el doble del individual", () => {
    const iguales: PuntoCarga[] = [
      { x: -50, y: 0, q: 1 },
      { x: 50, y: 0, q: 1 },
    ];
    expect(campoSI(0, 0, iguales)!.modulo).toBeLessThan(1e-9 * E1);
    const opuestas: PuntoCarga[] = [
      { x: -50, y: 0, q: 1 },
      { x: 50, y: 0, q: -1 },
    ];
    cercano(campoSI(0, 0, opuestas)!.modulo, 2 * E1);
  });

  it("no produce -0 por cancelación", () => {
    const c = campoSI(0, 0, [
      { x: -50, y: 0, q: 1 },
      { x: 50, y: 0, q: 1 },
    ])!;
    expect(Object.is(c.ex, -0)).toBe(false);
    expect(Object.is(c.ey, -0)).toBe(false);
  });

  it("fuerza de Coulomb entre pares: 89.9 N a 1 cm; 3.60 N a 5 cm; atractiva < 0", () => {
    cercano(fuerzaParSI(1, 1, 50), 89.8755179);
    cercano(fuerzaParSI(1, 1, 250), 3.59502072);
    cercano(fuerzaParSI(1, -1, 50), -89.8755179);
    cercano(fuerzaParSI(2, 1, 100), 2 * fuerzaParSI(1, 1, 100));
    cercano(fuerzaParSI(2, 1, 100), 44.937759);
  });

  it("energia: 0.899 J para el par a 1 cm; el sistema suma los tres pares", () => {
    cercano(energiaParSI(1, 1, 50), 0.898755179);
    const tri: PuntoCarga[] = [
      { x: 0, y: 0, q: 1 },
      { x: 100, y: 0, q: 1 },
      { x: 50, y: 80, q: -1 },
    ];
    const lado = Math.hypot(50, 80);
    const suma = energiaParSI(1, 1, 100) + 2 * energiaParSI(1, -1, lado);
    cercano(energiaSistemaSI(tri), suma);
  });

  it("trabajo del campo W = q0 (V_A - V_B) y antisimetria", () => {
    cercano(trabajoCampoSI(1, 8.98755e5, 1.79751e5), 0.719004);
    expect(trabajoCampoSI(1, 5, 2)).toBe(-trabajoCampoSI(1, 2, 5));
  });

  it("F = q0*E sobre una carga de prueba", () => {
    const c = campoSI(50, 0, origen)!;
    const f = fuerzaSobrePruebaSI(1, c);
    cercano(f.modulo, 89.8755179);
    cercano(f.modulo, fuerzaParSI(1, 1, 50));
  });

  it("decaimiento: E(2r)/E(r) = 1/4 y V(2r)/V(r) = 1/2", () => {
    cercano(campoSI(200, 0, origen)!.modulo / campoSI(100, 0, origen)!.modulo, 0.25);
    cercano(potencialSI(200, 0, origen)! / potencialSI(100, 0, origen)!, 0.5);
  });

  it("superposicion: el campo de dos cargas es la suma vectorial", () => {
    const a: PuntoCarga = { x: 10, y: 20, q: 1.5 };
    const b: PuntoCarga = { x: 300, y: 90, q: -0.5 };
    const suma = campoSI(150, 200, [a, b])!;
    const ea = campoSI(150, 200, [a])!;
    const eb = campoSI(150, 200, [b])!;
    cercano(suma.ex, ea.ex + eb.ex);
    cercano(suma.ey, ea.ey + eb.ey);
    cercano(
      potencialSI(150, 200, [a, b])!,
      potencialSI(150, 200, [a])! + potencialSI(150, 200, [b])!,
    );
  });

  it("tercera ley: fuerzaParSI simetrica en qa, qb", () => {
    expect(fuerzaParSI(1.5, -2, 80)).toBe(fuerzaParSI(-2, 1.5, 80));
  });

  it("escalado: duplicar M_POR_CUADRO divide E entre 4 y V entre 2", () => {
    const doble: ConfigEscala = { ...ESCALA, mPorCuadro: 2 * ESCALA.mPorCuadro };
    cercano(campoSI(50, 0, origen, doble)!.modulo, E1 / 4);
    cercano(potencialSI(50, 0, origen, doble)!, 8.98755179e5 / 2);
    cercano(fuerzaParSI(1, 1, 50, doble), 89.8755179 / 4);
    cercano(energiaParSI(1, 1, 50, doble), 0.898755179 / 2);
  });

  it("K_COULOMB coincide con CODATA 2018", () => {
    cercano(K_COULOMB, 8.9875517923e9);
  });
});

describe("factores de simulacion -> SI", () => {
  it("factoresSim(5000)", () => {
    const f = factoresSim(5000);
    cercano(f.campo, 4.4937759e7, 1e-8);
    cercano(f.potencial, 8987.55179, 1e-8);
    cercano(f.fuerza, 44.937759, 1e-8);
    cercano(f.energia, 8.98755179e-3, 1e-8);
  });

  it("cada factor es proporcional a 1/kSim", () => {
    cercano(factoresSim(10000).potencial, factoresSim(5000).potencial / 2);
    cercano(factoresSim(10000).energia, factoresSim(5000).energia / 2);
  });

  it("energiaSimAJ(25, 5000) = 0.2247 J", () => {
    cercano(energiaSimAJ(25, 5000), 0.224688795, 1e-8);
  });

  it("coherencia sim <-> SI: E_sim a 1 cm (=2) x factor de campo = campoSI", () => {
    const eSim = campoEn(50, 0, origen, 0)[0];
    expect(eSim).toBe(2);
    cercano(eSim * factoresSim(K_VISUAL).campo, campoSI(50, 0, origen)!.modulo);
  });

  it("coherencia de energia: V_sim (par a 50 px) en J = energiaParSI", () => {
    const vSim = potencialEn(50, 0, origen, 0);
    expect(vSim).toBe(100);
    cercano(energiaSimAJ(vSim, K_VISUAL), energiaParSI(1, 1, 50));
  });

  it("el resultado en SI no depende de kSim", () => {
    const e5000 = campoEn(50, 0, origen, 0)[0] * factoresSim(5000).campo;
    const e10000 = (10000 / K_VISUAL) * campoEn(50, 0, origen, 0)[0] * factoresSim(10000).campo;
    cercano(e5000, e10000);
  });
});

describe("campoEn/potencialEn: parametro soft2 retrocompatible", () => {
  it("sin soft2 el resultado es el de siempre (SOFTENING2 = 100)", () => {
    expect(campoEn(50, 0, origen)).toEqual(campoEn(50, 0, origen, 100));
    expect(potencialEn(50, 0, origen)).toBe(potencialEn(50, 0, origen, 100));
  });
});

describe("formatSI", () => {
  it("prefijos y 3 cifras significativas", () => {
    expect(formatSI(89.8755179, "N")).toBe("89.9 N");
    expect(formatSI(0.0036, "N")).toBe("3.60 mN");
    expect(formatSI(898755.179, "V")).toBe("899 kV");
    expect(formatSI(1.5e-7, "J")).toBe("150 nJ");
  });

  it("signo tipografico y cero", () => {
    expect(formatSI(-449377.59, "V")).toBe(`${MENOS}449 kV`);
    expect(formatSI(0, "V")).toBe("0 V");
    expect(formatSI(-0, "V")).toBe("0 V");
  });

  it("al redondear a 1000 sube de prefijo", () => {
    expect(formatSI(999.6, "V")).toBe("1.00 kV");
  });

  it("usa micro (U+00B5) como prefijo micro", () => {
    expect(formatSI(2.5e-6, "J")).toBe("2.50 µJ");
  });

  it("la mantisa nunca es >= 1000 ni < 1 (salvo 0)", () => {
    for (const exp of [-11, -9, -6, -3, -1, 0, 1, 2, 3, 5, 8]) {
      for (const m of [1, 1.5, 9.99, 99.9, 999, 999.5, 999.95, 5.55]) {
        const texto = formatSI(m * Math.pow(10, exp), "X");
        const mantisa = Math.abs(parseFloat(texto.replace(MENOS, "-")));
        expect(mantisa).toBeGreaterThanOrEqual(1);
        expect(mantisa).toBeLessThan(1000);
      }
    }
  });
});

describe("formatSI fuera del rango de prefijos", () => {
  it("usa notacion cientifica en vez de '1000 GV' o '0.05 pV'", () => {
    expect(formatSI(1e15, "V")).toBe("1.00 × 10¹⁵ V");
    expect(formatSI(999.6e9, "V")).toBe("1.00 × 10¹² V");
    expect(formatSI(5e-14, "V")).toBe("5.00 × 10⁻¹⁴ V");
    expect(formatSI(1e12, "V")).toBe("1.00 × 10¹² V");
    expect(formatSI(999e9, "V")).toBe("999 GV");
    expect(formatSI(1e-12, "V")).toBe("1.00 pV");
  });

  it("valores no finitos dan raya, sin lanzar", () => {
    expect(formatSI(NaN, "V")).toBe("—");
    expect(formatSI(Infinity, "V")).toBe("—");
  });

  it("sube de prefijo exactamente en el empate 999.5", () => {
    expect(formatSI(999.5, "V")).toBe("1.00 kV");
    expect(formatSI(999.49, "V")).toBe("999 V");
    expect(formatSI(999999.5, "V")).toBe("1.00 MV");
  });
});

describe("campoSI / potencialSI: cuando devuelven null", () => {
  it("null a r < 14 px; valido justo en 14 px", () => {
    expect(campoSI(13.999, 0, origen)).toBeNull();
    expect(potencialSI(13.999, 0, origen)).toBeNull();
    expect(campoSI(RADIO_MIN_LECTURA_PX, 0, origen)).not.toBeNull();
    expect(potencialSI(RADIO_MIN_LECTURA_PX, 0, origen)).not.toBeNull();
  });

  it("null si el punto esta dentro de CUALQUIERA de las cargas", () => {
    const dos: PuntoCarga[] = [
      { x: 100, y: 0, q: 1 },
      { x: 5, y: 5, q: -1 },
    ];
    expect(campoSI(0, 0, dos)).toBeNull();
    expect(potencialSI(0, 0, dos)).toBeNull();
  });

  it("sin cargas: campo y potencial cero (no null)", () => {
    expect(campoSI(50, 50, [])).toEqual({ ex: 0, ey: 0, modulo: 0 });
    expect(potencialSI(50, 50, [])).toBe(0);
  });

  it("punto medio de un dipolo +1/-1: V = 0 y E = 2*E(1 carga a 50 px)", () => {
    const dip: PuntoCarga[] = [
      { x: -50, y: 0, q: 1 },
      { x: 50, y: 0, q: -1 },
    ];
    expect(potencialSI(0, 0, dip)).toBe(0);
    cercano(campoSI(0, 0, dip)!.modulo, 2 * campoSI(50, 0, origen)!.modulo);
  });
});

describe("formatCientifica", () => {
  it("no hace doble redondeo en el empate 999.5", () => {
    expect(formatCientifica(999.5, "N/C")).toBe("1.00 × 10³ N/C");
    expect(formatCientifica(999.4, "N/C")).toBe("999 N/C");
  });

  it("notacion cientifica con superindices Unicode", () => {
    expect(formatCientifica(8.98755179e7, "N/C")).toBe("8.99 × 10⁷ N/C");
    expect(formatCientifica(-1.146e9, "N/C")).toBe(`${MENOS}1.15 × 10⁹ N/C`);
  });

  it("exponentes negativos y decimal simple entre 0.1 y 1000", () => {
    expect(formatCientifica(4.5e-3, "N/C")).toBe("4.50 × 10⁻³ N/C");
    expect(formatCientifica(12.345, "N/C")).toBe("12.3 N/C");
    expect(formatCientifica(0, "N/C")).toBe("0 N/C");
  });

  it("el redondeo de la mantisa a 10 sube el exponente", () => {
    expect(formatCientifica(9.996e7, "N/C")).toBe("1.00 × 10⁸ N/C");
  });
});

describe("formatDistancia y pasoAgradable", () => {
  it("mm / cm / m", () => {
    expect(formatDistancia(0.05)).toBe("5 cm");
    expect(formatDistancia(0.0028)).toBe("2.8 mm");
    expect(formatDistancia(0.14)).toBe("14 cm");
    expect(formatDistancia(2)).toBe("2 m");
  });

  it("pasoAgradable redondea a 1-2-5 x 10^n", () => {
    cercano(pasoAgradable(3.4e5), 5e5);
    cercano(pasoAgradable(8e4), 1e5);
    cercano(pasoAgradable(1.2e3), 1e3);
    expect(pasoAgradable(0)).toBe(0);
  });
});

describe("leyenda", () => {
  it("cuadrosBarra: 5 para 700, 2 para 520, 1 para 150", () => {
    expect(cuadrosBarra(700)).toBe(5);
    expect(cuadrosBarra(520)).toBe(2);
    expect(cuadrosBarra(150)).toBe(1);
  });

  it("geometriaLeyenda(700, 1)", () => {
    expect(geometriaLeyenda(700, 1)).toEqual({
      cuadros: 5,
      largoPx: 250,
      etiquetaLargo: "5 cm",
      etiquetaCuadro: "1 cuadro = 1 cm",
      fuentePx: 13,
      margenPx: 12,
      padPx: 6,
      grosorPx: 2,
      marcaPx: 6,
    });
  });

  it("compensa texto y grosores por escalaCss pero no el largo de la barra", () => {
    expect(geometriaLeyenda(700, 0.5).fuentePx).toBe(26);
    const g = geometriaLeyenda(700, 0.25);
    expect(g.fuentePx).toBe(26); // tope
    expect(g.largoPx).toBe(250);
    expect(g.grosorPx).toBe(8);
  });

  it("coherencia barra <-> cuadricula <-> escala: la barra mide lo que dice", () => {
    for (const ancho of [150, 520, 700]) {
      const g = geometriaLeyenda(ancho, 1);
      // largo en px = cuadros enteros de la cuadricula (marcas sobre lineas de la malla)
      expect(g.largoPx % PX_POR_CUADRO).toBe(0);
      expect(g.largoPx).toBeLessThanOrEqual(0.4 * ancho);
      // los px de la barra, convertidos a metros, son los cuadros x 1 cm del rotulo
      cercano(pxAMetros(g.largoPx), g.cuadros * ESCALA.mPorCuadro);
      cercano(metrosAPx(g.cuadros * ESCALA.mPorCuadro), g.largoPx);
      expect(g.etiquetaLargo).toBe(formatDistancia(pxAMetros(g.largoPx)));
    }
  });

  it("nunca baja de 11 px de fuente si el canvas se amplia", () => {
    expect(geometriaLeyenda(700, 2).fuentePx).toBe(11);
  });
});
