# Contrato Gauss 3D (estación 5, `/ley-de-gauss`) — Fase 0

Especificación: bóveda `decisiones/2026-10-07-gauss-3d-diseno-canvas2d.md` y `...-plan-estacion-ley-de-gauss.md`.
Este documento fija tipos, API, flujo de datos, escenarios y tests. Las fases 1–6 lo implementan sin cambiar firmas
(si algo debe cambiar, se edita aquí primero). Código nuevo en `src/fisica/gauss3d/` (puro, sin DOM, sin React),
`src/render/gauss3d/` (cámara, buffers, dibujo), `src/store/gauss3dStore.ts`, `src/pages/LeyDeGauss.tsx`.

## 1. Convenciones y unidades

- **Ejes:** `z` arriba; el suelo es el plano horizontal `xy` (z = 0, cuadrícula). Mano derecha. Ángulos en radianes.
- **Unidad de mundo (u) = 1 cuadro de la cuadrícula** = `PX_POR_CUADRO` px = `M_POR_CUADRO` m (1 cm por defecto).
  Toda la física 3D trabaja en u; los metros solo aparecen al formatear: `metros = u * M_POR_CUADRO` (de `escala.ts`).
  Nunca se usa `px` en `gauss3d/`: cambiar `ESCALA` no cambia ningún resultado adimensional.
- **Carga:** `q` en unidades de carga de la app (1 unidad = 1 µC = `C_POR_UNIDAD` C). Rango UI 0.5–5 con signo aparte
  (`|q|` ∈ [0.5, 5], signo ±1), como `Q_MIN/Q_MAX` de `fisica/carga.ts`.
- **Convención "ε₀ = 1" (flujo adimensional):** `E(r) = q · (r − r_q) / (4π |r − r_q|³)` en (µC/ε₀)/u². Con ella
  **Φ = q_enc** exactamente (sin 4π). Φ se mide en **"µC/ε₀"** (= unidades de `q`). Esta es la unidad de mundo del flujo.
- **Paso a SI** (solo para lecturas, en `gauss3d/unidades.ts`, usando `K_COULOMB`, `C_POR_UNIDAD`, `M_POR_CUADRO`):
  - `1 µC/ε₀ = 4π·K_COULOMB·C_POR_UNIDAD = 1.1294×10⁵ N·m²/C`. `Φ_SI = Φ · 4π·K_COULOMB·C_POR_UNIDAD`
    (depende solo de `C_POR_UNIDAD`, NO de `pxPorCuadro`/`mPorCuadro`).
  - `E_SI(r_u) = K_COULOMB·q·C_POR_UNIDAD / (r_u·M_POR_CUADRO)²` (para el escenario 9 y las flechas rotuladas).
- **Softening:** solo para dibujar flechas/trazar líneas (`SOFT2_3D = 0.01 u²`, ε = 0.1 u = 1 mm). El flujo NO usa softening
  (ángulo sólido exacto). `K_VISUAL`/`SOFTENING2` de 2D no se usan aquí.
- **Superficie fija en el origen** (centro de esfera/cubo/cilindro y del parche = (0,0,0)). Se mueven las cargas.
  Esfera: radio R. Cubo: aristas alineadas a ejes, lado a. Cilindro: eje z, radio R, altura h (z ∈ [−h/2, h/2]).
  **Máx. 2 cargas.** Rangos: R ∈ [2, 8] (def. 5); a ∈ [4, 16] (def. 8); cilindro R ∈ [2, 8], h ∈ [4, 16] (def. 4 y 8);
  parche lado l ∈ [2, 12] (def. 4). Cargas: x,y ∈ [−12, 12], z ∈ [−10, 10].
- **Normales:** siempre exteriores en superficies cerradas; en el parche, `n` es la elegida (Φ>0 si E·n>0).
- **Distancia mínima carga–superficie** `DIST_MIN_SUP = 0.4 u` (debe ser > `R_SEED_3D = 0.35 u`: si no, el punto de siembra
  de una línea podría quedar al otro lado de la superficie y su primer tramo carga→semilla, que no está en la polilínea, se
  perdería para el conteo de cruces y rompería el invariante salen−entran). `ajustarCargaFueraDeSuperficie` recibe la posición
  PEDIDA (cruda, del puntero/slider) y la `previa` ya ajustada: si lo pedido cae dentro de la franja |d| < `DIST_MIN_SUP`,
  se deja la carga en el lado de `previa` (el más cercano si no hay previa) a distancia `DIST_MIN_SUP`; en cuanto lo pedido
  sale de la franja por el otro lado, la carga salta allí. Así se puede cruzar la superficie (salto sobre la franja: Φ pasa de
  0 a q de un cuadro a otro; es lo físico: Φ es discontinua al cruzar, con q/2 justo sobre la superficie, que la UI nunca muestra).
  Las mallas tienen los vértices SOBRE la superficie verdadera; la sagita máxima (esfera/cilindro, nivel bajo, R≤8) es ≈0.07 u
  < `DIST_MIN_SUP`, así que "dentro de la malla" equivale a "dentro de la superficie" para toda carga permitida.
  Distancia mínima entre las dos cargas `DIST_MIN_CARGAS = 0.8 u` (≥ `R_SEED_3D + R_ABS_3D`, para que la semilla de una no caiga
  en el radio de absorción de la otra). Radio de absorción de líneas en una carga: `R_ABS_3D = 0.25 u`.

