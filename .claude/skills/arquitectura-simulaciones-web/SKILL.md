---
name: arquitectura-simulaciones-web
description: >-
  Experto en arquitectura frontend de simulaciones físicas interactivas en el navegador — gestión de estado en React/Vue/Svelte, motores de física en Web Workers con JavaScript vectorizado (Float32Array), y renderizado en Canvas 2D, WebGL (Three.js) o WebGPU. Úsala siempre que se pida construir una app web con simulaciones o visualizaciones interactivas en tiempo real (partículas, campos, cuerpos interactuando, sistemas N-cuerpos), cuando haya lag por muchos objetos re-renderizando en React, cuando pregunten si usar useState o Zustand/Redux para un canvas con elementos moviéndose, cuando pidan mover cálculos pesados a un Web Worker o WebAssembly, o cuando duden entre Canvas 2D, WebGL o WebGPU. Aplica con física (cargas, N-cuerpos) o cualquier otra simulación en tiempo real con muchos elementos dinámicos (partículas, autómatas celulares, dashboards animados).
---

# Arquitectura de simulaciones interactivas en la web

## Qué hace esta habilidad

Esta habilidad cubre el lado de ingeniería frontend de construir simulaciones interactivas que corren suaves en el navegador: cómo organizar el estado, dónde vive el cálculo pesado, y cómo se dibuja el resultado — sin que React se convierta en el cuello de botella.

No es una habilidad de física. Para las fórmulas y la discretización numérica (Coulomb, Maxwell, velocity Verlet, softening, FDTD), consulta la habilidad `electromagnetismo-computacional` — esta habilidad asume que ya tienes (o esa otra habilidad te da) la lógica de la simulación, y se enfoca en **cómo estructurarla como una aplicación web que se sienta fluida**, con cualquier tipo de simulación en tiempo real con muchos elementos dinámicos (no solo electromagnetismo — aplica igual a partículas, autómatas celulares, sistemas de N-cuerpos gravitacionales, etc.).

## El problema central que resuelve

React (y frameworks similares) están diseñados para re-renderizar cuando el **estado de la UI** cambia — un formulario, una lista, un modal. Una simulación física quiere actualizar posiciones **60 veces por segundo**, y ninguna de esas actualizaciones es realmente "estado de la UI" en el sentido de React. Si tratas la posición de cada partícula como estado de React, cada frame dispara una pasada completa de reconciliación del árbol de componentes — con 50 partículas a 60fps eso es 3000 re-renders por segundo, y la app se pone lenta o con tirones (jank) incluso en máquinas potentes.

La solución siempre tiene la misma forma, sea cual sea el framework: **separar el bucle de física del bucle de renderizado de React**. Esto se logra con tres piezas que trabajan juntas:

1. **Estado de React solo para lo que la UI necesita re-renderizar de verdad**: la lista de cargas (agregar/quitar), qué modo de vista está activo, si está en pausa, los valores de los sliders. Esto cambia poco — es perfectamente razonable que React lo maneje.
2. **Datos de simulación (posiciones, velocidades) fuera del árbol de React**: viven en un `ref`, en un `ArrayBuffer`/`Float32Array` compartido, o directamente dentro de un Web Worker. React nunca los toca ni se entera de que cambian frame a frame.
3. **Un bucle de animación propio** (`requestAnimationFrame`, o mensajes del Worker) que lee esos datos y los dibuja directamente en el canvas — sin pasar por `setState`.

Ver `references/gestion_estado.md` para el árbol de decisión completo (cuándo `useState` alcanza, cuándo conviene Zustand, y el patrón exacto para mantener los datos de animación fuera de React).

## Las tres decisiones de arquitectura

### 1. Gestión de estado: ¿qué vive en React y qué no?

Regla rápida: si un dato cambia por una acción del usuario (clic, submit, toggle) → estado de React. Si un dato cambia por el paso del tiempo dentro del bucle de simulación → vive fuera de React (ref, worker, o un store externo con selectores granulares).

- **`useState`/`useReducer`** alcanza perfectamente para apps simples: pocas cargas, sin necesidad de que múltiples componentes lejanos lean el mismo estado simulado.
- **Zustand** (u otro store externo tipo Jotai) vale la pena cuando: (a) tienes listas de objetos que cambian constantemente y quieres que solo los componentes que realmente dependen de un dato específico se re-rendericen (selectores granulares en vez de un solo contexto gigante), o (b) necesitas que el bucle de física escriba datos que varios componentes leen sin pasar por props. Zustand no resuelve el problema de rendimiento por sí solo — la clave sigue siendo que los datos de altísima frecuencia (posiciones cada frame) no pasen por el store como estado reactivo, sino por refs o el patrón de Worker de abajo.

Ver `references/gestion_estado.md` para el patrón completo y `scripts/store_simulacion.ts` como plantilla lista para usar.

### 2. Motor físico: ¿dónde corre el cálculo pesado?

La lógica de la simulación (sea Coulomb, gravedad, o cualquier regla de interacción) se traduce a JavaScript vectorizado usando `Float32Array` en vez de arrays normales de objetos — es el equivalente en el navegador de lo que hace numpy en Python, y evita la sobrecarga de crear miles de objetos JS por frame.

Esto corre dentro de un **Web Worker**, no en el hilo principal, para que el cálculo de fuerzas no compita con el hilo que maneja el mouse, el scroll, y el renderizado de React. La comunicación entre el hilo principal y el Worker se hace pasando el `ArrayBuffer` de posiciones como **objeto transferible** (`postMessage(buffer, [buffer])`) en vez de copiarlo — esto es prácticamente gratis, a diferencia de serializar el estado completo cada frame.

