# Renderizado: Canvas 2D, WebGL o WebGPU

## Árbol de decisión rápido

```
¿Es 2D y unos cientos de elementos o menos?
  → Sí: Canvas 2D. Es más simple, más fácil de depurar, y de sobra para esto.
  → No, sigue:

¿Necesitas 3D (órbitas en el espacio, campo alrededor de un solenoide/cable,
cámara que rota) O quieres un mapa de campo/potencial continuo y suave
calculado en paralelo por píxel?
  → Sí: WebGL vía Three.js.
  → No, sigue:

¿Necesitas literalmente miles de elementos actualizándose e interactuando
en tiempo real, y el JS vectorizado + Barnes-Hut ya no dan abasto?
  → Sí: considera WebGPU (compute shaders) -- pero primero confirma que el
    público del usuario tiene navegadores compatibles.
  → No: Canvas 2D o WebGL bastan, no compliques la arquitectura de más.
```

## Canvas 2D

La opción por defecto. Dibuja directamente con la API `CanvasRenderingContext2D` — círculos para las cargas, líneas para vectores de campo, `strokeStyle`/`fillStyle` para colores. Ver `scripts/CanvasRenderer.tsx` para el patrón de integración con React (leyendo del Worker sin pasar por el estado reactivo).

**Cuándo se queda corto**: si necesitas más de unos cientos de elementos dibujándose cada frame con transformaciones complejas, o si el fenómeno es genuinamente 3D. El cuello de botella de Canvas 2D es que cada `draw call` es una instrucción secuencial en la CPU — no hay paralelismo real.

## WebGL vía Three.js

Usa Three.js en vez de WebGL puro salvo que tengas una razón específica para no hacerlo — la API de WebGL crudo (shaders, buffers, matrices) es mucho más verbosa, y Three.js ya resuelve cámara, iluminación básica, y geometría por ti.

**Caso 1: fenómeno 3D**. Un solenoide, el campo magnético alrededor de un cable, trayectorias orbitales — cualquier cosa donde la cámara necesite rotar o el fenómeno tenga profundidad real. Usa `THREE.Points` o `THREE.InstancedMesh` para dibujar muchos elementos (cargas, partículas) de forma eficiente sin crear un objeto Three.js individual por elemento — `InstancedMesh` dibuja miles de instancias de la misma geometría con una sola llamada de dibujo, actualizando solo sus matrices de transformación por frame.

**Caso 2: mapas de campo continuo por píxel**. Si quieres un mapa de calor del potencial eléctrico o la magnitud del campo, calculado suavemente en toda la pantalla (no solo en una malla de puntos discretos), un *fragment shader* puede evaluar la fórmula del campo para cada píxel en paralelo en la GPU:

```glsl
// Fragment shader simplificado: suma el potencial de N cargas en cada píxel
uniform vec2 cargas[MAX_CARGAS];   // posiciones de las cargas
uniform float valores[MAX_CARGAS]; // valor de cada carga
uniform int numCargas;

void main() {
  vec2 p = gl_FragCoord.xy;
  float potencial = 0.0;
  for (int i = 0; i < numCargas; i++) {
    float r = distance(p, cargas[i]) + 0.01; // softening
    potencial += valores[i] / r;
  }
  // mapear 'potencial' a un color (por ejemplo con una rampa de color)
  gl_FragColor = vec4(colorDesdePotencial(potencial), 1.0);
}
```

Esto sería prohibitivamente lento en CPU (recalcular la suma de Coulomb para cada uno de, digamos, 1920×1080 píxeles, cada frame), pero es exactamente el tipo de trabajo para el que la GPU está diseñada — cada píxel se calcula en paralelo, independiente de los demás.

## WebGPU (compute shaders)

La diferencia clave con WebGL: WebGL usa shaders principalmente para *dibujar* (el fragment shader de arriba calcula un color por píxel, pero el resultado es visual, no datos reutilizables). WebGPU permite *compute shaders* que hacen cálculo de propósito general en la GPU — por ejemplo, calcular la fuerza neta sobre cada una de miles de partículas en paralelo, y escribir el resultado a un buffer que luego se usa para actualizar posiciones, todo sin que la CPU intervenga en el cálculo pesado.

Esto es relevante cuando el cuello de botella no es el *dibujo* sino el *cálculo físico* mismo con muchísimos elementos — la sección de Barnes-Hut/WASM en `motor_fisico_worker.md` ayuda hasta cierto punto, pero WebGPU es la opción que de verdad escala a decenas de miles de partículas interactuando en tiempo real.

**Antes de elegir WebGPU**, confirma que vale la pena la complejidad adicional (escribir compute shaders en WGSL, gestionar buffers de GPU explícitamente) revisando: ¿el usuario realmente necesita ese volumen de elementos, o es una demo educativa donde unos cientos ya transmiten la idea? La mayoría de las simulaciones interactivas educativas nunca necesitan salir de Canvas 2D + Web Worker.

## Nota sobre el bucle de renderizado y React

Sea cual sea la tecnología elegida, el componente de renderizado debe tener su propio `requestAnimationFrame` que lee los datos de posición (del ref, del buffer compartido con el Worker, etc.) y dibuja — nunca debe depender de que React se re-renderice para actualizar el frame. Ver `references/gestion_estado.md` y `scripts/CanvasRenderer.tsx` para el patrón completo.