## 2. Tipos (`src/fisica/gauss3d/tipos.ts`)

```ts
export type Vec3 = readonly [number, number, number];            // inmutable, para API pública
export type Vec3M = [number, number, number];                    // mutable, para buffers de trabajo

export interface Carga3D { x: number; y: number; z: number; q: number }   // q con signo, unidades de carga (µC)

export type TipoSuperficie = "parche" | "esfera" | "cubo" | "cilindro";
export type Superficie =
  | { tipo: "parche"; lado: number; theta: number; phi: number }   // normal n = (sinθ cosφ, sinθ sinφ, cosθ); cuadrado lado×lado centrado en 0, aristas
                                                                    // paralelas a û = (cosθ cosφ, cosθ sinφ, −sinθ) y v̂ = (−sinφ, cosφ, 0), û×v̂ = n
                                                                    // (sin esta convención el cuadrado inclinado no está definido: Φ depende de la orientación en su plano)
  | { tipo: "esfera"; radio: number }
  | { tipo: "cubo"; lado: number }
  | { tipo: "cilindro"; radio: number; altura: number };

export interface Camara {
  azimut: number;        // yaw alrededor de z (rad); arrastre horizontal
  inclinacion: number;   // pitch sobre el suelo (rad), clamp [15°, 85°]
  zoom: number;          // multiplicador sobre el encuadre automático (def. 1)
  fov: number;           // grados, perspectiva suave (def. 35)
  ancho: number; alto: number;   // px lógicos del canvas
}
export interface CamaraDerivada {      // calculada por render/gauss3d/camara.ts, una vez por cambio de cámara
  pos: Vec3;                            // posición del ojo en mundo (para test "delante/detrás")
  R: Float32Array;                      // 3×3 mundo→cámara, fila mayor
  distancia: number; fPx: number;       // distancia al objetivo y distancia focal en px
  encuadre: number;                     // px por u en el centro (zoom ya aplicado)
}

export type Calidad3D = 0 | 1 | 2;      // índice de NIVELES_GAUSS3D (0 alta … 2 baja); mismo orden que NIVELES_CALIDAD
export interface NivelGauss3D {
  nombre: "alta" | "media" | "baja";
  presupuestoLineas: number;            // 240 / 120 / 60
  pasoLinea: number;                    // longitud de arco por paso RK2 (u): 0.15 / 0.2 / 0.3
  mallaEsfera: readonly [nu: number, nv: number];   // [24,48] / [18,36] / [12,24]
  celdasCara: number;                   // celdas por arista en cubo/parche y por tapa; 12 / 9 / 6
  celdasCilindro: readonly [nz: number, nphi: number];  // [8,48] / [6,36] / [4,24]
  tapaFlechas: number;                  // máx. flechas E: 120 / 70 / 36
}

export interface Escenario {              // entrada de TODO el mundo; la UI lo construye y lo copia al controlador
  superficie: Superficie;
  cargas: readonly Carga3D[];             // longitud 1 o 2
  calidad: Calidad3D;
}

// ---- Resultados de flujo ----
export interface MallaSuperficie {        // geometría cacheada de la superficie (en mundo)
  tipo: TipoSuperficie;
  vertices: Float32Array;                 // 3·nV
  triangulos: Uint32Array;                // 3·nT, orientados con normal exterior (parche: según n)
  parcheDeTriangulo: Uint32Array;         // nT → índice de parche de flujo (grupo de triángulos, p. ej. celda quad/anillo)
  nParches: number;
  areaParche: Float32Array;               // nParches (u²)
  normalTriangulo: Float32Array;          // 3·nT
  centroParche: Float32Array;             // 3·nParches (para rotular y para orden por profundidad)
  nCeldasU: number; nCeldasV: number;     // rejilla lógica (solo orden de dibujo y accesibilidad)
}
export interface ResultadoFlujo {
  total: number;                          // Φ, en µC/ε₀ (convención ε₀=1)
  qEnc: number;                           // Σ q de las cargas estrictamente dentro (0 para parche)
  porCarga: Float64Array;                 // aporte de cada carga a Φ (long = cargas)
  porParche: Float32Array;                // Φ por parche de flujo (µC/ε₀), long = nParches
  densidadParche: Float32Array;           // E_n medio = porParche/area (µC/ε₀ por u²), para el color divergente
  maxAbsDensidad: number;                 // para saturar la paleta (tope = percentil 98 o este valor, ver flujo.ts)
}

// ---- Líneas de campo 3D en buffers planos ----
export interface LineasCampo3D {
  n: number;                              // nº de líneas
  inicio: Uint32Array;                    // n+1: la línea i usa puntos [inicio[i], inicio[i+1])
  puntos: Float32Array;                   // 3·nPuntos, concatenados
  carga: Uint8Array;                      // n: carga de origen (0|1)
  signo: Int8Array;                       // n: signo de la carga de origen (+1 sale de +q, −1 sembrada desde −q)
  sentido: Int8Array;                     // n: +1 si el recorrido va a favor de E, −1 si se trazó contra E
  fin: Uint8Array;                        // n: 0 = carga, 1 = esfera límite, 2 = MAX_PUNTOS_LINEA/E_MIN_3D (nunca 2 en tests de escenarios; con 1 sola carga todas son 1)
  finCarga: Int8Array;                    // n: índice de carga donde termina (−1 si fin≠0)
  lineasPorCarga: Uint16Array;            // 2: líneas que realmente emite/absorbe cada carga (contabilidad de Gauss): +: las n_i sembradas; −: max(n_j, llegadas_j) = llegadas desde + más las sembradas hacia atrás
}

// ---- Cruces línea–superficie ----
export interface Cruces {
  n: number;
  posicion: Float32Array;                 // 3·n, punto de cruce en mundo
  linea: Uint32Array;                     // índice de línea
  segmento: Uint32Array;                  // índice GLOBAL del punto anterior al cruce (en `puntos`)
  t: Float32Array;                        // fracción dentro del segmento [0,1)
  sentido: Int8Array;                     // +1 sale (E·n>0), −1 entra (E·n<0), medido sobre la línea orientada con E; se decide por el cambio de estado
                                          // dentro/fuera entre los extremos del segmento (robusto en tangencia), no por el signo numérico de E·n
  salen: number; entran: number;          // totales (salen − entran = líneas netas de q_enc)
}
```

