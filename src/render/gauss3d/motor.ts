/**
 * Motor de la escena Gauss 3D (sin DOM ni React): une firma de capa, geometría cacheada, cámara, pasadas y dibujo.
 *   actualizar(entrada)  → compara la firma y recalcula solo lo necesario ("geometria" → física + proyección,
 *                          "camara" → solo proyección y clasificación, "igual" → nada).
 *   dibujar(ctx, entrada) → pinta las 4 pasadas con lo último calculado.
 * Los buffers viven en el motor y se reutilizan; no hay asignaciones por cuadro.
 */
import { cargasEncerradas } from "../../fisica/gauss3d/superficies";
import type { Escenario } from "../../fisica/gauss3d/tipos";
import { crearGestorCalidad } from "../calidadCampo";
import { crearCamaraProy, derivarCamara, FOV_DEF, type CamaraProy } from "./camara";
import type { Ctx3D } from "./ctx3d";
import { dibujarEscenaGauss3D, type OpcionesDibujo3D } from "./dibujarGauss3D";
import { crearFirma3D, type CambioFirma3D } from "./firma3d";
import { construirGeometria, crearEstadoGeometria, type GeometriaGauss3D } from "./geometria";
import { construirPasadas, crearPasadas, type Pasadas } from "./pasadas";

export interface EntradaMotor {
  escenario: Escenario;
  camara: { azimut: number; inclinacion: number; zoom: number; fov?: number };
  /** Tamaño del canvas en px lógicos (CSS). */
  ancho: number;
  alto: number;
  dpr: number;
  mostrar: { lineas: boolean; flujo: boolean; campo: boolean };
  /** 0.2…1. */
  opacidad: number;
  /** Unidad de tamaño (≥ 1, ver `OpcionesDibujo3D`); 1 por defecto. */
  unidad?: number;
  /**
   * Radio de encuadre fijo (u): si se da, sustituye al automático (superficie + cargas). La UI lo usa mientras se
   * arrastra una carga para que la vista no se reencuadre bajo el puntero. 0/undefined = automático.
   */
  encuadre?: number;
  /** Índice de la carga seleccionada (se dibuja con un anillo); -1/undefined = ninguna. */
  seleccion?: number;
}

/** Lo que la UI puede publicar (≤ 10 Hz, nunca por cuadro) tras recalcular la geometría. */
export interface LecturaGauss3D {
  /** Φ en µC/ε₀ (convención ε₀ = 1): el valor de `calcularFlujo`, nunca un conteo de líneas. */
  phi: number;
  qEnc: number;
  /** Cruces de líneas con la superficie (0 si las líneas están ocultas). */
  salen: number;
  entran: number;
  nLineas: number;
  nParches: number;
  tipo: string;
  calidad: string;
  msCalculo: number;
  /** Por carga: signo/valor, si está estrictamente dentro de la superficie y si está en el centro (≤ 0.1 u). */
  cargas: ReadonlyArray<{ q: number; dentro: boolean; centrada: boolean }>;
}

/** Una carga a menos de esta distancia (u) del origen cuenta como «en el centro» para los textos. */
export const TOL_CENTRO = 0.1;

export interface MotorGauss3D {
  actualizar(e: EntradaMotor): CambioFirma3D;
  dibujar(ctx: Ctx3D, e: EntradaMotor): void;
  geometria(): GeometriaGauss3D | null;
  pasadas(): Pasadas;
  camara(): CamaraProy;
  lectura(): LecturaGauss3D | null;
  /** Calidad vigente según el gestor (0 alta … 2 baja); la usa quien construye el `Escenario`. */
  calidad(): number;
}

function lecturaCargas(geom: GeometriaGauss3D): LecturaGauss3D["cargas"] {
  const dentro = new Set(cargasEncerradas(geom.superficie, geom.cargas));
  return geom.cargas.map((c, i) => ({
    q: c.q,
    dentro: dentro.has(i),
    centrada: Math.hypot(c.x, c.y, c.z) <= TOL_CENTRO,
  }));
}

const NOMBRES_CALIDAD = ["alta", "media", "baja"];

export function crearMotorGauss3D(opciones: { calidadInicial?: number } = {}): MotorGauss3D {
  const firma = crearFirma3D();
  const estado = crearEstadoGeometria();
  const pasadas = crearPasadas();
  const cam = crearCamaraProy();
  const gestor = crearGestorCalidad(opciones.calidadInicial ?? 0);
  let geom: GeometriaGauss3D | null = null;
  let lectura: LecturaGauss3D | null = null;
  /** Coste del último dibujo (ms, suavizado): el gestor de calidad cuenta cálculo + dibujo. */
  let msDibujo = 0;

  return {
    actualizar(e) {
      const datos = {
        escenario: e.escenario,
        camara: {
          azimut: e.camara.azimut,
          inclinacion: e.camara.inclinacion,
          zoom: e.camara.zoom,
          fov: e.camara.fov ?? FOV_DEF,
          ancho: e.ancho,
          alto: e.alto,
        },
        dpr: e.dpr,
        mostrar: e.mostrar,
        opacidad: e.opacidad,
        encuadre: e.encuadre ?? 0,
      };
      const cambio = firma.comparar(datos);
      if (cambio === "igual" && geom) return cambio;
      if (cambio === "geometria" || !geom) {
        geom = construirGeometria(estado, e.escenario, e.mostrar);
        // Solo se mide el cálculo a la calidad vigente: el grueso del arrastre es más rápido y engañaría al gestor.
        if (e.escenario.calidad === gestor.indice()) gestor.registrar(geom.msCalculo + msDibujo);
        lectura = {
          phi: geom.flujo.total,
          qEnc: geom.flujo.qEnc,
          salen: geom.cruces.salen,
          entran: geom.cruces.entran,
          nLineas: geom.conLineas ? geom.lineas.n : 0,
          nParches: geom.malla.nParches,
          tipo: geom.superficie.tipo,
          calidad: NOMBRES_CALIDAD[geom.calidad] ?? "alta",
          msCalculo: geom.msCalculo,
          cargas: lecturaCargas(geom),
        };
      }
      derivarCamara(datos.camara, e.encuadre && e.encuadre > 0 ? e.encuadre : geom.rEncuadre, cam);
      construirPasadas(pasadas, geom, cam, e.ancho, e.alto);
      firma.guardar(datos);
      return cambio === "igual" ? "camara" : cambio;
    },
    dibujar(ctx, e) {
      if (!geom) return;
      const o: OpcionesDibujo3D = {
        ancho: e.ancho,
        alto: e.alto,
        unidad: e.unidad ?? 1,
        mostrarFlujo: e.mostrar.flujo,
        opacidad: e.opacidad,
        mostrarSuelo: true,
        seleccion: e.seleccion ?? -1,
      };
      const t0 = performance.now();
      dibujarEscenaGauss3D(ctx, geom, pasadas, cam, o);
      msDibujo = 0.7 * msDibujo + 0.3 * (performance.now() - t0);
    },
    geometria: () => geom,
    pasadas: () => pasadas,
    camara: () => cam,
    lectura: () => lectura,
    calidad: () => gestor.indice(),
  };
}