Cuando el número de elementos crece (cientos a miles), en ese orden de prioridad conviene escalar:
1. Optimizar el JS vectorizado (typed arrays, evitar allocaciones dentro del bucle).
2. **Barnes-Hut** (o un algoritmo de agrupamiento espacial similar) para bajar de O(N²) a O(N log N) — relevante para cualquier problema de interacción de a pares, no solo electrostático.
3. **WebAssembly**: compilar el integrador (Rust o C++) para rendimiento cercano a nativo cuando el JS vectorizado ya no alcanza.
4. **WebGPU (compute shaders)**: la opción más agresiva — paraleliza el cálculo de fuerzas en la GPU misma. Soporte de navegadores todavía en crecimiento; vale la pena solo si de verdad necesitas miles de elementos interactuando en tiempo real.

**Alternativa si no quieres reescribir la lógica**: si ya existe un script de Python (por ejemplo, de la habilidad `electromagnetismo-computacional`) que hace exactamente lo que se necesita, **Pyodide** (Python + numpy compilado a WASM) permite correrlo directamente en el navegador sin traducir nada a JS. El costo es un bundle inicial más pesado (varios MB de runtime de Python) y algo más de latencia de arranque — vale la pena cuando se quiere compartir una sola fuente de verdad entre la investigación en Python y la demo web, no cuando el rendimiento en tiempo real es la prioridad número uno.

Ver `references/motor_fisico_worker.md` para el protocolo de mensajes, el patrón de paso de tiempo fijo (timestep con acumulador, para que la física no dependa de la tasa de refresco de pantalla), y `scripts/motor_fisico.worker.ts` como plantilla funcional de un integrador N-cuerpos.

### 3. Renderizado: ¿Canvas 2D, WebGL o WebGPU?

- **Canvas 2D**: la opción por defecto. Suficiente para 2D, del orden de cientos de elementos, flechas de campo, líneas, formas simples. Es la más simple de depurar y la que menos dependencias añade.
- **WebGL vía Three.js**: necesario en dos casos — (a) el fenómeno es genuinamente 3D (un solenoide, órbitas en el espacio, campo alrededor de un cable), o (b) quieres que un *fragment shader* calcule un campo continuo por píxel en paralelo, lo cual da mapas de calor o de potencial suaves en tiempo real incluso con muchas fuentes, algo que sería lento recalculando en el CPU para cada píxel del canvas.
- **WebGPU (compute shaders)**: la opción más moderna, para cuando de verdad quieres miles de partículas o elementos interactuando en paralelo directamente en la GPU (no solo el renderizado, sino el cálculo físico mismo). Soporte de navegador todavía desigual (revisa compatibilidad si el público del usuario incluye Safari/navegadores más viejos) — trátalo como la opción de vanguardia, no la default.

Ver `references/renderizado.md` para los criterios de decisión con más detalle y `scripts/CanvasRenderer.tsx` como plantilla de un componente de renderizado desacoplado del ciclo de estado de React.

## Cómo decidir rápido cuando el usuario no da todos los detalles

Si el usuario no especifica número de elementos ni si es 2D/3D, asume por defecto: Canvas 2D + Web Worker con JS vectorizado + Zustand solo si hay más de un componente leyendo el mismo estado de simulación (si es un solo componente, `useState` basta). Este es el punto de partida más simple que ya resuelve el problema de rendimiento sin sobre-ingeniería — escala hacia WebGL/WebGPU/WASM/Barnes-Hut solo cuando el usuario menciona explícitamente muchos elementos (cientos o miles), 3D, o problemas de rendimiento reales que ya está experimentando.

## Archivos de referencia y plantillas

- `references/gestion_estado.md`: árbol de decisión completo para el estado (useState vs useReducer vs Zustand vs Jotai), el patrón de mantener datos de animación en refs fuera de React, y errores comunes (el antipatrón de poner posiciones en `useState`).
- `references/motor_fisico_worker.md`: protocolo de mensajes entre el hilo principal y el Worker, objetos transferibles, patrón de timestep fijo con acumulador, y notas sobre cuándo escalar a Barnes-Hut/WASM/WebGPU/Pyodide.
- `references/renderizado.md`: guía de decisión Canvas 2D / WebGL / WebGPU con patrones de código para cada uno, incluyendo el patrón de fragment shader para mapas de campo continuo.
- `scripts/store_simulacion.ts`: plantilla de un store de Zustand que maneja la lista de elementos, modo de vista, y controles de reproducción, manteniendo los datos de alta frecuencia (posiciones) fuera del store reactivo.
- `scripts/motor_fisico.worker.ts`: plantilla de un Web Worker que integra un sistema de N cuerpos con fuerza de Coulomb (fácilmente adaptable a otras leyes de fuerza), usando Float32Array y el patrón de timestep fijo.
- `scripts/CanvasRenderer.tsx`: plantilla de un componente React que dibuja el resultado de la simulación en un canvas usando `requestAnimationFrame`, leyendo los datos del Worker sin pasar por el estado de React.

Estas plantillas son puntos de partida, no la única forma de resolver el problema — adáptalas al framework y las necesidades específicas del usuario (por ejemplo, si usa Vue o Svelte en vez de React, el patrón de "estado UI vs datos de animación fuera del framework" es el mismo, solo cambia la sintaxis).

## Formato de la respuesta

Responde en prosa natural para preguntas conversacionales de arquitectura ("¿por qué mis partículas van lentas?"). Si el usuario pide código o una app funcional, ahí sí aplican las convenciones normales de creación de archivos (guardar en `/mnt/user-data/outputs`, presentarlo con `present_files`), y conviene revisar la skill `frontend-design` para las convenciones de estilo visual del proyecto.