Lectura de cruces y orientación de línea: una línea trazada contra E (`sentido −1`, sembrada desde una carga negativa) se
**invierte al guardarla** para que todas las polilíneas vayan a favor de E; así `sentido` del cruce se mide siempre con E
y `Cruces.sentido` no depende de cómo se sembró. (`LineasCampo3D.sentido` queda solo como metadato de depuración.)

## 3. API pública de `src/fisica/gauss3d/` (un archivo por tema; `index.ts` reexporta)

| Archivo | Exporta (firma exacta) |
|---|---|
| `constantes.ts` | `SOFT2_3D=0.01`, `DIST_MIN_SUP=0.4`, `DIST_MIN_CARGAS=0.8`, `R_SEED_3D=0.35`, `R_ABS_3D=0.25`, `R_LIMITE_FACTOR=3`, `E_MIN_3D=1e-7` (µC/ε₀ por u²; |E| de 5 µC a 100 u es 4e-5, no corta antes del límite), `LINEAS_POR_UC` (se fija tras §7; provisional 20), `MIN_LINEAS_CARGA=6`, `MAX_PUNTOS_LINEA=256`, `MAX_CARGAS=2`, `NIVELES_GAUSS3D: readonly NivelGauss3D[]`, `RANGOS` (tamaños de §1) |
| `tipos.ts` | todos los tipos de §2 |
| `unidades.ts` | `FLUJO_UNIDAD_SI: number` (= 4π·K_COULOMB·C_POR_UNIDAD = 112 940.9 N·m²/C por µC/ε₀), `flujoASI(phi: number, esc: ConfigEscala = ESCALA): number` (usa solo `esc.cPorUnidad`), `campoSI3D(q: number, rU: number): number` (N/C), `uAMetros(u: number): number`, `formatFlujoSI(phi: number): string` (con `formatSI`, unidad `N·m²/C`), `formatPhi(phi: number): string` ("3.00 q/ε₀"-style: `"Φ = 3.00 µC/ε₀"`) |
| `campo3d.ts` | `campoEn(p: Vec3, cargas: readonly Carga3D[], soft2 = SOFT2_3D, out: Float64Array = new Float64Array(3)): Float64Array` (E vectorial, ε₀=1, superposición); `campoCarga(p: Vec3, c: Carga3D, soft2?, out?): Float64Array`; `modulo(E: Float64Array): number`; `muestrearFlechas(sup: Superficie, cargas, tope: number, out: Float32Array): number` (posiciones sobre la malla de la superficie + vector E, devuelve nº; layout 6 floats/flecha: x,y,z,Ex,Ey,Ez) |
| `superficies.ts` | `crearSuperficie(tipo, params?): Superficie` (defaults §1); `normalParche(s: Extract<Superficie,{tipo:"parche"}>): Vec3`; `radioEnvolvente(s): number`; `estaDentro(s, p: Vec3): boolean` (parche → siempre false); `distanciaConSigno(s, p: Vec3): number` (>0 fuera; parche: distancia al plano, signo según n); `ajustarCargaFueraDeSuperficie(s, c: Carga3D, previa?: Carga3D): Carga3D`; `ajustarDistanciaCargas(a: Carga3D, b: Carga3D): Carga3D` (mueve b); `cargasEncerradas(s, cargas): number[]` (índices); `qEncerrada(s, cargas): number`; `area(s): number` |
| `rayos.ts` | `rayoSuperficie(s, o: Vec3, d: Vec3, tMax = Infinity): { tEntrada: number; tSalida: number } \| null` (d no necesita estar normalizado; cuadrática esfera, slabs cubo, cuerpo+tapas cilindro, plano+extensión parche, `tEntrada` puede ser <0 si el origen está dentro); `segmentoCruzaSuperficie(s, a: Vec3, b: Vec3, out: Float64Array): number` (nº de cruces 0..2, rellena `[t0, sentido0, t1, sentido1]` con t∈[0,1) y sentido ±1 = sale/entra según normal exterior en el punto); `ocultoPorSuperficie(s, ojo: Vec3, p: Vec3): boolean` (¿el rayo ojo→p atraviesa la superficie antes de llegar a p? define "detrás de la cara delantera"; parche: cuenta si el rayo cruza el cuadrado antes de p) |
| `mallas.ts` | `generarMalla(s: Superficie, nivel: NivelGauss3D): MallaSuperficie` (esfera UV sin triángulos degenerados en polos; cubo y parche en rejilla `celdasCara`², 2 triángulos/celda, 1 parche/celda; cilindro cuerpo `nz×nphi` + 2 tapas en anillos/sectores; parches = celdas cuadriláteras) |
| `flujo.ts` | `anguloSolidoTriangulo(p: Vec3, A: Vec3, B: Vec3, C: Vec3): number` (Van Oosterom–Strackee, signado según orientación ABC; sr); `flujoPorCarga(malla: MallaSuperficie, c: Carga3D): number` (= q·ΣΩ/(4π)); `calcularFlujo(malla: MallaSuperficie, cargas: readonly Carga3D[], sup: Superficie): ResultadoFlujo`; `flujoCuadratura(sup: Superficie, cargas, n?: number): number` (integra E·n dA por punto medio; solo para tests/verificación, no se usa en la app) |
| `lineas3d.ts` | `puntosFibonacci(n: number, rotacion: number): Float64Array` (3·n vectores unitarios, espiral áurea, rotados por `rotacion` alrededor de z y un tilt fijo por carga para no alinear polos); `repartirLineas(cargas, presupuesto: number, lineasPorUC = LINEAS_POR_UC): number[]` (n_i ∝ |q_i|, mín. `MIN_LINEAS_CARGA`; si Σ > presupuesto se reescala proporcionalmente y se redondea con mayor resto); `trazarLineas3D(cargas, rLimite: number /* = R_LIMITE_FACTOR·radioEnvolvente + max|r_i| de las cargas: con solo 3·R una carga en x,y=12 con R=2 quedaría fuera de la esfera límite y sus líneas morirían en el primer paso */, nivel: NivelGauss3D, lineasPorUC?: number, salida?: LineasCampo3D): LineasCampo3D` (RK2 de paso `pasoLinea`; semilla a radio 0.35 u de la carga; + sembradas hacia delante; − solo `max(0, n_j − llegadas_j)` hacia atrás, "donde falta" como E2.3; termina en carga (radio `R_ABS_3D`), esfera de radio `rLimite` (centrada en el origen) o `MAX_PUNTOS_LINEA`; **paso adaptativo** `h = pasoLinea·min(4, max(1, dMin/4))` con `dMin` = distancia a la carga más cercana (medido por el revisor: con paso fijo 0.15 un cubo a=16, límite 41.6 u, necesita 277 puntos y el dipolo del escenario 7 llega a 227, ambos > 220 ⇒ `fin=2`); reutiliza buffers de `salida` si caben) |
| `cruces.ts` | `calcularCruces(lineas: LineasCampo3D, sup: Superficie, out?: Cruces): Cruces`; `contarSalenEntran(c: Cruces): { salen: number; entran: number; neto: number }`; `lineasNetasEsperadas(sup: Superficie, cargas, lineas: LineasCampo3D): number` (= Σ signo_i·`lineasPorCarga`[i] sobre cargas encerradas; lo que debe valer `neto` en superficies CERRADAS; para el parche no hay invariante y devuelve `NaN`) |
| `unionesBuffers.ts` | `crearBufferesLineas(maxLineas: number): LineasCampo3D` y `crearBufferesCruces(maxCruces: number): Cruces` (preasignación, ver §4) |
| `escenarios.ts` | `ESCENARIOS: readonly DefEscenario[]` (los 9 de §5), `interface DefEscenario { id:1..9; nombre; superficie: Superficie; cargas: Carga3D[]; mostrar:{lineas:boolean;flujo:boolean;campo:boolean}; vista:{azimut:number;inclinacion:number}; esperado:{ phi:number; qEnc:number; texto?:string } }` |

