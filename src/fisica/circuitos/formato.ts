/** Formato SI con prefijos y 3 cifras significativas (coma decimal, español). */
const PREFIJOS: [number, string][] = [
  [-4, "p"],
  [-3, "n"],
  [-2, "µ"],
  [-1, "m"],
  [0, ""],
  [1, "k"],
  [2, "M"],
];

export function formatearSI(valor: number, unidad: string): string {
  if (valor === 0 || !Number.isFinite(valor)) return `${valor === 0 ? "0" : String(valor)} ${unidad}`;
  const signo = valor < 0 ? "-" : "";
  const a = Math.abs(valor);
  let e3 = Math.floor(Math.log10(a) / 3);
  e3 = Math.max(-4, Math.min(2, e3));
  let m = Number((a / 10 ** (3 * e3)).toPrecision(3));
  if (m >= 1000 && e3 < 2) {
    e3++;
    m = Number((a / 10 ** (3 * e3)).toPrecision(3));
  }
  const pref = PREFIJOS.find(([k]) => k === e3)?.[1] ?? "";
  return `${signo}${String(m).replace(".", ",")} ${pref}${unidad}`;
}
