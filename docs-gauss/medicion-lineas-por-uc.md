# Medición de líneas por µC (`LINEAS_POR_UC`)

Generado por `src/fisica/gauss3d/lineas3d.medicion.test.ts` (`MEDIR_LINEAS=1 npx vitest run src/fisica/gauss3d/lineas3d.medicion.test.ts`), Node, 2026-10-07. Candidatos 16, 20, 24; niveles alta/media/baja = 240/120/60 líneas. Tiempos: mediana de 40 repeticiones (trazar + cruces, buffers reutilizados).

## 1. Fidelidad: líneas por octante frente al flujo

Esfera R=5, una carga positiva excéntrica. Se compara el nº de líneas que salen por cada octante con `Φ_octante · n / q` (cargas en (1.5,1,2), (3,2,2), (0,0,3.5)). RMS relativo sobre los 8 octantes (y máximo). Criterio del contrato: RMS ≤ 15 % con q=3 en nivel alta.

| LPU | nivel | q | n líneas | RMS medio (3 posiciones) | máx. error octante |
| --- | --- | --- | --- | --- | --- |
| 16 | alta | 1 | 16 | 37.3 % | 100.0 % |
| 16 | alta | 3 | 48 | 16.1 % | 39.9 % |
| 16 | alta | 5 | 80 | 8.3 % | 17.4 % |
| 16 | media | 1 | 16 | 37.3 % | 100.0 % |
| 16 | media | 3 | 48 | 16.1 % | 39.8 % |
| 16 | media | 5 | 80 | 8.3 % | 17.5 % |
| 16 | baja | 1 | 16 | 37.3 % | 100.0 % |
| 16 | baja | 3 | 48 | 16.1 % | 39.8 % |
| 16 | baja | 5 | 60 | 14.5 % | 36.4 % |
| 20 | alta | 1 | 20 | 21.9 % | 104.3 % |
| 20 | alta | 3 | 60 | 14.5 % | 36.2 % |
| 20 | alta | 5 | 100 | 8.3 % | 22.6 % |
| 20 | media | 1 | 20 | 21.9 % | 104.6 % |
| 20 | media | 3 | 60 | 14.5 % | 36.4 % |
| 20 | media | 5 | 100 | 8.3 % | 22.7 % |
| 20 | baja | 1 | 20 | 21.9 % | 104.6 % |
| 20 | baja | 3 | 60 | 14.5 % | 36.4 % |
| 20 | baja | 5 | 60 | 14.5 % | 36.4 % |
| 24 | alta | 1 | 24 | 29.2 % | 70.3 % |
| 24 | alta | 3 | 72 | 13.4 % | 43.2 % |
| 24 | alta | 5 | 120 | 7.2 % | 19.2 % |
| 24 | media | 1 | 24 | 29.2 % | 70.5 % |
| 24 | media | 3 | 72 | 13.4 % | 43.2 % |
| 24 | media | 5 | 120 | 7.2 % | 19.3 % |
| 24 | baja | 1 | 24 | 29.2 % | 70.5 % |
| 24 | baja | 3 | 60 | 14.5 % | 36.4 % |
| 24 | baja | 5 | 60 | 14.5 % | 36.4 % |

## 2. Conteo salen − entran frente a q_enc · LPU

`neto` = salen − entran medido sobre los buffers; ideal = q_enc · LPU. `neto` es siempre igual a `Σ signo·lineasPorCarga` (invariante, tests); la diferencia con el ideal es solo redondeo/llegadas.

