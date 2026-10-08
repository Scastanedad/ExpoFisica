# Panel simplificado de Ley de Gauss: diseño físico (Fase 0)

Autor: `fisico-revisor`. Rama `feat/gauss-panel-simple`. Solo diseño: no toca código de producto. Convención del motor: ε₀ = 1, Φ en µC/ε₀, 1 u = 1 cm, q en µC (`flujo.ts`, `constantes.ts`).

Los valores de Φ y q_enc se midieron con `generarMalla` (calidad alta) + `calcularFlujo`, con un test desechable ya borrado. Los números de abajo son los que debe reproducir `presets.test.ts` y el e2e.

## 1. Posiciones iniciales (8 combinaciones)

Reglas que se comprobaron:
- `DIST_MIN_SUP = 0.4`: franja |d| < 0.4 u de la superficie cerrada, donde `ajustarCargaFueraDeSuperficie` mueve la carga. El Plano no tiene franja.
- `DIST_MIN_CARGAS = 0.8`: separación mínima entre cargas (`ajustarDistanciaCargas`, la aplica `sincronizar` en `controladorGauss3d.ts`).
- Límites de `RANGOS.carga`: x, y ∈ [−12, 12], z ∈ [−10, 10], q ∈ [0.5, 5].
- Tamaños: `rangoTamano(forma).def` = Esfera R 5, Cubo L 8, Cilindro R 4 (la altura sale de `superficieDeUI`: h = 2R = 8), Plano L 4.

El primer elemento del dipolo es la carga +q (la que queda seleccionada), el segundo la −q. Todas las z son 0 salvo el Plano.

| Figura | Fuente | Tamaño | Cargas (q; x, y, z) | d con signo a la superficie | Distancia entre cargas | Φ (µC/ε₀) | q_enc (µC) |
|---|---|---|---|---|---|---|---|
| Esfera | Una carga | R = 5 | +3; 0, 0, 0 | −5.0 | n/a | **3.00000** | 3 |
| Esfera | Dipolo | R = 5 | +3; −2, 0, 0 y −3; +2, 0, 0 | −3.0 y −3.0 | 4.0 | **0.00000** | 0 |
| Cubo | Una carga | L = 8 | +3; 0, 0, 0 | −4.0 | n/a | **3.00000** | 3 |
| Cubo | Dipolo | L = 8 | +3; −2, 0, 0 y −3; +2, 0, 0 | −2.0 y −2.0 | 4.0 | **0.00000** | 0 |
| Cilindro | Una carga | R = 4, h = 8 | +3; 0, 0, 0 | −4.0 | n/a | **3.00000** | 3 |
| Cilindro | Dipolo | R = 4, h = 8 | +3; −2, 0, 0 y −3; +2, 0, 0 | −2.0 y −2.0 | 4.0 | **0.00000** | 0 |
| Plano (θ = 0) | Una carga | L = 4 (def) | +3; 0, 0, −4 | −4.0 (al plano) | n/a | **0.19228** (≈ 0.064·q) | 0 |
| Plano (θ = 0) | Dipolo | L = 4 (def) | +3; −2, 0, −4 y −3; +2, 0, −4 | −4.0 y −4.0 | 4.0 | **≈ 0** (±0.1536 por carga) | 0 |

Verificación: ninguna carga cae en la franja de exclusión (la menor distancia a una superficie cerrada es 2.0 u, contra 0.4 u) y ninguna cae a menos de 0.8 u de la otra (4.0 u). `ajustarCargaFueraDeSuperficie` las devuelve sin mover. Todas están dentro de los límites de `RANGOS.carga`. Estado inicial de la página: **Esfera + Una carga** (idéntica al antiguo escenario 2: Φ = 3, q_enc = 3).

Plano, lado de la carga: el plano tiene normal +z (θ = 0, φ = 0). Con la carga **debajo** (z < 0) el campo cruza el plano a favor de su normal y Φ sale positivo. Es el sentido más fácil de leer («a favor de la normal»). Con la carga encima, Φ cambia de signo (−0.19228 con +3 µC en z = +4), así que no hace falta elegir el lado de arriba.

Φ del Plano es la salida de `calcularFlujo`: no se afirma q/ε₀ (q_enc = 0 por definición, `cargasEncerradas` devuelve vacío para el parche).

### 1.1 Hallazgos que cambian algo del plan (Plano)

