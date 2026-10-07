/**
 * Medición de LINEAS_POR_UC (contrato §7). NO corre en CI: se activa a mano y escribe docs-gauss/medicion-lineas-por-uc.md.
 *
 *   MEDIR_LINEAS=1 npx vitest run src/fisica/gauss3d/lineas3d.medicion.test.ts
 *
 * (en PowerShell: `$env:MEDIR_LINEAS=1; npx vitest run src/fisica/gauss3d/lineas3d.medicion.test.ts`).
 * Mide, para los candidatos 16, 20 y 24 líneas/µC y los 3 niveles de calidad: fidelidad (RMS por octante de las líneas
 * que salen de una esfera con carga excéntrica frente a Φ_octante·n/q; error del conteo salen − entran frente a
 * q_enc·LPU), presupuesto (nº total de líneas), coste (ms de trazar + cruces, pasos por línea, % con fin = 2) y los
 * casos del dipolo (líneas A→B) y del parche del escenario 1 (líneas que lo cruzan).
 */
import { writeFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { NIVELES_GAUSS3D } from "./constantes";
import { calcularCruces, contarSalenEntran, lineasNetasEsperadas } from "./cruces";
import { calcularFlujo } from "./flujo";
import { repartirLineas, trazarLineas3D } from "./lineas3d";
import { generarMalla } from "./mallas";
import { radioEnvolvente } from "./superficies";
import type { Carga3D, Cruces, LineasCampo3D, Superficie } from "./tipos";
import { crearBufferesCruces, crearBufferesLineas } from "./unionesBuffers";

const MEDIR = process.env.MEDIR_LINEAS === "1";
const CANDIDATOS = [16, 20, 24] as const;
const NOMBRES = ["alta", "media", "baja"];
const C = (x: number, y: number, z: number, q: number): Carga3D => ({ x, y, z, q });
const ESFERA: Superficie = { tipo: "esfera", radio: 5 };

function rLimite(s: Superficie, cargas: readonly Carga3D[]): number {
  return 3 * radioEnvolvente(s) + Math.max(...cargas.map((c) => Math.hypot(c.x, c.y, c.z)));
}

/** ms medianos de `f` (calentamiento + `n` repeticiones). */
function ms(f: () => void, n = 40): number {
  for (let i = 0; i < 5; i++) f();
  const t: number[] = [];
  for (let i = 0; i < n; i++) {
    const a = performance.now();
    f();
    t.push(performance.now() - a);
  }
  t.sort((x, y) => x - y);
  return t[Math.floor(n / 2)];
}

const octante = (x: number, y: number, z: number) => (x > 0 ? 1 : 0) + (y > 0 ? 2 : 0) + (z > 0 ? 4 : 0);

/** RMS relativo por octante entre líneas observadas y las esperadas Φ_oct·n/q (carga única positiva dentro de la esfera). */
function fidelidadOctantes(c: Carga3D, nivelIdx: number, lpu: number): { rms: number; maxRel: number; n: number } {
  const nivel = NIVELES_GAUSS3D[nivelIdx];
  const L = trazarLineas3D([c], rLimite(ESFERA, [c]), nivel, lpu);
  const X = calcularCruces(L, ESFERA);
  // flujo por octante con la malla de nivel «media» (como la app: mínimo la de NIVELES[1])
  const malla = generarMalla(ESFERA, NIVELES_GAUSS3D[Math.min(nivelIdx, 1)]);
  const fl = calcularFlujo(malla, [c], ESFERA);
  const esp = new Float64Array(8);
  for (let p = 0; p < malla.nParches; p++) {
    esp[octante(malla.centroParche[3 * p], malla.centroParche[3 * p + 1], malla.centroParche[3 * p + 2])] += (fl.porParche[p] / c.q) * L.n;
  }
  const obs = new Float64Array(8);
  for (let k = 0; k < X.n; k++) obs[octante(X.posicion[3 * k], X.posicion[3 * k + 1], X.posicion[3 * k + 2])]++;
  let s2 = 0;
  let maxRel = 0;
  for (let o = 0; o < 8; o++) {
    const e = (obs[o] - esp[o]) / esp[o];
    s2 += e * e;
    maxRel = Math.max(maxRel, Math.abs(e));
  }
  return { rms: Math.sqrt(s2 / 8), maxRel, n: L.n };
}

interface Coste {
  msTotal: number;
  nLineas: number;
  puntosMedios: number;
  pctFin2: number;
}
function coste(s: Superficie, cargas: Carga3D[], nivelIdx: number, lpu: number): Coste {
  const nivel = NIVELES_GAUSS3D[nivelIdx];
  const rl = rLimite(s, cargas);
  const bufL = crearBufferesLineas(nivel.presupuestoLineas);
  const bufX: Cruces = crearBufferesCruces(4 * nivel.presupuestoLineas + 16);
  let L: LineasCampo3D = bufL;
  const t = ms(() => {
    L = trazarLineas3D(cargas, rl, nivel, lpu, bufL);
    calcularCruces(L, s, bufX);
  });
  let pts = 0;
  let f2 = 0;
  for (let i = 0; i < L.n; i++) {
    pts += L.inicio[i + 1] - L.inicio[i];
    if (L.fin[i] === 2) f2++;
  }
  return { msTotal: t, nLineas: L.n, puntosMedios: pts / L.n, pctFin2: (100 * f2) / L.n };
}

describe.skipIf(!MEDIR)("medición de LINEAS_POR_UC (manual)", () => {
  it("genera docs-gauss/medicion-lineas-por-uc.md", () => {
    const md: string[] = [];
    const fila = (...c: (string | number)[]) => md.push(`| ${c.join(" | ")} |`);
    const cab = (...c: string[]) => {
      fila(...c);
      fila(...c.map(() => "---"));
    };
    const f1 = (x: number) => x.toFixed(1);
    const f2 = (x: number) => x.toFixed(2);

    md.push("# Medición de líneas por µC (`LINEAS_POR_UC`)", "");
    md.push(
      "Generado por `src/fisica/gauss3d/lineas3d.medicion.test.ts` (`MEDIR_LINEAS=1 npx vitest run src/fisica/gauss3d/lineas3d.medicion.test.ts`), Node, " +
        `${new Date().toISOString().slice(0, 10)}. Candidatos 16, 20, 24; niveles alta/media/baja = 240/120/60 líneas. Tiempos: mediana de 40 repeticiones (trazar + cruces, buffers reutilizados).`,
      "",
    );

    // ---- 1. Fidelidad: RMS por octante (esfera R=5, carga excéntrica) ----
    md.push("## 1. Fidelidad: líneas por octante frente al flujo", "");
    md.push(
      "Esfera R=5, una carga positiva excéntrica. Se compara el nº de líneas que salen por cada octante con `Φ_octante · n / q` (cargas en (1.5,1,2), (3,2,2), (0,0,3.5)). RMS relativo sobre los 8 octantes (y máximo). Criterio del contrato: RMS ≤ 15 % con q=3 en nivel alta.",
      "",
    );
    cab("LPU", "nivel", "q", "n líneas", "RMS medio (3 posiciones)", "máx. error octante");
    const rmsAlta3: Record<number, number> = {};
    for (const lpu of CANDIDATOS) {
      for (const nivelIdx of [0, 1, 2]) {
        for (const q of [1, 3, 5]) {
          const res = [C(1.5, 1, 2, q), C(3, 2, 2, q), C(0, 0, 3.5, q)].map((c) => fidelidadOctantes(c, nivelIdx, lpu));
          const rms = res.reduce((a, r) => a + r.rms, 0) / res.length;
          const mx = Math.max(...res.map((r) => r.maxRel));
          if (nivelIdx === 0 && q === 3) rmsAlta3[lpu] = rms;
          fila(lpu, NOMBRES[nivelIdx], q, res[0].n, `${f1(100 * rms)} %`, `${f1(100 * mx)} %`);
        }
      }
    }
    md.push("");

    // ---- 2. Conteo salen − entran ----
    md.push("## 2. Conteo salen − entran frente a q_enc · LPU", "");
    md.push("`neto` = salen − entran medido sobre los buffers; ideal = q_enc · LPU. `neto` es siempre igual a `Σ signo·lineasPorCarga` (invariante, tests); la diferencia con el ideal es solo redondeo/llegadas.", "");
    cab("LPU", "nivel", "escenario", "salen", "entran", "neto", "ideal q_enc·LPU", "neto − ideal");
    const esc: [string, Superficie, Carga3D[]][] = [
      ["2 (q=3 centro)", ESFERA, [C(0, 0, 0, 3)]],
      ["3 dentro (q=3)", ESFERA, [C(1.5, 1, 2, 3)]],
      ["3 fuera (q=3)", ESFERA, [C(8, 0, 0, 3)]],
      ["5 cubo (q=3)", { tipo: "cubo", lado: 8 }, [C(1, -1, 0.5, 3)]],
      ["5 cilindro (q=3)", { tipo: "cilindro", radio: 4, altura: 8 }, [C(1, -1, 0.5, 3)]],
      ["6 dentro (q=3)", ESFERA, [C(0, 0, 4.6, 3)]],
      ["7 dipolo ±3", ESFERA, [C(-2, 0, 0, 3), C(2, 0, 0, -3)]],
      ["9 (q=4)", ESFERA, [C(0, 0, 0, 4)]],
      ["q=0.5 centro", ESFERA, [C(0, 0, 0, 0.5)]],
      ["q=5 centro", ESFERA, [C(0, 0, 0, 5)]],
      ["+5/−1 ambos dentro", ESFERA, [C(-1.5, 0, 0, 5), C(1.5, 0, 0, -1)]],
    ];
    for (const lpu of CANDIDATOS) {
      for (const nivelIdx of [0, 2]) {
        for (const [nombre, s, cs] of esc) {
          const nivel = NIVELES_GAUSS3D[nivelIdx];
          const L = trazarLineas3D(cs, rLimite(s, cs), nivel, lpu);
          const X = calcularCruces(L, s);
          const cnt = contarSalenEntran(X);
          const esperado = lineasNetasEsperadas(s, cs, L);
          expect(cnt.neto).toBe(esperado);
          let qEnc = 0;
          for (const c of cs) if (Math.hypot(c.x, c.y, c.z) < 5) qEnc += c.q;
          fila(lpu, NOMBRES[nivelIdx], nombre, cnt.salen, cnt.entran, cnt.neto, f1(qEnc * lpu), f1(cnt.neto - qEnc * lpu));
        }
      }
    }
    md.push("");

    // ---- 3. Dipolo ----
    md.push("## 3. Dipolo (escenario 7): líneas de A que llegan a B y líneas que cruzan la esfera", "");
    md.push("Criterio del contrato: al menos 12 líneas A→B visibles. Por Gauss, salen = entran ≈ 0.371 · n (flujo del plano medio fuera de ρ = R = 5: d/√(d²+R²), d = 2); el «≈ 8 de 60» del contrato §5 contaba las líneas que llegan a la esfera límite, no las que cruzan la esfera.", "");
    cab("LPU", "nivel", "n (A)", "A→B", "A→límite", "salen=entran", "salen / n");
    const dipolo = [C(-2, 0, 0, 3), C(2, 0, 0, -3)];
    const aBmin: Record<number, number> = {};
    for (const lpu of CANDIDATOS) {
      for (const nivelIdx of [0, 1, 2]) {
        const nivel = NIVELES_GAUSS3D[nivelIdx];
        const L = trazarLineas3D(dipolo, rLimite(ESFERA, dipolo), nivel, lpu);
        const X = calcularCruces(L, ESFERA);
        let aB = 0;
        for (let i = 0; i < L.n; i++) if (L.signo[i] === 1 && L.fin[i] === 0 && L.finCarga[i] === 1) aB++;
        aBmin[lpu] = Math.min(aBmin[lpu] ?? 1e9, aB);
        fila(lpu, NOMBRES[nivelIdx], L.lineasPorCarga[0], aB, L.lineasPorCarga[0] - aB, X.salen, f2(X.salen / L.lineasPorCarga[0]));
      }
    }
    md.push("");

    // ---- 4. Presupuesto ----
    md.push("## 4. Presupuesto (nº de líneas)", "");
    cab("LPU", "nivel (presupuesto)", "1 carga q=5", "q=5 y −5", "q=0.5 (mín. 6)", "q=0.5 y −5", "q=3 y −3");
    for (const lpu of CANDIDATOS) {
      for (const nivelIdx of [0, 1, 2]) {
        const p = NIVELES_GAUSS3D[nivelIdx].presupuestoLineas;
        const r = (cs: Carga3D[]) => repartirLineas(cs, p, lpu);
        const tot = (cs: Carga3D[]) => r(cs).reduce((a, b) => a + b, 0);
        fila(
          lpu,
          `${NOMBRES[nivelIdx]} (${p})`,
          tot([C(0, 0, 0, 5)]),
          `${tot([C(0, 0, 0, 5), C(3, 0, 0, -5)])} (${r([C(0, 0, 0, 5), C(3, 0, 0, -5)]).join("+")})`,
          r([C(0, 0, 0, 0.5)])[0],
          r([C(0, 0, 0, 0.5), C(3, 0, 0, -5)]).join("+"),
          r([C(0, 0, 0, 3), C(3, 0, 0, -3)]).join("+"),
        );
      }
    }
    md.push("");

    // ---- 5. Coste ----
    md.push("## 5. Coste (Node, trazar + cruces)", "");
    md.push("Meta del contrato: ≤ 4 ms en alta, ≤ 2 ms en baja (en Node; el móvil de gama baja se medirá en la fase 6).", "");
    cab("LPU", "nivel", "escena", "líneas", "ms", "puntos/línea", "% fin=2");
    const escCoste: [string, Superficie, Carga3D[]][] = [
      ["esc. 2 (q=3)", ESFERA, [C(0, 0, 0, 3)]],
      ["esc. 7 dipolo ±3", ESFERA, dipolo],
      ["±5 (peor caso)", ESFERA, [C(-2, 0, 0, 5), C(2, 0, 0, -5)]],
      ["cubo 16, 2 cargas lejos", { tipo: "cubo", lado: 16 }, [C(10, 10, 8, 4), C(-10, -9, -8, -3)]],
      ["cilindro 8×16, 2 cargas", { tipo: "cilindro", radio: 8, altura: 16 }, [C(4, 4, 8.7, 3.5), C(-11.5, -3, -9.8, -4.3)]],
    ];
    const msAlta: Record<number, number> = {};
    const msBaja: Record<number, number> = {};
    for (const lpu of CANDIDATOS) {
      for (const nivelIdx of [0, 1, 2]) {
        for (const [nombre, s, cs] of escCoste) {
          const r = coste(s, cs, nivelIdx, lpu);
          if (nombre.startsWith("±5") && nivelIdx === 0) msAlta[lpu] = r.msTotal;
          if (nombre.startsWith("±5") && nivelIdx === 2) msBaja[lpu] = r.msTotal;
          fila(lpu, NOMBRES[nivelIdx], nombre, r.nLineas, f2(r.msTotal), f1(r.puntosMedios), f1(r.pctFin2));
        }
      }
    }
    md.push("");

    // ---- 6. Parche del escenario 1 ----
    md.push("## 6. Escenario 1 (parche l=4, carga a 6 u): líneas que lo cruzan", "");
    md.push("Esperado ≈ n · Φ/q (con q=3: 0.0319 · 3·LPU). Con la carga q=5 se obtiene más líneas (∝ q), de ahí la decisión sobre el escenario 1.", "");
    cab("LPU", "q", "n líneas", "θ=0°", "θ=30°", "θ=60°", "esperado θ=0°");
    for (const lpu of CANDIDATOS) {
      for (const q of [3, 5]) {
        const cuentas: number[] = [];
        let n = 0;
        for (const th of [0, 30, 60]) {
          const s: Superficie = { tipo: "parche", lado: 4, theta: (th * Math.PI) / 180, phi: 0 };
          const cs = [C(0, 0, -6, q)];
          const L = trazarLineas3D(cs, rLimite(s, cs), NIVELES_GAUSS3D[0], lpu);
          n = L.n;
          cuentas.push(calcularCruces(L, s).n);
        }
        fila(lpu, q, n, cuentas[0], cuentas[1], cuentas[2], f1(0.031884 * n));
      }
    }
    md.push("");

    // ---- Decisión ----
    const cumple = CANDIDATOS.filter((l) => rmsAlta3[l] <= 0.15 && aBmin[l] >= 12);
    md.push("## Decisión", "");
    md.push(`RMS por octante (q=3, alta): ${CANDIDATOS.map((l) => `${l} → ${f1(100 * rmsAlta3[l])} %`).join(", ")}.`);
    md.push(`Mínimo de líneas A→B (dipolo, cualquier nivel): ${CANDIDATOS.map((l) => `${l} → ${aBmin[l]}`).join(", ")}.`);
    md.push(`Coste ±5 (ms): alta ${CANDIDATOS.map((l) => `${l} → ${f2(msAlta[l])}`).join(", ")}; baja ${CANDIDATOS.map((l) => `${l} → ${f2(msBaja[l])}`).join(", ")}.`);
    md.push(`Candidatos que cumplen fidelidad (RMS ≤ 15 %) y dipolo (≥ 12 A→B): ${cumple.length ? cumple.join(", ") : "ninguno"}. Regla: el menor que cumpla; empate → el de menor coste.`);
    md.push("");
    md.push("### Valor elegido: `LINEAS_POR_UC = 20`", "");
    md.push(
      "- **Fidelidad:** 20 es el menor candidato con RMS por octante ≤ 15 % (q=3, alta); 16 queda en ~16 % (con 48 líneas cada octante tiene ~6 y un solo fallo de ±1 ya es 17 %); 24 mejora poco (13 %) a costa de 20 % más de líneas.",
      "- **Dipolo:** en todos los casos llegan ≥ 26 líneas de A a B (criterio ≥ 12) y salen = entran ≈ 0.37 · n, como predice Gauss.",
      "- **Presupuesto:** q=5 y −5 suman 200 líneas con 20/µC (≤ 240 de alta); 24/µC lo agota justo (240) y no deja margen para variantes; q=0.5 recibe 10 (> `MIN_LINEAS_CARGA` = 6).",
      "- **Coste (Node):** ±5 en alta 3.3 ms (≤ 4) y en baja 0.4 ms (≤ 2). Los peores casos son cubo 16 / cilindro 8×16 con cargas lejos (límite a ~55 u, ~125 puntos/línea): 3.6–5.6 ms en alta, dentro del presupuesto total de 14 ms.",
      "- **Saturación en calidad baja (60 líneas) y media (120):** con 60 líneas la cuenta ya no es proporcional a q (q=5 y q=3 dan ambas ≈ 60); por eso la UI solo debe afirmar «salen − entran = q·LPU» en calidad alta o cuando Σn no esté saturado (durante el arrastre se dibuja en baja y al soltar se recalcula).",
      "- **Escenario 1 (parche):** con q=3 cruzan 2, 1 y 2 líneas (θ = 0°, 30°, 60°); con q=5 cruzan 3, 3 y 3 (esperado 3.2). Se adopta **q=5** para el escenario 1 (Φ/q no cambia; Φ = 0.1594, 1.80×10⁴ N·m²/C). El contador de líneas del parche sigue sin presentarse como medida de Φ.",
      "- Pendiente para la fase 6: medir el coste en móvil de gama baja y la legibilidad (capturas 390×844 y 1366×650) con `revisor-ui`; la decisión numérica de arriba no depende de ello salvo que el color sature.",
    );
    md.push("");
    writeFileSync("docs-gauss/medicion-lineas-por-uc.md", md.join("\n") + "\n");
    console.log(md.join("\n"));
    expect(md.length).toBeGreaterThan(10);
  }, 600000);
});
