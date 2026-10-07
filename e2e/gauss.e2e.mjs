/**
 * E2E de la estación Ley de Gauss (`/ley-de-gauss`) con Playwright. Uso: `npm run e2e:gauss`.
 *
 * Arranca `vite preview` sobre un build nuevo (comprobaciones de interfaz y tiempo por cuadro) y `vite` en modo
 * desarrollo (solo para el micro-benchmark del recálculo de geometría, que importa los módulos .ts desde la página),
 * y cierra ambos al terminar. NO forma parte de `npm test`.
 *
 * Qué comprueba, en 390×844, 1024×768 y 1366×650:
 *   - los 9 escenarios (botones del panel): sin errores de consola ni de página, Φ y q_enc iguales a los del contrato §5;
 *   - sin desplazamiento horizontal y sin objetivos táctiles < 44 px;
 *   - capturas de cada escenario/viewport en capturas-gauss/e2e/ (carpeta ignorada por git).
 * Y, con la CPU 4× más lenta (CDP `Emulation.setCPUThrottlingRate`):
 *   - tiempo entre cuadros (rAF; p50/p95/máx) en reposo, arrastre de carga, deslizadores de tamaño y z, giro del azimut
 *     y cambio de escenario;
 *   - tiempo del RECÁLCULO de geometría (`construirGeometria`) por escenario y calidad, medido importando el módulo
 *     real desde el servidor de desarrollo (sin código de depuración en producción).
 * Resultados en capturas-gauss/e2e/medidas.json. Código de salida ≠ 0 si falla alguna comprobación.
 */
import { spawn, execSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { chromium } from "playwright";

const RAIZ = resolve(import.meta.dirname, "..");
const SALIDA = resolve(RAIZ, "capturas-gauss/e2e");
const PUERTO_PREVIEW = 4173;
const PUERTO_DEV = 5199;
const VIEWPORTS = [
  { n: "movil-390x844", w: 390, h: 844, dpr: 2 },
  { n: "tablet-1024x768", w: 1024, h: 768, dpr: 1 },
  { n: "pc-1366x650", w: 1366, h: 650, dpr: 1 },
];

/** Esperado del contrato §5 (Φ en µC/ε₀ y q_enc en µC; qEnc null = «sin carga encerrada» (superficie abierta)). */
const ESPERADO = {
  1: { phi: 0.1594, qEnc: null },
  2: { phi: 3, qEnc: 3 },
  3: { phi: 3, qEnc: 3 },
  4: { phi: 3, qEnc: 3 },
  5: { phi: 3, qEnc: 3 },
  6: { phi: 0, qEnc: 0 },
  7: { phi: 0, qEnc: 0 },
  8: { phi: 0.7889, qEnc: null },
  9: { phi: 4, qEnc: 4 },
};

const fallos = [];
const falla = (m) => {
  fallos.push(m);
  console.log("  FALLO:", m);
};
const resultados = { viewports: {}, rendimiento: {}, recalculo: {} };

// ---------- servidores ----------
const hijos = [];
function lanzar(args, puerto) {
  const h = spawn("npx", ["vite", ...args, "--port", String(puerto), "--strictPort"], { cwd: RAIZ, shell: true, stdio: "ignore" });
  hijos.push(h);
}
function cerrarHijos() {
  for (const h of hijos) {
    try {
      if (process.platform === "win32") execSync(`taskkill /pid ${h.pid} /T /F`, { stdio: "ignore" });
      else h.kill("SIGTERM");
    } catch {
      /* ya cerrado */
    }
  }
}
async function esperar(url, ms = 60000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    try {
      if ((await fetch(url)).ok) return;
    } catch {
      /* aún no */
    }
    await new Promise((r) => setTimeout(r, 300));
  }
  throw new Error(`El servidor no respondió: ${url}`);
}