1. **Plano con L = 4 se queda corto.** Φ = 0.19 (6 % de q) apenas se distingue de «cero» a simple vista, y en el dipolo las cargas (x = ±2) quedan justo sobre el borde de la proyección del plano (el plano cubre |x| ≤ 2). **Propuesta: tamaño inicial del Plano L = 8** (deslizador 2 a 12). Con L = 8 y la carga en z = −4: Φ = **0.50000** (el plano es exactamente una cara del cubo L = 8 con la carga en el centro, y Φ = q/6; es solo una validación del cálculo, no una frase para el visitante porque deja de valer al mover la carga). Dipolo con L = 8: ±0.4540 por carga, total ≈ 0, y las dos cargas quedan dentro de la proyección del plano. Esto contradice la frase del plan «el tamaño vuelve al `def` de la nueva figura». Se resuelve de dos maneras:
   - Opción A (recomendada): `posicionInicial` devuelve también `tamano` y `setForma`/`setFuente`/`recolocar` lo usan. Para las cerradas coincide con el `def`; para el Plano es 8.
   - Opción B: subir `RANGOS.parche.lado.def` de 4 a 8. Solo lo leen `crearSuperficie` y `rangoTamano`, pero es tocar la física fuera del alcance del plan.
   Si se mantiene L = 4, los números válidos son los de la tabla.
2. **Plano + Dipolo (±x a la misma z) da Φ_total = 0 por simetría**, no por Gauss: el espejo x → −x intercambia las cargas y cambia el signo del flujo. Es un riesgo didáctico, porque el visitante puede leer «Φ = 0 como en la esfera con dipolo». El texto del Plano no debe presentarlo como «cargas que suman 0»: debe decir que lo que se compensa son dos flujos locales opuestos (±0.15 o ±0.45) y que el plano no encierra nada. La frase existente de `pasaParche` para |Φ| < 0.005 ya cubre esto («lo cruza en un sentido y en el otro por igual. El parche no encierra carga»). Sugerencia de acción: «Sube la carga −q por encima del plano: ahora los dos flujos se suman» (con +3 en z = −4 y −3 en z = +4, Φ = 0.385 con L = 4). Evita que el 0 parezca una regla.
3. Lectura de la tabla: el dipolo en las tres cerradas tiene Φ = 0 con campo ≠ 0 (la lección del antiguo escenario 7). Tras sacar una carga: ver la tabla de lecciones en 3.

### 1.2 Lecciones alcanzables desde el estado inicial (comprobadas con `calcularFlujo`)

| Lección (antiguo escenario) | Acción en la UI nueva | Φ / q_enc |
|---|---|---|
| 3 Dentro/fuera | Esfera + Una carga: arrastra a x = 8 (d = +3) | Φ = 0, q_enc = 0 |
| 4 Tamaño | Esfera + Una carga: cambia R de 2 a 8 | Φ = 3 siempre |
| 5 Formas | Cambia Esfera ↔ Cubo ↔ Cilindro con Una carga | Φ = 3 en las tres |
| 6 Cruza | Altura z de 0 a 8 con la carga de la Esfera (cruza en z = 5) | 3 → 0 (salto en la franja) |
| 7 Dipolo | Cualquier cerrada + Dipolo | Φ = 0, campo ≠ 0 |
| 7 + 3 Dipolo con una fuera | Esfera + Dipolo: −q a x = 8 | Φ = **+3** (q_enc = +3) |
| Dipolo con +q fuera | Esfera + Dipolo: +q a x = −8 | Φ = **−3** (q_enc = −3) |
| Cubo, −q fuera | Cubo + Dipolo: −q a x = 6 (d = +2) | Φ = +3 |
| Cilindro, −q fuera | Cilindro + Dipolo: −q a x = 6 (ρ = 6, d = +2) | Φ = +3 |
| 8 Abierta | Plano (cualquier fuente) | Φ de `calcularFlujo`, q_enc = 0 |
| 1 Parche y ángulo | Plano + θ | Φ cambia con θ, sin q/ε₀ |
| 9 Gauss herramienta | Esfera + Una carga, centrada | Φ = q, E = Φ/(4πR²) |

Notas de borde: en el Cubo una carga a x = 4.2 cae en la franja (|d| < 0.4) y el controlador la empuja a ±4.4 o 3.6; en el Cilindro la franja es ρ ∈ (3.6, 4.4). En la Esfera con R mínimo = 2, las cargas del dipolo (radio 2) quedan sobre la superficie y el controlador las desplaza a R − 0.4 = 1.6: es una consecuencia de bajar el tamaño, no un error del preset (el tamaño inicial es el `def`).

## 2. Reglas de los textos educativos por estado

`textoGauss(e)` sustituye a `textoEscenario(e)`. Entrada: `forma`, `fuente` (`"carga" | "dipolo"`), `tamano`, `thetaDeg`, `cargas[]` con `{q, dentro, centrada}`, `phi`. Se propone añadir un campo opcional `cerca?: boolean` por carga (|d con signo a la superficie| < 1.5 u, solo cerradas) para anunciar el cruce.

### 2.1 Clasificación