Reglas de implementación: funciones puras (sin DOM/estado/`Math.random`); semillas deterministas; sin asignaciones en bucles
internos (los `out` se reciben); Float64 para cálculo, Float32 solo en buffers de salida; sin `NaN` (comprobar con `Number.isFinite`
en tests). `calcularFlujo` es O(nT·nCargas) (~2200 triángulos × 2 ≈ 0.04 ms por 1 carga según el PoC de `investigacion-gauss-3d`).

## 4. Flujo de datos

```
Zustand (gauss3dStore: SOLO UI)            ref del controlador (controladorGauss3d.ts)
  forma, tamaño, selección, q, signo,       x,y de cada carga (arrastre en plano, NO en React)
  z (slider), toggles, escenario,            azimut/inclinación en curso, estado de arrastre, buffers
  azimut/inclinación (avanzado)              ▲ lee con getState() en rAF (sin re-render); publica lecturas ≤10 Hz
        │  Escenario (superficie, cargas, calidad)
        ▼
  firma de capa (firma3d.ts)  ── "igual" → no hace nada
        │ "camara"   → solo reproyecta (barato)
        │ "geometria"→ recalcula geometría cacheada
        ▼
  GEOMETRÍA CACHEADA (mundo, Float32Array): malla, flujo, líneas, cruces, flechas, sombras/líneas de caída
        ▼
  PROYECCIÓN por cuadro → Float32Array preasignados (xs, ys, prof) de vértices, puntos de línea, cargas, flechas
        ▼
  4 pasadas Canvas 2D: 1 caras traseras · 2 contenido detrás de la cara delantera · 3 caras delanteras translúcidas ·
  4 contenido delante (cada trozo clasificado con `ocultoPorSuperficie`; las líneas ya partidas en los cruces)
```