// ---------- utilidades ----------
const pct = (v, p) => {
  const s = [...v].sort((a, b) => a - b);
  return s.length ? s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))] : NaN;
};
const resumen = (v) => ({
  n: v.length,
  p50: +pct(v, 50).toFixed(1),
  p95: +pct(v, 95).toFixed(1),
  max: +Math.max(...v, 0).toFixed(1),
});
const dormir = (ms) => new Promise((r) => setTimeout(r, ms));
const numero = (t) => Number(t.replace("−", "-").replace(",", "."));

async function leerLectura(page) {
  const t = (await page.locator(".gauss3d-lectura-fila").first().innerText()).replace(/\s+/g, " ");
  const phi = t.match(/Φ = (−?[\d,]+)/);
  const q = t.match(/q_enc = ([+−]?[\d,]+)/);
  return { texto: t, phi: phi ? numero(phi[1]) : null, qEnc: q ? numero(q[1]) : t.includes("sin carga encerrada") ? null : undefined };
}

async function esperarLectura(page, esp, ms = 4000) {
  const t0 = Date.now();
  let l;
  while (Date.now() - t0 < ms) {
    l = await leerLectura(page);
    if (l.phi !== null && Math.abs(l.phi - esp.phi) <= 0.006 && (esp.qEnc === null ? l.qEnc === null : l.qEnc !== null && Math.abs(l.qEnc - esp.qEnc) <= 0.006)) return { ok: true, l };
    await dormir(100);
  }
  return { ok: false, l };
}

async function auditarPagina(page, vp, etiqueta) {
  const r = await page.evaluate(() => {
    const doc = document.documentElement;
    const malos = [];
    for (const el of document.querySelectorAll("button, a[href], summary, input, select")) {
      const objetivo = el.matches('input[type="checkbox"], input[type="radio"]') ? el.closest("label") ?? el : el;
      const r = objetivo.getBoundingClientRect();
      const cs = getComputedStyle(el);
      if (r.width === 0 || r.height === 0 || cs.visibility === "hidden" || cs.display === "none") continue;
      if (el.closest(".sr-only")) continue;
      if (r.width < 43.5 || r.height < 43.5) {
        malos.push(`${el.tagName.toLowerCase()}${el.className ? "." + String(el.className).split(" ")[0] : ""} "${(el.getAttribute("aria-label") ?? el.textContent ?? "").trim().slice(0, 30)}" ${Math.round(r.width)}×${Math.round(r.height)}`);
      }
    }
    return { scrollX: doc.scrollWidth - doc.clientWidth, malos };
  });
  if (r.scrollX > 0) falla(`${vp.n} ${etiqueta}: scroll horizontal de ${r.scrollX}px`);
  if (r.malos.length) falla(`${vp.n} ${etiqueta}: objetivos < 44 px: ${r.malos.join("; ")}`);
}

/** Pantalla ancha: el panel no se recorta (sin scroll interno) y la página entera cabe sin desplazarse (Avanzado cerrado). */
async function auditarCabida(page, vp, etiqueta) {
  const r = await page.evaluate(() => {
    const lat = document.querySelector(".simulador-lateral");
    const doc = document.documentElement;
    const textos = document.querySelector(".gauss3d-textos-ancho");
    return {
      lateral: lat.scrollHeight - lat.clientHeight,
      pagina: doc.scrollHeight - window.innerHeight,
      pie: textos ? Math.round(textos.getBoundingClientRect().bottom - window.innerHeight) : 0,
    };
  });
  if (r.lateral > 1) falla(`${vp.n} ${etiqueta}: el panel derecho se recorta (${r.lateral}px de scroll interno)`);
  if (r.pagina > 1 || r.pie > 0) falla(`${vp.n} ${etiqueta}: la página no cabe (desborda ${Math.max(r.pagina, r.pie)}px)`);
}

