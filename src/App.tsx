import { lazy, Suspense } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { Home } from "./pages/Home";
import { CargasEnReposo } from "./pages/CargasEnReposo";
import { CargasEnMovimiento } from "./pages/CargasEnMovimiento";
import { CampoContinuo } from "./pages/CampoContinuo";
import { Materiales } from "./pages/Materiales";
import { LeyDeGauss } from "./pages/LeyDeGauss";

// Estaciones de circuitos: se cargan al entrar (code-split por ruta). E7 «Capacitores» seguirá este patrón.
const Resistencias = lazy(() => import("./pages/Resistencias").then((m) => ({ default: m.Resistencias })));

function App() {
  return (
    <BrowserRouter>
      <Suspense fallback={<p className="cargando-estacion" role="status">Cargando estación…</p>}>
        <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/cargas-en-reposo" element={<CargasEnReposo />} />
        {/* Ruta anterior: se mantiene para no romper enlaces ni QR ya impresos. */}
        <Route path="/campo-fijo" element={<Navigate to="/cargas-en-reposo" replace />} />
        <Route path="/cargas-en-movimiento" element={<CargasEnMovimiento />} />
        <Route path="/campo-continuo" element={<CampoContinuo />} />
        {/* Ruta anterior (la estación se llamaba "Dipolos"): se mantiene para no romper enlaces ni QR ya impresos. */}
        <Route path="/dipolos" element={<Navigate to="/campo-continuo" replace />} />
        <Route path="/materiales" element={<Materiales />} />
        <Route path="/ley-de-gauss" element={<LeyDeGauss />} />
        <Route path="/resistencias" element={<Resistencias />} />
      </Routes>
      </Suspense>
    </BrowserRouter>
  );
}

export default App;
