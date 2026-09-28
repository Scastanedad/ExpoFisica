import { describe, expect, it } from "vitest";
import {
  CAPACIDAD_DEFECTO,
  capacidadParaVentana,
  crearColeccionSeries,
  crearSerie,
  serieAFilaCSV,
  seriesACSV,
  seriesACSVAncho,
  type FilaCSV,
} from "./series";

describe("crearSerie: push/lectura", () => {
  it("empieza vacía", () => {
    const s = crearSerie({ clave: "k", etiqueta: "Cinética", unidad: "J", capacidad: 5 });
    expect(s.longitud()).toBe(0);
    expect(s.ultimo()).toBeNull();
    expect(s.leer()).toEqual([]);
  });

  it("push/leer conserva orden cronológico y valores", () => {
    const s = crearSerie({ clave: "k", etiqueta: "Cinética", unidad: "J", capacidad: 5 });
    s.push(0, 1);
    s.push(10, 2);
    s.push(20, 3);
    expect(s.longitud()).toBe(3);
    expect(s.leer()).toEqual([
      { t: 0, valor: 1 },
      { t: 10, valor: 2 },
      { t: 20, valor: 3 },
    ]);
    expect(s.ultimo()).toEqual({ t: 20, valor: 3 });
  });

  it("descarta t/valor no finitos (NaN, ±Infinity)", () => {
    const s = crearSerie({ clave: "k", etiqueta: "k", unidad: "J", capacidad: 5 });
    s.push(0, 1);
    s.push(NaN, 2);
    s.push(10, Infinity);
    s.push(Infinity, 3);
    expect(s.longitud()).toBe(1);
    expect(s.leer()).toEqual([{ t: 0, valor: 1 }]);
  });

  it("capacidad mínima de 1 aunque se pida 0 o negativa", () => {
    const s = crearSerie({ clave: "k", etiqueta: "k", unidad: "J", capacidad: 0 });
    expect(s.capacidad).toBe(1);
    s.push(0, 1);
    s.push(1, 2);
    expect(s.leer()).toEqual([{ t: 1, valor: 2 }]);
  });

  it("vaciar() resetea la serie sin cambiar su configuración", () => {
    const s = crearSerie({ clave: "k", etiqueta: "Cinética", unidad: "J", capacidad: 3 });
    s.push(0, 1);
    s.push(1, 2);
    s.vaciar();
    expect(s.longitud()).toBe(0);
    expect(s.leer()).toEqual([]);
    expect(s.capacidad).toBe(3);
    expect(s.clave).toBe("k");
  });
});

describe("crearSerie: comportamiento de ring buffer al llenarse", () => {
  it("con capacidad 3, la 4ª muestra descarta la más antigua (FIFO)", () => {
    const s = crearSerie({ clave: "k", etiqueta: "k", unidad: "J", capacidad: 3 });
    s.push(0, 1);
    s.push(1, 2);
    s.push(2, 3);
    expect(s.leer()).toEqual([
      { t: 0, valor: 1 },
      { t: 1, valor: 2 },
      { t: 2, valor: 3 },
    ]);
    s.push(3, 4);
    expect(s.longitud()).toBe(3);
    expect(s.leer()).toEqual([
      { t: 1, valor: 2 },
      { t: 2, valor: 3 },
      { t: 3, valor: 4 },
    ]);
  });

  it("nunca supera la capacidad tras muchos más push que capacidad (sin fuga de memoria)", () => {
    const capacidad = 10;
    const s = crearSerie({ clave: "k", etiqueta: "k", unidad: "J", capacidad });
    for (let i = 0; i < 10_000; i++) {
      s.push(i, i * 2);
      expect(s.longitud()).toBeLessThanOrEqual(capacidad);
    }
    expect(s.longitud()).toBe(capacidad);
    const leidas = s.leer();
    expect(leidas).toHaveLength(capacidad);
    // Las últimas 10 muestras son 9990..9999.
    expect(leidas[0]).toEqual({ t: 9990, valor: 19980 });
    expect(leidas[9]).toEqual({ t: 9999, valor: 19998 });
  });

  it("mantiene el orden cronológico correcto tras dar varias vueltas al buffer", () => {
    const s = crearSerie({ clave: "k", etiqueta: "k", unidad: "J", capacidad: 4 });
    for (let i = 0; i < 13; i++) s.push(i, i);
    // Las últimas 4: t = 9,10,11,12.
    expect(s.leer().map((m) => m.t)).toEqual([9, 10, 11, 12]);
  });
});