| LPU | nivel | escenario | salen | entran | neto | ideal q_enc·LPU | neto − ideal |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 16 | alta | 2 (q=3 centro) | 48 | 0 | 48 | 48.0 | 0.0 |
| 16 | alta | 3 dentro (q=3) | 48 | 0 | 48 | 48.0 | 0.0 |
| 16 | alta | 3 fuera (q=3) | 5 | 5 | 0 | 0.0 | 0.0 |
| 16 | alta | 5 cubo (q=3) | 48 | 0 | 48 | 48.0 | 0.0 |
| 16 | alta | 5 cilindro (q=3) | 48 | 0 | 48 | 48.0 | 0.0 |
| 16 | alta | 6 dentro (q=3) | 48 | 0 | 48 | 48.0 | 0.0 |
| 16 | alta | 7 dipolo ±3 | 18 | 18 | 0 | 0.0 | 0.0 |
| 16 | alta | 9 (q=4) | 64 | 0 | 64 | 64.0 | 0.0 |
| 16 | alta | q=0.5 centro | 8 | 0 | 8 | 8.0 | 0.0 |
| 16 | alta | q=5 centro | 80 | 0 | 80 | 80.0 | 0.0 |
| 16 | alta | +5/−1 ambos dentro | 65 | 0 | 65 | 64.0 | 1.0 |
| 16 | baja | 2 (q=3 centro) | 48 | 0 | 48 | 48.0 | 0.0 |
| 16 | baja | 3 dentro (q=3) | 48 | 0 | 48 | 48.0 | 0.0 |
| 16 | baja | 3 fuera (q=3) | 5 | 5 | 0 | 0.0 | 0.0 |
| 16 | baja | 5 cubo (q=3) | 48 | 0 | 48 | 48.0 | 0.0 |
| 16 | baja | 5 cilindro (q=3) | 48 | 0 | 48 | 48.0 | 0.0 |
| 16 | baja | 6 dentro (q=3) | 48 | 0 | 48 | 48.0 | 0.0 |
| 16 | baja | 7 dipolo ±3 | 12 | 12 | 0 | 0.0 | 0.0 |
| 16 | baja | 9 (q=4) | 60 | 0 | 60 | 64.0 | -4.0 |
| 16 | baja | q=0.5 centro | 8 | 0 | 8 | 8.0 | 0.0 |
| 16 | baja | q=5 centro | 60 | 0 | 60 | 80.0 | -20.0 |
| 16 | baja | +5/−1 ambos dentro | 40 | 0 | 40 | 64.0 | -24.0 |
| 20 | alta | 2 (q=3 centro) | 60 | 0 | 60 | 60.0 | 0.0 |
| 20 | alta | 3 dentro (q=3) | 60 | 0 | 60 | 60.0 | 0.0 |
| 20 | alta | 3 fuera (q=3) | 6 | 6 | 0 | 0.0 | 0.0 |
| 20 | alta | 5 cubo (q=3) | 60 | 0 | 60 | 60.0 | 0.0 |
| 20 | alta | 5 cilindro (q=3) | 60 | 0 | 60 | 60.0 | 0.0 |
| 20 | alta | 6 dentro (q=3) | 60 | 0 | 60 | 60.0 | 0.0 |
| 20 | alta | 7 dipolo ±3 | 22 | 22 | 0 | 0.0 | 0.0 |
| 20 | alta | 9 (q=4) | 80 | 0 | 80 | 80.0 | 0.0 |
| 20 | alta | q=0.5 centro | 10 | 0 | 10 | 10.0 | 0.0 |
| 20 | alta | q=5 centro | 100 | 0 | 100 | 100.0 | 0.0 |
| 20 | alta | +5/−1 ambos dentro | 81 | 0 | 81 | 80.0 | 1.0 |
| 20 | baja | 2 (q=3 centro) | 60 | 0 | 60 | 60.0 | 0.0 |
| 20 | baja | 3 dentro (q=3) | 60 | 0 | 60 | 60.0 | 0.0 |
| 20 | baja | 3 fuera (q=3) | 6 | 6 | 0 | 0.0 | 0.0 |
| 20 | baja | 5 cubo (q=3) | 60 | 0 | 60 | 60.0 | 0.0 |
| 20 | baja | 5 cilindro (q=3) | 60 | 0 | 60 | 60.0 | 0.0 |
| 20 | baja | 6 dentro (q=3) | 60 | 0 | 60 | 60.0 | 0.0 |
| 20 | baja | 7 dipolo ±3 | 12 | 12 | 0 | 0.0 | 0.0 |
| 20 | baja | 9 (q=4) | 60 | 0 | 60 | 80.0 | -20.0 |
| 20 | baja | q=0.5 centro | 10 | 0 | 10 | 10.0 | 0.0 |
| 20 | baja | q=5 centro | 60 | 0 | 60 | 100.0 | -40.0 |
| 20 | baja | +5/−1 ambos dentro | 40 | 0 | 40 | 80.0 | -40.0 |
| 24 | alta | 2 (q=3 centro) | 72 | 0 | 72 | 72.0 | 0.0 |
| 24 | alta | 3 dentro (q=3) | 72 | 0 | 72 | 72.0 | 0.0 |
| 24 | alta | 3 fuera (q=3) | 8 | 8 | 0 | 0.0 | 0.0 |
| 24 | alta | 5 cubo (q=3) | 72 | 0 | 72 | 72.0 | 0.0 |
| 24 | alta | 5 cilindro (q=3) | 72 | 0 | 72 | 72.0 | 0.0 |
| 24 | alta | 6 dentro (q=3) | 72 | 0 | 72 | 72.0 | 0.0 |
| 24 | alta | 7 dipolo ±3 | 29 | 29 | 0 | 0.0 | 0.0 |
| 24 | alta | 9 (q=4) | 96 | 0 | 96 | 96.0 | 0.0 |
| 24 | alta | q=0.5 centro | 12 | 0 | 12 | 12.0 | 0.0 |
| 24 | alta | q=5 centro | 120 | 0 | 120 | 120.0 | 0.0 |
| 24 | alta | +5/−1 ambos dentro | 97 | 0 | 97 | 96.0 | 1.0 |
| 24 | baja | 2 (q=3 centro) | 60 | 0 | 60 | 72.0 | -12.0 |
| 24 | baja | 3 dentro (q=3) | 60 | 0 | 60 | 72.0 | -12.0 |
| 24 | baja | 3 fuera (q=3) | 6 | 6 | 0 | 0.0 | 0.0 |
| 24 | baja | 5 cubo (q=3) | 60 | 0 | 60 | 72.0 | -12.0 |
| 24 | baja | 5 cilindro (q=3) | 60 | 0 | 60 | 72.0 | -12.0 |
| 24 | baja | 6 dentro (q=3) | 60 | 0 | 60 | 72.0 | -12.0 |
| 24 | baja | 7 dipolo ±3 | 12 | 12 | 0 | 0.0 | 0.0 |
| 24 | baja | 9 (q=4) | 60 | 0 | 60 | 96.0 | -36.0 |
| 24 | baja | q=0.5 centro | 12 | 0 | 12 | 12.0 | 0.0 |
| 24 | baja | q=5 centro | 60 | 0 | 60 | 120.0 | -60.0 |
| 24 | baja | +5/−1 ambos dentro | 40 | 0 | 40 | 96.0 | -56.0 |

