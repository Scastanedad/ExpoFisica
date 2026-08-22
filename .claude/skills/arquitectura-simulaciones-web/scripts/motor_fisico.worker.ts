/**
 * Plantilla: Web Worker con un motor físico de N cuerpos interactuando por
 * fuerza de Coulomb (fácilmente adaptable a otras leyes de fuerza -- cambia
 * K_COULOMB y la fórmula de `calcularFuerzas` si necesitas gravedad u otra
 * interacción).
 *
 * Ver references/motor_fisico_worker.md para el protocolo de mensajes,
 * objetos transferibles, y el patrón de timestep fijo usado aquí.
 *
 * Ver la habilidad electromagnetismo-computacional (references/metodos_numericos.md,
 * sección 4) para la derivación física de estas mismas fórmulas en Python --
 * esta es la traducción directa a JS vectorizado con Float32Array.
 *
 * Uso: `const worker = new Worker(new URL("./motor_fisico.worker.ts", import.meta.url));`
 */

const K_COULOMB = 8.99e9;
const SOFTENING = 0.05;
const DT_FISICA = 1 / 120; // paso de física fijo, independiente del framerate de pantalla

let N = 0;
let posiciones: Float32Array; // [x0,y0, x1,y1, ...]
let velocidades: Float32Array;
let fuerzas: Float32Array;
let cargas: Float32Array; // valor de carga (Coulombs) por partícula
let masas: Float32Array;

let enPausa = false;
let multiplicadorVelocidad = 1;
let acumulador = 0;
let ultimoTiempo = 0;
let ultimoEnvioEnergia = 0;

function inicializar(nCargas: number, valoresCarga: number[], valoresMasa: number[]) {
  N = nCargas;
  posiciones = new Float32Array(N * 2);
  velocidades = new Float32Array(N * 2);
  fuerzas = new Float32Array(N * 2);
  cargas = new Float32Array(valoresCarga);
  masas = new Float32Array(valoresMasa);

  // Posiciones iniciales de ejemplo -- en un caso real, el hilo principal
  // mandaría posiciones iniciales específicas en el mensaje de init.
  for (let i = 0; i < N; i++) {
    const angulo = (i / N) * Math.PI * 2;
    posiciones[i * 2] = Math.cos(angulo) * 2;
    posiciones[i * 2 + 1] = Math.sin(angulo) * 2;
  }
}

/** Calcula la fuerza neta de Coulomb sobre cada partícula. O(N^2) -- ver
 * references/motor_fisico_worker.md para cuándo pasar a Barnes-Hut. */
function calcularFuerzas() {
  fuerzas.fill(0);
  for (let i = 0; i < N; i++) {
    const xi = posiciones[i * 2];
    const yi = posiciones[i * 2 + 1];
    for (let j = i + 1; j < N; j++) {
      const dx = xi - posiciones[j * 2];
      const dy = yi - posiciones[j * 2 + 1];
      const dist2 = dx * dx + dy * dy + SOFTENING * SOFTENING;
      const dist = Math.sqrt(dist2);
      const factor = (K_COULOMB * cargas[i] * cargas[j]) / (dist2 * dist);

      const fx = factor * dx;
      const fy = factor * dy;
      // tercera ley de Newton: la fuerza sobre j es igual y opuesta
      fuerzas[i * 2] += fx;
      fuerzas[i * 2 + 1] += fy;
      fuerzas[j * 2] -= fx;
      fuerzas[j * 2 + 1] -= fy;
    }
  }
}

/** Un paso de integración con velocity Verlet (ver metodos_numericos.md
 * en la habilidad electromagnetismo-computacional para la derivación). */
function avanzarPaso(dt: number) {
  // medio paso de velocidad
  for (let i = 0; i < N; i++) {
    const invMasa = 1 / masas[i];
    velocidades[i * 2] += fuerzas[i * 2] * invMasa * (dt / 2);
    velocidades[i * 2 + 1] += fuerzas[i * 2 + 1] * invMasa * (dt / 2);
  }
  // paso completo de posición
  for (let i = 0; i < N * 2; i++) {
    posiciones[i] += velocidades[i] * dt;
  }
  calcularFuerzas(); // recalcular con las nuevas posiciones
  // medio paso final de velocidad
  for (let i = 0; i < N; i++) {
    const invMasa = 1 / masas[i];
    velocidades[i * 2] += fuerzas[i * 2] * invMasa * (dt / 2);
    velocidades[i * 2 + 1] += fuerzas[i * 2 + 1] * invMasa * (dt / 2);
  }
}

function energiaTotal(): number {
  let cinetica = 0;
  for (let i = 0; i < N; i++) {
    const vx = velocidades[i * 2];
    const vy = velocidades[i * 2 + 1];
    cinetica += 0.5 * masas[i] * (vx * vx + vy * vy);
  }
  let potencial = 0;
  for (let i = 0; i < N; i++) {
    for (let j = i + 1; j < N; j++) {
      const dx = posiciones[i * 2] - posiciones[j * 2];
      const dy = posiciones[i * 2 + 1] - posiciones[j * 2 + 1];
      const dist = Math.sqrt(dx * dx + dy * dy + SOFTENING * SOFTENING);
      potencial += (K_COULOMB * cargas[i] * cargas[j]) / dist;
    }
  }
  return cinetica + potencial;
}

function bucle(ahora: number) {
  if (ultimoTiempo === 0) ultimoTiempo = ahora;
  const delta = (ahora - ultimoTiempo) / 1000;
  ultimoTiempo = ahora;

  if (!enPausa) {
    acumulador += Math.min(delta, 0.25) * multiplicadorVelocidad; // clamp evita "spiral of death"
    while (acumulador >= DT_FISICA) {
      avanzarPaso(DT_FISICA);
      acumulador -= DT_FISICA;
    }

    // Transferir el buffer de posiciones al hilo principal (objeto
    // transferible -- ver metodos_numericos.md, prácticamente gratis).
    // Nota: tras transferir, hay que crear un nuevo Float32Array para
    // seguir escribiendo del lado del Worker.
    const copia = posiciones.slice(); // copia barata (mismo tamaño, sin fuerzas de por medio)
    (self as unknown as Worker).postMessage({ tipo: "frame", posiciones: copia.buffer }, [
      copia.buffer,
    ]);

    // Energía a tasa reducida (throttled, ~4Hz) -- no hace falta cada frame.
    if (ahora - ultimoEnvioEnergia > 250) {
      ultimoEnvioEnergia = ahora;
      (self as unknown as Worker).postMessage({ tipo: "energia", valor: energiaTotal() });
    }
  }

  requestAnimationFrame(bucle);
}

self.onmessage = (evento: MessageEvent) => {
  const { tipo } = evento.data;
  switch (tipo) {
    case "init":
      inicializar(evento.data.nCargas, evento.data.cargas, evento.data.masas);
      calcularFuerzas();
      requestAnimationFrame(bucle);
      break;
    case "pausa":
      enPausa = evento.data.valor;
      break;
    case "velocidad":
      multiplicadorVelocidad = evento.data.valor;
      break;
    // agrega más tipos de mensaje según necesites: "agregarCarga", "moverCarga", etc.
  }
};
