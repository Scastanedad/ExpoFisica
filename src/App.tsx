import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { Home } from "./pages/Home";
import { CargasEnReposo } from "./pages/CargasEnReposo";
import { CargasEnMovimiento } from "./pages/CargasEnMovimiento";
import { CampoContinuo } from "./pages/CampoContinuo";
import { Materiales } from "./pages/Materiales";

function App() {
  return (
    <BrowserRouter>
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
      </Routes>
    </BrowserRouter>
  );
}

export default App;
