# Motor físico en un Web Worker

## Por qué un Worker y no el hilo principal

El hilo principal del navegador maneja el DOM, los eventos de mouse/teclado, y el renderizado de React. Si el cálculo de fuerzas (O(N²) para N cuerpos interactuando) corre ahí también, compite por el mismo hilo — arrastrar una carga con el mouse se siente con lag, los toggles de la UI responden tarde, todo se siente "pegajoso". Mover ese cálculo a un **Web Worker** lo pone en un hilo separado: la física corre en paralelo sin bloquear la interfaz.

## Protocolo de mensajes: qué mandar y qué no

El error común es mandar el estado completo (un array de objetos JS) en cada mensaje — eso implica serializar/clonar estructuras complejas constantemente, lo cual tiene su propio costo. En vez de eso:

1. **Inicialización** (una sola vez): manda al Worker los parámetros fijos (número de cargas, sus valores de carga/masa) y un `ArrayBuffer` compartido para las posiciones.
2. **Cada frame**: el Worker escribe las nuevas posiciones directamente en ese buffer y avisa "listo" — no manda los datos completos cada vez, el hilo principal ya tiene acceso al mismo buffer.
3. **Objetos transferibles** (`Transferable`): cuando sí necesitas mandar un `ArrayBuffer` de un lado a otro (en vez de compartirlo con `SharedArrayBuffer`), usa la segunda forma de `postMessage` para transferir la propiedad sin copiar:
   ```js
   worker.postMessage({ tipo: "posiciones", buffer }, [buffer]); // transferencia, no copia
   ```
   Después de esto, `buffer` ya no es accesible en el hilo que lo mandó — la propiedad pasó al otro lado. Es prácticamente instantáneo sin importar el tamaño del buffer, a diferencia de clonarlo.
4. **`SharedArrayBuffer`** (cuando el navegador y los headers de seguridad lo permiten — requiere `Cross-Origin-Opener-Policy`/`Cross-Origin-Embedder-Policy`): ambos hilos leen y escriben el mismo buffer sin transferencias ni copias en absoluto. Es la opción más eficiente, pero añade complejidad de configuración del servidor — empieza con objetos transferibles y sube a `SharedArrayBuffer` solo si el perfilado muestra que la transferencia es el cuello de botella.

## Patrón de timestep fijo (para que la física no dependa del framerate)

Si simplemente avanzas la física un paso por cada `requestAnimationFrame`, la simulación corre distinto en una pantalla de 60Hz que en una de 144Hz, o se vuelve inestable si el navegador se atrasa un frame. El patrón estándar es un **acumulador de tiempo**:

```js
const DT_FISICA = 1 / 120; // paso de física fijo (independiente del framerate de pantalla)
let acumulador = 0;
let ultimoTiempo = performance.now();

function bucle(ahora) {
  const delta = (ahora - ultimoTiempo) / 1000;
  ultimoTiempo = ahora;
  acumulador += Math.min(delta, 0.25); // clamp para evitar "spiral of death" si hay un frame muy largo

  while (acumulador >= DT_FISICA) {
    avanzarPaso(DT_FISICA); // siempre el mismo dt, sin importar el framerate real
    acumulador -= DT_FISICA;
  }

  self.postMessage({ tipo: "listo" }); // avisa al hilo principal que puede leer/dibujar
  requestAnimationFrame(bucle); // dentro de un Worker, usar setInterval/self.requestAnimationFrame si está disponible
}
```

Esto es exactamente el mismo problema que la condición de Courant en una simulación FDTD (ver la habilidad `electromagnetismo-computacional`) — el paso de tiempo de la física es una decisión de estabilidad numérica, no un detalle de rendimiento.

## Cuándo escalar más allá de JS vectorizado

En este orden de prioridad (no saltes a la solución más compleja si la anterior todavía no se ha probado):

1. **JS vectorizado con Float32Array** (ver `scripts/motor_fisico.worker.ts`): suficiente para decenas a un par de cientos de elementos interactuando en tiempo real en la mayoría de las máquinas.
2. **Barnes-Hut**: agrupa elementos lejanos en un solo "centro efectivo" usando un árbol espacial (quadtree en 2D, octree en 3D), bajando el cálculo de fuerzas de O(N²) a O(N log N). Vale la pena a partir de cientos/miles de elementos donde el O(N²) empieza a notarse. Es un algoritmo genérico de N-cuerpos — aplica igual a fuerzas gravitacionales, electrostáticas, o cualquier interacción de a pares que decae con la distancia.
3. **WebAssembly**: compila el integrador (por ejemplo desde Rust con `wasm-bindgen`, o C++ con Emscripten) para rendimiento cercano a nativo. Vale la pena cuando el JS vectorizado y Barnes-Hut ya no alcanzan, o cuando quieres reusar una librería de física existente en otro lenguaje.
4. **WebGPU (compute shaders)**: paraleliza el cálculo de fuerzas directamente en la GPU — miles de elementos actualizándose en paralelo cada frame. Es la opción de mayor rendimiento potencial, pero el soporte de navegadores todavía es desigual (revisa si el público del usuario incluye Safari u otros navegadores con soporte parcial) y añade la complejidad de escribir shaders. Trátalo como la opción de vanguardia para cuando de verdad se necesitan miles de partículas, no como punto de partida.

## Alternativa: Pyodide (reusar Python directamente)

Si ya existe un script de Python que hace exactamente la simulación deseada (por ejemplo, las plantillas de la habilidad `electromagnetismo-computacional`), **Pyodide** compila Python + numpy a WASM y permite correrlo tal cual dentro de un Web Worker, sin traducir la lógica a JavaScript:

```js
// dentro de un Worker
importScripts("https://cdn.jsdelivr.net/pyodide/v0.26.0/full/pyodide.js");
async function iniciar() {
  const pyodide = await loadPyodide();
  await pyodide.loadPackage("numpy");
  await pyodide.runPythonAsync(`
    import numpy as np
    # ... la misma lógica de calcular_fuerzas() del script de Python ...
  `);
}
```

Compensación: el runtime de Pyodide pesa varios MB adicionales de descarga inicial y tiene más latencia de arranque que JS nativo. Es la elección correcta cuando se prioriza compartir una única fuente de verdad entre la investigación en Python y la demo web (por ejemplo, un curso donde el mismo código se usa en Jupyter y en la página); no es la elección correcta si la prioridad es rendimiento en tiempo real o un bundle ligero.

Ver `scripts/motor_fisico.worker.ts` para una plantilla funcional del enfoque JS vectorizado (opción 1), que cubre la gran mayoría de los casos de uso educativos e interactivos.