/** Móvil: el lienzo pegado (sticky) no tapa el control enfocado ni el último párrafo. */
async function auditarSticky(page, vp) {
  const sel = [
    ["primer control (escenario 1)", "button.gauss3d-escenario"],
    ["Forma «Cubo»", ".gauss3d-formas button:nth-child(3)"],
    ["tamaño de la superficie", '.gauss3d-panel input[type="range"]'],
    ["Invertir signo", ".gauss3d-panel .boton-colocar"],
    ["Avanzado", "details.gauss3d-avanzado > summary"],
  ];
  for (const [nombre, css] of sel) {
    const loc = page.locator(css).first();
    await loc.evaluate((el) => {
      window.scrollTo(0, 0);
      el.focus({ preventScroll: false });
    });
    await dormir(150);
    const libre = await loc.evaluate((el) => {
      const r = el.getBoundingClientRect();
      const e = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      return { ok: !!e && (e === el || el.contains(e) || e.contains(el)), y: Math.round(r.top) };
    });
    if (!libre.ok) falla(`${vp.n}: el lienzo pegado tapa «${nombre}» al enfocarlo (y=${libre.y})`);
    if (nombre === "tamaño de la superficie" || nombre === "Avanzado") {
      await page.screenshot({ path: `${SALIDA}/${vp.n}-scroll-${nombre === "Avanzado" ? "avanzado" : "superficie"}.png` });
    }
  }
  // Último párrafo: se baja hasta el final y se comprueba el punto de su primera línea.
  await page.locator("details.gauss3d-avanzado > summary").click();
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  await dormir(200);
  const p = await page.locator(".ayuda-mover").evaluate((el) => {
    const tactil = el.querySelector(".ayuda-puntero-tactil");
    const vis = [...el.querySelectorAll("span")].find((x) => getComputedStyle(x).display !== "none") ?? el;
    const r = vis.getBoundingClientRect();
    const e = document.elementFromPoint(r.left + 12, r.top + 8);
    return { ok: !!e && (e === vis || vis.contains(e) || e.contains(vis) || el.contains(e)), y: Math.round(r.top), tactil: !!tactil };
  });
  if (!p.ok) falla(`${vp.n}: el último párrafo queda tapado al final de la página (y=${p.y})`);
  await page.screenshot({ path: `${SALIDA}/${vp.n}-scroll-final.png` });
  await page.locator("details.gauss3d-avanzado > summary").click();
}

function vigilar(page, lista) {
  page.on("console", (m) => {
    if (m.type() === "error") lista.push(`console: ${m.text()}`);
  });
  page.on("pageerror", (e) => lista.push(`pageerror: ${String(e)}`));
}

