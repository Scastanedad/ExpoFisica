# Contrato Capacitor de placas (estación 8, `/capacitor-de-placas`) — Fase 0

Este documento fija modelo, fórmulas, rangos, API y tests. Las fases 1–6 lo implementan sin cambiar firmas
(si algo cambia, se edita aquí primero). Código nuevo en `src/fisica/capacitorPlacas/` (puro, sin DOM ni React),
`src/render/capacitorPlacas/`, `src/store/capacitorPlacasStore.ts`, `src/ui/capacitorPlacas/`, `src/pages/CapacitorPlacas.tsx`.
Distinta de E7 (`/capacitores`, redes RC): aquí es UN capacitor y su física interna.

## 1. Modelo y unidades

- Placas conductoras cuadradas de área `A` (lado `L = √A`) separadas `d`; campo uniforme; **sin efectos de borde**
  (se dice en la leyenda). Todo en SI reales: `ε₀ = 8,854×10⁻¹² F/m` (constante `EPSILON_0`).
- El dieléctrico es una lámina de espesor `d` (llena el hueco en espesor) que entra deslizando a lo largo de `L`.
  `f ∈ [0, 1]` = fracción insertada (`x = f·L`). `f = 1`: hueco lleno. `f = 0`: no entra (solo aire).
- El medio de fondo es **aire** (κ = 1,00059). El vacío (κ = 1) no es una opción del selector: solo existe como
  caso límite en tests.
- Unidades y prefijos: `formatearSI` de `src/fisica/circuitos/formato.ts` (p…M, 3 cifras, coma decimal; **se importa, no se
  duplica**). pF (C), nC/µC (Q), V/kV, V/m→**MV/m** (E: se pasa por `formatearSI(E, "V/m")` → «3 MV/m»), µJ/mJ (U),
  J/m³/kJ/m³ (u). Área en cm², distancia en mm (conversión explícita en UI, física en m y m²).
- No se alinean constantes con `fisica/materiales.ts` (E4 modela partículas en px con escala propia, κ_eff ≈ 1,12–1,25).
  Solo se reutiliza la **idea visual**: fracción de polarización dibujada `p = 1 − 1/κ` (= `σ_b/σ`).

## 2. Fórmulas (todas con `κ` del material y `φ(f) = 1 + (κ − 1)·f`)

| Magnitud | Fórmula |
|---|---|
| C₀ (sin dieléctrico, vacío) | `ε₀A/d` |
| C | `C = κ_aire·C₀·φ(f)` con `φ(f) = 1 + (κ/κ_aire − 1)·f` (κ_aire = 1,00059; sin dieléctrico `C = κ_aire·C₀`, el aire cuenta) |
| Q | `Q = C·V` |
| E (uniforme en toda la lámina) | `E = V/d`; con hueco lleno: `E = σ_libre/(κε₀)` |
| U | `½CV² = Q²/2C = ½QV` |
| u en cada zona | `u = ½κ_zona·ε₀·E²` (zona dieléctrico: κ; zona aire: ≈ 1) |
| comprobación | `u_d·V_d + u_a·V_a = U`, con `V_d = f·A·d`, `V_a = (1−f)·A·d` |
| carga ligada | `σ_b = σ_libre·(1 − 1/κ)` en la zona con dieléctrico |
| carga libre por zona | `σ_a = ε₀E`, `σ_d = κε₀E` |

- **E es igual en las dos zonas** (placas equipotenciales, mismo `d`) tanto con batería como aislado; lo que cambia por
  zona es `σ_libre`, `D`, `σ_b` y `u`. (Aclaración sobre el prompt original: «E distinto por zona» sería falso.)
- Inserción parcial: dos capacitores en paralelo `C = ε₀·w/d·[κx + (L−x)] = ε₀A/d·φ(f)`.
- Fuerza que mete la lámina (**opcional, se muestra como línea pequeña en el panel de inserción**):
  `F = ½V²·dC/dx = ½V²ε₀w(κ−1)/d`, válida en ambos modos (en aislado `V` cambia con `f`; en conectado es constante).