1. `cerrada = forma !== "parche"`. Si no es cerrada → rama **abierta** (2.4).
2. Si es cerrada, `nDentro` = nº de cargas con `dentro`, `qEnc` = Σ q de las de dentro. `caso`:
   - `fuera`: `nDentro === 0` (Φ = 0).
   - `neta0`: `nDentro > 0` y |qEnc| < 1e-9 (solo posible en Dipolo con las dos dentro).
   - `neta`: el resto. Con Una carga es «dentro». Con Dipolo es «una dentro, una fuera» (Φ = ±q).
3. `centrada`: se evalúa solo para Esfera + Una carga + `dentro` + centrada (función `esfera1Centrada` actual). Es el caso «Gauss como herramienta».
4. Estado inicial = (cerrada, Una carga, `neta`, centrada) → Esfera centrada, ver 2.3.

Estas reglas son una reordenación de `resumir`/`caso`/`pasaCerrada`/`porqueCerrada` de `textosGauss3D.ts`: no se inventa lógica nueva salvo la elección de `mirar` y los casos de la tabla de 2.2.

### 2.2 Título derivado

`"{Figura} con {una carga | un dipolo}"`, con Figura ∈ {Esfera, Cubo, Cilindro, Plano}: «Esfera con una carga», «Cubo con un dipolo», «Plano con una carga», etc. No lleva número de escenario ni «dentro/fuera» (eso lo dicen `pasa` y `porque`).

### 2.3 Cerradas (Esfera, Cubo, Cilindro)

`pasa` y `porque` salen **sin cambios** de `pasaCerrada` y `porqueCerrada` (todas las frases ya verificadas). Sólo cambia `mirar` y los dos refuerzos de abajo.

| Estado | `pasa` (se reutiliza) | `porque` (se reutiliza) | `mirar` / sugerencia de acción |
|---|---|---|---|
| Una carga, `neta` (dentro) | `pasaCerrada` caso `neta`: «Dentro de la esfera hay +3 µC. Φ = 3 µC/ε₀. En neto, el campo sale…» | Frase del caso 3: «Da igual en qué punto de dentro esté la carga: lo que cuenta es que esté dentro» (reemplaza a `porqueCerrada.neta` cuando hay una sola carga). Cuando se cambió de forma: usar la frase del caso 5: «Φ depende de la carga encerrada, no de la forma…» | «Arrastra la carga fuera de la superficie y vuelve a meterla.» Alternativas rotativas, siempre veraces: «Cambia el tamaño: Φ no cambia mientras la carga siga dentro.» y «Prueba Esfera, Cubo y Cilindro con la misma carga: Φ es igual.» |
| Una carga, `fuera` | `pasaCerrada` caso `fuera`: «La carga está fuera… Φ = 0. El campo la atraviesa, pero lo que entra por un lado sale por el otro.» | `porqueCerrada.fuera`: «Cada línea que entra vuelve a salir…» | «Mete la carga en la superficie: Φ pasará de 0 a q/ε₀.» (veraz: es una consecuencia de la ley). |
| Una carga, `cerca` | como el caso de arriba, según dentro/fuera | Frases del caso 6: dentro («Si la carga sale, Φ cambia de golpe a 0…»), fuera («En cuanto la carga cruza la superficie y queda dentro, Φ cambia de golpe: pasa de 0 a q/ε₀») | «Sube y baja la carga con la altura z y haz que cruce la superficie.» |
| Dipolo, `neta0` (las dos dentro) | `pasaCerrada` caso `neta0` + frase del caso 7: «Dentro hay +3 µC y −3 µC: suman 0 y Φ = 0. Aun así, hay zonas donde el campo sale y zonas donde entra.» | Caso 7: «Flujo no es campo: Φ = 0 no significa campo cero. El flujo que sale en una zona compensa el que entra en otra.» | «Mira las líneas que van de la carga + a la − y las zonas rojas y azules. Saca una de las cargas de la superficie y mira cómo cambia Φ.» |
| Dipolo, `neta` (una dentro, una fuera) | `pasaCerrada` caso `neta` con `nFuera > 0`: «Dentro hay +3 µC. Φ = 3 µC/ε₀… La carga de fuera no cambia el Φ total (sí el flujo local, zona a zona).» (con −q dentro: «Dentro hay −3 µC. Φ = −3 µC/ε₀. En neto, el campo entra…») | `porqueCerrada.neta` (Gauss: Φ = q_enc/ε₀, solo cuenta la encerrada) | «Devuelve la carga a la superficie: Φ vuelve a 0.» |
| Dipolo, `fuera` (las dos fuera) | `pasaCerrada` caso `fuera` («Las cargas están fuera…») | `porqueCerrada.fuera` | «Mueve una de las cargas hacia dentro: Φ será ±q/ε₀.» |
| Esfera + Una carga + `centrada` (Gauss como herramienta) | `pasa` del caso 9: «Φ = 3 µC/ε₀. Entonces E = Φ/(4πR²) ≈ … a … del centro.» | `porque` del caso 9: «Por simetría, E es igual y perpendicular en toda la esfera…» + la frase del caso 4: «Si agrandas la esfera, el campo en su superficie baja (como 1/R²) pero el área sube (como R²). Su producto, Φ, no cambia.» | Caso 9: «Con la carga en el centro, el campo es igual en toda la esfera. ¿Cuánto vale?» + «Agranda la esfera.» |
| Esfera + Una carga + dentro, **no** centrada | `pasa` del caso 9 sin simetría: «Φ/(4πR²) … es solo el valor medio de E perpendicular a la superficie…, no E en cada punto» | «Gauss da E fácilmente solo cuando hay simetría. Deja una sola carga en el centro para verlo.» | «Pon la carga en el centro» |

