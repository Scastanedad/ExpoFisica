import { describe, expect, it } from "vitest";
import {
  NIVELES_CALIDAD,
  UMBRAL_BAJAR_MS,
  UMBRAL_PERIODO_MS,
  UMBRAL_SUBIR_MS,
  VENTANA_BAJAR,
  VENTANA_SUBIR,
  crearGestorCalidad,
} from "./calidadCampo";

describe("niveles de calidad", () => {
  it("alta / media / baja: celda 10 / 12.5 / 25 px y presupuesto 200 / 120 / 60 líneas (E2.3 §8)", () => {
    expect(NIVELES_CALIDAD.map((n) => n.celda)).toEqual([10, 12.5, 25]);
    expect(NIVELES_CALIDAD.map((n) => n.presupuesto)).toEqual([200, 120, 60]);
    expect(NIVELES_CALIDAD.map((n) => n.paso)).toEqual([6, 8, 10]);
  });
});

describe("gestor de calidad", () => {
  it("empieza en alta y no baja mientras el tiempo sea razonable", () => {
    const g = crearGestorCalidad();
    for (let i = 0; i < 200; i++) g.registrar(UMBRAL_BAJAR_MS - 1);
    expect(g.nivel().nombre).toBe("alta");
  });

  it("baja de nivel cuando la media de 30 reconstrucciones supera 14 ms", () => {
    const g = crearGestorCalidad();
    let cambios = 0;
    for (let i = 0; i < VENTANA_BAJAR - 1; i++) if (g.registrar(20)) cambios++;
    expect(cambios).toBe(0);
    expect(g.registrar(20)).toBe(true);
    expect(g.nivel().nombre).toBe("media");
  });

  it("baja hasta el nivel más bajo y no más", () => {
    const g = crearGestorCalidad();
    for (let i = 0; i < 500; i++) g.registrar(50);
    expect(g.nivel().nombre).toBe("baja");
  });

  it("sube tras 60 reconstrucciones seguidas por debajo de 7 ms (una lenta reinicia la cuenta)", () => {
    const g = crearGestorCalidad(2);
    for (let i = 0; i < VENTANA_SUBIR - 1; i++) g.registrar(UMBRAL_SUBIR_MS - 1);
    g.registrar(UMBRAL_SUBIR_MS + 1);
    for (let i = 0; i < VENTANA_SUBIR - 1; i++) g.registrar(UMBRAL_SUBIR_MS - 1);
    expect(g.nivel().nombre).toBe("baja");
    expect(g.registrar(UMBRAL_SUBIR_MS - 1)).toBe(true);
    expect(g.nivel().nombre).toBe("media");
  });

  it("histéresis: tras subir y volver a bajar enseguida, cuesta el doble volver a subir", () => {
    const g = crearGestorCalidad(1);
    for (let i = 0; i < VENTANA_SUBIR; i++) g.registrar(1); // sube a alta
    expect(g.nivel().nombre).toBe("alta");
    for (let i = 0; i < VENTANA_BAJAR; i++) g.registrar(30); // vuelve a media
    expect(g.nivel().nombre).toBe("media");
    for (let i = 0; i < VENTANA_SUBIR; i++) g.registrar(1);
    expect(g.nivel().nombre).toBe("media"); // 60 ya no bastan
    for (let i = 0; i < VENTANA_SUBIR; i++) g.registrar(1);
    expect(g.nivel().nombre).toBe("alta"); // 120 sí
  });

  it("también baja si el frame siguiente tarda > 20 ms de media (raster diferido que el JS no ve)", () => {
    const g = crearGestorCalidad();
    for (let i = 0; i < 100; i++) g.observarFrame(16.7);
    for (let i = 0; i < VENTANA_BAJAR - 1; i++) expect(g.registrar(3, UMBRAL_PERIODO_MS + 8)).toBe(false);
    expect(g.registrar(3, UMBRAL_PERIODO_MS + 8)).toBe(true);
    expect(g.nivel().nombre).toBe("media");
  });

  it("un frame de 16.7 ms con el JS rápido no baja nunca (pantalla de 60 Hz)", () => {
    const g = crearGestorCalidad();
    for (let i = 0; i < 100; i++) g.observarFrame(16.7);
    for (let i = 0; i < 300; i++) g.registrar(4, 16.7);
    expect(g.nivel().nombre).toBe("alta");
  });

  it("en una pantalla de 30 Hz (frames de 33 ms) no se confunde el refresco con lentitud", () => {
    const g = crearGestorCalidad();
    for (let i = 0; i < 100; i++) g.observarFrame(33.3);
    expect(g.periodoRefresco()).toBeCloseTo(33.3, 5);
    for (let i = 0; i < 300; i++) g.registrar(4, 33.3);
    expect(g.nivel().nombre).toBe("alta");
  });

  it("no sube si hay frames perdidos aunque el JS sea rápido", () => {
    const g = crearGestorCalidad(1);
    for (let i = 0; i < 100; i++) g.observarFrame(16.7);
    for (let i = 0; i < 200; i++) g.registrar(2, 21.5); // perdió un vsync pero aún no baja
    expect(g.nivel().nombre).toBe("media");
  });
});