**`firma3d.ts`** (en `src/render/gauss3d/`, mismo patrón que `firmaCapa.ts`: `Float64Array`, sin cadenas, en cada frame):
`interface DatosFirma3D { escenario: Escenario; camara: Camara; dpr: number; mostrar: {lineas:boolean;flujo:boolean;campo:boolean};
opacidad: number }`; `crearFirma3D(): { comparar(d): "igual"|"camara"|"geometria"; guardar(d): void }`.
- **geometría** cambia con: tipo/tamaños de superficie, cualquier `x,y,z,q` de carga, calidad (alta/media/baja), nº de cargas,
  toggles que añaden cálculo (líneas, campo). No depende de la cámara.
- **cámara** cambia con: azimut, inclinación, zoom, ancho/alto/dpr, opacidad. Reproyecta, no recalcula física.
- Toggle `flujo` solo oculta colores (el flujo siempre se calcula: alimenta la lectura Φ).

**Cuándo se recalcula qué:**
| Evento | malla | flujo | líneas | cruces | flechas | proyección |
|---|---|---|---|---|---|---|
| rotar/zoom/inclinación | – | – | – | – | – | sí |
| tamaño de superficie / forma | sí | sí | – (solo si cambia R límite) | sí | sí | sí |
| mover/cambiar q o z de una carga | – | sí | sí | sí | sí | sí |
| calidad cambia | sí | sí | sí | sí | sí | sí |
Los buffers se reasignan solo si el tamaño máximo (`NIVELES_GAUSS3D[0]`) no cabe; capacidades fijas por diseño: líneas
240 × `MAX_PUNTOS_LINEA` (256) = 61 440 puntos; cruces ≤ 2·240; vértices de malla ≤ 2 500; flechas ≤ 120.

**Arrastre y calidad:** durante un arrastre (cargas o sliders) la geometría se recalcula a calidad gruesa (nivel 2, "baja"),
**máx. 1 recálculo por cuadro** (el handler solo marca `sucio = true` y guarda el último valor; el rAF recalcula una vez);
al soltar (`pointerup`/`change`, o 150 ms sin eventos) se recalcula a la calidad vigente del gestor (`crearGestorCalidad` de
`render/calidadCampo.ts`, reutilizado tal cual para elegir 0/1/2; `registrar(msJs)` mide el recálculo; el dibujo es bajo demanda
y se detiene si la firma es "igual"; auto-rotación apagada por defecto y siempre con `prefers-reduced-motion`).
Tras un arrastre grueso, el valor de Φ mostrado es siempre el del cálculo con la calidad vigente (el flujo es barato: se
calcula con la malla de `NIVELES_GAUSS3D[1]` como mínimo; mallas groseras con carga cercana a la cara sub-resuelven los parches,
no el total — el total del ángulo sólido es exacto en cualquier malla cerrada).

## 5. Escenarios (botones 1–9)

Φ en µC/ε₀ (= q_enc cuando cerrada); SI = Φ·1.1294×10⁵ N·m²/C. `q` en µC. Vista: azimut/inclinación iniciales (°).
Toggles: L=líneas, F=flujo (parches), E=flechas campo. Tamaño en u (1 u = 1 cm).

