# Fórmulas de electromagnetismo (nivel universitario básico)

Todas las fórmulas en unidades SI. `ε₀` = permitividad del vacío (8.854×10⁻¹² F/m), `μ₀` = permeabilidad del vacío (4π×10⁻⁷ T·m/A), `c` = velocidad de la luz (299 792 458 m/s, y se cumple `c = 1/√(ε₀μ₀)`).

## Electrostática

**Ley de Coulomb** (fuerza entre dos cargas puntuales):
```
F = (1 / 4πε₀) * (q₁q₂ / r²)   [dirección a lo largo de la línea que une las cargas]
```

**Campo eléctrico de una carga puntual**:
```
E(r) = (1 / 4πε₀) * (q / r²) r̂
```
Para varias cargas, el campo total es la suma vectorial (principio de superposición) — esto es literalmente un bucle `for` sumando vectores, la base de casi cualquier simulación electrostática.

**Ley de Gauss** (forma integral):
```
∮ E · dA = Q_enc / ε₀
```
Forma diferencial (la que se discretiza para resolver campos en una malla):
```
∇ · E = ρ / ε₀
```

**Potencial eléctrico**:
```
V(r) = (1 / 4πε₀) * Σ (qᵢ / rᵢ)      E = -∇V
```
Útil porque a veces es más barato computacionalmente resolver el potencial (escalar) y derivarlo, que sumar campos vectoriales directamente.

**Ecuación de Poisson / Laplace** (para el potencial en una región con o sin carga):
```
∇²V = -ρ/ε₀        (Poisson, con carga)
∇²V = 0            (Laplace, sin carga — región vacía entre electrodos, por ejemplo)
```
Esta es la ecuación que se resuelve con diferencias finitas + iteración (Jacobi/Gauss-Seidel) para problemas tipo "capacitor de placas paralelas" o "encuentra el potencial entre dos electrodos con geometría rara". Ver `metodos_numericos.md`.

**Capacitancia**: `C = Q/V`. Para placas paralelas: `C = ε₀A/d` (A = área, d = separación).

## Sistemas de N cargas puntuales interactuando

Cuando varias cargas no están fijas sino que se mueven por su propia interacción mutua, cada carga `i` siente la suma vectorial de las fuerzas de Coulomb de todas las demás:
```
F_i = Σ_{j≠i} (1 / 4πε₀) * (qᵢqⱼ / rᵢⱼ²) r̂ᵢⱼ
```
Esta fuerza neta se usa en `F = ma` para obtener la aceleración de cada carga, y se integra en el tiempo para obtener trayectorias (ver `metodos_numericos.md`, sección de N-cuerpos electrostático).

**Energía potencial del sistema** (la cantidad que debe conservarse, junto con la energía cinética, en un sistema aislado sin fricción):
```
U = (1 / 4πε₀) * Σ_{i<j} (qᵢqⱼ / rᵢⱼ)
```
La energía total `E = K + U` (cinética + potencial) es invariante en el tiempo si no hay fuerzas externas ni disipación — es el chequeo de validación más directo para este tipo de simulación.

## Magnetostática

**Ley de Biot-Savart** (campo magnético generado por un elemento de corriente):
```
dB = (μ₀ / 4π) * (I dl × r̂ / r²)
```

**Ley de Ampère** (forma integral):
```
∮ B · dl = μ₀ I_enc
```
Forma diferencial:
```
∇ × B = μ₀ J   (en magnetostática, sin campo eléctrico variable)
```

**Fuerza de Lorentz** (fuerza sobre una carga en movimiento — la ecuación clave para simular trayectorias de partículas cargadas):
```
F = q(E + v × B)
```
Esta es una ecuación diferencial ordinaria de segundo orden (`F = ma`); se integra en el tiempo con Euler, Euler-Cromer, o (mejor, más estable) el método de Boris o leapfrog. Ver `metodos_numericos.md`.

**Campo de un solenoide ideal (largo)**: `B = μ₀ n I` (n = vueltas por unidad de longitud), dentro del solenoide; ≈0 fuera.

## Inducción electromagnética

**Ley de Faraday**:
```
ε = -dΦ_B/dt         Φ_B = ∫ B · dA
```
Forma diferencial:
```
∇ × E = -∂B/∂t
```

**Ley de Lenz**: el signo negativo de arriba — la fem inducida se opone al cambio de flujo que la genera.

**Inductancia**: `ε = -L (dI/dt)`.

## Circuitos RLC (aplicación directa de lo anterior)

- **RC**: `V(t) = V₀(1 - e^(-t/RC))` (carga) o `V₀ e^(-t/RC)` (descarga). Constante de tiempo `τ = RC`.
- **RL**: análogo con `τ = L/R`.
- **RLC serie**: ecuación diferencial `L(d²Q/dt²) + R(dQ/dt) + Q/C = V(t)`. Frecuencia de resonancia `ω₀ = 1/√(LC)`. Este es un oscilador armónico amortiguado — mismo tipo de ecuación que un sistema masa-resorte-amortiguador, útil como analogía si el usuario ya conoce mecánica.

## Las ecuaciones de Maxwell (el conjunto completo)

Forma diferencial, en el vacío o en un medio lineal (`ε`, `μ` del medio):

```
1. ∇ · E = ρ/ε          (Gauss, eléctrica)
2. ∇ · B = 0            (Gauss, magnética — no hay monopolos)
3. ∇ × E = -∂B/∂t       (Faraday)
4. ∇ × B = μ(J + ε ∂E/∂t)   (Ampère-Maxwell, con la corrección de Maxwell: la corriente de desplazamiento)
```

El término `ε ∂E/∂t` en la ecuación 4 (corriente de desplazamiento) es la pieza que Maxwell añadió y la que permite que las ecuaciones 3 y 4 se acoplen para producir **ondas autosostenidas** — un campo E variable crea un campo B, que a su vez crea un campo E, indefinidamente, sin necesidad de cargas ni corrientes. Esta es la razón física de por qué existe la luz.

## Ondas electromagnéticas

Combinando las ecuaciones de Maxwell en una región sin cargas ni corrientes (`ρ=0`, `J=0`), se obtiene la ecuación de onda para cada componente del campo:

```
∇²E = με (∂²E/∂t²)      (y lo mismo para B)
```

que en 1D (propagación en x) es:
```
∂²E/∂x² = (1/v²) ∂²E/∂t²    donde v = 1/√(με)   (v = c en el vacío)
```

Esta es la ecuación que se discretiza con FDTD (`scripts/fdtd_1d_template.py`) — ver `metodos_numericos.md` para la receta exacta.

**Vector de Poynting** (flujo de energía de la onda, dirección y magnitud):
```
S = (1/μ) E × B
```
La intensidad promedio (potencia por unidad de área) es `<S> = (1/2) c ε E₀²` para una onda plana en el vacío con amplitud `E₀`.

**Polarización**: la orientación del vector E respecto a la dirección de propagación. Lineal, circular o elíptica según la relación de fase entre las componentes del campo — relevante si simulas antenas, luz polarizada, o comunicaciones.

## Índice de refracción y medios materiales

En un medio con permitividad `ε = ε_r ε₀` y permeabilidad `μ = μ_r μ₀`:
```
v = c / √(ε_r μ_r) = c/n     donde n = √(ε_r μ_r)  (índice de refracción, para materiales no magnéticos μ_r≈1)
```
Relevante para simulaciones de reflexión/refracción en una interfaz (ley de Snell: `n₁ sinθ₁ = n₂ sinθ₂`), y para el coeficiente de reflexión en una interfaz FDTD (impedancia de cada medio: `Z = √(μ/ε)`).
