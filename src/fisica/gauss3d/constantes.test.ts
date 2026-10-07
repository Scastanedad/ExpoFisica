/**
 * README de pruebas — constantes.ts (contrato §3, §1, §4).
 * Valores literales del contrato y las desigualdades de diseño que sostienen los invariantes de Gauss
 * (semilla de línea > franja de distancia mínima, etc.). Si una constante cambia, se edita antes el contrato.
 */
import { describe, expect, it } from "vitest";
import {
  DIST_MIN_CARGAS,
  DIST_MIN_SUP,
  E_MIN_3D,
  LINEAS_POR_UC,
  MAX_CARGAS,
  MAX_PUNTOS_LINEA,
  MIN_LINEAS_CARGA,
  NIVELES_GAUSS3D,
  RANGOS,
  R_ABS_3D,
  R_LIMITE_FACTOR,
  R_SEED_3D,
  SOFT2_3D,
} from "./constantes";

describe("constantes gauss3d", () => {
  it("valores del contrato", () => {
    expect(SOFT2_3D).toBe(0.01);
    expect(DIST_MIN_SUP).toBe(0.4);
    expect(DIST_MIN_CARGAS).toBe(0.8);
    expect(R_SEED_3D).toBe(0.35);
    expect(R_ABS_3D).toBe(0.25);
    expect(R_LIMITE_FACTOR).toBe(3);
    expect(E_MIN_3D).toBe(1e-7);
    expect(MIN_LINEAS_CARGA).toBe(6);
    expect(MAX_PUNTOS_LINEA).toBe(256);
    expect(MAX_CARGAS).toBe(2);
  });

  it("desigualdades de diseño (semilla no cruza la franja; semilla de una no cae en la absorción de la otra)", () => {
    expect(R_SEED_3D).toBeLessThan(DIST_MIN_SUP);
    expect(DIST_MIN_CARGAS).toBeGreaterThanOrEqual(R_SEED_3D + R_ABS_3D - 1e-12);
    expect(R_ABS_3D).toBeLessThan(R_SEED_3D);
  });

  it("LINEAS_POR_UC es uno de los candidatos del plan §7 (16, 20 o 24)", () => {
    expect([16, 20, 24]).toContain(LINEAS_POR_UC);
  });

  it("NIVELES_GAUSS3D: 3 niveles ordenados alta→baja con los números del contrato", () => {
    expect(NIVELES_GAUSS3D).toHaveLength(3);
    expect(NIVELES_GAUSS3D.map((n) => n.nombre)).toEqual(["alta", "media", "baja"]);
    expect(NIVELES_GAUSS3D.map((n) => n.presupuestoLineas)).toEqual([240, 120, 60]);
    expect(NIVELES_GAUSS3D.map((n) => n.pasoLinea)).toEqual([0.15, 0.2, 0.3]);
    expect(NIVELES_GAUSS3D.map((n) => [...n.mallaEsfera])).toEqual([[24, 48], [18, 36], [12, 24]]);
    expect(NIVELES_GAUSS3D.map((n) => n.celdasCara)).toEqual([12, 9, 6]);
    expect(NIVELES_GAUSS3D.map((n) => [...n.celdasCilindro])).toEqual([[8, 48], [6, 36], [4, 24]]);
    expect(NIVELES_GAUSS3D.map((n) => n.tapaFlechas)).toEqual([120, 70, 36]);
  });

  it("RANGOS contiene los límites de §1 (cada número aparece en la estructura)", () => {
    const nums = new Set<number>();
    const rec = (v: unknown) => {
      if (typeof v === "number") nums.add(v);
      else if (Array.isArray(v)) v.forEach(rec);
      else if (v && typeof v === "object") Object.values(v).forEach(rec);
    };
    rec(RANGOS);
    for (const n of [2, 8, 5, 4, 16, 12, -12, 10, -10]) expect(nums.has(n), `falta ${n}`).toBe(true);
  });
});
