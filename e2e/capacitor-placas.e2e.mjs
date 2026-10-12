/**
 * E2E de la estación 08 «Capacitor de placas» (/capacitor-de-placas) con Playwright.
 * Uso: `npm run test:e2e:capacitor`. NO forma parte de `npm test`.
 *
 * Servidor: reutiliza el que ya responde en http://localhost:5173 (o en la URL de `URL_E2E`); si no hay ninguno,
 * arranca uno con la API de Vite (`createServer`) y lo cierra con `server.close()`. Nunca mata procesos.
 * Navegador: usa el Chromium de Playwright; si la versión que pide el paquete no está instalada pero hay otro
 * Chromium en la caché de Playwright, usa ese. Si no hay ninguno, sale con código 2 y explica qué instalar.
 *
 * Qué comprueba:
 *   - Home: la tarjeta 08 existe y navega a /capacitor-de-placas; el título del documento es el de la estación;
 *   - en 390×844, 1024×768 y 1920×1080: carga sin errores ni avisos de consola, sin desplazamiento horizontal,
 *     objetivos táctiles ≥ 44 px y deslizadores con aria-valuetext; los 5 escenarios rápidos corren sin errores;
 *   - en 1024×768: cada dieléctrico × modo (conectado | aislado) con el hueco lleno da C, Q, V, E y U del
 *     contrato (calculados aquí de forma independiente con ε₀ y κ) y los cambios «×κ» / «÷κ» de la tabla;
 *   - límite por rigidez: con cada material, V al máximo y las placas acercadas con el teclado, la separación se
 *     detiene en d_mín = V/E_máx (o en 0,1 mm si V/E_máx es menor) y el medidor marca 100 %.
 * Capturas en capturas-capacitor/ (ignorada por git). Código de salida ≠ 0 si falla alguna comprobación.
 */
import { existsSync, mkdirSync, readdirSync } from "node:fs";
import { homedir } from "node:os";
import { resolve } from "node:path";
import { chromium } from "playwright";
import { createServer } from "vite";

const RAIZ = resolve(import.meta.dirname, "..");
const SALIDA = resolve(RAIZ, "capturas-capacitor");
const VIEWPORTS = [
  { n: "movil-390x844", w: 390, h: 844, dpr: 2 },
  { n: "tablet-1024x768", w: 1024, h: 768, dpr: 1 },
  { n: "sala-1920x1080", w: 1920, h: 1080, dpr: 1 },
];

// Copia INDEPENDIENTE de los valores del contrato (§5): si el catálogo del código cambia, este test lo detecta.
const EPS0 = 8.854e-12;
const K_AIRE = 1.00059;
const MATERIALES = [
  { nombre: "Aire (sin dieléctrico)", kappa: K_AIRE, eMax: 3e6, aire: true },
  { nombre: "Teflón", kappa: 2.1, eMax: 60e6 },
  { nombre: "Aceite de silicona", kappa: 2.5, eMax: 15e6 },
  { nombre: "Poliestireno", kappa: 2.56, eMax: 24e6 },
  { nombre: "Mylar (PET)", kappa: 3.2, eMax: 7e6 },
  { nombre: "PVC", kappa: 3.4, eMax: 40e6 },
  { nombre: "Papel", kappa: 3.7, eMax: 16e6 },
  { nombre: "Vidrio Pyrex", kappa: 5.6, eMax: 14e6 },
  { nombre: "Porcelana", kappa: 6, eMax: 12e6 },
  { nombre: "Neopreno", kappa: 6.7, eMax: 12e6 },
  { nombre: "Titanato de estroncio", kappa: 233, eMax: 8e6 },
];
const ESCENARIOS = [
  "Meter vidrio con la batería conectada",
  "Cargar, desconectar y meter vidrio",
  "Separar placas aislado",
  "Cerca de la ruptura del aire",
  "Titanato: κ = 233",
];
const A = 100e-4; // valores de arranque de la estación
const D = 1e-3;
const V0 = 100;

let fallos = 0;
let comprobaciones = 0;
const ok = (cond, msg) => {
  comprobaciones++;
  if (!cond) {
    fallos++;
    console.log(`  FALLO: ${msg}`);
  }
};
const casi = (a, b, tol = 0.012) => Math.abs(a - b) <= tol * Math.abs(b);