| # | Forma y tamaño | Cargas (x,y,z,q) | Toggles | Vista | Resultado esperado |
|---|---|---|---|---|---|
| 1 Parche, cos θ | parche l=4, θ=0 φ=0 (n=+z; θ 0→90° en Avanzado, giro alrededor de y) | A (0,0,−6,+3) | L, F | 35/30 | Φ/q = 0.03188, 0.02925, 0.01928, 0 para θ=0°,30°,60°,90°; con q=3: Φ = 0.0957, 0.0877, 0.0578, 0 (θ=0: 1.08×10⁴ N·m²/C). q_enc = 0 (no cerrada). Con 60 líneas solo ≈1.9, 1.8, 1.2, 0 líneas atraviesan el parche: su contador es ±1 y no se presenta como medida de Φ (la medida es el Φ calculado) |
| 2 Superficie cerrada | esfera R=5 | A (0,0,0,+3) | L, F | 35/30 | Φ = 3.00 (3.39×10⁵ N·m²/C), q_enc = 3; parches uniformes (Φ_p = 3/nP); salen = 3·`LPU`, entran = 0 (carga única: todas llegan a la esfera límite) |
| 3 Dentro / fuera | esfera R=5 | A (1.5,1,2,+3) y variante fuera (8,0,0,+3) (botón "dentro/fuera") | L, F | 35/30 | dentro: Φ = 3, q_enc = 3. fuera: Φ = 0, q_enc = 0; salen = entran > 0 (cada línea que entra, sale). Φ no depende de la posición dentro |
| 4 Cambiar tamaño | esfera R=2→8 (def. 5) | A (0,0,0,+3) | L, F, E | 35/30 | Φ = 3 para todo R (constante). E_sup = K·q/R²: R=2 → 6.74×10⁷ N/C; R=5 → 1.08×10⁷; R=8 → 4.21×10⁶ (Φ = E·4πR² se compensa) |
| 5 Cubo/cilindro vs esfera | cubo a=8 · cilindro R=4,h=8 · esfera R=5 (botones de forma) | A (1,−1,0.5,+3) (dentro de las tres) | L, F | 35/30 | Φ = 3.00 en las tres formas (igualdad a 1e-9 relativo); q_enc = 3. Parches distintos, mismo total |
| 6 Carga que cruza | esfera R=5 | A (0,0,8,+3) (arrastrar/slider z de 8 a 0) | L, F | 35/30 | Φ = 0 con la carga fuera; al cruzar R (|z|=5) salta a 3; q_enc 0→3; salen−entran 0→`LPU`·3 |
| 7 Dipolo | esfera R=5 | A (−2,0,0,+3), B (2,0,0,−3) | L, F, E | 35/30 | Φ = 0.00, q_enc = 0; parches rojos y azules que se compensan; salen = entran = `LPU`·3 − (nº de líneas A→B). Medido (60 líneas, RK2 0.15 u): 52 van de A a B y solo 8 cruzan, así que salen = entran ≈ 8 (**no** 60) |
| 8 Superficie abierta | parche l=10, θ=0 | A (0,0,−3,+3) | L, F | 35/30 | Φ = 0.7889 (8.91×10⁴ N·m²/C) ≠ q (no encierra carga: Gauss no da q/ε₀); q_enc = 0; contraste con el escenario 2 |
| 9 Gauss como herramienta | esfera R=5 (R libre 2–8) | A (0,0,0,+4) | L, F, E | 35/30 | Φ = 4.00 (4.52×10⁵ N·m²/C) ⇒ E = Φ/(4πR²) = K·q/R² = 1.44×10⁷ N/C a R=5 cm (R=3: 3.99×10⁷ N/C); la lectura muestra E = Φ/(4πR²) y lo compara con K·q/R² |

`LPU` = `LINEAS_POR_UC` fijado en §7. Los valores 0.0957/0.0877/0.0578 y 0.7889 provienen de integrar E·n dA (500² puntos;
error < 1e-4) y son la referencia de los tests de parche. El escenario 5 es la prueba de "cubo=esfera=cilindro". El 6 muestra
el salto: la lectura de Φ debe anunciarse en la región viva solo cuando cambia de lado (no por cuadro).

## 6. Tests obligatorios (Vitest, junto a cada módulo; `fisico-revisor` los diseña, ver `docs` de revisión)

Tolerancias: flujo por ángulo sólido `|Φ − q_enc| ≤ 1e-9·max(1,|q_enc|)` (mallas de nivel 1 y 2 también); cuadratura `≤ 5e-3` relativo.
1. **Φ = q/ε₀ dentro:** para esfera (R=2,5,8), cubo (a=4,8,16), cilindro (R×h=2×4, 4×8, 8×16), con una carga dentro en posiciones
   centrales, excéntricas (a `DIST_MIN_SUP`=0.4 u de la cara, esquina del cubo, borde de tapa) y q=±0.5,±3,±5: `calcularFlujo(...).total ≈ q`.
