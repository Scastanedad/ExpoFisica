import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { Home } from "./pages/Home";
import { CargasEnReposo } from "./pages/CargasEnReposo";
import { CargasEnMovimiento } from "./pages/CargasEnMovimiento";

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/cargas-en-reposo" element={<CargasEnReposo />} />
        {/* Ruta anterior: se mantiene para no romper enlaces ni QR ya impresos. */}
        <Route path="/campo-fijo" element={<Navigate to="/cargas-en-reposo" replace />} />
        <Route path="/cargas-en-movimiento" element={<CargasEnMovimiento />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
