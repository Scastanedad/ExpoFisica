import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

const raiz = createRoot(document.getElementById('root')!)

// Banco de pruebas de la base de circuitos (E6/E7): SOLO en desarrollo y sin ruta. Se abre con
// http://localhost:5173/?banco=circuitos. En producción esta rama se elimina del paquete.
if (import.meta.env.DEV && new URLSearchParams(window.location.search).get('banco') === 'circuitos') {
  void import('./ui/circuitos/BancoCircuitos').then(({ BancoCircuitos }) => {
    raiz.render(
      <StrictMode>
        <BancoCircuitos />
      </StrictMode>,
    )
  })
} else {
  raiz.render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
}
