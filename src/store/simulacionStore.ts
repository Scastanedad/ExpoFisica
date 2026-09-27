/**
 * Store de Zustand — SOLO estado que cambia por acción del usuario (agregar/
 * quitar cargas, magnitud, modo de vista, unidad mostrada). Las posiciones de
 * cada carga NO viven aquí: viven fuera de React, en un ref del componente de
 * renderizado (ver render/CanvasRenderer.tsx), siguiendo el patrón de
 * .claude/skills/arquitectura-simulaciones-web/references/gestion_estado.md.
 */
import { create } from "zustand";
import { aplicarMagnitud, normalizarCarga } from "../fisica/carga";
import type { CargaMeta, ModoVista, UnidadCarga } from "../types/simulacion";

interface EstadoSimulacion {
  cargas: CargaMeta[];
  modoVista: ModoVista;
  unidadCarga: UnidadCarga;
  /** Muestra el vector de fuerza neta sobre cada carga (E3.2). Compartido por las dos estaciones. */
  mostrarFuerzas: boolean;

  agregarCarga: (q: number) => void;
  quitarCarga: (id: string) => void;
  /** Cambia la magnitud de una carga; el signo no se edita. Ver fisica/carga.ts. */
  cambiarMagnitud: (id: string, q: number) => void;
  setModoVista: (modo: ModoVista) => void;
  toggleUnidadCarga: () => void;
  setMostrarFuerzas: (valor: boolean) => void;
}

let contadorId = 2;

export const useSimulacionStore = create<EstadoSimulacion>((set) => ({
  cargas: [
    { id: "carga-0", q: 1 },
    { id: "carga-1", q: -1 },
  ],
  modoVista: "vectores",
  unidadCarga: "microC",
  mostrarFuerzas: false,

  agregarCarga: (q) =>
    set((estado) => {
      const qn = normalizarCarga(q);
      if (qn === null) return estado;
      return { cargas: [...estado.cargas, { id: `carga-${contadorId++}`, q: qn }] };
    }),

  quitarCarga: (id) =>
    set((estado) => ({ cargas: estado.cargas.filter((c) => c.id !== id) })),

  cambiarMagnitud: (id, q) =>
    set((estado) => {
      const actual = estado.cargas.find((c) => c.id === id);
      if (!actual) return estado;
      const nueva = aplicarMagnitud(actual.q, q);
      if (nueva === null || nueva === actual.q) return estado;
      return { cargas: estado.cargas.map((c) => (c.id === id ? { ...c, q: nueva } : c)) };
    }),

  setModoVista: (modo) => set({ modoVista: modo }),

  toggleUnidadCarga: () =>
    set((estado) => ({
      unidadCarga: estado.unidadCarga === "microC" ? "normalizada" : "microC",
    })),

  setMostrarFuerzas: (valor) => set({ mostrarFuerzas: valor }),
}));