2. **Φ = 0 fuera:** carga a 0.4 u, 1 u y 10 u fuera de cada forma (incluso a 0.4 u de una arista); con 1 y 2 cargas fuera.
3. **cubo = esfera = cilindro:** misma escena de cargas (varias posiciones comunes) → los tres Φ iguales (1e-9).
4. **Superposición/q_enc con 2 cargas:** una dentro + otra fuera → Φ = q_dentro; las dos dentro → Φ = q1+q2.
5. **Dipolo encerrado:** (−2,0,0,+q) y (2,0,0,−q) en esfera, cubo y cilindro → Φ = 0 (|Φ|<1e-9); Φ_parche tiene ambos signos.
6. **Independencia de escala y de softening:** `calcularFlujo` no importa `escala.ts`; `ESCALA` es constante congelada, así que se
   comprueba con `flujoASI(phi, esc)` para `esc` alternativos (cambiar `pxPorCuadro`/`mPorCuadro` no altera Φ ni Φ_SI; cambiar `cPorUnidad` escala Φ_SI en proporción) y cambiando `SOFT2_3D` (parámetro de `campoEn`) se comprueba Φ idéntico; `flujoCuadratura` (usa `campoEn` sin softening ε=1e-12)
   coincide con `calcularFlujo` a ≤ 5e-3 en esfera/cubo/cilindro (cargas a ≥ 1 u de la superficie y `n` suficiente: el punto medio converge mal a 0.4 u). Parche: reproduce Φ/q = 0.03188/0.02925/0.01928 (θ=0/30/60°) a ≤1e-4 y 0.7889 (esc. 8); verificado por el revisor con 800² puntos.
7. **Φ legible en SI:** `flujoASI(1) ≈ 1.1294e5` (rel 1e-4); `flujoASI(3) ≈ 3.388e5`; con `escala.ts`: `flujoASI(Φ_esfera)/(4π·(R·M_POR_CUADRO)²)` = `K·q·C_POR_UNIDAD/(R·M_POR_CUADRO)²` (escenario 9) = `campoSI(R·PX_POR_CUADRO, 0, [{x:0,y:0,q}]).modulo` de `escala.ts` (rel < 1e-15; verificado por el revisor para (q,R) = (3,5),(4,5),(4,3),(3,2),(3,8); R·50 px ≥ 100 > `RADIO_MIN_LECTURA_PX`).
8. **Líneas, conteo salen − entran:** para cada escenario cerrado (2,3,5,6,7,9) y 40 posiciones aleatorias (semilla fija):
   `contarSalenEntran(calcularCruces(trazarLineas3D(...)))`.neto == `lineasNetasEsperadas(...)` (entero exacto, con cargas negativas y pares desiguales incluidos; con q desiguales `lineasPorCarga` de la negativa puede superar a `repartirLineas` por las llegadas, por eso se compara con el valor real); en el dipolo: neto = 0
   y salen == entran (> 0 en el escenario 7, ≈8); cargas a `DIST_MIN_SUP` de la cara (peor caso de la semilla) y en x,y=±12, z=±10 (R=2: la esfera límite debe incluirlas); ninguna línea con `fin === 2` (cubo a=16 y cilindro 8×16 incluidos); Σ `lineasPorCarga` coherente con `repartirLineas`.
9. **Fibonacci:** cobertura uniforme (varianza de conteos por octante ≤ 15 % para n≥24); determinismo (misma entrada → mismos bytes).
10. **Rayos:** `rayoSuperficie`/`segmentoCruzaSuperficie` contra una referencia por muestreo denso para esfera, cubo, cilindro (cuerpo y tapas),
    parche; casos de tangente, origen dentro, `tMax`. `ocultoPorSuperficie` coherente con "rayo atraviesa la malla" (comparar con
    intersección rayo–triángulo sobre la malla).
11. **Mallas:** Σ áreas = área analítica (error < 1 % esfera, exacto cubo/cilindro/parche); normales exteriores (producto con vector al centro > 0); Σ Φ_p = Φ; ningún triángulo degenerado.
12. **Ajustes:** `ajustarCargaFueraDeSuperficie` deja `|distanciaConSigno| ≥ DIST_MIN_SUP` y conserva el lado; `ajustarDistanciaCargas` respeta `DIST_MIN_CARGAS`.
13. **Escenarios:** cada `ESCENARIOS[i]` produce `calcularFlujo` ≈ `esperado.phi` (tabla §5; parche con tolerancia 1e-3) y es válido (distancias mínimas).
14. **Rendimiento (informativo, no bloqueante):** `calcularFlujo` + `trazarLineas3D` + `calcularCruces` en nivel alto < 14 ms en Node (se registra, no falla CI).

## 7. Plan de medición de líneas por µC (Fase 1, tras tests verdes)

Archivo `src/fisica/gauss3d/lineas3d.medicion.test.ts` (marcado `test.skip` en CI; se ejecuta a mano, resultados a la bóveda).
Candidatos `LINEAS_POR_UC ∈ {16, 20, 24}`, presupuestos 240/120/60, con 1 y 2 cargas (±0.5, ±1, ±3, ±5 µC), escenarios 2, 3, 5, 6, 7.
Para cada candidato se mide:
- **Fidelidad:** proporción de líneas por parche de flujo vs Φ_p·(n/q) en esfera con carga excéntrica; error RMS relativo por octante
  y máximo de densidad; criterio: RMS ≤ 15 % con `q=3` (nivel alto) y que el dipolo muestre al menos 12 líneas A→B visibles.
- **Presupuesto:** para q=5 con 2 cargas Σn = 240 a 24/µC (tope exacto) y 160 a 16/µC; con calidad media (120) comprobar que
  `MIN_LINEAS_CARGA=6` no impone mínimo mayor que el reparto proporcional (q=0.5 → ≥8 a 16/µC).