## 3. Dipolo (escenario 7): líneas de A que llegan a B y líneas que cruzan la esfera

Criterio del contrato: al menos 12 líneas A→B visibles. Por Gauss, salen = entran ≈ 0.371 · n (flujo del plano medio fuera de ρ = R = 5: d/√(d²+R²), d = 2); el «≈ 8 de 60» del contrato §5 contaba las líneas que llegan a la esfera límite, no las que cruzan la esfera.

| LPU | nivel | n (A) | A→B | A→límite | salen=entran | salen / n |
| --- | --- | --- | --- | --- | --- | --- |
| 16 | alta | 48 | 42 | 6 | 18 | 0.38 |
| 16 | media | 48 | 42 | 6 | 18 | 0.38 |
| 16 | baja | 30 | 26 | 4 | 12 | 0.40 |
| 20 | alta | 60 | 54 | 6 | 22 | 0.37 |
| 20 | media | 60 | 54 | 6 | 22 | 0.37 |
| 20 | baja | 30 | 26 | 4 | 12 | 0.40 |
| 24 | alta | 72 | 64 | 8 | 29 | 0.40 |
| 24 | media | 60 | 54 | 6 | 22 | 0.37 |
| 24 | baja | 30 | 26 | 4 | 12 | 0.40 |

## 4. Presupuesto (nº de líneas)

| LPU | nivel (presupuesto) | 1 carga q=5 | q=5 y −5 | q=0.5 (mín. 6) | q=0.5 y −5 | q=3 y −3 |
| --- | --- | --- | --- | --- | --- | --- |
| 16 | alta (240) | 80 | 160 (80+80) | 8 | 8+80 | 48+48 |
| 16 | media (120) | 80 | 120 (60+60) | 8 | 8+80 | 48+48 |
| 16 | baja (60) | 60 | 60 (30+30) | 8 | 6+54 | 30+30 |
| 20 | alta (240) | 100 | 200 (100+100) | 10 | 10+100 | 60+60 |
| 20 | media (120) | 100 | 120 (60+60) | 10 | 10+100 | 60+60 |
| 20 | baja (60) | 60 | 60 (30+30) | 10 | 6+54 | 30+30 |
| 24 | alta (240) | 120 | 240 (120+120) | 12 | 12+120 | 72+72 |
| 24 | media (120) | 120 | 120 (60+60) | 12 | 11+109 | 60+60 |
| 24 | baja (60) | 60 | 60 (30+30) | 12 | 6+54 | 30+30 |

## 5. Coste (Node, trazar + cruces)