describe("crearSerie: ventana de lectura no destructiva", () => {
  it("leer(ventanaS) filtra sin mutar el buffer", () => {
    const s = crearSerie({ clave: "k", etiqueta: "k", unidad: "J", capacidad: 10 });
    for (let t = 0; t <= 100; t += 10) s.push(t, t);
    expect(s.longitud()).toBe(10); // capacidad 10: ya se sobrescribió el t=0

    const ventana = s.leer(20); // últimos 20 (unidades de t) respecto al último t: [100-20, 100]
    expect(ventana.map((m) => m.t)).toEqual([80, 90, 100]);

    // Una segunda lectura con ventana distinta ve el mismo contenido retenido.
    expect(s.leer(1000).length).toBe(10);
    expect(s.longitud()).toBe(10);
  });

  it("ventanaS mayor que la historia retenida devuelve todo lo que hay", () => {
    const s = crearSerie({ clave: "k", etiqueta: "k", unidad: "J", capacidad: 5 });
    s.push(0, 1);
    s.push(1, 2);
    expect(s.leer(1e9)).toEqual([
      { t: 0, valor: 1 },
      { t: 1, valor: 2 },
    ]);
  });
});

describe("capacidadParaVentana / CAPACIDAD_DEFECTO", () => {
  it("da al menos hz*segundos, con margen", () => {
    expect(capacidadParaVentana(10, 120)).toBeGreaterThanOrEqual(1200);
    expect(capacidadParaVentana(4, 60)).toBeGreaterThanOrEqual(240);
  });

  it("valores inválidos (<=0) devuelven 1, no NaN/Infinity", () => {
    expect(capacidadParaVentana(0, 10)).toBe(1);
    expect(capacidadParaVentana(10, 0)).toBe(1);
    expect(capacidadParaVentana(-5, 10)).toBe(1);
  });

  it("CAPACIDAD_DEFECTO es finita y positiva", () => {
    expect(CAPACIDAD_DEFECTO).toBeGreaterThan(0);
    expect(Number.isFinite(CAPACIDAD_DEFECTO)).toBe(true);
  });
});

describe("crearColeccionSeries", () => {
  const configs = [
    { clave: "K", etiqueta: "Cinética", unidad: "J", capacidad: 5 },
    { clave: "U", etiqueta: "Potencial", unidad: "J", capacidad: 5 },
    { clave: "total", etiqueta: "Total", unidad: "J", capacidad: 5 },
  ];

  it("push por clave llega a la serie correcta; clave desconocida es no-op", () => {
    const c = crearColeccionSeries(configs);
    c.push("K", 0, 1);
    c.push("no-existe", 0, 99);
    expect(c.serie("K")?.leer()).toEqual([{ t: 0, valor: 1 }]);
    expect(c.serie("U")?.leer()).toEqual([]);
  });

  it("pushLote escribe el mismo t en varias series y omite claves desconocidas", () => {
    const c = crearColeccionSeries(configs);
    c.pushLote(100, { K: 1, U: -2, total: -1, otra: 5 });
    expect(c.serie("K")?.ultimo()).toEqual({ t: 100, valor: 1 });
    expect(c.serie("U")?.ultimo()).toEqual({ t: 100, valor: -2 });
    expect(c.serie("total")?.ultimo()).toEqual({ t: 100, valor: -1 });
  });

  it("claves() conserva el orden de configuración", () => {
    const c = crearColeccionSeries(configs);
    expect(c.claves()).toEqual(["K", "U", "total"]);
  });

  it("todas las series están activas por defecto", () => {
    const c = crearColeccionSeries(configs);
    expect(c.activas()).toEqual(["K", "U", "total"]);
    expect(c.esActiva("K")).toBe(true);
  });

  it("activasIniciales limita el conjunto inicial de activas", () => {
    const c = crearColeccionSeries(configs, { activasIniciales: ["U"] });
    expect(c.activas()).toEqual(["U"]);
    expect(c.esActiva("K")).toBe(false);
  });

  it("setActiva/setActivas cambian la selección; ignoran claves desconocidas", () => {
    const c = crearColeccionSeries(configs);
    c.setActiva("K", false);
    expect(c.activas()).toEqual(["U", "total"]);
    c.setActiva("K", true);
    expect(c.activas()).toEqual(["K", "U", "total"]);

    c.setActivas(["total", "no-existe"]);
    expect(c.activas()).toEqual(["total"]);
  });

  it("vaciar(clave) vacía solo esa serie; vaciar() sin argumento vacía todas", () => {
    const c = crearColeccionSeries(configs);
    c.pushLote(0, { K: 1, U: 2, total: 3 });
    c.vaciar("K");
    expect(c.serie("K")?.longitud()).toBe(0);
    expect(c.serie("U")?.longitud()).toBe(1);

    c.vaciar();
    expect(c.serie("U")?.longitud()).toBe(0);
    expect(c.serie("total")?.longitud()).toBe(0);
  });
});

