/**
 * Tamaño lógico (sistema de coordenadas) del canvas de las estaciones: la
 * física y el layout (`RADIO_CARGA_PX`, `PASO_MALLA`, etc.) siguen en estas
 * unidades. El bitmap real (backing store) del `<canvas>` es más grande --
 * ver hooks/useEscalaCss.ts -- para que se vea nítido sin importar a qué
 * tamaño CSS lo estire la pantalla.
 */
export const ANCHO_ESCENA = 700;
export const ALTO_ESCENA = 500;

/**
 * Tope de `devicePixelRatio` al fijar la resolución real del bitmap (hooks/useEscalaCss.ts,
 * render/capaCampo.ts). Sin tope, un teléfono o proyector 4K con dpr 3-4 multiplicaría por
 * 9-16 los píxeles a rasterizar cada frame (cuadrícula, líneas de campo, equipotenciales).
 */
export const DPR_MAXIMO = 2;