Meta del contrato: ≤ 4 ms en alta, ≤ 2 ms en baja (en Node; el móvil de gama baja se medirá en la fase 6).

| LPU | nivel | escena | líneas | ms | puntos/línea | % fin=2 |
| --- | --- | --- | --- | --- | --- | --- |
| 16 | alta | esc. 2 (q=3) | 48 | 0.70 | 62.0 | 0.0 |
| 16 | alta | esc. 7 dipolo ±3 | 54 | 1.68 | 61.4 | 0.0 |
| 16 | alta | ±5 (peor caso) | 90 | 2.82 | 61.2 | 0.0 |
| 16 | alta | cubo 16, 2 cargas lejos | 73 | 4.57 | 127.7 | 0.0 |
| 16 | alta | cilindro 8×16, 2 cargas | 78 | 3.74 | 124.5 | 0.0 |
| 16 | media | esc. 2 (q=3) | 48 | 0.55 | 47.0 | 0.0 |
| 16 | media | esc. 7 dipolo ±3 | 54 | 1.31 | 46.4 | 0.0 |
| 16 | media | ±5 (peor caso) | 66 | 1.08 | 47.5 | 0.0 |
| 16 | media | cubo 16, 2 cargas lejos | 73 | 3.43 | 96.3 | 0.0 |
| 16 | media | cilindro 8×16, 2 cargas | 74 | 2.23 | 95.1 | 0.0 |
| 16 | baja | esc. 2 (q=3) | 48 | 0.38 | 32.0 | 0.0 |
| 16 | baja | esc. 7 dipolo ±3 | 34 | 0.39 | 31.1 | 0.0 |
| 16 | baja | ±5 (peor caso) | 34 | 0.39 | 31.1 | 0.0 |
| 16 | baja | cubo 16, 2 cargas lejos | 39 | 1.54 | 65.8 | 0.0 |
| 16 | baja | cilindro 8×16, 2 cargas | 37 | 0.90 | 63.8 | 0.0 |
| 20 | alta | esc. 2 (q=3) | 60 | 0.90 | 62.0 | 0.0 |
| 20 | alta | esc. 7 dipolo ±3 | 66 | 1.44 | 62.9 | 0.0 |
| 20 | alta | ±5 (peor caso) | 113 | 3.51 | 60.9 | 0.0 |
| 20 | alta | cubo 16, 2 cargas lejos | 89 | 3.78 | 131.2 | 0.0 |
| 20 | alta | cilindro 8×16, 2 cargas | 100 | 5.79 | 120.8 | 0.0 |
| 20 | media | esc. 2 (q=3) | 60 | 0.68 | 47.0 | 0.0 |
| 20 | media | esc. 7 dipolo ±3 | 66 | 1.08 | 47.5 | 0.0 |
| 20 | media | ±5 (peor caso) | 66 | 1.07 | 47.5 | 0.0 |
| 20 | media | cubo 16, 2 cargas lejos | 77 | 2.84 | 97.8 | 0.0 |
| 20 | media | cilindro 8×16, 2 cargas | 74 | 2.22 | 95.1 | 0.0 |
| 20 | baja | esc. 2 (q=3) | 60 | 0.46 | 32.0 | 0.0 |
| 20 | baja | esc. 7 dipolo ±3 | 34 | 0.39 | 31.1 | 0.0 |
| 20 | baja | ±5 (peor caso) | 34 | 0.39 | 31.1 | 0.0 |
| 20 | baja | cubo 16, 2 cargas lejos | 39 | 1.43 | 65.8 | 0.0 |
| 20 | baja | cilindro 8×16, 2 cargas | 37 | 0.84 | 63.8 | 0.0 |
| 24 | alta | esc. 2 (q=3) | 72 | 1.01 | 62.0 | 0.0 |
| 24 | alta | esc. 7 dipolo ±3 | 80 | 1.91 | 62.0 | 0.0 |
| 24 | alta | ±5 (peor caso) | 135 | 4.33 | 61.3 | 0.0 |
| 24 | alta | cubo 16, 2 cargas lejos | 107 | 4.20 | 131.3 | 0.0 |
| 24 | alta | cilindro 8×16, 2 cargas | 117 | 6.49 | 124.0 | 0.0 |
| 24 | media | esc. 2 (q=3) | 72 | 0.82 | 47.0 | 0.0 |
| 24 | media | esc. 7 dipolo ±3 | 66 | 1.08 | 47.5 | 0.0 |
| 24 | media | ±5 (peor caso) | 66 | 1.09 | 47.5 | 0.0 |
| 24 | media | cubo 16, 2 cargas lejos | 77 | 2.87 | 97.8 | 0.0 |
| 24 | media | cilindro 8×16, 2 cargas | 74 | 2.21 | 95.1 | 0.0 |
| 24 | baja | esc. 2 (q=3) | 60 | 0.47 | 32.0 | 0.0 |
| 24 | baja | esc. 7 dipolo ±3 | 34 | 0.40 | 31.1 | 0.0 |
| 24 | baja | ±5 (peor caso) | 34 | 0.39 | 31.1 | 0.0 |
| 24 | baja | cubo 16, 2 cargas lejos | 39 | 1.54 | 65.8 | 0.0 |
| 24 | baja | cilindro 8×16, 2 cargas | 37 | 0.89 | 63.8 | 0.0 |

