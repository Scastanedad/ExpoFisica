/**
 * README de pruebas — unionesBuffers.ts (contrato §3 y §4 "capacidades fijas por diseño").
 * Preasignación: líneas 240 × MAX_PUNTOS_LINEA puntos; cruces ≤ 2·líneas. Los buffers nuevos están vacíos (n = 0).
 */
import { describe, expect, it } from "vitest";
import { MAX_PUNTOS_LINEA, NIVELES_GAUSS3D } from "./constantes";
import { crearBufferesCruces, crearBufferesLineas } from "./unionesBuffers";

describe("crearBufferesLineas", () => {
  it("capacidad para maxLineas líneas de MAX_PUNTOS_LINEA puntos; vacío; tipos correctos", () => {
    const max = NIVELES_GAUSS3D[0].presupuestoLineas;
    const L = crearBufferesLineas(max);
    expect(L.n).toBe(0);
    expect(L.inicio).toBeInstanceOf(Uint32Array);
    expect(L.puntos).toBeInstanceOf(Float32Array);
    expect(L.carga).toBeInstanceOf(Uint8Array);
    expect(L.signo).toBeInstanceOf(Int8Array);
    expect(L.sentido).toBeInstanceOf(Int8Array);
    expect(L.fin).toBeInstanceOf(Uint8Array);
    expect(L.finCarga).toBeInstanceOf(Int8Array);
    expect(L.lineasPorCarga).toBeInstanceOf(Uint16Array);
    expect(L.lineasPorCarga).toHaveLength(2);
    expect(L.inicio.length).toBeGreaterThanOrEqual(max + 1);
    expect(L.puntos.length).toBeGreaterThanOrEqual(3 * max * MAX_PUNTOS_LINEA);
    for (const a of [L.carga, L.signo, L.sentido, L.fin, L.finCarga]) expect(a.length).toBeGreaterThanOrEqual(max);
  });
  it("buffers distintos en cada llamada (no se comparten)", () => {
    expect(crearBufferesLineas(10).puntos).not.toBe(crearBufferesLineas(10).puntos);
  });
});

describe("crearBufferesCruces", () => {
  it("capacidad para maxCruces cruces; vacío", () => {
    const X = crearBufferesCruces(480);
    expect(X.n).toBe(0);
    expect([X.salen, X.entran]).toEqual([0, 0]);
    expect(X.posicion).toBeInstanceOf(Float32Array);
    expect(X.posicion.length).toBeGreaterThanOrEqual(3 * 480);
    for (const a of [X.linea, X.segmento, X.t, X.sentido]) expect(a.length).toBeGreaterThanOrEqual(480);
    expect(X.linea).toBeInstanceOf(Uint32Array);
    expect(X.segmento).toBeInstanceOf(Uint32Array);
    expect(X.sentido).toBeInstanceOf(Int8Array);
  });
});
