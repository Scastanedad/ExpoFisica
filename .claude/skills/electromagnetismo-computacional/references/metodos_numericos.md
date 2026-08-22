# De ecuación continua a código: recetas de discretización

Esta es la parte "ciencias de la computación" del electromagnetismo: cómo convertir una derivada o una ecuación diferencial parcial en una operación sobre un array que una computadora puede iterar. Cada receta de abajo es, literalmente, la línea (o par de líneas) de código que necesitas escribir.

## 1. Diferencias finitas (la herramienta base de todo lo demás)

Cualquier derivada se puede aproximar con los valores de una función en una malla (grid) de puntos separados por un paso `h` (o `dx`, `dt` según el eje).

**Primera derivada (diferencia centrada, la más precisa de las simples)**:
```
f'(x) ≈ (f(x+h) - f(x-h)) / (2h)
```

**Segunda derivada**:
```
f''(x) ≈ (f(x+h) - 2f(x) + f(x-h)) / h²
```

En código con un array `f` indexado `f[i]`:
```python
d2f_dx2 = (f[i+1] - 2*f[i] + f[i-1]) / dx**2
```
Esto es exactamente lo que necesitas para el operador `∇²` (laplaciano) en 1D. En 2D, se suma la misma fórmula en ambos ejes:
```python
laplacian[i,j] = (f[i+1,j] - 2*f[i,j] + f[i-1,j]) / dx**2 \
               + (f[i,j+1] - 2*f[i,j] + f[i,j-1]) / dy**2
```

## 2. Resolver Laplace/Poisson (potencial electrostático): relajación iterativa

Para `∇²V = -ρ/ε₀` en una malla 2D con condiciones de frontera fijas (electrodos, placas de un capacitor), el método más simple y robusto es la **iteración de Jacobi** (o Gauss-Seidel, que converge más rápido):

Despejando el laplaciano discreto de la ecuación de Poisson para el punto central:
```python
V[i,j] = 0.25 * (V[i+1,j] + V[i-1,j] + V[i,j+1] + V[i,j-1] + dx**2 * rho[i,j] / eps0)
```
Se itera esta actualización sobre toda la malla (excepto los puntos de frontera fijos, que no se tocan) hasta que el cambio máximo entre iteraciones sea menor a una tolerancia (típicamente `1e-5` o similar). Esto converge a la solución de estado estacionario. Es el algoritmo estándar para "campo entre dos placas de un capacitor" o "potencial alrededor de un electrodo de forma rara".

Nota de CS: esto es un ejemplo clásico de algoritmo iterativo de punto fijo — la misma familia que PageRank o la resolución de sistemas lineales dispersos. Gauss-Seidel converge más rápido que Jacobi porque usa valores ya actualizados en la misma pasada, al costo de no ser trivialmente paralelizable (Jacobi sí lo es, celda por celda).

## 3. FDTD (Finite-Difference Time-Domain) para ondas electromagnéticas

Este es el método estándar para simular la propagación de ondas EM (la ecuación de onda de `ecuaciones_maxwell.md`). La idea: discretizar tanto el espacio como el tiempo, y actualizar el campo en pasos alternados (E y H se actualizan en instantes de tiempo intercalados — esto se llama **malla de Yee**, pero para una versión simplificada 1D escalar basta con la ecuación de onda de segundo orden).

**Ecuación de onda 1D** `∂²E/∂t² = c² ∂²E/∂x²` discretizada:
```python
E_new[i] = 2*E[i] - E_old[i] + (c*dt/dx)**2 * (E[i+1] - 2*E[i] + E[i-1])
```
donde `E` es el campo en el paso de tiempo actual y `E_old` el paso anterior. Después de calcular `E_new`, se rota: `E_old, E = E, E_new`.

**Condición de estabilidad de Courant** (crítica — si no se cumple, la simulación explota numéricamente sin que sea un fenómeno físico real):
```
c * dt / dx ≤ 1        (en 1D; en 2D/3D el límite es más estricto, típicamente ≤ 1/√(dimensiones))
```
Regla práctica: elige `dt = 0.5 * dx / c` para tener margen de seguridad.

**Condiciones de frontera** (qué pasa en los bordes de la malla): las más simples son fronteras absorbentes simples (Mur de primer orden) o simplemente fijar el campo a cero en los bordes (frontera reflectante — útil si quieres ver reflexiones a propósito, por ejemplo en una "caja" o cavidad).

**Interfaces entre medios** (para simular reflexión/refracción): cambia el valor de `c` (o de `ε_r`) en la región correspondiente del array — la propagación de la onda naturalmente producirá una reflexión parcial en la interfaz según la diferencia de impedancia (`Z = √(μ/ε)`) entre ambos medios. No hace falta ninguna lógica especial extra: el mismo bucle de actualización con `c` variable por celda ya produce el efecto físico correcto.

## 4. Sistema de N cargas puntuales interactuando (N-cuerpos electrostático)

Este es un problema distinto al de la sección 2 (campo estático de cargas fijas): aquí las cargas mismas se mueven porque sienten la fuerza de las demás. Es estructuralmente idéntico a un problema de N-cuerpos gravitacional — mismo patrón de código, cambiando la ley de fuerza.