- Constante de tiempo: no hay dinámica temporal (estado de equilibrio); el cambio es instantáneo, con transición visual breve.

## 3. Modos

| | **Conectado a la batería** (V fija) | **Aislado** (Q fija) |
|---|---|---|
| se edita | `V`, `A`, `d`, material, `f` | `Q`, `A`, `d`, material, `f` |
| se deriva | `Q = CV` | `V = Q/C` |
| meter dieléctrico | `C ×κ`, `Q ×κ`, `U ×κ`, `E` igual | `C ×κ`, `V ÷κ`, `E ÷κ`, `U ÷κ`, `Q` igual |
| separar placas (↑d) | `C ↓`, `Q ↓` (la batería recibe carga), `U ↓`, `E ↓` | `C ↓`, `V ↑`, `U ↑`, `E` igual (`E = Q/κε₀A`) |

- **Cambiar de modo es continuo**: no salta `Q`, `V`, `E` ni `U` (se conservan; solo cambia qué se puede editar).
  Es el problema clásico: cargar, desconectar y meter el dieléctrico.
- **Trabajo al separar** (rótulo en el panel; `ΔU` y `W` formateados con `formatearSI`):
  - Aislado: `Q` fija ⇒ `U = Q²/2C ∝ d`. Subes `U`: alguien hace trabajo `W = ΔU > 0`.
  - Conectado: `U = ½CV²` baja (`ΔU < 0`), la batería recibe `V·|ΔQ| = 2|ΔU|`; tú sigues haciendo
    `W = −½V²ΔC = |ΔU| > 0`; el resto de la energía que recibe la batería sale del campo.

## 4. Controles y rangos

| Variable | Rango | Escala | Nota |
|---|---|---|---|
| `A` | 25 – 400 cm² (def. 100) | lineal, paso 5 | `C` no se edita directo: es derivada de `A` y `d` |
| `d` | 0,1 – 10 mm (def. 1) | **logarítmica** (100×) | se limita por rigidez (§6) |
| `V` (conectado) | 0 – 5 kV (def. 100 V) | log desde 1 V | `V_TOPE = 5 kV` también limita en aislado |
| `Q` (aislado) | 0 – `Q_máx` (§6) | log desde 1 nC | `Q_máx` depende de `A`, κ, `f` |
| `f` | 0 – 100 % (def. 0) | lineal, paso 1 % | texto «el dieléctrico entra a x de L» |

- Con `d = 0,1 mm` el aire solo aguanta 300 V: el rango de `V` se **recorta** según material y `d`, no es fijo.
- Valores por defecto: conectado, aire, `A = 100 cm²`, `d = 1 mm`, `V = 100 V` ⇒ `C = 88,6 pF`, `Q = 8,86 nC`,
  `E = 100 kV/m` (3,3 % de la rigidez), `U = 443 nJ`.
- Máximos de formato (verificado): `U` hasta ≈ 0,3 J, `u` hasta ≈ 70 kJ/m³, `E` hasta 60 MV/m: entran en `formatearSI`.

## 5. Catálogo de dieléctricos

Solo materiales reales de uso cotidiano; **el agua queda fuera** (decisión del usuario). Valores de la tabla de constantes y
rigideces dieléctricas aproximadas a temperatura ambiente (Serway, *Física para ciencias e ingeniería*, tabla del capítulo de
capacitancia). **Pendiente de verificar cada valor contra el libro** (fisico-revisor / usuario antes de la fase 1; las fuentes
web consultadas discrepan por espesor y geometría, así que se fija UNA tabla y se rotula «valores de tabla, ideales»).

