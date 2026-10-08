/**
 * Los 9 escenarios de la estación Ley de Gauss (contrato §5): casos de referencia para tests (física, render, e2e),
 * NO UI. El panel ya no los ofrece: el visitante elige figura y fuente (`presets.ts`). No confundir con el tipo
 * `Escenario` de `tipos.ts`, que es la entrada del motor. Tamaños en u (1 u = 1 cm), cargas en µC.
 */
import type { Carga3D, Superficie } from "./tipos";

export interface DefEscenario {
  id: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;
  nombre: string;
  superficie: Superficie;
  cargas: Carga3D[];
  /** Toggles iniciales: líneas, flujo (parches), flechas de campo. */
  mostrar: { lineas: boolean; flujo: boolean; campo: boolean };
  /** Vista inicial en radianes (35° / 30°). */
  vista: { azimut: number; inclinacion: number };
  /** Φ en µC/ε₀ (= q_enc en cerradas) y q_enc esperados. */
  esperado: { phi: number; qEnc: number; texto?: string };
  /** Escenario 3: variante «fuera» (botón dentro/fuera). */
  variante?: { cargas: Carga3D[]; esperado: { phi: number; qEnc: number } };
}

const VISTA = { azimut: (35 * Math.PI) / 180, inclinacion: (30 * Math.PI) / 180 };
const c = (x: number, y: number, z: number, q: number): Carga3D => ({ x, y, z, q });
const ESFERA5: Superficie = { tipo: "esfera", radio: 5 };

export const ESCENARIOS: readonly DefEscenario[] = [
  {
    id: 1,
    nombre: "Parche y ángulo (cos θ)",
    superficie: { tipo: "parche", lado: 4, theta: 0, phi: 0 },
    cargas: [c(0, 0, -6, 5)],
    mostrar: { lineas: true, flujo: true, campo: false },
    vista: VISTA,
    esperado: { phi: 5 * 0.031884, qEnc: 0, texto: "Φ/q = 0.03188, 0.02925, 0.01928, 0 para θ = 0°, 30°, 60°, 90°" },
  },
  {
    id: 2,
    nombre: "Superficie cerrada",
    superficie: ESFERA5,
    cargas: [c(0, 0, 0, 3)],
    mostrar: { lineas: true, flujo: true, campo: false },
    vista: VISTA,
    esperado: { phi: 3, qEnc: 3 },
  },
  {
    id: 3,
    nombre: "Dentro / fuera",
    superficie: ESFERA5,
    cargas: [c(1.5, 1, 2, 3)],
    mostrar: { lineas: true, flujo: true, campo: false },
    vista: VISTA,
    esperado: { phi: 3, qEnc: 3 },
    variante: { cargas: [c(8, 0, 0, 3)], esperado: { phi: 0, qEnc: 0 } },
  },
  {
    id: 4,
    nombre: "Cambiar el tamaño",
    superficie: ESFERA5,
    cargas: [c(0, 0, 0, 3)],
    mostrar: { lineas: true, flujo: true, campo: true },
    vista: VISTA,
    esperado: { phi: 3, qEnc: 3 },
  },
  {
    id: 5,
    nombre: "Cubo, cilindro y esfera",
    superficie: { tipo: "cubo", lado: 8 },
    cargas: [c(1, -1, 0.5, 3)],
    mostrar: { lineas: true, flujo: true, campo: false },
    vista: VISTA,
    esperado: { phi: 3, qEnc: 3 },
  },
  {
    id: 6,
    nombre: "Una carga que cruza",
    superficie: ESFERA5,
    cargas: [c(0, 0, 8, 3)],
    mostrar: { lineas: true, flujo: true, campo: false },
    vista: VISTA,
    esperado: { phi: 0, qEnc: 0 },
  },
  {
    id: 7,
    nombre: "Dipolo",
    superficie: ESFERA5,
    cargas: [c(-2, 0, 0, 3), c(2, 0, 0, -3)],
    mostrar: { lineas: true, flujo: true, campo: true },
    vista: VISTA,
    esperado: { phi: 0, qEnc: 0 },
  },
  {
    id: 8,
    nombre: "Superficie abierta",
    superficie: { tipo: "parche", lado: 10, theta: 0, phi: 0 },
    cargas: [c(0, 0, -3, 3)],
    mostrar: { lineas: true, flujo: true, campo: false },
    vista: VISTA,
    esperado: { phi: 3 * 0.262956, qEnc: 0, texto: "No encierra carga: Gauss no da q/ε₀" },
  },
  {
    id: 9,
    nombre: "Gauss como herramienta",
    superficie: ESFERA5,
    cargas: [c(0, 0, 0, 4)],
    mostrar: { lineas: true, flujo: true, campo: true },
    vista: VISTA,
    esperado: { phi: 4, qEnc: 4 },
  },
];