const PREFIJOS = { p: 1e-12, n: 1e-9, "µ": 1e-6, "μ": 1e-6, m: 1e-3, "": 1, k: 1e3, M: 1e6 };
/** «88,6 pF» → 8.86e-11. Devuelve NaN si no reconoce el formato. */
function leerSI(texto) {
  const m = /^\s*([−-]?[\d.,]+)\s*([pnµmkM]?)(F|C|V\/m|V|J)\b/.exec(texto);
  if (!m) return NaN;
  return Number(m[1].replace("−", "-").replace(",", ".")) * PREFIJOS[m[2]];
}

/** «933 µm» o «1 mm» → metros. */
function leerMetros(texto) {
  const m = /^\s*([\d.,]+)\s*([µμm]?)m\b/.exec(texto);
  return m ? Number(m[1].replace(",", ".")) * ({ "µ": 1e-6, "μ": 1e-6, m: 1e-3, "": 1 }[m[2]]) : NaN;
}

async function responde(url) {
  try {
    return (await fetch(url)).ok;
  } catch {
    return false;
  }
}

async function servidor() {
  const candidata = process.env.URL_E2E ?? "http://localhost:5173";
  if (await responde(candidata)) return { base: candidata.replace(/\/$/, ""), cerrar: async () => {} };
  const s = await createServer({ root: RAIZ, logLevel: "error", server: { port: 5189, strictPort: true } });
  await s.listen();
  return { base: "http://localhost:5189", cerrar: () => s.close() };
}

/** Chromium de Playwright; si falta la versión exacta, usa otro de la caché; si no hay, explica y sale con 2. */
async function lanzar() {
  try {
    return await chromium.launch();
  } catch (e) {
    const cache =
      process.env.PLAYWRIGHT_BROWSERS_PATH ??
      (process.platform === "win32"
        ? resolve(process.env.LOCALAPPDATA ?? homedir(), "ms-playwright")
        : resolve(homedir(), process.platform === "darwin" ? "Library/Caches/ms-playwright" : ".cache/ms-playwright"));
    if (existsSync(cache)) {
      for (const dir of readdirSync(cache).filter((d) => d.startsWith("chromium")).sort().reverse()) {
        const candidatos = [
          resolve(cache, dir, "chrome-headless-shell-win64", "chrome-headless-shell.exe"),
          resolve(cache, dir, "chrome-win64", "chrome.exe"),
          resolve(cache, dir, "chrome-linux", "chrome"),
          resolve(cache, dir, "chrome-headless-shell-linux64", "chrome-headless-shell"),
        ];
        const exe = candidatos.find((c) => existsSync(c));
        if (exe) {
          console.log(`Usando el Chromium de la caché: ${exe}`);
          return chromium.launch({ executablePath: exe });
        }
      }
    }
    console.error(`No hay Chromium instalado para Playwright (${String(e.message).split("\n")[0]}).`);
    console.error("Instálalo con:  npx playwright install chromium   y vuelve a correr el e2e.");
    process.exit(2);
  }
}

function vigilar(page) {
  const errores = [];
  page.on("console", (m) => {
    if (m.type() === "error" || m.type() === "warning") errores.push(`${m.type()}: ${m.text()}`);
  });
  page.on("pageerror", (e) => errores.push(`pageerror: ${e.message}`));
  return errores;
}

const sinScrollHorizontal = (page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);

async function nuevaPagina(browser, base, vp) {
  const ctx = await browser.newContext({ viewport: { width: vp.w, height: vp.h }, deviceScaleFactor: vp.dpr });
  const page = await ctx.newPage();
  const errores = vigilar(page);
  await page.goto(`${base}/capacitor-de-placas`);
  await page.locator("canvas.capacitor-lienzo").waitFor({ state: "visible", timeout: 10000 });
  return { ctx, page, errores };
}

async function pruebaHome(browser, base, vp) {
  const ctx = await browser.newContext({ viewport: { width: vp.w, height: vp.h }, deviceScaleFactor: vp.dpr });
  const page = await ctx.newPage();
  const errores = vigilar(page);
  await page.goto(`${base}/`);
  const tarjeta = page.locator("a.estacion", { has: page.locator('.estacion-numero:text-is("08")') });
  ok((await tarjeta.count()) === 1, `Home ${vp.n}: tarjeta 08`);
  ok((await page.locator("a.estacion").count()) === 8, `Home ${vp.n}: 8 tarjetas`);
  ok(/mete un aislante/i.test(await tarjeta.innerText()), `Home ${vp.n}: etiqueta «Mete un aislante»`);
  await tarjeta.scrollIntoViewIfNeeded();
  await tarjeta.click();
  await page.waitForURL("**/capacitor-de-placas");
  await page.locator("canvas.capacitor-lienzo").waitFor({ state: "visible", timeout: 10000 });
  ok((await page.title()) === "Capacitor de placas · ExpoFísica", `título del documento: ${await page.title()}`);
  ok(await sinScrollHorizontal(page), `Home ${vp.n}: sin scroll horizontal`);
  ok(errores.length === 0, `Home ${vp.n} sin errores de consola: ${errores.join(" | ")}`);
  await ctx.close();
}