| id | Material | Uso real (1 línea en la UI) | κ | E_máx (MV/m) |
|---|---|---|---|---|
| `aire` | Aire (defecto, «sin dieléctrico») | capacitor variable de radio | 1,00059 | 3 |
| `papel` | Papel | capacitores de papel antiguos | 3,7 | 16 |
| `poliestireno` | Poliestireno | capacitores de película de audio | 2,56 | 24 |
| `teflon` | Teflón | RF y alta temperatura | 2,1 | 60 |
| `mylar` | Mylar (PET) | capacitores de película comunes | 3,2 | 7 |
| `pyrex` | Vidrio Pyrex | botella de Leyden, laboratorio | 5,6 | 14 |
| `porcelana` | Porcelana | aisladores de alta tensión | 6 | 12 |
| `neopreno` | Neopreno | aislamiento flexible de cables | 6,7 | 12 |
| `pvc` | PVC | aislamiento de cables eléctricos | 3,4 | 40 |
| `silicona` | Aceite de silicona | transformadores y capacitores de potencia | 2,5 | 15 |
| `titanato` | Titanato de estroncio | capacitores cerámicos de κ muy alta | 233 | 8 |

- Todos tienen κ y `E_máx` finitos: no hay caso «sin ruptura» en el catálogo.
- Orden del selector: por κ creciente, con «Aire» primero. Cada opción muestra «κ = … · E_máx = … MV/m».
- Tipo `Dielectrico { id, nombre, uso, kappa, eMax /* V/m */, fuente }`.

## 6. Rigidez dieléctrica y límites (solo **bloqueo**: no hay «forzar ruptura»)

- **Rigidez efectiva** `E_lim(f)`: `f = 0` → `E_máx(aire)`; `0 < f < 1` → `min(E_máx(aire), E_máx(mat))`
  (la zona de aire sigue ahí y rompe primero); `f = 1` → `E_máx(mat)`.
- Medidor `E/E_máx` en el panel; **aviso a ≥ 80 %** («Estás al 85 % de la rigidez del aire»); en 100 % el control se bloquea.
- **Conectado**: `d_mín = V/E_lim`, `V_máx = min(V_TOPE, E_lim·d)`.
- **Aislado**: `E = Q/(ε₀A·φ(f))` **no depende de `d`**; el límite es `Q_máx = E_lim·ε₀A·φ(f)` (y `V ≤ V_TOPE`).
  Texto: «Aislado: al acercar o alejar las placas el campo no cambia; lo que lo limita es la carga».
- **Regla determinista al violarse** (cualquier control, material o `f`):
  1. Conectado: se sube `d` hasta `V/E_lim`; si pasa de 10 mm, `d = 10 mm` y se baja `V` a `V_máx`.
  2. Aislado: el cambio **se bloquea** (se queda en el valor límite) y se avisa; **no se baja `Q`** (la lección es que `Q` no cambia).
     Sacar el dieléctrico o cambiar de material que dejaría `E > E_lim` queda bloqueado en `f_mín` o con el material anterior.
- Arrastrar una placa cambia `d` y respeta el mismo límite (se detiene en `d_mín`).
- El límite también actúa al cambiar de modo (conectado → aislado conserva `V` y `Q`: no puede violarlo).

## 7. Referencia vs actual

- `Referencia = { modo, A, d, V|Q, material: aire, f: 0, estado }` calculada con el mismo modelo.
- **Auto**: mientras el estado actual no tenga dieléctrico (`material = aire` o `f = 0`), la referencia sigue al estado actual.
  Al meter un dieléctrico se congela. Botón **«Fijar referencia»** guarda los valores actuales y detiene el seguimiento;
  «Volver al aire» reanuda el modo auto.
- Para cada `C, Q, V, E, U, u, E/E_máx` el panel muestra: referencia, actual y cambio. Cambio = `actual/ref`:
  `> 1 + 1e-3` → «↑ ×r», `< 1 − 1e-3` → «↓ ÷(1/r)», si no «= igual». Si `r ≈ κ` o `1/κ` (0,5 %): «(= κ)» / «(= 1/κ)».
  Color neutro, flecha y texto (no solo color).

## 8. Tipos y API (`src/fisica/capacitorPlacas/`)

