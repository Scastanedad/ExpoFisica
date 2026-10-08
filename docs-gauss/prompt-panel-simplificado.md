# Prompt para Claude Code (VS Code) — Simplificar el panel de la estación 5 «Ley de Gauss»

> Copia todo lo que hay debajo de la línea en Claude Code. Plan hecho el 2026-10-08 tras revisar la estación en producción (https://expofisica-electromagnetismo.vercel.app/ley-de-gauss) y el código en `main` (675aa06, PR #2 ya fusionado).

---

## Contexto
Trabajamos en ExpoFisica. Usa la skill/protocolo de la bóveda (`D:\Proyectos\ExpoFisWB\EFmem`): al empezar lee SOLO `00-Proyecto/estado.md` y `04-Sync/sesion-actual.md`; al cerrar actualiza la bóveda según el `CLAUDE.md`.

La estación 5 Ley de Gauss (`/ley-de-gauss`) está bien físicamente y los modelos 3D están bien. **NO se toca** la física (`src/fisica/gauss3d/*` salvo lo indicado), ni el render 3D (`src/render/gauss3d/*`, `CanvasGauss3D.tsx`), ni el cálculo de Φ, líneas, cruces o mallas. El problema es **el panel de opciones**: hoy mezcla 9 «Escenarios» (Parche, Cerrada, Dentro, Tamaño, Formas, Cruza, Dipolo, Abierta, Útil) con controles de forma y de cargas que repiten lo mismo. Un escenario es solo «una figura + una carga (o dos) en una posición concreta», así que el visitante ve dos maneras de hacer lo mismo y no sabe por dónde empezar.

### Lo que hay hoy (panel lateral, de arriba abajo)
1. **Escenarios**: 9 botones + botón «dentro/fuera» del escenario 3 + textos educativos en móvil.
2. **Qué se muestra**: Líneas · Flujo · Campo E.
3. **La superficie**: Parche · Esfera · Cubo · Cilindro + deslizador de tamaño.
4. **La carga / Las cargas**: chips de selección (si hay 2), «Invertir signo», magnitud q, «Añadir carga» / «Quitar carga» (la 2.ª carga sale opuesta: un dipolo «escondido»).
5. **La vista**: ↺ ↻ · Vista inicial.
6. **Avanzado** (plegado): x, y de la carga · θ del parche · azimut · inclinación · zoom · opacidad.
Además: deslizador vertical «Altura z» junto al lienzo, lectura Φ / q_enc / líneas bajo el lienzo, y textos «Qué mirar / Qué pasa / Por qué» cuyo título y contenido dependen del `escenarioId`.

## Objetivo
Sustituir los escenarios por dos decisiones claras:

1. **Figura** (4 botones grandes, con icono simple): **Esfera · Cubo · Cilindro · Plano**. («Plano» es el actual `parche`; solo cambia la etiqueta visible: el tipo interno `"parche"` se mantiene.)
2. **Fuente** (selector segmentado de 2 opciones): **Una carga · Dipolo**.

Todo lo demás (tamaño, magnitud, signo, altura, arrastre, interruptores, vista) sigue igual. Los 9 escenarios desaparecen de la UI; sus lecciones se conservan porque los textos educativos pasan a depender del **estado** (figura, fuente, cargas dentro/fuera), no de un número de escenario.

### Panel objetivo (de arriba abajo)
1. **Figura** — Esfera · Cubo · Cilindro · Plano. Debajo: deslizador «Tamaño (radio/lado)». Si la figura es Plano, aparece aquí mismo (no en Avanzado) el deslizador «Inclinación del plano (θ)».
2. **Fuente** — [ Una carga | Dipolo ].
   - Una carga: «Invertir signo» + «Magnitud q».
   - Dipolo: chips «+q» / «−q» para elegir cuál se mueve con las flechas y con la «Altura z»; «Magnitud q» (cambia las dos a la vez, siempre +q y −q iguales); «Invertir» intercambia la polaridad.
   - Botón «Recolocar» (devuelve la carga o el dipolo a su posición inicial para esa figura).
3. **Qué se muestra** — Líneas · Flujo · Campo E (igual que hoy).
4. **La vista** — ↺ ↻ · Vista inicial (igual que hoy).
5. **Avanzado** (plegado) — x, y de la carga seleccionada · azimut · inclinación · zoom · opacidad (sin θ, que sube al bloque Figura).
6. Textos educativos y leyenda: mismo lugar que hoy (bajo el lienzo en ancho; en móvil, bajo el bloque Figura/Fuente).
Desaparecen: bloque «Escenarios», botón «dentro/fuera», «Añadir carga» y «Quitar carga».

### Decisiones ya tomadas (no las reabras sin motivo físico)
- **Dipolo = dos cargas ±q independientes en posición** (cada una se arrastra sola, como hoy) pero con magnitud enlazada. Así no hay que tocar el controlador de arrastre y el visitante puede sacar una sola carga de la figura y ver que Φ pasa de 0 a ±q/ε₀ (la lección del antiguo escenario 7 + 3). `MAX_CARGAS` sigue en 2.
- **Cambiar de figura o de fuente recoloca las cargas en la posición inicial de esa combinación** (predecible para un visitante y evita casos degenerados, p. ej. una carga en el origen al pasar a Plano, que pasa por el origen). Tamaño, interruptores y vista se conservan; el tamaño vuelve al `def` de la nueva figura como ya hace `setForma`.
- Estado inicial de la página: **Esfera + Una carga** (equivale al antiguo escenario 2).
- Las posiciones x, y siguen fuera de React (controlador); Zustand solo UI. Regla del `CLAUDE.md`.
- Ruta `/ley-de-gauss` sin cambios.

## Reparto entre subagentes (en este orden; commit por fase en la rama `feat/gauss-panel-simple`, creada desde `main` actualizado)

### Fase 0 — `fisico-revisor`: posiciones iniciales y reglas de texto (diseño, sin UI)
- Definir la tabla de **8 posiciones iniciales** (4 figuras × 2 fuentes) con q, x, y, z y tamaño por defecto, comprobando que ninguna cae en la zona de exclusión de la superficie ni a menos de la distancia mínima entre cargas (ver `RANGOS` en `constantes.ts` y las reglas de colocación del controlador). Propuesta de partida: Esfera R5 / Cubo L8 / Cilindro R4: carga en el origen (+3 µC); dipolo en x = ±2 (+3/−3 µC). Plano: carga y dipolo debajo del plano (z < 0, p. ej. z = −4; dipolo separado en x), con el lado por defecto que deje ver bien el contraste «abierta».
- Escribir el **Φ esperado** de cada una (cerradas: q_enc; plano: el valor de `calcularFlujo`, sin afirmar q/ε₀).
- Redactar las **reglas de los textos educativos por estado** que reemplazan a los 9 títulos, sin perder ninguna lección: cerrada con carga dentro (Φ = q/ε₀, no importa forma ni tamaño), carga fuera (entra = sale, Φ = 0), carga cruzando la superficie, dipolo dentro (Φ = 0 aunque el campo no es cero), dipolo con una carga fuera (Φ = ±q/ε₀), plano/abierta (no es Gauss), «Gauss como herramienta» (esfera centrada → |E| en la superficie), y sugerencias de acción («arrastra la carga fuera», «cambia el tamaño: Φ no cambia»). Títulos derivados, p. ej. «Esfera con una carga», «Cubo con un dipolo».
- Entregable: `docs-gauss/panel-simple-fisica.md` (tabla + reglas). Sin código.

### Fase 1 — `ingeniero-frontend`: modelo de estado
- Nuevo módulo puro `src/fisica/gauss3d/presets.ts`: `posicionInicial(forma, fuente)` con la tabla de la fase 0 (+ tests).
- `store/gauss3dStore.ts`: quitar `escenarioId`, `fuera`, `aplicarEscenario`, `estadoDeEscenario`, `anadirCarga`, `quitarCarga`; añadir `fuente: "carga" | "dipolo"`, `setFuente`, `recolocar`; `setForma` recoloca según `posicionInicial`; en dipolo `setQ` cambia las dos magnitudes (signos opuestos) y `alternarSigno` invierte ambas. Tipo `Fuente` exportado.
- `render/controladorGauss3d.ts` (~línea 380): la condición que compara `escenarioId`/`fuera` para decidir si reutiliza x, y debe pasar a comparar los ids de las cargas (los ids nuevos ya fuerzan recolocar). Cambio mínimo: no tocar arrastre, exclusión ni geometría.
- `src/fisica/gauss3d/escenarios.ts` **no se borra**: muchos tests de física/render (`dibujo`, `marcas`, `pasadas`, `sinAsignaciones`, `escenarios.test`) y el e2e lo usan como fixtures. Documentarlo en su cabecera como «casos de referencia para tests, no UI». No renombrar el tipo `Escenario` de `tipos.ts` (es la entrada del motor, no un escenario de UI).
- Actualizar `gauss3dStore.test.ts` y `controladorGauss3d.test.ts` (`aplicarEscenario(2)` → estado Esfera + Una carga; `aplicarEscenario(6)` → colocar la carga en z = 8 a mano).

### Fase 2 — `ingeniero-frontend`: panel
- Reescribir `ui/PanelGauss3D.tsx` según «Panel objetivo»: bloque Figura (renombrar etiqueta Parche → Plano, orden Esfera · Cubo · Cilindro · Plano, θ visible solo con Plano), bloque Fuente (segmentado con `role="radiogroup"` o botones `aria-pressed`), chips ±q en dipolo, «Recolocar». Quitar el bloque Escenarios y la prop `bajoEscenarios` (renombrarla a `bajoFuente` en `pages/LeyDeGauss.tsx`).
- `pages/LeyDeGauss.tsx`: la etiqueta de «Altura z» dice «carga +q / carga −q» en dipolo.
- `anunciar(...)`: mensajes para cambio de figura, de fuente y recolocar (región viva ya limitada; mantener).
- Reutilizar las clases CSS existentes; borrar las de `.gauss3d-escenarios`/`.gauss3d-escenario`/`.gauss3d-variante` si quedan sin uso.

### Fase 3 — `fisico-revisor` (diseña/revisa) + `ingeniero-frontend` (implementa): textos educativos
- `ui/textosGauss3D.ts`: `EntradaTexto` cambia `escenario: number` por `fuente: Fuente`; `textoEscenario` → `textoGauss` con título y «Qué mirar» derivados del estado según las reglas de la fase 0. Conservar `pasaCerrada`, `pasaParche`, `PORQUE_PARCHE` y toda frase ya verificada.
- `ui/RotuloGauss3D.tsx` y `anunciosGauss3D.ts`: dejar de leer `escenarioId`.
- `textosGauss3D.test.ts`: casos por (figura × fuente × dentro/fuera/cruzando).
- **Revisión obligatoria del `fisico-revisor`** de todos los textos y de la tabla de presets antes del commit.

### Fase 4 — `ingeniero-frontend`: tests y e2e
- `e2e/gauss.e2e.mjs`: sustituir el recorrido de los 9 botones por las 8 combinaciones figura × fuente (Φ y q_enc esperados de la fase 0) + los casos «carga fuera» (arrastre/x numérico), «dipolo con una carga fuera» y «cruza» (z de 8 a 0). Quitar la medición «cambio de escenario» o convertirla en «cambio de figura».
- `npm test`, `npm run build`, `npm run lint` en **Windows** (desde la VM Linux fallan por `node_modules`). Todo en verde antes de seguir.

### Fase 5 — `revisor-ui` (solo revisa)
- Revisar en 1568×726 (sala), tablet y 375 px de ancho: jerarquía (Figura → Fuente es lo primero que se ve), objetivos táctiles ≥ 44 px, «Cilindro» no se parte en dos líneas (hoy pasa en ancho medio), contraste, foco, lectores de pantalla (`aria-pressed`, anuncios) y que el panel cabe sin scroll interno en la vista de sala si es posible.
- Comparar con capturas del panel actual. Devolver lista de cambios; `ingeniero-frontend` los aplica.

### Fase 6 — `experto-vercel`
- Build de producción, rutas profundas, tamaño del bundle (debe bajar o quedar igual), preview del PR.
- Abrir PR `feat/gauss-panel-simple` → `main`. **No fusionar** sin mi autorización (push a `main` = producción).

No hacen falta `ingeniero-backend` ni `simulador-fisico-web` (no hay backend ni cambios de motor).

## Criterios de aceptación
- El panel muestra solo: Figura (4) + tamaño (+θ en Plano), Fuente (Una carga | Dipolo) + magnitud/signo/recolocar, Qué se muestra, Vista, Avanzado.
- Con cualquier figura cerrada y cualquier fuente, Φ mostrado = q_enc/ε₀; con Plano nunca se afirma q/ε₀.
- Todas las lecciones de los antiguos 9 escenarios siguen alcanzables arrastrando / cambiando figura, fuente o tamaño, y los textos las explican.
- Cero cambios en `src/render/gauss3d/*` y en la física salvo `presets.ts` (nuevo) y comentarios de `escenarios.ts`.
- Tests, build, lint y e2e en verde; revisión aprobada por `fisico-revisor` y `revisor-ui`.
- Al cerrar: actualizar la bóveda (sesión, estado, decisión `2026-10-08-gauss-panel-figura-fuente` si cambia algo de lo decidido, historial).