describe("seriesACSV (formato largo)", () => {
  it("genera cabecera y filas separadas por coma, ordenadas por t y luego clave", () => {
    const entradas: FilaCSV[] = [
      { clave: "E", etiqueta: "Campo", unidad: "N/C", muestras: [{ t: 1000, valor: 12.5 }] },
      { clave: "V", etiqueta: "Potencial", unidad: "V", muestras: [{ t: 0, valor: 3 }] },
    ];
    const csv = seriesACSV(entradas, { decimales: 2 });
    const filas = csv.trim().split("\r\n");
    expect(filas[0]).toBe("t_s,serie,etiqueta,unidad,valor");
    // t=0 (V) antes que t=1000ms=1s (E).
    expect(filas[1]).toBe("0.00,V,Potencial,V,3.00");
    expect(filas[2]).toBe("1.00,E,Campo,N/C,12.50");
  });

  it("factorTiempo por defecto convierte ms a segundos", () => {
    const entradas: FilaCSV[] = [
      { clave: "K", etiqueta: "Cinética", unidad: "J", muestras: [{ t: 2500, valor: 1 }] },
    ];
    const csv = seriesACSV(entradas, { decimales: 3 });
    expect(csv).toContain("2.500,K,Cinética,J,1.000");
  });

  it("soloClaves filtra qué series se exportan", () => {
    const entradas: FilaCSV[] = [
      { clave: "K", etiqueta: "K", unidad: "J", muestras: [{ t: 0, valor: 1 }] },
      { clave: "U", etiqueta: "U", unidad: "J", muestras: [{ t: 0, valor: 2 }] },
    ];
    const csv = seriesACSV(entradas, { soloClaves: ["U"] });
    expect(csv).not.toContain(",K,");
    expect(csv).toContain(",U,");
  });

  it("escapa campos con separador o comillas (RFC 4180)", () => {
    const entradas: FilaCSV[] = [
      { clave: "x", etiqueta: 'Fuerza, "F"', unidad: "N", muestras: [{ t: 0, valor: 1 }] },
    ];
    const csv = seriesACSV(entradas);
    expect(csv).toContain('"Fuerza, ""F"""');
  });

  it("con separador personalizado, usa ese separador en todas las columnas", () => {
    const entradas: FilaCSV[] = [
      { clave: "K", etiqueta: "K", unidad: "J", muestras: [{ t: 0, valor: 1.5 }] },
    ];
    const csv = seriesACSV(entradas, { separador: ";", decimales: 1 });
    expect(csv.split("\r\n")[0]).toBe("t_s;serie;etiqueta;unidad;valor");
    expect(csv).toContain("0.0;K;K;J;1.5");
  });

  it("sin muestras, produce solo la cabecera", () => {
    const csv = seriesACSV([{ clave: "K", etiqueta: "K", unidad: "J", muestras: [] }]);
    expect(csv.trim().split("\r\n")).toEqual(["t_s,serie,etiqueta,unidad,valor"]);
  });

  it("no deja -0 en la salida", () => {
    const entradas: FilaCSV[] = [
      { clave: "K", etiqueta: "K", unidad: "J", muestras: [{ t: 0, valor: -0 }] },
    ];
    const csv = seriesACSV(entradas, { decimales: 2 });
    expect(csv).not.toContain("-0.00");
    expect(csv).toContain("0.00,K,K,J,0.00");
  });
});