Frases del caso 9 en cerradas distintas de la esfera: no hay «E = Φ/(4πR²)» (el cubo y el cilindro no tienen E constante ni normal en toda la superficie). Para Cubo o Cilindro con la carga centrada **no** se muestra la fórmula de E: el texto es el de «Una carga, `neta`». Esto ya lo garantiza `e.forma !== "esfera"` en el caso 9 actual.

Restricción general (del contrato): ninguna frase de las cerradas afirma «Φ = q/ε₀» sin que haya al menos una carga dentro; nunca se menciona «escenario» ni se hace referencia a un botón que desaparece («el botón»).

### 2.4 Plano (abierta)

- Título: «Plano con una carga» / «Plano con un dipolo».
- `pasa`: `pasaParche(e)` sin cambios (Φ real de `calcularFlujo`; casos |Φ| < 0.005, a favor/en contra de la normal; siempre termina con «El parche no encierra carga: aquí Φ no es q/ε₀.»). Cambiar el sustantivo visible «parche» por «plano» en `FORMA` y en el aviso; mantener `PORQUE_PARCHE` salvo esa palabra.
- `porque`: `PORQUE_PARCHE` («Φ solo cuenta la parte del campo que atraviesa… depende de cómo está inclinado y de dónde está la carga») + la frase del antiguo escenario 8: «La ley de Gauss solo vale para superficies cerradas. Un plano no encierra nada y solo mide el campo que lo atraviesa.»
- `mirar` / sugerencia (sin referencia al escenario 2): «Mira el plano y las líneas que lo cruzan. Inclínalo con θ.» (θ está ahora en el bloque Figura, no en «Avanzado»), y «Cambia a Esfera, Cubo o Cilindro: ahí la superficie sí rodea la carga.»
- Prohibido en esta rama: «Φ = q/ε₀», «la carga encerrada», «Gauss da…» y cualquier valor q_enc distinto de 0 (el lector de `RotuloGauss3D` debe seguir mostrando q_enc = 0 sin etiqueta «= Φ»). Si hay Dipolo y Φ ≈ 0, aplica el hallazgo 2 de 1.1: dos flujos locales opuestos, no una regla.
- Nota sobre θ: con θ > 0 el plano pasa por el origen y gira respecto del eje y; la carga en z < 0 sigue sin tocar el plano en el estado inicial. Para otras posiciones (x, y) y θ el plano puede cortar la línea que une las cargas, es un caso válido: la rama abierta no necesita zona de exclusión.

### 2.5 Reutilización de `textosGauss3D.ts`

Se conservan sin cambios de contenido: `pasaCerrada`, `porqueCerrada`, `pasaParche`, `PORQUE_PARCHE`, `campoEnEsfera`, `esfera1Centrada`, `resumir`, `caso`, `sentidoNeto`, `num`, `fmtQ`, `coma`, y las frases de los antiguos casos 3 (porque dentro), 4 (agrandar), 5 (porque forma), 6 (cruce), 7 (dipolo Φ = 0), 8 (porque abierta) y 9 (Gauss herramienta). `textoConteo` no se toca. Se eliminan: `TITULOS` por número, el parámetro `escenario`, el `switch (e.escenario)` y la referencia «escenario 2» del `mirar` del 8.

Coherencia con el contrato: «Φ no depende de la forma, ni del tamaño, ni de dónde esté la carga dentro» y «una carga fuera aporta flujo local pero neto cero» se mantienen literalmente.

### 2.6 Pruebas de regla sugeridas (para `textosGauss3D.test.ts`)

Un caso por celda de la tabla 2.3 más Plano ×2, comprobando: título derivado exacto; las frases ya verificadas aparecen según el estado; en Plano ninguna cadena contiene «q/ε₀» salvo la negación «no es q/ε₀»; y en Dipolo con las dos dentro, `pasa` contiene «suman 0» y `porque` contiene «no significa campo cero». Valores de Φ para el e2e: los de la tabla 1 y de 1.2.