// ---------- comprobaciones por viewport ----------
async function comprobarViewport(browser, vp, base) {
  console.log(`\n== ${vp.n} ==`);
  const ctx = await browser.newContext({ viewport: { width: vp.w, height: vp.h }, deviceScaleFactor: vp.dpr, hasTouch: vp.w < 600 });
  const page = await ctx.newPage();
  const errores = [];
  vigilar(page, errores);
  await page.goto(`${base}/ley-de-gauss`);
  await page.locator("canvas.lienzo-gauss3d").waitFor();
  const filas = [];
  for (let e = 1; e <= 9; e++) {
    await page.getByRole("button", { name: new RegExp(`^${e} `) }).click();
    const { ok, l } = await esperarLectura(page, ESPERADO[e]);
    if (!ok) falla(`${vp.n} esc ${e}: lectura «${l?.texto}» no coincide con Φ=${ESPERADO[e].phi}, q_enc=${ESPERADO[e].qEnc}`);
    await page.screenshot({ path: `${SALIDA}/${vp.n}-esc${e}.png`, fullPage: true });
    await auditarPagina(page, vp, `esc ${e}`);
    if (vp.w >= 900) await auditarCabida(page, vp, `esc ${e}`);
    filas.push({ esc: e, lectura: l?.texto, ok });
    console.log(`  esc ${e}: ${l?.texto} ${ok ? "OK" : "MAL"}`);
  }
  // Escenario 3 variante «fuera»: Φ = 0
  await page.getByRole("button", { name: /^3 / }).click();
  await page.getByRole("button", { name: /ponerla fuera/ }).click();
  const fuera = await esperarLectura(page, { phi: 0, qEnc: 0 });
  if (!fuera.ok) falla(`${vp.n} esc 3 fuera: ${fuera.l?.texto}`);
  await page.screenshot({ path: `${SALIDA}/${vp.n}-esc3-fuera.png`, fullPage: true });
  // Escenario 5: cubo → cilindro → esfera, siempre Φ = 3
  await page.getByRole("button", { name: /^5 / }).click();
  for (const forma of ["Cilindro", "Esfera", "Cubo"]) {
    await page.getByRole("button", { name: forma, exact: true }).click();
    const r = await esperarLectura(page, { phi: 3, qEnc: 3 });
    if (!r.ok) falla(`${vp.n} esc 5 ${forma}: ${r.l?.texto}`);
  }
  // Escenario 6: z de 8 a 0 → Φ salta a 3
  await page.getByRole("button", { name: /^6 / }).click();
  await page.locator(".gauss3d-altura-barra").fill("0");
  const cruce = await esperarLectura(page, { phi: 3, qEnc: 3 });
  if (!cruce.ok) falla(`${vp.n} esc 6 con z=0: ${cruce.l?.texto}`);
  // Panel «Avanzado» abierto: también sin scroll horizontal ni objetivos pequeños
  await page.getByRole("button", { name: /^2 / }).click();
  await page.locator("details.gauss3d-avanzado > summary").click();
  await dormir(300);
  await auditarPagina(page, vp, "Avanzado abierto");
  await page.screenshot({ path: `${SALIDA}/${vp.n}-avanzado.png`, fullPage: true });
  await page.locator("details.gauss3d-avanzado > summary").click(); // cerrar de nuevo
  if (vp.w < 600) await auditarSticky(page, vp);
  if (errores.length) errores.forEach((e) => falla(`${vp.n}: ${e}`));
  resultados.viewports[vp.n] = { escenarios: filas, errores };
  await ctx.close();
}

// ---------- tiempo por cuadro con CPU 4× ----------
const SONDA = () => {
  window.__fr = { dt: [], largas: [], on: false };
  let ult = 0;
  const bucle = (t) => {
    if (window.__fr.on && ult) window.__fr.dt.push(t - ult);
    ult = t;
    requestAnimationFrame(bucle);
  };
  requestAnimationFrame(bucle);
  try {
    new PerformanceObserver((l) => {
      if (window.__fr.on) for (const e of l.getEntries()) window.__fr.largas.push(e.duration);
    }).observe({ entryTypes: ["longtask"] });
  } catch {
    /* sin longtask */
  }
};

async function medirFase(page, nombre, accion) {
  await page.evaluate(() => {
    window.__fr.dt = [];
    window.__fr.largas = [];
    window.__fr.on = true;
  });
  await accion();
  await dormir(200);
  const d = await page.evaluate(() => {
    window.__fr.on = false;
    return { dt: window.__fr.dt, largas: window.__fr.largas, calidad: document.querySelector("canvas.lienzo-gauss3d")?.dataset.calidad };
  });
  const r = { ...resumen(d.dt), largasN: d.largas.length, largaMax: +Math.max(...d.largas, 0).toFixed(1), calidad: d.calidad };
  console.log(`  ${nombre}: p50 ${r.p50} · p95 ${r.p95} · máx ${r.max} ms (tareas largas: ${r.largasN}, máx ${r.largaMax}) calidad ${r.calidad}`);
  return r;
}

