# Simulador Interactivo de Electromagnetismo

## Descripción

Una página web educativa donde el visitante puede **ver y manipular en tiempo real** los fenómenos de electrostática que normalmente solo se explican con fórmulas en el pizarrón: el campo eléctrico de una carga, cómo se atraen o repelen varias cargas entre sí, y cómo se ve el potencial eléctrico alrededor de ellas. Pensada como estación interactiva para una exposición de física: no requiere instalar nada, corre en cualquier navegador (incluyendo tablets/celulares).

**Estado: construida y probada.** Corre localmente en `http://localhost:5173/` mientras el servidor de desarrollo está encendido; todavía no tiene un link público (ver "Próximos pasos").

## Cómo está organizada

Una página de inicio ("Estaciones") lleva a dos experiencias independientes:

- **01 · Campo eléctrico** (`/campo-fijo`) — una o varias cargas fijas que se arrastran con el mouse/dedo; el campo se recalcula en vivo.
- **02 · Cargas en movimiento** (`/cargas-en-movimiento`) — varias cargas que se atraen y repelen solas por la fuerza de Coulomb, como un sistema de N cuerpos; también se pueden arrastrar para darles un empujón.

Ambas estaciones comparten el mismo toggle de 3 modos de vista y los mismos controles de agregar/quitar carga; la estación dinámica además tiene pausa/reanudar y control de velocidad (la estática no, porque ahí no hay nada que evolucione en el tiempo para pausar).

## Qué se puede hacer

- **Arrastrar cargas con el mouse/dedo** y ver su campo eléctrico reaccionar al instante.
- **Soltar varias cargas y verlas interactuar solas**: se atraen o repelen entre sí por la fuerza de Coulomb.
- **Cambiar entre 3 formas de visualizar el campo**, con un toggle:
  - *Vectores de campo* — flechas que muestran dirección e intensidad.
  - *Líneas de campo* — las clásicas líneas que salen de cargas positivas y entran en las negativas.
  - *Mapa de potencial* — un mapa de calor de colores mostrando el voltaje en cada punto.
- **Agregar o quitar cargas**, y en la estación dinámica, pausar/reanudar y controlar la velocidad con un slider.
- Probada con **30 cargas simultáneas** interactuando sin trabarse.

## Tecnologías usadas

| Área | Tecnología | Por qué |
|---|---|---|
| Framework web | React 19 + TypeScript + Vite | Confirmado con el usuario; estándar moderno, rápido de armar y de mantener |
| Rutas | React Router | Pasar de la página de inicio a cada estación con un link real |
| Estado de la interfaz | Zustand (un store por estación, más uno compartido para modo de vista/unidad) | Cada componente se suscribe solo a lo que necesita, sin ralentizar la app |
| Motor de física | Web Worker con arrays planos de JS (no un `Float32Array` gestionado a mano — a esta escala de decenas de cargas es más simple de mutar al agregar/quitar, y el costo O(n²) sigue siendo trivial) | Corre en un hilo aparte para que el cálculo de fuerzas nunca compita con el mouse ni el renderizado |
| Integración numérica | Velocity Verlet + suavizado ("softening") + rebote elástico en los bordes del canvas | Método estable para que las trayectorias no exploten cerca de una colisión, y para que las cargas no se salgan de pantalla |
| Dibujo en pantalla | Canvas 2D | Suficiente para el número de cargas esperado; el modo de líneas de campo tiene un presupuesto adaptativo (menos líneas por carga cuando hay muchas) para no ponerse lento a 30 cargas |
| Diseño visual | Skill oficial `frontend-design` de Anthropic | Estética "instrumento de laboratorio/plano técnico": grid de fondo, tipografía monoespaciada, un solo acento (cian), y el rojo/azul reservado para el significado físico real (polaridad de la carga), no como decoración |

**Deliberadamente descartado por ahora:** WebGPU y WebAssembly (solo se justifican con miles de elementos interactuando), y `SharedArrayBuffer` (requiere configuración especial de servidor que no aporta nada a esta escala).

## Física detrás de cada modo

- **Vectores y líneas de campo**: ley de Coulomb, `E = (1/4πε₀) Σ qᵢ(r-rᵢ)/|r-rᵢ|³` — suma directa, sin necesidad de simular tiempo.
- **Mapa de potencial**: `V = (1/4πε₀) Σ qᵢ/rᵢ`, evaluado sobre una malla y pintado como mapa de color.
- **Cargas interactuando**: fuerza de Coulomb entre cada par (`F = kq₁q₂/r²`), integrada en el tiempo — se valida que la energía total del sistema se mantenga aproximadamente constante, como debe ser en un sistema aislado (si la deriva supera 8%, el motor avisa por consola).

Los tres modos de vista funcionan tanto con cargas quietas como con cargas moviéndose solas — se puede ver, por ejemplo, el mapa de potencial deformándose en vivo mientras las cargas orbitan y colisionan.

## Decisiones ya tomadas

- **Cargas simultáneas**: ~20-30 es el rango de diseño; probado sin problemas a 30.
- **Responsive**: debe funcionar en celular/tablet, no solo en pantalla de exposición — verificado en viewport de 390×844.
- **Unidades**: normalizadas pero con sentido físico real (magnitud `1` = 1 microCoulomb), con un toggle de cómo se muestran, para que sea preciso sin dejar de ser intuitivo.

## Próximos pasos posibles

- Desplegar a un hosting estático (Vercel, Netlify o GitHub Pages) para tener un link público compartible — hoy solo corre localmente.
- Revalidar el layout móvil de la estación "Cargas en movimiento" en particular (el de "Campo eléctrico" y el de inicio ya se probaron en viewport móvil).
- Pulido visual adicional si se quiere, sobre la misma dirección de diseño ya establecida.
