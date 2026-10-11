import { describe, expect, it } from "vitest";
import { e, paralelo, serie, tauRC, tauVisual } from "../../fisica/circuitos";
import {
  MENSAJE_REINICIO,
  NOTA_ESCALA_TIEMPO,
  NOTA_SENTIDO_DESCARGA,
  TEXTO_DESCARGA,
  TEXTO_BATERIA_BAJADA,
  TEXTO_DESCARGA_SIN_CARGA,
  TEXTO_ENERGIA_CARGA,
  anuncioFase,
  formatearFactor,
  rotuloCorriente,
  rotuloTiempo,
  textoEducativoE7,
  textoFase,
} from "./textosE7";

const uF = 1e-6;

describe("rótulo del tiempo dilatado", () => {
  it("el preset por defecto: ×30 más lento, τ real 100 ms, en pantalla 3,0 s", () => {
    expect(rotuloTiempo(0.1, tauVisual(0.1))).toBe("Tiempo ×30 más lento (τ real = 100 ms, en pantalla = 3,0 s)");
  });

  it("τ de 10 µs: factor ×100 000 con espacio fino y 1,0 s en pantalla", () => {
    const t = rotuloTiempo(10e-6, tauVisual(10e-6));
    expect(t).toContain("×100 000 más lento");
    expect(t).toContain("τ real = 10 µs");
    expect(t).toContain("en pantalla = 1,0 s");
  });

  it("τ de 10 s se ve más rápido que lo real (F < 1) y lo dice", () => {
    const t = rotuloTiempo(10, tauVisual(10));
    expect(t).toBe("Tiempo ×2,5 más rápido (τ real = 10 s, en pantalla = 4,0 s)");
  });

  it("siempre lleva el factor o dice que es tiempo real", () => {
    for (const tau of [1e-6, 1e-5, 1e-3, 0.1, 1, 5, 10]) {
      expect(rotuloTiempo(tau, tauVisual(tau))).toMatch(/Tiempo (×|real)/);
    }
  });

  it("el τ del rótulo es el de la red real: s(200,400,400) µF con 1 kΩ", () => {
    const tau = tauRC(serie(e("C1", 200 * uF), e("C2", 400 * uF), e("C3", 400 * uF)), 1000);
    expect(tau).toBeCloseTo(0.1, 12);
  });

  it("formatearFactor", () => {
    expect(formatearFactor(2.5)).toBe("2,5");
    expect(formatearFactor(30)).toBe("30");
    expect(formatearFactor(1234)).toBe("1 234");
  });

  it("la nota de escala avisa que no es lineal y que las gráficas son de tiempo real", () => {
    expect(NOTA_ESCALA_TIEMPO).toContain("no es lineal");
    expect(NOTA_ESCALA_TIEMPO).toContain("tiempo real");
  });
});

describe("rótulo de la corriente", () => {
  it("en descarga o con signo negativo se rotula «sentido invertido»", () => {
    expect(rotuloCorriente("descargar", 0)).toBe("I (sentido invertido)");
    expect(rotuloCorriente("descargar", -0.005)).toBe("I (sentido invertido)");
    expect(rotuloCorriente("cargar", -0.005)).toBe("I (sentido invertido)");
  });
  it("al cargar es simplemente I (y una corriente ≈ 0 negativa no la invierte)", () => {
    expect(rotuloCorriente("cargar", 0.01)).toBe("I");
    expect(rotuloCorriente("cargar", -1e-12)).toBe("I");
  });
});

describe("textos educativos de E7", () => {
  const unos = e("C1", 100 * uF);
  const ser = serie(e("C1", 100 * uF), e("C2", 100 * uF));
  const par = paralelo(e("C1", 100 * uF), e("C2", 100 * uF));
  const mix = serie(par, e("C3", 100 * uF));
  const todo = (t: ReturnType<typeof textoEducativoE7>) => [t.titulo, ...t.parrafos].join(" ");

  it("siempre dice que la carga no atraviesa el aislante y que la corriente no «pasa por» el capacitor", () => {
    for (const a of [unos, ser, par, mix]) {
      const t = todo(textoEducativoE7(a, "cargar", "cargando"));
      expect(t).toContain("la carga no atraviesa el aislante");
      expect(t).toContain("no «pasa por» el capacitor");
    }
  });

  it("serie: misma carga; paralelo: mismo voltaje; mixto: invita a reducir", () => {
    expect(todo(textoEducativoE7(ser, "cargar", "cargando"))).toContain("la misma carga Q");
    expect(todo(textoEducativoE7(par, "cargar", "cargando"))).toContain("el mismo voltaje");
    expect(todo(textoEducativoE7(mix, "cargar", "cargando"))).toContain("Reducir un paso");
    expect(textoEducativoE7(ser, "cargar", "cargando").titulo).toBe("Capacitores en serie");
  });

  it("los balances de energía se anuncian «al terminar de cargar», nunca «a 5τ»", () => {
    expect(TEXTO_ENERGIA_CARGA).toContain("Al terminar de cargar");
    expect(TEXTO_ENERGIA_CARGA).not.toMatch(/a 5\s?τ/);
    expect(TEXTO_ENERGIA_CARGA).toContain("sea cual sea su resistencia");
  });

  it("al descargar: la corriente va al revés porque el capacitor es la fuente; sin carga pide cargar primero", () => {
    expect(todo(textoEducativoE7(ser, "descargar", "descargando"))).toContain(TEXTO_DESCARGA);
    expect(TEXTO_DESCARGA).toContain("ahora el capacitor es la fuente");
    expect(todo(textoEducativoE7(ser, "descargar", "descargado"))).toContain(TEXTO_DESCARGA_SIN_CARGA);
    expect(NOTA_SENTIDO_DESCARGA).toContain("al revés");
    expect(NOTA_SENTIDO_DESCARGA).toContain("signo menos");
  });

  it("con «Cargar» y los capacitores por encima de E (se bajó la batería) no promete C·E² entregada", () => {
    const t = todo(textoEducativoE7(ser, "cargar", "descargando"));
    expect(t).toContain(TEXTO_BATERIA_BAJADA);
    expect(t).not.toContain(TEXTO_ENERGIA_CARGA);
  });

  it("anuncios de fase para lectores de pantalla", () => {
    expect(anuncioFase("cargado")).toContain("Terminó de cargar");
    expect(anuncioFase("descargando")).toContain("al revés");
    expect(anuncioFase("cargando")).toContain("Cargando");
    expect(anuncioFase("descargado")).toContain("Terminó de descargar");
    expect(textoFase("cargado")).toBe("Cargado");
    expect(MENSAJE_REINICIO).toContain("descargados");
  });
});