async function pruebaViewport(browser, base, vp) {
  const { ctx, page, errores } = await nuevaPagina(browser, base, vp);
  ok(await sinScrollHorizontal(page), `${vp.n}: sin scroll horizontal al cargar`);
  const pequenos = await page.evaluate(() => {
    const salida = [];
    for (const el of document.querySelectorAll("main button, main a, main label.opcion-dielectrico, main input[type=range]")) {
      const r = el.getBoundingClientRect();
      if (r.width && r.height && (r.height < 44 || r.width < 44)) salida.push(`${el.tagName}.${el.className} ${Math.round(r.width)}x${Math.round(r.height)}`);
    }
    return salida;
  });
  ok(pequenos.length === 0, `${vp.n}: objetivos táctiles ≥ 44 px (${pequenos.join("; ")})`);
  const sinTexto = await page.evaluate(
    () => [...document.querySelectorAll("input[type=range]")].filter((i) => !i.getAttribute("aria-valuetext")).length,
  );
  ok(sinTexto === 0, `${vp.n}: todos los deslizadores con aria-valuetext`);
  ok((await page.locator("table.tabla-capacitor-placas tbody tr").count()) >= 7, `${vp.n}: tabla con las 7 magnitudes`);
  await page.screenshot({ path: resolve(SALIDA, `inicio-${vp.n}.png`), fullPage: true });

  for (const nombre of ESCENARIOS) {
    await page.getByRole("button", { name: nombre, exact: true }).click();
    await page.waitForTimeout(250);
    ok(await sinScrollHorizontal(page), `${vp.n}: «${nombre}» sin scroll horizontal`);
  }
  await page.screenshot({ path: resolve(SALIDA, `escenarios-${vp.n}.png`), fullPage: true });
  ok(errores.length === 0, `${vp.n} sin errores de consola: ${errores.join(" | ")}`);
  await ctx.close();
}

/** Lee la columna «Actual» de la fila cuyo encabezado contiene `fila`. */
async function leerFila(page, fila) {
  const f = page.locator("table.tabla-capacitor-placas tbody tr", { has: page.locator("th", { hasText: fila }) });
  const celdas = f.locator("td");
  return { actual: await celdas.nth(1).innerText(), cambio: await celdas.nth(2).innerText() };
}

async function llenarHueco(page) {
  const f = page.getByRole("slider", { name: "Cuánto entra el dieléctrico" });
  await f.focus();
  await page.keyboard.press("End");
  await page.waitForTimeout(80);
}

async function valoresPorMaterialYModo(browser, base, vp) {
  const { ctx, page, errores } = await nuevaPagina(browser, base, vp);
  for (const modo of ["Conectado", "Aislado"]) {
    for (const m of MATERIALES) {
      const etiqueta = `${modo} · ${m.nombre}`;
      await page.getByRole("button", { name: "Volver a empezar", exact: true }).click();
      if (modo === "Aislado") await page.getByRole("radio", { name: "Aislado", exact: true }).click();
      await page.locator("label.opcion-dielectrico", { hasText: m.nombre }).click();
      if (!m.aire) await llenarHueco(page);
      await page.waitForTimeout(120);

      // Valores esperados del contrato, calculados aquí.
      const C = (m.kappa * EPS0 * A) / D;
      const Q0 = ((K_AIRE * EPS0 * A) / D) * V0; // carga con aire a 100 V
      const esp =
        modo === "Conectado"
          ? { C, Q: C * V0, V: V0, E: V0 / D, U: 0.5 * C * V0 * V0 }
          : { C, Q: Q0, V: Q0 / C, E: Q0 / C / D, U: (Q0 * Q0) / (2 * C) };
      for (const [fila, clave] of [
        ["C · capacitancia", "C"],
        ["Q · carga", "Q"],
        ["V · tensión", "V"],
        ["E · campo", "E"],
        ["U · energía", "U"],
      ]) {
        const { actual } = await leerFila(page, fila);
        const valor = leerSI(actual);
        ok(casi(valor, esp[clave]), `${etiqueta}: ${clave} = ${actual} (esperado ${esp[clave].toPrecision(3)})`);
      }

      // Cambios contra la referencia con aire.
      const c = await leerFila(page, "C · capacitancia");
      const v = await leerFila(page, "V · tensión");
      const q = await leerFila(page, "Q · carga");
      if (m.aire) {
        ok(/igual/.test(c.cambio) && /igual/.test(v.cambio), `${etiqueta}: sin dieléctrico todo «igual»`);
      } else if (modo === "Conectado") {
        ok(/↑ ×/.test(c.cambio) && /\(= κ\)/.test(c.cambio), `${etiqueta}: C sube ×κ (${c.cambio})`);
        ok(/↑ ×/.test(q.cambio) && /\(= κ\)/.test(q.cambio), `${etiqueta}: Q sube ×κ (${q.cambio})`);
        ok(/igual/.test(v.cambio), `${etiqueta}: V igual (${v.cambio})`);
      } else {
        ok(/↑ ×/.test(c.cambio) && /\(= κ\)/.test(c.cambio), `${etiqueta}: C sube ×κ (${c.cambio})`);
        ok(/↓ ÷/.test(v.cambio) && /\(= 1\/κ\)/.test(v.cambio), `${etiqueta}: V baja ÷κ (${v.cambio})`);
        ok(/igual/.test(q.cambio), `${etiqueta}: Q igual (${q.cambio})`);
      }
    }
  }
  await page.screenshot({ path: resolve(SALIDA, `valores-${vp.n}.png`), fullPage: true });
  ok(errores.length === 0, `valores ${vp.n} sin errores de consola: ${errores.join(" | ")}`);
  await ctx.close();
}

