/**
 * E2E de las estaciones de circuitos E6 «Resistencias» (/resistencias) y E7 «Capacitores» (/capacitores) con
 * Playwright. Uso: `npm run test:e2e:circuitos`. NO forma parte de `npm test`.
 *
 * Servidor: reutiliza el que ya responde en http://localhost:5173 (o en la URL de `URL_E2E`); si no hay ninguno,
 * arranca uno con la API de Vite (`createServer`) y lo cierra con `server.close()`. Nunca mata procesos.
 *
 * Qué comprueba en 1920×1080, 1366×768, 1024×768, 768×1024 y 390×844:
 *   - Home: las tarjetas 06 y 07 existen y navegan a su ruta; /campo-fijo y /dipolos redirigen;
 *   - cada ruta carga sin errores ni avisos de consola y sin desplazamiento horizontal;
 *   - E6: los 7 presets × vista (corriente convencional | electrones): tabla con una fila por resistor, totales
 *     con valor, lienzo presente; reducción paso a paso (y el puente «no se reduce»); sonda; cambio de preset;
 *   - E7: los 5 presets × interruptor (cargar | descargar) × vista: rótulo del tiempo dilatado, rótulo
 *     «I (sentido invertido)» al descargar, tabla con Rc + capacitores, reducción a C_eq, sonda,
 *     «Volver a empezar» (0 V) y aviso de reinicio al editar la red;
 *   - en pantallas anchas (≥ 900×560) los totales quedan dentro de la ventana sin desplazar la página.
 * Capturas en capturas-circuitos/ (ignorada por git si está en .gitignore; no se versiona).
 * Código de salida ≠ 0 si falla alguna comprobación.
 */
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { chromium } from "playwright";
import { createServer } from "vite";

const RAIZ = resolve(import.meta.dirname, "..");
const SALIDA = resolve(RAIZ, "capturas-circuitos");
const VIEWPORTS = [
  { n: "sala-1920x1080", w: 1920, h: 1080, dpr: 1 },
  { n: "pc-1366x768", w: 1366, h: 768, dpr: 1 },
  { n: "tablet-1024x768", w: 1024, h: 768, dpr: 1 },
  { n: "tablet-v-768x1024", w: 768, h: 1024, dpr: 1 },
  { n: "movil-390x844", w: 390, h: 844, dpr: 2 },
];
const PRESETS_E6 = [
  { nombre: "3 en serie", hojas: 3 },
  { nombre: "3 en paralelo", hojas: 3 },
  { nombre: "Serie + paralelo", hojas: 3 },
  { nombre: "Escalera R-2R", hojas: 5 },
  { nombre: "Mixto de 6", hojas: 6 },
  { nombre: "Puente equilibrado", hojas: 5 },
  { nombre: "Puente desequilibrado", hojas: 5 },
];
const PRESETS_E7 = [
  { nombre: "3 en serie", hojas: 3 },
  { nombre: "3 en paralelo", hojas: 3 },
  { nombre: "Serie + paralelo", hojas: 3 },
  { nombre: "Escalera", hojas: 5 },
  { nombre: "Mixto de 6", hojas: 6 },
];

let fallos = 0;
let comprobaciones = 0;
const ok = (cond, msg) => {
  comprobaciones++;
  if (!cond) {
    fallos++;
    console.log(`  FALLO: ${msg}`);
  }
};

async function responde(url) {
  try {
    const r = await fetch(url);
    return r.ok;
  } catch {
    return false;
  }
}

