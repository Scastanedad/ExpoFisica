import { Link } from "react-router-dom";
import { CanvasRenderer } from "../render/CanvasRenderer";
import type { CargaMeta } from "../types/simulacion";

interface Estacion {
  numero: string;
  /** Etiqueta corta: qué hace el visitante (o la simulación) en esta estación. */
  etiqueta: string;
  titulo: string;
  descripcion: string;
  ruta: string;
}

const ESTACIONES: Estacion[] = [
  {
    numero: "01",
    etiqueta: "Tú las mueves",
    titulo: "Cargas en reposo",
    descripcion:
      "Tú mueves las cargas y ves el campo eléctrico que crean: en vectores, líneas de campo o mapa de potencial.",
    ruta: "/cargas-en-reposo",
  },
  {
    numero: "02",
    etiqueta: "Se mueven solas",
    titulo: "Cargas en movimiento",
    descripcion:
      "Coloca varias cargas y mira cómo se mueven solas: se atraen y se repelen entre sí por la fuerza de Coulomb.",
    ruta: "/cargas-en-movimiento",
  },
];

/**
 * Cargas del hero: propias y aisladas del store de la estación 01. Antes el
 * hero compartía `useSimulacionStore` y mostraba las cargas que el visitante
 * añadía en "Cargas en reposo". Las posiciones siguen viviendo en un ref dentro
 * del canvas, como en las estaciones (constante de módulo: referencia estable).
 */
const CARGAS_HERO: CargaMeta[] = [
  { id: "hero-0", q: 1, anclada: false },
  { id: "hero-1", q: -1, anclada: false },
];

export function Home() {
  return (
    <main className="home">
      <header className="home-hero">
        <p className="home-kicker">Laboratorio interactivo · ExpoFísica</p>
        <h1>Electrostática, en vivo</h1>
        <p className="home-lead">Arrastra las cargas y mira cómo cambia el campo.</p>
        <div className="hero-canvas-frame">
          <CanvasRenderer
            ancho={520}
            alto={320}
            mostrarEscala={false}
            cargas={CARGAS_HERO}
            modoVista="vectores"
          />
        </div>
      </header>

      <section className="estaciones" aria-label="Estaciones del simulador">
        {ESTACIONES.map((e) => (
          <Link key={e.numero} to={e.ruta} className="estacion">
            <span className="estacion-numero" aria-hidden="true">
              {e.numero}
            </span>
            <div className="estacion-texto">
              <span className="estacion-etiqueta">{e.etiqueta}</span>
              <h2>{e.titulo}</h2>
              <p>{e.descripcion}</p>
            </div>
            <span className="estacion-estado" aria-hidden="true">
              Entrar →
            </span>
          </Link>
        ))}
      </section>
    </main>
  );
}