async function hallarCarga(page) {
  const c = await page.locator("canvas.lienzo-gauss3d").boundingBox();
  // barrido desde el centro hacia fuera hasta que el lienzo marque «sobre carga»
  for (let r = 0; r <= Math.min(c.width, c.height) / 2; r += 6) {
    for (let a = 0; a < (r === 0 ? 1 : 12); a++) {
      const x = c.x + c.width / 2 + r * Math.cos((a * Math.PI) / 6);
      const y = c.y + c.height / 2 + r * Math.sin((a * Math.PI) / 6);
      await page.mouse.move(x, y);
      if ((await page.locator("canvas.lienzo-gauss3d").getAttribute("data-sobre")) === "carga") return { x, y, c };
    }
  }
  return null;
}

async function rendimiento(browser, vp, base) {
  console.log(`\n== rendimiento (CPU 4×) ${vp.n} ==`);
  const ctx = await browser.newContext({ viewport: { width: vp.w, height: vp.h }, deviceScaleFactor: vp.dpr });
  const page = await ctx.newPage();
  const errores = [];
  vigilar(page, errores);
  await page.addInitScript(SONDA);
  await page.goto(`${base}/ley-de-gauss`);
  await page.locator("canvas.lienzo-gauss3d").waitFor();
  const cdp = await ctx.newCDPSession(page);
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
  const R = {};
  await page.getByRole("button", { name: /^7 / }).click(); // dipolo: el más caro (2 cargas, flechas)
  await dormir(1500);

  R.reposo = await medirFase(page, "(a) reposo", () => dormir(2000));

  const sitio = await hallarCarga(page);
  if (!sitio) {
    falla(`${vp.n}: no se encontró ninguna carga bajo el puntero para el arrastre`);
  } else {
    R.arrastreCarga = await medirFase(page, "(b) arrastre de carga", async () => {
      await page.mouse.move(sitio.x, sitio.y);
      await page.mouse.down();
      for (let i = 0; i <= 80; i++) {
        const a = (i / 80) * 2 * Math.PI;
        await page.mouse.move(sitio.x + 30 * Math.sin(a), sitio.y + 20 * (1 - Math.cos(a)));
        await dormir(16);
      }
      await page.mouse.up();
    });
  }

  await page.getByRole("button", { name: /^4 / }).click();
  await dormir(800);
  R.deslizadorTamano = await medirFase(page, "(c1) deslizador de tamaño", async () => {
    const barra = page.locator('input[type="range"][aria-label^="Tamaño de la superficie"]');
    for (let i = 0; i <= 60; i++) {
      await barra.fill(String(Math.round((2 + 6 * Math.abs(Math.sin((i / 60) * Math.PI))) * 2) / 2));
      await dormir(16);
    }
    await page.locator("canvas.lienzo-gauss3d").focus();
  });
  await page.getByRole("button", { name: /^6 / }).click();
  await dormir(800);
  R.deslizadorZ = await medirFase(page, "(c2) deslizador de z", async () => {
    const barra = page.locator(".gauss3d-altura-barra");
    for (let i = 0; i <= 60; i++) {
      await barra.fill(String(Math.round(8 - 8 * Math.abs(Math.sin((i / 60) * Math.PI)))));
      await dormir(16);
    }
  });

  await page.getByRole("button", { name: /^7 / }).click();
  await dormir(800);
  R.azimut = await medirFase(page, "(d) giro del azimut", async () => {
    const c = await page.locator("canvas.lienzo-gauss3d").boundingBox();
    const x0 = c.x + 12;
    const y0 = c.y + c.height - 12; // esquina vacía
    await page.mouse.move(x0, y0);
    await page.mouse.down();
    for (let i = 0; i <= 80; i++) {
      await page.mouse.move(x0 + (i / 80) * (c.width - 24), y0);
      await dormir(16);
    }
    await page.mouse.up();
  });

  R.cambioEscenario = await medirFase(page, "(e) cambio de escenario (9→1→…→9)", async () => {
    for (const e of [1, 2, 3, 4, 5, 6, 7, 8, 9, 1, 2, 3, 4, 5, 6, 7, 8, 9]) {
      await page.getByRole("button", { name: new RegExp(`^${e} `) }).click();
      await dormir(350);
    }
  });
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: 1 });
  if (errores.length) errores.forEach((e) => falla(`${vp.n} (rendimiento): ${e}`));
  resultados.rendimiento[vp.n] = R;
  await ctx.close();
}

