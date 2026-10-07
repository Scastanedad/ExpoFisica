# Verificación fase 6 (Gauss 3D)

Script: `npm run e2e:gauss` (`e2e/gauss.e2e.mjs`; no forma parte de `npm test`). Levanta `vite preview` sobre un build nuevo y `vite` (dev, solo para el micro-benchmark), y cierra ambos. Capturas en `capturas-gauss/e2e/` (ignorada por git) y datos en `capturas-gauss/e2e/medidas.json`. Chromium headless (sin GPU, raster por software), CPU 4× con CDP `Emulation.setCPUThrottlingRate`.

## Funcional (390×844, 1024×768, 1366×650)
- 9 escenarios por los botones del panel: Φ y q_enc iguales al contrato §5 (Φ a 0,01; esc. 1: 0,16 con q=5; esc. 8: 0,79; superficies abiertas muestran «sin carga encerrada»). Extra: esc. 3 «fuera» → 0; esc. 5 cubo/cilindro/esfera → 3; esc. 6 con z=0 → 3.
- 0 errores de consola o de página; 0 scroll horizontal; 0 objetivos < 44 px (también con «Avanzado» abierto).
- Capturas revisadas (móvil esc. 6, tablet esc. 2, pc esc. 7): sin defectos visibles.

## Recálculo de geometría (`construirGeometria`, CPU 4×, p50 / p95 en ms)
«Caché» = malla en caché (arrastre de carga, ajuste de q). «Nueva» = malla nueva (cambio de escenario, de tamaño o de forma). Modo gesto = líneas a calidad 2 con malla a calidad 0 (lo que usa el controlador). Valor entre paréntesis: CPU 1×.

| Escenario | Alta caché | Alta nueva | Media nueva | Baja nueva | Gesto caché | Gesto nueva |
|---|---|---|---|---|---|---|
| 1 Parche | 3,8/4,7 | 4,1/4,6 | 3,1/3,8 | 1,3/1,7 | 1,3/1,5 | 1,5/1,7 |
| 2 Cerrada | 3,4/4,0 | 5,3/6,0 | 3,6/5,1 | 2,0/2,8 | 2,2/2,4 | 4,3/5,4 |
| 3 Dentro (fuera: igual) | 3,5/4,2 | 5,3/6,2 | 3,5/4,4 | 2,1/2,3 | 2,2/2,5 | 4,2/4,8 |
| 4 Tamaño | 3,4/4,1 | 5,2/6,3 | 3,5/4,3 | 2,0/2,8 | 2,2/2,5 | 4,2/5,1 |
| 5 Formas (cubo) | 3,5/4,2 | 5,0/5,9 | 3,4/4,2 | 2,1/2,8 | 2,2/2,9 | 3,7/4,7 |
| 6 Cruza | 3,4/4,0 | 5,3/6,3 | 3,6/4,5 | 2,0/2,7 | 2,2/2,9 | 4,1/5,1 |
| 7 Dipolo (el peor) | 5,5/6,3 | 7,7/8,5 | 5,3/6,2 | 2,5/3,4 | 3,2/3,5 | 5,1/6,0 |
| 8 Abierta | 3,0/3,6 | 3,3/3,9 | 2,4/3,1 | 1,6/1,8 | 1,6/1,8 | 1,9/2,8 |
| 9 Útil | 4,2/4,9 | 6,1/6,9 | 4,1/4,9 | 2,0/2,2 | 2,2/2,5 | 4,1/5,1 |

Máximo absoluto en 4×: 9,4 ms (esc. 7, p95 de varias pasadas). A 1× el peor p95 es 4,7 ms. La calidad del gestor se mantuvo en «alta» en todas las fases.

## Tiempo entre cuadros (rAF, CPU 4×, ms: p50 / p95 / máx)
| Viewport | (a) reposo | (b) arrastre carga | (c1) tamaño | (c2) z | (d) azimut | (e) cambio escenario |
|---|---|---|---|---|---|---|
| 390×844 | 16,7/16,8/16,8 | 16,7/83/133 | 16,7/150/167 | 16,7/133/133 | 16,7/117/117 | 16,7/33/183 |
| 1024×768 | 16,7/16,8/16,8 | 16,7/50/83 | 16,7/100/100 | 16,7/83/83 | 16,7/67/83 | 16,7/33/117 |
| 1366×650 | 16,7/16,8/16,8 | 16,7/50/83 | 16,7/83/100 | 16,7/83/83 | 16,7/67/83 | 16,7/17/133 |

El reposo es 60 Hz sin trabajo (dibujo bajo demanda).

## Desglose de un cuadro (CPU 4×)
- Proyección + pasadas (`motor.actualizar` sin geometría): 1–7 ms p95.
- Dibujo 2D (`motor.dibujar`) con volcado forzado del raster: 22–109 ms p95 a 4× (24 ms a 1× en el peor caso). Sin volcado, la llamada tarda 4,4 ms a 1× (≈ 18 ms a 4×) y casi no depende de líneas ni parches (4,1 ms con solo suelo y superficie): el resto es raster por software del Chromium headless, que no es representativo de un móvil con GPU. Los 50–150 ms por cuadro de la tabla anterior vienen sobre todo de ahí, no de la geometría.

