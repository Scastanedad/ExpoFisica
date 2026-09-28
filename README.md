# ExpoFisica — Electromagnetismo interactivo

Simulador interactivo de electrostática pensado como estación para una exposición de física. Corre en cualquier navegador, sin instalar nada, incluyendo tablets y celulares. Sin backend.

**Producción:** https://expofisica-electromagnetismo.vercel.app/

## Estaciones

| Ruta | Estación | Qué muestra |
|---|---|---|
| `/cargas-en-reposo` | Cargas en reposo | Campo eléctrico de cargas arrastrables (vectores, líneas de campo, equipotenciales), carga de prueba q₀ (E, V, F, ΔV, trabajo) y gráficas vs. tiempo/distancia con exportación CSV |
| `/cargas-en-movimiento` | Cargas en movimiento | N cargas interactuando por la ley de Coulomb en tiempo real (Web Worker), con energía cinética/potencial/total y su gráfica |
| `/dipolos` | Dipolos | Un dipolo (+q, −q) en un campo uniforme (placas) o el campo de una carga puntual: giro, oscilación, torque y fuerza sobre cada carga |
| `/materiales` | Conductores y aislantes | Modelo de red ion-electrón entre placas: apantallamiento parcial en un conductor vs. polarización en un aislante, con voltaje ajustable |

`/campo-fijo` redirige a `/cargas-en-reposo` (ruta anterior, se mantiene por enlaces/QR ya impresos).

## Stack

React 19 + TypeScript + Vite. Estado de UI en Zustand; las posiciones de las cargas **nunca** pasan por estado de React (viven en refs o en el Worker). Render en Canvas 2D. Sin dependencias de gráficas/animación: los motores de física y las gráficas dinámicas son código propio.

## Comandos

```bash
npm run dev       # servidor de desarrollo (http://localhost:5173/)
npm run build     # tsc -b && vite build
npm run lint      # Oxlint
npm test          # Vitest (suite de física e integración)
npm run preview   # sirve el build de producción
```

## Estructura

- `src/pages/` — una página por estación, más `Home`
- `src/fisica/` — leyes físicas puras (Coulomb, campo externo, dipolo, conductores/aislantes)
- `src/worker/motorFisico.worker.ts` — motor de integración (Velocity Verlet + softening) para "Cargas en movimiento"
- `src/render/` — dibujo en Canvas 2D por estación
- `src/store/` — estado de UI (Zustand)
- `src/graficas/`, `src/datos/` — gráficas dinámicas y buffers de series de tiempo
- `src/hooks/`, `src/ui/`, `src/types/`

La física se valida con Vitest: invariantes (conservación de energía, decaimiento 1/r², tercera ley) y calibración numérica de los modelos de materiales/dipolo, no solo snapshots.

## Despliegue

Auto-deploy de Vercel en cada push a `main` (`vercel.json` en la raíz para el SPA de React Router).