```ts
type Modo = "conectado" | "aislado";
interface Parametros { modo: Modo; A: number /*m²*/; d: number /*m*/; materialId: string; f: number; V: number; Q: number }
interface Estado { C: number; Q: number; V: number; E: number; U: number; uAire: number; uDiel: number;
                   sigmaLibre: number; sigmaLigada: number; eLim: number; ratioRigidez: number; F: number }
```

- `modelo.ts`: `calcularEstado(p: Parametros): Estado` (conectado usa `V`, aislado usa `Q`; devuelve ambos).
- `dielectricos.ts`: `CATALOGO`, `dielectricoPorId(id)`, `AIRE`.
- `limites.ts`: `eLim(materialId, f)`, `dMinima(V, eLim)`, `qMaxima(A, materialId, f)`, `ajustar(p, cambio): { p, bloqueado?: Motivo }`.
- `referencia.ts`: `referenciaDe(p)`, `comparar(ref, act): Cambio` con `{ razon, tipo: "sube"|"baja"|"igual", etiqueta }`.
- `trabajo.ts`: `trabajoSeparar(p, dNuevo)` → `{ dU, wExterno, wBateria? }`.
- `index.ts` reexporta. Todo puro: sin `Date`, sin azar, sin DOM.

## 9. Vista, panel y textos (resumen; detalle en fases 2–3)

- Vista lateral 2D (corte), no perspectiva; escala visual: `d` y número de ⊕/⊖ y líneas con mapeo logarítmico/saturante;
  rótulo «dibujo no a escala».
- Textos clave (dependen del estado): «La batería mantiene V: al meter {mat} entra más carga ×κ y el campo no cambia»;
  «Aislado: la carga no cambia, el campo baja ×1/κ»; «Estás al 85 % de la rigidez del aire»;
  leyenda: qué es un capacitor, qué hace el dieléctrico (se polariza y debilita el campo dentro), qué es κ y qué es la rigidez.
- Escenarios (5): «Meter vidrio con la batería conectada», «Cargar, desconectar y meter vidrio», «Separar placas aislado»,
  «Cerca de la ruptura del aire» (V = 2800 V, d = 1 mm → 93 %), **«Titanato: κ = 233»** (sustituye al escenario del agua).
- Fuera de alcance (por decisión del usuario): «¿Qué crees que pasará?», aplicaciones reales, forzar la ruptura.
- Pendiente de confirmar: mini gráfica `C`/`U` vs `f` o vs `d`, y mostrar `F`.

## 10. Tests obligatorios (Vitest, junto a cada módulo; invariantes, no snapshots)

1. `C ∝ A/d`: duplicar `A` duplica `C`; duplicar `d` lo divide a la mitad.
2. `×κ` y `÷κ`: conectado (`C`, `Q`, `U` ×κ; `E`, `V` iguales) y aislado (`C` ×κ; `V`, `E`, `U` ÷κ; `Q` igual), para cada material.
3. `u·volumen = U` (zonas dieléctrico y aire, `f ∈ {0, 0,25, 0,5, 1}`, ambos modos).
4. `f = 0` → `C₀·κ_aire`; `f = 100 %` → `κ·C₀`; `C` monótono creciente en `f`.
5. `d_mín = V/E_máx`: con `d = d_mín` ⇒ `E/E_máx = 1`; con `f ∈ (0,1)` el límite es el del aire.
6. Aislado: `E` no depende de `d`; `Q_máx = E_lim·ε₀A·φ(f)`.
7. Continuidad al cambiar de modo (en ambos sentidos): `Q`, `V`, `E`, `U` iguales; cambiar `f` después da el cociente correcto.
8. Catálogo: todos con `κ ≥ 1` y `E_máx > 0` finitos, ids únicos, aire = 1,00059 y 3 MV/m; sin entrada de agua.
9. Referencia: auto-seguimiento con aire, congelada con dieléctrico; `comparar` marca «= κ» / «= 1/κ».
10. `ajustar`: regla determinista de §6 (conectado sube `d`; aislado bloquea sin tocar `Q`).
11. Trabajo: aislado `W = ΔU`; conectado `W = −½V²ΔC` y `V·ΔQ = 2ΔU`.
12. Fuerza: `F = ½V²·dC/dx`, constante en `f` para conectado.