## Decisión: Worker NO
Criterio del coordinador: mover la geometría a un Worker si el recálculo supera 14 ms con CPU 4×. El máximo medido es 8,5 ms (p95; 9,4 ms con otra pasada), por debajo del umbral en todos los escenarios y calidades; en el modo gesto (≤ 6 ms) hay margen aun más amplio. No se mueve: un Worker añadiría latencia de un cuadro, transferencia de buffers y complejidad sin ganancia. Si en dispositivos reales el cuadro sigue siendo largo, el cuello de botella a atacar es el dibujo (raster del suelo, la superficie y los parches), no la geometría; el dibujo no se puede pasar a Worker sin `OffscreenCanvas` (fuera de alcance de esta fase). Reabrir la decisión si algún cambio futuro sube el recálculo por encima de 14 ms en 4×.

Sin código de depuración en producción: el recálculo se mide importando `geometria.ts` y `motor.ts` desde el servidor dev dentro de la página.

## Revisión de la fase 6 (correcciones y nueva medición)

Cambios: panel a dos columnas en pantallas anchas y bajas (altura ≤ 820 px: 1366×650 y 1024×768) sin recorte ni scroll interno; leyenda y unidades se muestran bajo los interruptores del panel (una sola vez, «Φ se da en µC/ε₀…» como pie de la leyenda, ya no dentro del texto de cada escenario); texto «Qué mirar / Qué pasa / Por qué» en tres columnas bajo el lienzo (sin cambiar palabras); instrucciones largas ocultas en esas pantallas (la ayuda del panel dice lo mismo); en móvil, marcadores de cruce y trazos ×1,25 (`unidadParaAncho`) y encuadre con 10 % más de aire en lienzos < 500 px; `scroll-padding-top` para que el lienzo pegado no tape el control enfocado; q_enc en negrita; textos secundarios a 14 px; «Altura z / carga 1» en dos líneas reservadas; hueco reservado para el botón dentro/fuera del escenario 3 (salvo en pantalla ancha y baja).

Rendimiento: (1) durante un gesto (arrastre de carga, deslizadores, teclas, giro de la vista) el bitmap baja a dpr 1 y se restaura al soltar (`DPR_GESTO`; solo afecta a pantallas con dpr > 1); (2) el gestor de calidad cuenta cálculo + dibujo (media móvil del último dibujo); (3) un cuadro por rAF, y si el anterior tardó > 24 ms durante un gesto se cede un cuadro (una vez seguida). Con CPU 4× el gestor ahora baja a calidad «media» tras cambios de escenario (antes se quedaba en «alta»).

E2E nuevo: el panel no hace scroll interno y la página cabe sin desplazarse en 1024×768 y 1366×650 con los 9 escenarios; en 390×844, con `focus()` + `elementFromPoint`, el lienzo pegado no tapa el primer control, la forma, los deslizadores, «Invertir signo», «Avanzado» ni el último párrafo; capturas no fullPage tras scroll en `capturas-gauss/e2e/movil-390x844-scroll-*.png`.

Tiempo entre cuadros con CPU 4× (rAF, p95 / máx en ms), antes → después. En Chromium headless el raster es por software y domina; el efecto del dpr 1 solo se ve en el móvil simulado (dpr 2), y entre ejecuciones hay ±30 % de ruido.

| Viewport | arrastre carga | tamaño | z | azimut |
|---|---|---|---|---|
| 390×844 | 83/133 → 67/133 | 150/167 → 133/150 | 133/133 → 133/134 | 117/117 → 67/117 |
| 1024×768 | 50/83 → 67/100 | 100/100 → 117/133 | 83/83 → 100/117 | 67/83 → 83/133 |
| 1366×650 | 50/83 → 50/67 | 83/100 → 67/83 | 83/83 → 67/83 | 67/83 → 67/67 |

Recálculo de geometría con CPU 4× en la nueva medición: máximo p50 7,5 ms y p95 11,7 ms (esc. 7, alta, malla nueva); algunas ejecuciones dieron p95 de 14,4 ms en ese mismo caso (12 muestras con GC), por lo que el margen frente a los 14 ms es menor que en la primera medición (8,5 ms). Con malla en caché (arrastre) p95 ≤ 6,1 ms y en modo gesto ≤ 6 ms. La decisión se mantiene: sin Worker, porque lo que ocurre en cada cuadro de un gesto (malla en caché, líneas gruesas) queda en ≤ 6 ms; el caso de 11–14 ms es el cambio de escenario o de tamaño (una vez por acción) y además el gestor ya degrada la calidad. Si se quiere más holgura, el siguiente paso sería un Worker solo para el cambio de escenario.