describe("seriesACSVAncho (formato ancho)", () => {
  it("une varias series con el mismo t en columnas separadas", () => {
    const entradas: FilaCSV[] = [
      {
        clave: "K",
        etiqueta: "Cinética",
        unidad: "J",
        muestras: [
          { t: 0, valor: 1 },
          { t: 250, valor: 2 },
        ],
      },
      {
        clave: "U",
        etiqueta: "Potencial",
        unidad: "J",
        muestras: [
          { t: 0, valor: -1 },
          { t: 250, valor: -2 },
        ],
      },
    ];
    const csv = seriesACSVAncho(entradas, { decimales: 1 });
    expect(csv).not.toBeNull();
    const filas = csv!.trim().split("\r\n");
    expect(filas[0]).toBe("t_s,Cinética (J),Potencial (J)");
    expect(filas[1]).toBe("0.0,1.0,-1.0");
    expect(filas[2]).toBe("0.3,2.0,-2.0");
  });

  it("devuelve null si las series no comparten los mismos t (no inventa alineado)", () => {
    const entradas: FilaCSV[] = [
      { clave: "K", etiqueta: "K", unidad: "J", muestras: [{ t: 0, valor: 1 }] },
      { clave: "U", etiqueta: "U", unidad: "J", muestras: [{ t: 5, valor: 2 }] },
    ];
    expect(seriesACSVAncho(entradas)).toBeNull();
  });

  it("devuelve null si las series tienen distinto número de muestras", () => {
    const entradas: FilaCSV[] = [
      {
        clave: "K",
        etiqueta: "K",
        unidad: "J",
        muestras: [
          { t: 0, valor: 1 },
          { t: 1, valor: 2 },
        ],
      },
      { clave: "U", etiqueta: "U", unidad: "J", muestras: [{ t: 0, valor: 1 }] },
    ];
    expect(seriesACSVAncho(entradas)).toBeNull();
  });

  it("devuelve null con una lista vacía de entradas", () => {
    expect(seriesACSVAncho([])).toBeNull();
  });
});

describe("serieAFilaCSV", () => {
  it("convierte una Serie en FilaCSV respetando la ventana", () => {
    const s = crearSerie({ clave: "K", etiqueta: "Cinética", unidad: "J", capacidad: 10 });
    for (let t = 0; t <= 40; t += 10) s.push(t, t / 10);
    const fila = serieAFilaCSV(s, 15);
    expect(fila.clave).toBe("K");
    expect(fila.etiqueta).toBe("Cinética");
    expect(fila.unidad).toBe("J");
    expect(fila.muestras).toEqual([
      { t: 30, valor: 3 },
      { t: 40, valor: 4 },
    ]);
  });

  it("integra con crearColeccionSeries + seriesACSV extremo a extremo", () => {
    const c = crearColeccionSeries([
      { clave: "K", etiqueta: "Cinética", unidad: "J", capacidad: 100 },
      { clave: "U", etiqueta: "Potencial", unidad: "J", capacidad: 100 },
    ]);
    c.pushLote(0, { K: 1, U: -1 });
    c.pushLote(250, { K: 1.1, U: -1.1 });
    const filas = c.claves().map((clave) => serieAFilaCSV(c.serie(clave)!));
    const csv = seriesACSV(filas, { decimales: 1 });
    expect(csv).toContain("0.0,K,Cinética,J,1.0");
    expect(csv).toContain("0.3,U,Potencial,J,-1.1");
  });
});