## 11. Decisiones de criterio (para tu OK)

1. Agua fuera; catálogo de 11 materiales reales (los 9 del prompt sin agua + PVC + aceite de silicona).
2. Ruptura solo por bloqueo (sin chispa ni dieléctrico dañado).
3. En aislado nunca se baja `Q` para obedecer la rigidez: se bloquea el cambio.
4. Referencia automática con aire; se congela al meter dieléctrico; botón «Fijar referencia» manual.
5. Vista lateral 2D con escala logarítmica rotulada.
6. `V_TOPE = 5 kV` (sala), también en aislado.
7. Selector arranca en aire con `f = 0`; elegir un material no lo mete solo: se arrastra o se usa el deslizador (escenarios sí lo meten).
8. Valores del catálogo: de memoria de la tabla de Serway, **sin verificar contra el libro**.

## 12. Desvíos de la fase 1 respecto a lo escrito arriba

- `Estado` añade `sigmaLibreAire` (carga libre en la zona de aire) y `sigmaLibre` es la de la zona del dieléctrico.
- «×κ» y «÷κ» en realidad son `κ/κ_aire` (difiere 0,06 %): los tests usan ese cociente y `comparar` anota «(= κ)» con tolerancia 0,5 %.
- `F = ½V²ε₀·L·(κ − κ_aire)/d`; se devuelve 0 con `f = 1` (ya no puede entrar más) y con aire.
- `ajustar`, conectado: editar `V` se recorta a `V_máx` (no sube `d`); editar `d` se recorta a `d_mín`; material, `f` o `A` suben `d`.
  La rama «`d` = 10 mm y baja `V`» existe pero con este catálogo y `V_TOPE` no es alcanzable.
- `ajustar`, aislado: bisección sobre A, d, f, Q; un cambio de material que dejaría `E > E_lim` conserva el anterior.
- `cambiarModo(p, modo)` y `sincronizar(p)` mantienen Q y V coherentes en `Parametros`.
- Tests en 5 archivos (modelo, dielectricos+rigidez, limites, referencia, trabajo): 41 casos.
- Valores del catálogo siguen **sin verificar contra el libro** (ver §5).

## 13. Fase 3 (panel y textos): decisiones y correcciones

- Corrección: el escenario «Cerca de la ruptura del aire» usa **2800 V** a 1 mm (E = 2,8 MV/m = 93 %). El contrato decía 280 V,
  que son 0,28 MV/m (9,3 %); lo detectó el test del escenario.
- Se muestra la fuerza `F = ½V²·dC/dx` (una línea, solo si hay lámina que pueda entrar). **No** se hizo la mini gráfica de C o U.
- Controles reutilizan `EditorValor` de E6/E7 (log para d, V y Q; lineal para A y f). El rango de V y de Q se recorta según el
  límite de rigidez; el de d es fijo (0,1–10 mm) y el límite lo aplica `ajustar` con un aviso, con la separación mínima en la ayuda.
- El selector de dieléctrico es un grupo de radios nativos con κ y E máx en cada opción; el uso real va para lectores de pantalla.
- Rótulo de trabajo: calcula el caso «si las separas al doble (o al medio, si ya está en el tope)» con los números actuales.

## 14. Escenarios rápidos retirados (petición del usuario, tras la fase 6)

- Se quitó la sección «Escenarios rápidos» de la estación (§9 y §13 quedan como historia): botones, `ui/capacitorPlacas/escenarios.ts`,
  sus tests y las comprobaciones del e2e. El visitante llega a los mismos estados con el interruptor, el selector y los controles.
- «Volver a empezar» sigue en el panel de referencia.