// ---------- recálculo de geometría (micro-benchmark en el navegador con CPU 4×) ----------
async function recalculo(browser, baseDev) {
  console.log("\n== recálculo de geometría (CPU 4×, módulo real vía vite dev) ==");
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 650 } });
  const page = await ctx.newPage();
  await page.goto(`${baseDev}/ley-de-gauss`);
  await page.locator("canvas.lienzo-gauss3d").waitFor();
  const cdp = await ctx.newCDPSession(page);
  for (const rate of [1, 4]) {
    await cdp.send("Emulation.setCPUThrottlingRate", { rate });
    let res = await page.evaluate(async () => {
      const g = await import("/src/render/gauss3d/geometria.ts");
      const { ESCENARIOS } = await import("/src/fisica/gauss3d/escenarios.ts");
      const med = (v) => {
        const s = [...v].sort((a, b) => a - b);
        return { p50: s[Math.floor(s.length * 0.5)], p95: s[Math.min(s.length - 1, Math.floor(s.length * 0.95))], max: s[s.length - 1] };
      };
      const filas = [];
      const casos = [];
      for (const d of ESCENARIOS) {
        casos.push({ nombre: `${d.id}`, d, cargas: d.cargas });
        if (d.variante) casos.push({ nombre: `${d.id}-fuera`, d, cargas: d.variante.cargas });
      }
      // modos: calidad de líneas / calidad de malla. «gesto» = líneas gruesas (2) con la malla a la calidad del gestor (0).
      const modos = [
        { m: "alta", cal: 0, malla: 0 },
        { m: "media", cal: 1, malla: 1 },
        { m: "baja", cal: 2, malla: 2 },
        { m: "gesto", cal: 2, malla: 0 },
      ];
      for (const c of casos) {
        for (const modo of modos) {
          const est = g.crearEstadoGeometria();
          const mk = (i) => {
            const cargas = c.cargas.map((q, k) => ({ ...q, x: q.x + (k === 0 ? 0.013 * i : 0), y: q.y + (k === 0 ? 0.007 * i : 0) }));
            return { superficie: c.d.superficie, cargas, calidad: modo.cal, calidadMalla: modo.malla };
          };
          const mostrar = { lineas: c.d.mostrar.lineas, campo: c.d.mostrar.campo };
          for (let i = 0; i < 4; i++) g.construirGeometria(est, mk(i), mostrar); // calentar JIT
          const caliente = [];
          for (let i = 4; i < 34; i++) {
            const t0 = performance.now();
            g.construirGeometria(est, mk(i), mostrar);
            caliente.push(performance.now() - t0);
          }
          const frio = [];
          for (let i = 0; i < 12; i++) {
            est.claveMalla = ""; // fuerza malla y aristas nuevas, como en un cambio de escenario o de tamaño
            const t0 = performance.now();
            g.construirGeometria(est, mk(40 + i), mostrar);
            frio.push(performance.now() - t0);
          }
          filas.push({ esc: c.nombre, modo: modo.m, caliente: med(caliente), frio: med(frio) });
        }
      }
      // Desglose de un cuadro de giro de cámara (sin recalcular geometría): proyección/pasadas y dibujo en un canvas real.
      const { crearMotorGauss3D } = await import("/src/render/gauss3d/motor.ts");
      const cuadros = [];
      for (const [ancho, alto, nombre] of [[360, 400, "movil"], [900, 560, "pc"]]) {
        const lienzo = document.createElement("canvas");
        lienzo.width = ancho;
        lienzo.height = alto;
        const ctx2 = lienzo.getContext("2d", { alpha: false });
        for (const d of ESCENARIOS) {
          for (const gesto of [false, true]) {
            const motor = crearMotorGauss3D();
            const ent = (az) => ({
              escenario: { superficie: d.superficie, cargas: d.cargas, calidad: gesto ? 2 : 0, calidadMalla: 0 },
              camara: { azimut: az, inclinacion: 0.52, zoom: 1 },
              ancho, alto, dpr: 1, mostrar: d.mostrar, opacidad: 0.6, unidad: 1, encuadre: 0, seleccion: 0,
            });
            for (let i = 0; i < 6; i++) { motor.actualizar(ent(0.6 + 0.01 * i)); motor.dibujar(ctx2, ent(0.6)); }
            const tAct = [], tDib = [];
            for (let i = 0; i < 25; i++) {
              const e = ent(0.7 + 0.03 * i);
              let t0 = performance.now();
              motor.actualizar(e);
              tAct.push(performance.now() - t0);
              t0 = performance.now();
              motor.dibujar(ctx2, e);
              ctx2.getImageData(0, 0, 1, 1); // fuerza a terminar el raster
              tDib.push(performance.now() - t0);
            }
            cuadros.push({ vista: nombre, esc: d.id, modo: gesto ? "gesto" : "reposo", actualizarCamara: med(tAct), dibujar: med(tDib) });
          }
        }
      }
      return { filas, cuadros };
    });
    resultados.recalculo[`cpu${rate}x`] = res.filas;
    resultados.cuadro = resultados.cuadro ?? {};
    resultados.cuadro[`cpu${rate}x`] = res.cuadros;
    const peorCuadro = res.cuadros.reduce((a, b) => (b.dibujar.p95 > a.dibujar.p95 ? b : a));
    console.log(`  CPU ${rate}×: dibujo peor p95 ${peorCuadro.dibujar.p95.toFixed(1)} ms (esc ${peorCuadro.esc}, ${peorCuadro.vista}, ${peorCuadro.modo}); proyección+pasadas peor p95 ${Math.max(...res.cuadros.map((c) => c.actualizarCamara.p95)).toFixed(1)} ms`);
    res = res.filas;
    resultados.recalculo[`cpu${rate}x`] = res;
    const peor = res.reduce((a, b) => (b.frio.p95 > a.frio.p95 ? b : a));
    const peorC = res.reduce((a, b) => (b.caliente.p95 > a.caliente.p95 ? b : a));
    console.log(`  CPU ${rate}×: peor recálculo con malla nueva p95 ${peor.frio.p95.toFixed(1)} ms (esc ${peor.esc}, ${peor.modo}); con malla en caché p95 ${peorC.caliente.p95.toFixed(1)} ms (esc ${peorC.esc}, ${peorC.modo})`);
  }
  await ctx.close();
}

// ---------- principal ----------
let browser;
try {
  mkdirSync(SALIDA, { recursive: true });
  console.log("Compilando (vite build)…");
  execSync("npx vite build", { cwd: RAIZ, stdio: "ignore" });
  lanzar(["preview"], PUERTO_PREVIEW);
  lanzar([], PUERTO_DEV);
  const base = `http://localhost:${PUERTO_PREVIEW}`;
  const baseDev = `http://localhost:${PUERTO_DEV}`;
  await esperar(base);
  await esperar(baseDev);
  browser = await chromium.launch();
  for (const vp of VIEWPORTS) await comprobarViewport(browser, vp, base);
  for (const vp of VIEWPORTS) await rendimiento(browser, vp, base);
  await recalculo(browser, baseDev);
  writeFileSync(`${SALIDA}/medidas.json`, JSON.stringify(resultados, null, 1));
} catch (e) {
  falla(String(e?.stack ?? e));
} finally {
  await browser?.close();
  cerrarHijos();
}
console.log(fallos.length ? `\n${fallos.length} fallo(s)` : "\nE2E Gauss: todo en orden");
process.exit(fallos.length ? 1 : 0);
