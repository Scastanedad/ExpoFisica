import { BrowserRouter, Routes, Route } from "react-router-dom";
import { Home } from "./pages/Home";
import { CampoFijo } from "./pages/CampoFijo";
import { CargasEnMovimiento } from "./pages/CargasEnMovimiento";

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/campo-fijo" element={<CampoFijo />} />
        <Route path="/cargas-en-movimiento" element={<CargasEnMovimiento />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