- **Coste:** ms de `trazarLineas3D` + `calcularCruces` (Node y, en Fase 6, móvil de gama baja): meta ≤ 4 ms alta, ≤ 2 ms baja;
  nº medio de pasos por línea y % que alcanza `MAX_PUNTOS_LINEA`.
- **Legibilidad:** captura a 390×844 y 1366×650 (Playwright): sin saturación de color y con ≥ 3 líneas visibles por parche grande;
  la decisión es visual (revisor-ui) además de numérica.
Regla de elección: el menor valor que cumpla fidelidad y presupuesto; empate → el menor coste. El valor ganador se escribe en
`LINEAS_POR_UC` y en una nota de decisión de la bóveda; los niveles `presupuestoLineas` se reajustan si hace falta (rango 120–240 alta/media, 60 baja).
Nota: en 3D, con siembra uniforme en ángulo sólido, la densidad de líneas ∝ 1/r² = |E| (a diferencia del corte 2D); la medición de fidelidad lo verifica.

## 8. Dudas y decisiones conservadoras tomadas

- Posiciones x,y: en un ref del controlador (regla del repo); q, z y tamaño en el store porque son de slider (valores UI, baja frecuencia).
- Φ siempre se calcula (no solo con el toggle F); el toggle solo colorea parches.
- El parche solo cuenta flujo (q_enc = 0); texto educativo debe decir "no encierra carga, no se puede aplicar Gauss".
- `Cruces.sentido` y `salen/entran` se miden con la normal exterior y la línea orientada con E; para el parche, con su normal `n`.
- Con pares de cargas desiguales, "salen − entran = q_enc·LPU" es solo aproximado (±1–2 líneas): la UI lo afirma exacto solo con carga única o pares ±iguales.
- Clasificación delante/detrás por segmento (punto medio) tras partir en cruces; los segmentos de longitud ≤ `pasoLinea` hacen que
  el error visual de una línea que roza el silueta sea < 1 paso (aceptado; revisar en Fase 2).

## 9. Revisión fisico-revisor

**Veredicto: APRUEBA (con las correcciones ya aplicadas en este documento).**

Verificado con cálculo independiente (Node, cuadratura de punto medio, `escala.ts` real importado):
- Φ = q/ε₀ con E = q·r/(4π r³) es consistente: `flujoASI(1)` = 4π·K·C = 112 940.9 N·m²/C; `flujoASI(Φ)/(4π R²)` coincide con `campoSI` de `escala.ts` a 1e-16 (q,R = 3/5, 4/5, 4/3, 3/2, 3/8). E del escenario 4 (6.74e7, 1.08e7, 4.21e6) y 9 (1.44e7, 3.99e7) correctos.
- Escenario 1 (parche l=4, d=6, rotación del cuadrado alrededor de y): Φ/q = 0.031884, 0.029250, 0.019278, 0 (θ=0/30/60/90°): OK. Escenario 8 (l=10, d=3): Φ/q = 0.262956, Φ = 0.78887 (8.91e4 N·m²/C): OK. Cubo a=8 y cilindro R=4,h=8 con A(1,−1,0.5,+3): Φ = 3.000005 y 3.000001 (cuadratura): OK.

Cambios hechos:
1. **Crítico:** `DIST_MIN_SUP` 0.3 < semilla 0.35: la semilla podía quedar al otro lado de la superficie y el tramo carga→semilla no cuenta, rompiendo salen−entran. Ahora `DIST_MIN_SUP = 0.4`, `R_SEED_3D = 0.35`, `DIST_MIN_CARGAS = 0.8`; regla de la franja y del cruce con posición pedida vs ajustada; tests 1 y 2 ajustados.
2. **Crítico:** escenario 7 afirmaba salen = entran = 3·LPU; medido: 52 de 60 líneas van de A a B y cruzan solo 8. Corregido (y nota para pares desiguales).
3. **Crítico:** esfera límite = 3·R dejaba cargas (hasta |r|=19.7 u) fuera con R=2; ahora `R_LIMITE = 3·R_env + max|r_i|`.
4. **Importante:** `MAX_PUNTOS_LINEA`=220 con paso fijo daba `fin=2` (cubo a=16: 277 pts; dipolo: 227); paso adaptativo, `MAX_PUNTOS_LINEA`=256, `E_MIN_3D`; `fin` doc corregido (carga única ⇒ fin=1).
5. Orientación del cuadrado inclinado del parche definida (û, v̂); `Cruces.sentido` por cambio de estado; `lineasNetasEsperadas` = NaN en parche; `flujoASI` con parámetro `esc` (test 6 estaba vacío porque `ESCALA` es constante); 0.0878→0.0877; 14 tests completos tras ajustes.

Pendientes (no bloqueantes): (a) escenario 1 con 60 líneas solo cruzan ≈2 al parche: decidir si subir q a 5 o solo mostrar el Φ numérico; (b) elegir `LINEAS_POR_UC` tras §7; (c) confirmar identidad `lineasPorCarga` vs `repartirLineas` en los 9 escenarios cuando exista la implementación (en el cálculo previo, cargas únicas y dipolo ±iguales cumplen por construcción).
