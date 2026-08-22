/**
 * Store de Zustand — SOLO estado que cambia por acción del usuario (agregar/
 * quitar cargas, modo de vista, unidad mostrada). Las posiciones de cada
 * carga NO viven aquí: viven fuera de React, en un ref del componente de
 * renderizado (ver render/CanvasRenderer.tsx), siguiendo el patrón de
 * .claude/skills/arquitectura-simulaciones-web/references/gestion_estado.md.
 */
import { create } from "zustand";
import type { CargaMeta, ModoVista, UnidadCarga } from "../types/simulacion";

interface EstadoSimulacion {
  cargas: CargaMeta[];
  modoVista: ModoVista;
  unidadCarga: UnidadCarga;

  agregarCarga: (q: number) => void;
  quitarCarga: (id: string) => void;
  setModoVista: (modo: ModoVista) => void;
  toggleUnidadCarga: () => void;
}

let contadorId = 2;

export const useSimulacionStore = create<EstadoSimulacion>((set) => ({
  cargas: [
    { id: "carga-0", q: 1, anclada: false },
    { id: "carga-1", q: -1, anclada: false },
  ],
  modoVista: "vectores",
  unidadCarga: "microC",

  agregarCarga: (q) =>
    set((estado) => ({
      cargas: [...estado.cargas, { id: `carga-${contadorId++}`, q, anclada: false }],
    })),

  quitarCarga: (id) =>
    set((estado) => ({ cargas: estado.cargas.filter((c) => c.id !== id) })),

  setModoVista: (modo) => set({ modoVista: modo }),

  toggleUnidadCarga: () =>
    set((estado) => ({
      unidadCarga: estado.unidadCarga === "microC" ? "normalizada" : "microC",
    })),
}));
