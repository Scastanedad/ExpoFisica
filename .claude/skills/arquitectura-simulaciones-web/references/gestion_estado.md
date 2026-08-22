# Gestión de estado en simulaciones interactivas

## El antipatrón a evitar

```tsx
// ❌ NO HAGAS ESTO: posiciones como estado de React
function Simulacion() {
  const [cargas, setCargas] = useState([{ x: 0, y: 0, vx: 1, vy: 0 }]);

  useEffect(() => {
    const id = requestAnimationFrame(function tick() {
      setCargas(prev => prev.map(c => ({ ...c, x: c.x + c.vx }))); // re-render cada frame
      requestAnimationFrame(tick);
    });
    return () => cancelAnimationFrame(id);
  }, []);
  // ...
}
```

Cada `setCargas` dentro del bucle de animación dispara una reconciliación completa del árbol de React. A 60fps con N objetos, esto se nota casi de inmediato — la interfaz se vuelve pesada, arrastrar algo con el mouse tiene lag, y cuantos más componentes lean ese estado, peor se pone.

## El patrón correcto: separar "estado de UI" de "datos de simulación"

Pregúntate de cada dato: **¿cambia por una acción del usuario, o cambia por el paso del tiempo?**

| Cambia por... | Ejemplo | Dónde vive |
|---|---|---|
| Acción del usuario (clic, submit, drag-and-drop de un slider) | agregar/quitar una carga, cambiar el modo de vista, pausar | Estado de React (`useState`, `useReducer`, o un store) |
| El paso del tiempo dentro del bucle de física | posición y velocidad de cada carga, cada frame | `ref`, `Float32Array`, o dentro del Web Worker — nunca en `useState` |

```tsx
// ✅ Datos de animación en un ref, fuera del ciclo de re-render de React
function Simulacion() {
  const posicionesRef = useRef(new Float32Array(N * 2)); // x,y por carga, sin re-renders
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    let id: number;
    function tick() {
      actualizarFisica(posicionesRef.current); // muta el array in-place
      dibujar(canvasRef.current, posicionesRef.current); // dibuja directo, sin pasar por React
      id = requestAnimationFrame(tick);
    }
    id = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(id);
  }, []);

  return <canvas ref={canvasRef} />;
}
```

React nunca se entera de que las posiciones cambiaron — no hay reconciliación, no hay re-render. El canvas se actualiza directamente en cada frame.

## Cuándo `useState`/`useReducer` alcanza

Para apps simples: pocas cargas (decenas), un solo componente que necesita saber "cuántas hay" o "cuáles son sus propiedades editables" (no sus posiciones de animación), sin necesidad de compartir ese estado entre componentes lejanos en el árbol. Ejemplo: una lista de cargas con su carga (culombios) editable en un panel lateral — eso sí puede vivir en `useState`, mientras que su posición X/Y en cada frame vive en el ref.

## Cuándo conviene un store externo (Zustand, Jotai)

Vale la pena cuando:
- **Selectores granulares**: varios componentes leen partes distintas del mismo estado (un panel de control, un contador de energía, una lista de cargas) y no quieres que todos se re-rendericen cuando cualquiera cambia. Con `useState` en el componente padre y prop drilling, cualquier cambio re-renderiza todo el subárbol; con Zustand, cada componente se suscribe solo al slice que le importa.
- **El bucle de física necesita escribir algo que la UI sí debe reflejar eventualmente** (por ejemplo, un contador de energía total que se actualiza una vez por segundo, no cada frame) — puedes escribir eso al store a una tasa reducida (throttled), sin que sea el mismo canal de alta frecuencia que las posiciones.

**Importante**: Zustand no resuelve el problema de rendimiento por sí solo si sigues poniendo las posiciones de cada frame dentro del store como estado reactivo — vas a tener el mismo problema que con `useState`, solo que con una API distinta. La clave sigue siendo la tabla de arriba: los datos de alta frecuencia (posiciones cada frame) van en un ref o directamente en el Worker, no en ningún store reactivo. Zustand ayuda con el resto del estado (qué cargas existen, modo de vista, controles) para que ese estado sí se pueda compartir sin over-rendering.

### Patrón con Zustand: separar el store "de UI" del canal de animación

```ts
// Estado de UI en Zustand: cambia poco, varios componentes lo leen
interface EstadoSimulacion {
  cargas: { id: string; q: number }[]; // solo propiedades editables, NO posiciones
  modoVista: "vectores" | "lineas" | "potencial";
  enPausa: boolean;
  agregarCarga: (q: number) => void;
  quitarCarga: (id: string) => void;
  setModoVista: (m: EstadoSimulacion["modoVista"]) => void;
  togglePausa: () => void;
}

// Las posiciones NO están aquí -- viven en un Float32Array compartido
// con el Worker (ver motor_fisico_worker.md), leído directamente por
// el componente de renderizado en su propio requestAnimationFrame.
```

## Vue y Svelte: el mismo patrón, distinta sintaxis

- **Vue**: usa `ref()`/`reactive()` solo para el estado de UI; para los datos de animación, evita que Vue los haga reactivos — usa un objeto plano o un `Float32Array` fuera de `reactive()`, y actualiza el canvas directamente en el bucle de `requestAnimationFrame`, sin pasar por `ref.value =`.
- **Svelte**: los stores (`writable`) son para el estado de UI. Para las posiciones de animación, igual que en React/Vue: una variable normal fuera del sistema reactivo de Svelte, actualizada en un bucle propio.

El principio es universal: cualquier framework reactivo (React, Vue, Svelte) paga un costo de reconciliación/reactividad por cada actualización de estado — ese costo es aceptable a la frecuencia de interacción del usuario (clics, toggles) pero no a 60fps para cientos de valores. La solución es siempre sacar el bucle de animación del sistema reactivo del framework.