/** Devuelve la URL base y una función para cerrar lo que se haya arrancado (nada, si se reutilizó). */
async function servidor() {
  const candidata = process.env.URL_E2E ?? "http://localhost:5173";
  if (await responde(candidata)) return { base: candidata, cerrar: async () => {} };
  const s = await createServer({ root: RAIZ, logLevel: "error", server: { port: 5188, strictPort: true } });
  await s.listen();
  return { base: "http://localhost:5188", cerrar: () => s.close() };
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

async function totalesDentro(page, vp, selector, etiqueta) {
  const caja = await page.locator(selector).first().boundingBox();
  if (!caja) return ok(false, `${etiqueta}: no hay totales`);
  if (vp.w >= 900 && vp.h >= 560) ok(caja.y + caja.height <= vp.h, `${etiqueta}: totales dentro de la ventana (${Math.round(caja.y + caja.height)} <= ${vp.h})`);
}

async function elegirPreset(page, nombre) {
  await page.getByRole("radio", { name: nombre, exact: true }).click();
  await page.waitForTimeout(450);
}

async function ponerSonda(page) {
  await page.locator("canvas.circuito-lienzo").scrollIntoViewIfNeeded();
  await page.waitForTimeout(150);
  const lienzo = await page.locator("canvas.circuito-lienzo").boundingBox();
  for (const fy of [0.5, 0.45, 0.55, 0.6, 0.4, 0.7, 0.3]) {
    for (const fx of [0.9, 0.5, 0.2, 0.7, 0.35]) {
      await page.mouse.click(lienzo.x + lienzo.width * fx, lienzo.y + lienzo.height * fy);
      await page.waitForTimeout(120);
      const t = await page.locator(".lectura-sonda").innerText();
      if (/Sonda (en|dentro)/.test(t)) return t;
    }
  }
  return "";
}

async function reducir(page, esperado) {
  const boton = page.getByRole("button", { name: "Reducir un paso" });
  await boton.scrollIntoViewIfNeeded();
  for (let k = 0; k < 7 && (await boton.getAttribute("aria-disabled")) !== "true"; k++) {
    await boton.click();
    await page.waitForTimeout(120);
  }
  const panel = await page.locator(".panel-reduccion").innerText();
  ok(esperado.test(panel), `reducción termina con ${esperado}: ${panel.slice(-120).replace(/\s+/g, " ")}`);
  await page.getByRole("button", { name: "Circuito completo" }).click();
  await page.waitForTimeout(300);
}

async function pruebaHome(browser, base, vp) {
  const ctx = await browser.newContext({ viewport: { width: vp.w, height: vp.h }, deviceScaleFactor: vp.dpr });
  const page = await ctx.newPage();
  const errores = vigilar(page);
  await page.goto(`${base}/`);
  for (const [numero, ruta] of [["06", "/resistencias"], ["07", "/capacitores"]]) {
    const tarjeta = page.locator("a.estacion", { has: page.locator(`.estacion-numero:text-is("${numero}")`) });
    ok((await tarjeta.count()) === 1, `Home: tarjeta ${numero}`);
    await tarjeta.scrollIntoViewIfNeeded();
    await tarjeta.click();
    await page.waitForURL(`**${ruta}`);
    await page.locator("canvas.circuito-lienzo").waitFor({ state: "visible", timeout: 10000 });
    ok(true, `Home → ${ruta}: lienzo visible`);
    await page.goBack();
    await page.waitForSelector("a.estacion");
  }
  for (const [antigua, nueva] of [["campo-fijo", "/cargas-en-reposo"], ["dipolos", "/campo-continuo"]]) {
    await page.goto(`${base}/${antigua}`);
    await page.waitForURL(`**${nueva}`);
    ok(true, `/${antigua} → ${nueva}`);
  }
  ok(errores.length === 0, `Home y redirecciones sin errores de consola: ${errores.join(" | ")}`);
  await ctx.close();
}

async function pruebaE6(browser, base, vp) {
  const ctx = await browser.newContext({ viewport: { width: vp.w, height: vp.h }, deviceScaleFactor: vp.dpr });
  const page = await ctx.newPage();
  const errores = vigilar(page);
  await page.goto(`${base}/resistencias`);
  await page.waitForSelector("canvas.circuito-lienzo");
  await page.waitForTimeout(900);
  ok(await sinScrollHorizontal(page), `E6 ${vp.n}: sin desplazamiento horizontal`);
  await totalesDentro(page, vp, ".resumen-circuito", `E6 ${vp.n}`);
  for (const p of PRESETS_E6) {
    await elegirPreset(page, p.nombre);
    for (const electrones of [false, true]) {
      const caja = page.getByLabel("Ver electrones");
      if (electrones) await caja.check();
      else await caja.uncheck();
      await page.waitForTimeout(250);
      const filas = await page.locator(".tabla-circuito tbody tr").count();
      ok(filas === p.hojas + 1, `E6 ${vp.n} ${p.nombre} (${electrones ? "electrones" : "convencional"}): ${filas} filas, esperadas ${p.hojas + 1}`);
      const leyenda = await page.locator(".leyenda-corriente-sentido").first().innerText();
      ok(electrones ? /electrones/.test(leyenda) : /convencional/.test(leyenda), `E6 ${p.nombre}: leyenda de la vista`);
      const totales = await page.locator(".resumen-circuito dd").first().innerText();
      ok(/\d/.test(totales), `E6 ${p.nombre}: resistencia total con valor (${totales})`);
      const celda = await page.locator(".tabla-circuito tbody tr").first().locator("td").nth(2).innerText();
      ok(celda !== "—", `E6 ${p.nombre}: rótulos con lectura`);
    }
    ok(await sinScrollHorizontal(page), `E6 ${vp.n} ${p.nombre}: sin desplazamiento horizontal`);
  }
  // Reducción: serie+paralelo llega a R_eq; el puente no se reduce.
  await page.getByLabel("Ver electrones").uncheck();
  await elegirPreset(page, "Mixto de 6");
  await reducir(page, /Resistencia equivalente/);
  await elegirPreset(page, "Puente equilibrado");
  const puente = await page.locator(".panel-reduccion").innerText();
  ok(/no se reduce/.test(puente), "E6: el puente no se reduce");
  // Sonda y cambio de preset.
  await elegirPreset(page, "3 en serie");
  const sonda = await ponerSonda(page);
  ok(sonda !== "", "E6: la sonda lee en el circuito");
  await page.screenshot({ path: resolve(SALIDA, `e6-${vp.n}.png`) });
  ok(errores.length === 0, `E6 ${vp.n} sin errores de consola: ${errores.join(" | ")}`);
  await ctx.close();
}

async function pruebaE7(browser, base, vp) {
  const ctx = await browser.newContext({ viewport: { width: vp.w, height: vp.h }, deviceScaleFactor: vp.dpr });
  const page = await ctx.newPage();
  const errores = vigilar(page);
  await page.goto(`${base}/capacitores`);
  await page.waitForSelector("canvas.circuito-lienzo");
  await page.waitForTimeout(1200);
  const resumen = async () => (await page.locator(".resumen-capacitores").innerText()).replace(/\s+/g, " ");
  ok(await sinScrollHorizontal(page), `E7 ${vp.n}: sin desplazamiento horizontal`);
  ok(/Tiempo ×\d[^ ]* más lento/.test(await resumen()), "E7: rótulo del tiempo dilatado");
  await totalesDentro(page, vp, ".resumen-capacitores", `E7 ${vp.n}`);
  for (const p of PRESETS_E7) {
    await elegirPreset(page, p.nombre);
    for (const modo of ["Cargar", "Descargar"]) {
      await page.getByRole("radio", { name: modo, exact: true }).click();
      for (const electrones of [false, true]) {
        const caja = page.getByLabel("Ver electrones");
        if (electrones) await caja.check();
        else await caja.uncheck();
        await page.waitForTimeout(350);
        const filas = await page.locator(".tabla-capacitores tbody tr").count();
        ok(filas === p.hojas + 2, `E7 ${vp.n} ${p.nombre} ${modo}: ${filas} filas, esperadas ${p.hojas + 2}`);
        const r = await resumen();
        if (modo === "Descargar") ok(/I \(sentido invertido\)/.test(r), `E7 ${p.nombre}: «I (sentido invertido)» al descargar`);
        else ok(/Corriente I/.test(r), `E7 ${p.nombre}: «Corriente I» al cargar`);
        const leyenda = await page.locator(".leyenda-corriente").innerText();
        ok(electrones ? /electrones/.test(leyenda) : /convencional/.test(leyenda), `E7 ${p.nombre}: leyenda de la vista`);
        ok(await sinScrollHorizontal(page), `E7 ${vp.n} ${p.nombre} ${modo}: sin desplazamiento horizontal`);
      }
    }
    await page.getByRole("radio", { name: "Cargar", exact: true }).click();
  }
  // Cargar un rato, descargar y comprobar la fase y el sentido.
  await page.getByLabel("Ver electrones").uncheck();
  await elegirPreset(page, "3 en serie");
  await page.waitForTimeout(2500);
  await page.getByRole("radio", { name: "Descargar", exact: true }).click();
  await page.waitForTimeout(1200);
  ok(/Descargando/.test(await resumen()), "E7: fase «Descargando»");
  ok(/fuera del circuito/.test(await page.locator(".tabla-capacitores").innerText()), "E7: batería fuera del circuito al descargar");
  await page.screenshot({ path: resolve(SALIDA, `e7-descarga-${vp.n}.png`) });
  // Reinicio.
  await page.getByRole("button", { name: "Volver a empezar" }).click();
  await page.waitForTimeout(400);
  ok(/Voltaje de los capacitores 0 V/.test(await resumen()), `E7: Volver a empezar deja 0 V (${(await resumen()).slice(-80)})`);
  // Editar la red con carga acumulada reinicia y avisa.
  await page.getByRole("radio", { name: "Cargar", exact: true }).click();
  await page.waitForTimeout(2000);
  const añadir = page.getByRole("button", { name: "Añadir en paralelo" });
  await añadir.scrollIntoViewIfNeeded();
  await añadir.click();
  await page.waitForTimeout(700);
  ok(/vuelven a empezar descargados/.test(await page.locator(".aviso-reinicio").innerText()), "E7: aviso de reinicio al editar la red");
  // Reducción y sonda.
  await reducir(page, /Capacitancia equivalente/);
  await elegirPreset(page, "Serie + paralelo");
  ok((await ponerSonda(page)) !== "", "E7: la sonda lee en el circuito");
  await page.screenshot({ path: resolve(SALIDA, `e7-${vp.n}.png`) });
  ok(errores.length === 0, `E7 ${vp.n} sin errores de consola: ${errores.join(" | ")}`);
  await ctx.close();
}

mkdirSync(SALIDA, { recursive: true });
const { base, cerrar } = await servidor();
console.log(`E2E circuitos contra ${base}`);
const browser = await chromium.launch();
try {
  for (const vp of VIEWPORTS) {
    const antes = fallos;
    await pruebaHome(browser, base, vp);
    await pruebaE6(browser, base, vp);
    await pruebaE7(browser, base, vp);
    console.log(`${vp.n}: ${fallos === antes ? "ok" : `${fallos - antes} fallo(s)`}`);
  }
} finally {
  await browser.close();
  await cerrar();
}
console.log(`${comprobaciones} comprobaciones, ${fallos} fallo(s)`);
process.exit(fallos ? 1 : 0);