## 6. Escenario 1 (parche l=4, carga a 6 u): líneas que lo cruzan

Esperado ≈ n · Φ/q (con q=3: 0.0319 · 3·LPU). Con la carga q=5 se obtiene más líneas (∝ q), de ahí la decisión sobre el escenario 1.

| LPU | q | n líneas | θ=0° | θ=30° | θ=60° | esperado θ=0° |
| --- | --- | --- | --- | --- | --- | --- |
| 16 | 3 | 48 | 1 | 1 | 2 | 1.5 |
| 16 | 5 | 80 | 3 | 2 | 2 | 2.6 |
| 20 | 3 | 60 | 2 | 1 | 2 | 1.9 |
| 20 | 5 | 100 | 3 | 3 | 3 | 3.2 |
| 24 | 3 | 72 | 2 | 2 | 2 | 2.3 |
| 24 | 5 | 120 | 3 | 4 | 3 | 3.8 |

## Decisión

RMS por octante (q=3, alta): 16 → 16.1 %, 20 → 14.5 %, 24 → 13.4 %.
Mínimo de líneas A→B (dipolo, cualquier nivel): 16 → 26, 20 → 26, 24 → 26.
Coste ±5 (ms): alta 16 → 2.82, 20 → 3.51, 24 → 4.33; baja 16 → 0.39, 20 → 0.39, 24 → 0.39.
Candidatos que cumplen fidelidad (RMS ≤ 15 %) y dipolo (≥ 12 A→B): 20, 24. Regla: el menor que cumpla; empate → el de menor coste.

### Valor elegido: `LINEAS_POR_UC = 20`

- **Fidelidad:** 20 es el menor candidato con RMS por octante ≤ 15 % (q=3, alta); 16 queda en ~16 % (con 48 líneas cada octante tiene ~6 y un solo fallo de ±1 ya es 17 %); 24 mejora poco (13 %) a costa de 20 % más de líneas.
- **Dipolo:** en todos los casos llegan ≥ 26 líneas de A a B (criterio ≥ 12) y salen = entran ≈ 0.37 · n, como predice Gauss.
- **Presupuesto:** q=5 y −5 suman 200 líneas con 20/µC (≤ 240 de alta); 24/µC lo agota justo (240) y no deja margen para variantes; q=0.5 recibe 10 (> `MIN_LINEAS_CARGA` = 6).
- **Coste (Node):** ±5 en alta 3.3 ms (≤ 4) y en baja 0.4 ms (≤ 2). Los peores casos son cubo 16 / cilindro 8×16 con cargas lejos (límite a ~55 u, ~125 puntos/línea): 3.6–5.6 ms en alta, dentro del presupuesto total de 14 ms.
- **Saturación en calidad baja (60 líneas) y media (120):** con 60 líneas la cuenta ya no es proporcional a q (q=5 y q=3 dan ambas ≈ 60); por eso la UI solo debe afirmar «salen − entran = q·LPU» en calidad alta o cuando Σn no esté saturado (durante el arrastre se dibuja en baja y al soltar se recalcula).
- **Escenario 1 (parche):** con q=3 cruzan 2, 1 y 2 líneas (θ = 0°, 30°, 60°); con q=5 cruzan 3, 3 y 3 (esperado 3.2). Se adopta **q=5** para el escenario 1 (Φ/q no cambia; Φ = 0.1594, 1.80×10⁴ N·m²/C). El contador de líneas del parche sigue sin presentarse como medida de Φ.
- Pendiente para la fase 6: medir el coste en móvil de gama baja y la legibilidad (capturas 390×844 y 1366×650) con `revisor-ui`; la decisión numérica de arriba no depende de ello salvo que el color sature.