**Cálculo de fuerzas (el paso O(N²))**: para cada carga, suma la fuerza de Coulomb de todas las demás (ver `ecuaciones_maxwell.md`, sección "Sistemas de N cargas puntuales interactuando"). Con numpy, esto se vectoriza calculando todas las diferencias de posición a la vez en vez de un doble bucle `for`:
```python
# posiciones: array (N, 2 o 3); cargas: array (N,)
diffs = posiciones[:, None, :] - posiciones[None, :, :]      # (N, N, dim)
dist2 = np.sum(diffs**2, axis=-1) + SOFTENING**2             # softening: ver abajo
dist3 = dist2 ** 1.5
np.fill_diagonal(dist3, np.inf)                                # evita que una carga se "sienta" a sí misma
fuerza_por_par = K * cargas[:, None] * cargas[None, :] / dist3  # (N, N)
F = np.sum(fuerza_por_par[:, :, None] * diffs, axis=1)          # (N, dim), fuerza neta sobre cada carga
```

**Parámetro de suavizado (softening)**: cuando dos cargas se acercan mucho, `1/r²` diverge y la simulación se vuelve numéricamente inestable (velocidades absurdas, energía que explota) — esto es un artefacto de la discretización temporal, no física real (en la realidad, a esas distancias empiezan a dominar otros efectos que el modelo de carga puntual no captura). La solución estándar es sumar una constante pequeña `SOFTENING` al cuadrado de la distancia antes de elevar a la potencia, como en el código de arriba. Ajusta su tamaño según la escala del problema: lo bastante grande para evitar la divergencia, lo bastante pequeño para no distorsionar la física a distancias normales.

**Integración temporal: velocity Verlet** (mejor opción por defecto — conserva energía mucho mejor que Euler simple, mismo costo computacional):
```python
# medio paso de velocidad, paso completo de posición, recálculo de fuerza, medio paso final de velocidad
v_half = v + (F/m) * (dt/2)
pos_new = pos + v_half * dt
F_new = calcular_fuerzas(pos_new)          # recalcular con las nuevas posiciones
v_new = v_half + (F_new/m) * (dt/2)
```

**Complejidad y conexión con CS**: el cálculo de fuerzas de arriba es O(N²) — cada carga interactúa con todas las demás. Para N grande (miles o más), esto se vuelve el cuello de botella, y ahí es donde algoritmos como **Barnes-Hut** (agrupa cargas lejanas en un solo "centro de masa efectivo" usando un árbol espacial, quadtree/octree) reducen esto a O(N log N) — es un ejemplo clásico de trade-off espacio-tiempo con estructuras de datos jerárquicas. Solo vale la pena mencionarlo o implementarlo si el usuario tiene N grande o pregunta explícitamente por rendimiento/escalabilidad; para N pequeño (decenas a un par de cientos) el cálculo O(N²) vectorizado con numpy es más que suficiente y mucho más simple.

**Colisiones / cargas que se superponen**: si dos cargas de signo opuesto pueden acercarse indefinidamente (se atraen sin límite), considera si el usuario quiere que "colisionen" (fusionarse, detenerse, rebotar) o si el softening es suficiente para que simplemente pasen de largo una junto a la otra sin comportamiento extraño. Aclara esto si no es obvio por el contexto.

## 5. Trayectorias de partículas cargadas (fuerza de Lorentz)

Para integrar `F = q(E + v × B) = ma` en el tiempo, evita Euler simple (acumula error de energía rápidamente — una partícula en un campo magnético uniforme debería orbitar en un círculo perfecto para siempre, y Euler simple hace que la órbita se abra en espiral, lo cual es un artefacto numérico, no física real).

**Método recomendado: leapfrog / Euler-Cromer** (mucho más estable para sistemas oscilatorios, mismo costo computacional que Euler):
```python
v_new = v + (q/m) * (E + cross(v, B)) * dt
x_new = x + v_new * dt   # nota: usa v_new, no v — esa es la diferencia clave con Euler simple
```

Si necesitas más precisión (por ejemplo, para verificar conservación de energía con más rigor), el **método de Boris** es el estándar en simulaciones de física de plasmas — separa la rotación debida a B (que no cambia la energía cinética) de la aceleración debida a E, y es exactamente conservativo para el término magnético. Es más código, así que solo vale la pena si el usuario pide explícitamente precisión física alta o trayectorias muy largas en el tiempo.

## 6. Cómo elegir el paso de malla (`dx`) y de tiempo (`dt`)

- `dx` debe ser mucho menor que la escala espacial más pequeña que te importa resolver (por ejemplo, para una onda de longitud de onda `λ`, usa al menos 10-20 puntos por longitud de onda: `dx ≤ λ/10`).
- `dt` se deriva de `dx` vía la condición de Courant (sección 3), no se elige independientemente.
- Si la simulación es muy lenta, el primer lugar para optimizar es vectorizar con numpy (operaciones sobre el array completo) en vez de bucles `for` explícitos sobre cada celda — la diferencia de rendimiento es típicamente de 10-100x.

## Resumen rápido: qué método usar según el problema

| Problema físico | Ecuación | Método numérico |
|---|---|---|
| Campo/potencial de cargas estáticas | Coulomb / Gauss | Suma directa (superposición) — no necesita discretización temporal |
| Potencial entre electrodos con geometría | Laplace/Poisson | Relajación iterativa (Jacobi/Gauss-Seidel) |
| Propagación de ondas EM | Ecuación de onda | FDTD (diferencias finitas en espacio y tiempo) |
| N cargas puntuales interactuando entre sí | Coulomb + F=ma (N-cuerpos) | Velocity Verlet + softening (Barnes-Hut si N es grande) |
| Trayectoria de partícula cargada en campo externo | Fuerza de Lorentz | Leapfrog / Euler-Cromer (o Boris para alta precisión) |
| Circuito RLC | EDO de 2° orden | Euler o RK4 (son pocas variables, no hace falta nada más sofisticado) |
