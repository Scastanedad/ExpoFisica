"""
Plantilla: simulación FDTD 1D de una onda electromagnética.

Resuelve la ecuación de onda derivada de las ecuaciones de Maxwell:
    d2E/dx2 = (1/v^2) d2E/dt2
usando diferencias finitas centradas en espacio y tiempo (ver
references/metodos_numericos.md, sección 3, para la derivación).

Uso típico: adapta N_STEPS, la fuente, la geometría de medios (variando
c_local por celda) y las condiciones de frontera según lo que pida el
usuario. Está pensado como punto de partida, no como caja negra.

Requiere: numpy, matplotlib (pip install numpy matplotlib --break-system-packages)
"""

import numpy as np
import matplotlib.pyplot as plt
from matplotlib.animation import FuncAnimation

# --- Parámetros físicos y de malla ---
C = 299_792_458.0          # velocidad de la luz en el vacío (m/s)
NX = 400                   # número de celdas espaciales
DX = 1e-3                  # tamaño de celda (m) -> dominio total = NX*DX

# Índice de refracción por celda: 1.0 = vacío. Cambia un tramo para simular
# una interfaz entre medios (ej. aire -> vidrio) y ver reflexión/refracción.
n_medio = np.ones(NX)
# Ejemplo: un "vidrio" (n=1.5) en la segunda mitad del dominio
# n_medio[NX // 2:] = 1.5

c_local = C / n_medio       # velocidad local de la onda en cada celda

# Condición de Courant: dt <= dx/c (con margen de seguridad)
DT = 0.5 * DX / C

N_STEPS = 600               # número de pasos de tiempo a simular

# --- Estado del campo: E en el paso actual y en el paso anterior ---
E = np.zeros(NX)
E_old = np.zeros(NX)

# --- Fuente: un pulso oscilante en el borde izquierdo ---
SOURCE_POS = 10
FREQ = 5e9                  # 5 GHz, ajusta según lo que se quiera mostrar


def fuente(t_step):
    """Pulso senoidal suave (envolvente gaussiana) inyectado en SOURCE_POS."""
    t = t_step * DT
    envolvente = np.exp(-((t_step - 60) ** 2) / (2 * 30 ** 2))
    return envolvente * np.sin(2 * np.pi * FREQ * t)


def paso_fdtd(E, E_old, c_local, dx, dt):
    """Un paso de actualización FDTD (ver metodos_numericos.md sección 3)."""
    E_new = np.zeros_like(E)
    r2 = (c_local[1:-1] * dt / dx) ** 2
    E_new[1:-1] = (
        2 * E[1:-1] - E_old[1:-1]
        + r2 * (E[2:] - 2 * E[1:-1] + E[:-2])
    )
    # Fronteras simples fijas en cero (reflectantes). Para fronteras
    # absorbentes se necesitaría una condición tipo Mur de primer orden.
    # Nota: con fronteras reflectantes el dominio se comporta como una
    # cavidad cerrada sin pérdidas -- es normal que la amplitud crezca
    # varias veces por encima de la amplitud de la fuente mientras el
    # pulso sigue activo (resonancia física real, no inestabilidad),
    # y luego se estabilice una vez que la fuente termina. Si quieres
    # que la onda simplemente "salga" del dominio sin rebotar, cambia
    # estas líneas por una condición absorbente de Mur.
    E_new[0] = 0.0
    E_new[-1] = 0.0
    return E_new


# --- Bucle principal de la simulación ---
frames = []
for step in range(N_STEPS):
    E_new = paso_fdtd(E, E_old, c_local, DX, DT)
    E_new[SOURCE_POS] += fuente(step)   # inyecta la fuente

    E_old = E
    E = E_new
    frames.append(E.copy())

# --- Chequeo físico rápido (ver SKILL.md, paso 5: validar contra la física) ---
max_abs = max(np.max(np.abs(f)) for f in frames)
assert np.isfinite(max_abs), "La simulación divergió: revisa la condición de Courant (DT vs DX)."

# --- Animación ---
fig, ax = plt.subplots(figsize=(8, 4))
ax.set_ylim(-1.5, 1.5)
ax.set_xlim(0, NX)
ax.set_xlabel("posición (celdas)")
ax.set_ylabel("campo E (u.a.)")
ax.set_title("Propagación de onda electromagnética (FDTD 1D)")
line, = ax.plot([], [], lw=2)

# Si hay una interfaz de medios, márcala visualmente
if not np.allclose(n_medio, n_medio[0]):
    interfaz = np.argmax(n_medio != n_medio[0])
    ax.axvline(interfaz, color="gray", linestyle="--", label="interfaz de medio")
    ax.legend(loc="upper right")


def init():
    line.set_data([], [])
    return line,


def update(frame_idx):
    line.set_data(np.arange(NX), frames[frame_idx])
    return line,


anim = FuncAnimation(fig, update, frames=len(frames), init_func=init,
                      interval=20, blit=True)

# Para guardar como GIF/MP4 (requiere ffmpeg o pillow instalado):
# anim.save("onda_em.gif", writer="pillow", fps=30)

plt.tight_layout()
plt.savefig("onda_em_ultimo_frame.png", dpi=120)  # snapshot rápido sin necesitar GUI
print("Simulación completa. Frame final guardado en onda_em_ultimo_frame.png")
print(f"Amplitud máxima registrada: {max_abs:.4f} (si esto es enorme o 'nan', revisa DT/DX)")
