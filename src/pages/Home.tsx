import { Link } from "react-router-dom";
import { CanvasRenderer } from "../render/CanvasRenderer";

interface Estacion {
  numero: string;
  titulo: string;
  descripcion: string;
  ruta: string | null;
}

const ESTACIONES: Estacion[] = [
  {
    numero: "01",
    titulo: "Campo eléctrico",
    descripcion:
      "Arrastra una o dos cargas y observa su campo en vectores, líneas de campo o mapa de potencial.",
    ruta: "/campo-fijo",
  },
  {
    numero: "02",
    titulo: "Cargas en movimiento",
    descripcion:
      "Suelta varias cargas y mira cómo se atraen y repelen entre sí, como un sistema de N cuerpos.",
    ruta: "/cargas-en-movimiento",
  },
];

export function Home() {
  return (
    <main className="home">
      <header className="home-hero">
        <p className="home-kicker">Laboratorio interactivo · ExpoFísica</p>
        <h1>Electromagnetismo, en vivo</h1>
        <p className="home-lead">Arrastra esta carga. Todo lo demás en esta página funciona igual.</p>
        <div className="hero-canvas-frame">
          <CanvasRenderer ancho={520} alto={320} />
        </div>
      </header>

      <section className="estaciones" aria-label="Estaciones del simulador">
        {ESTACIONES.map((e) =>
          e.ruta ? (
            <Link key={e.numero} to={e.ruta} className="estacion estacion-activa">
              <ContenidoEstacion estacion={e} disponible />
            </Link>
          ) : (
            <div key={e.numero} className="estacion estacion-inactiva" aria-disabled="true">
              <ContenidoEstacion estacion={e} disponible={false} />
            </div>
          ),
        )}
      </section>
    </main>
  );
}

function ContenidoEstacion({ estacion, disponible }: { estacion: Estacion; disponible: boolean }) {
  return (
    <>
      <span className="estacion-numero">{estacion.numero}</span>
      <div className="estacion-texto">
        <h2>{estacion.titulo}</h2>
        <p>{estacion.descripcion}</p>
      </div>
      <span className="estacion-estado">{disponible ? "Entrar →" : "En construcción"}</span>
    </>
  );
}