async function limitePorRigidez(browser, base, vp) {
  const { ctx, page, errores } = await nuevaPagina(browser, base, vp);
  for (const m of MATERIALES) {
    await page.getByRole("button", { name: "Volver a empezar", exact: true }).click();
    await page.locator("label.opcion-dielectrico", { hasText: m.nombre }).click();
    if (!m.aire) await llenarHueco(page);
    // V al máximo que permite el material a 1 mm (con el hueco lleno) y tope de la sala.
    const v = page.getByRole("slider", { name: "Voltaje de la batería" });
    await v.focus();
    await page.keyboard.press("End");
    await page.waitForTimeout(80);
    const lienzo = page.locator("canvas.capacitor-lienzo");
    await lienzo.focus();
    for (let i = 0; i < 40; i++) await page.keyboard.press("ArrowDown"); // acerca (÷1,12 cada vez)
    await page.waitForTimeout(100);
    const et = await lienzo.getAttribute("aria-label");
    const dTxt = /separación ([\d,.]+ ?[µμm]?m)/.exec(et)?.[1] ?? "";
    const vTxt = /tensión ([\d,.]+ ?[kM]?V)/.exec(et)?.[1] ?? "";
    const dMed = leerMetros(dTxt);
    const vMed = leerSI(vTxt);
    const dMin = Math.max(1e-4, vMed / m.eMax);
    ok(casi(dMed, dMin, 0.02), `límite ${m.nombre}: d = ${dTxt} (esperado ${(dMin * 1e3).toPrecision(3)} mm con V = ${vTxt})`);
    const pct = /al (\d+) % de la rigidez/.exec(et)?.[1];
    if (dMin > 1e-4 * 1.0001) ok(pct === "100", `límite ${m.nombre}: medidor en 100 % (${pct} %)`);
  }
  ok(errores.length === 0, `límite ${vp.n} sin errores de consola: ${errores.join(" | ")}`);
  await ctx.close();
}

mkdirSync(SALIDA, { recursive: true });
const { base, cerrar } = await servidor();
console.log(`E2E capacitor de placas contra ${base}`);
const browser = await lanzar();
try {
  for (const vp of VIEWPORTS) {
    const antes = fallos;
    await pruebaHome(browser, base, vp);
    await pruebaViewport(browser, base, vp);
    console.log(`${vp.n}: ${fallos === antes ? "ok" : `${fallos - antes} fallo(s)`}`);
  }
  const tablet = VIEWPORTS[1];
  let antes = fallos;
  await valoresPorMaterialYModo(browser, base, tablet);
  console.log(`valores por dieléctrico × modo: ${fallos === antes ? "ok" : `${fallos - antes} fallo(s)`}`);
  antes = fallos;
  await limitePorRigidez(browser, base, tablet);
  console.log(`límite por rigidez: ${fallos === antes ? "ok" : `${fallos - antes} fallo(s)`}`);
} finally {
  await browser.close();
  await cerrar();
}
console.log(`${comprobaciones} comprobaciones, ${fallos} fallo(s)`);
process.exit(fallos ? 1 : 0);
