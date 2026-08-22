"""
Plantilla: dinámica de N cargas puntuales que interactúan por fuerza de
Coulomb mutua (problema de N-cuerpos electrostático).

Distinto del caso "campo de cargas fijas" (scripts/campo_electrico_interactivo.html):
aquí las cargas se MUEVEN por su propia interacción, integradas en el tiempo.
Ver references/metodos_numericos.md sección 4, y references/ecuaciones_maxwell.md
sección "Sistemas de N cargas puntuales interactuando" para la derivación.

Requiere: numpy, matplotlib (pip install numpy matplotlib --break-system-packages)
"""

import numpy as np
import matplotlib.pyplot as plt
from matplotlib.animation import FuncAnimation

# --- Parámetros físicos ---
K = 8.99e9          # constante de Coulomb, 1/(4*pi*eps0), en unidades SI
MASA = 1e-3         # masa de cada carga (kg) -- misma masa para todas por simplicidad
SOFTENING = 0.05    # evita divergencia de 1/r^2 cuando dos cargas se acercan mucho (ver metodos_numericos.md)

# --- Estado inicial: posiciones (m), velocidades (m/s), cargas (C) ---
# Ejemplo: 4 cargas -- dos positivas y dos negativas en una configuración simétrica.
# Cambia esto libremente según lo que pida el usuario (número de cargas, signos, velocidades iniciales).
posiciones = np.array([
    [-1.0,  0.0],
    [ 1.0,  0.0],
    [ 0.0,  1.0],
    [ 0.0, -1.0],
], dtype=float)

velocidades = np.zeros_like(posiciones)  # parten en reposo; cambia si quieres darles velocidad inicial

cargas = np.array([1e-6, 1e-6, -1e-6, -1e-6])  # Coulombs
N = len(cargas)
masas = np.full(N, MASA)

DT = 1e-3
N_STEPS = 2000


def calcular_fuerzas(pos):
    """Fuerza neta de Coulomb sobre cada carga (vectorizado, ver metodos_numericos.md sección 4)."""
    diffs = pos[:, None, :] - pos[None, :, :]              # (N, N, dim)
    dist2 = np.sum(diffs ** 2, axis=-1) + SOFTENING ** 2     # softening evita división por cero
    dist3 = dist2 ** 1.5
    np.fill_diagonal(dist3, np.inf)                          # una carga no se atrae/repele a sí misma
    factor = K * cargas[:, None] * cargas[None, :] / dist3    # (N, N)
    F = np.sum(factor[:, :, None] * diffs, axis=1)           # (N, dim)
    return F


def energia_total(pos, vel):
    """Energía cinética + potencial electrostática (debe conservarse -- ver SKILL.md paso 5)."""
    K_cin = 0.5 * np.sum(masas * np.sum(vel ** 2, axis=-1))
    diffs = pos[:, None, :] - pos[None, :, :]
    dist = np.sqrt(np.sum(diffs ** 2, axis=-1) + SOFTENING ** 2)
    np.fill_diagonal(dist, np.inf)
    U = 0.5 * np.sum(K_matriz_cargas(dist))  # 0.5 porque cada par se cuenta dos veces
    return K_cin + U


def K_matriz_cargas(dist):
    return K * cargas[:, None] * cargas[None, :] / dist


# --- Integración con velocity Verlet (ver metodos_numericos.md sección 4) ---
trayectorias = np.zeros((N_STEPS, N, 2))
energias = np.zeros(N_STEPS)

F = calcular_fuerzas(posiciones)
for step in range(N_STEPS):
    trayectorias[step] = posiciones
    energias[step] = energia_total(posiciones, velocidades)

    v_half = velocidades + (F / masas[:, None]) * (DT / 2)
    posiciones = posiciones + v_half * DT
    F = calcular_fuerzas(posiciones)
    velocidades = v_half + (F / masas[:, None]) * (DT / 2)

# --- Chequeo físico rápido: la energía total no debería variar mucho ---
energia_inicial = energias[0]
deriva_relativa = np.abs((energias[-1] - energia_inicial) / energia_inicial)
print(f"Energía inicial: {energia_inicial:.6e} J | Energía final: {energias[-1]:.6e} J")
print(f"Deriva relativa de energía: {deriva_relativa:.2%} "
      f"({'aceptable' if deriva_relativa < 0.05 else 'alta -- considera reducir DT'})")

# --- Visualización: trayectorias de cada carga ---
fig, (ax1, ax2) = plt.subplots(1, 2, figsize=(11, 5))

colores = ["#ef4444" if q > 0 else "#3b82f6" for q in cargas]
for i in range(N):
    ax1.plot(trayectorias[:, i, 0], trayectorias[:, i, 1], color=colores[i], alpha=0.6, lw=1.5)
    ax1.scatter(*trayectorias[-1, i], color=colores[i], s=80, edgecolor="black", zorder=5)
ax1.set_title("Trayectorias de las cargas")
ax1.set_xlabel("x (m)")
ax1.set_ylabel("y (m)")
ax1.set_aspect("equal")
ax1.grid(alpha=0.3)

ax2.plot(np.arange(N_STEPS) * DT, energias, color="#22c55e")
ax2.set_title("Energía total del sistema (debe ser ~constante)")
ax2.set_xlabel("tiempo (s)")
ax2.set_ylabel("energía (J)")
ax2.grid(alpha=0.3)

plt.tight_layout()
plt.savefig("n_cargas_resultado.png", dpi=120)
print("Gráfico guardado en n_cargas_resultado.png")

# --- Para animar el movimiento en vez de solo ver las trayectorias finales ---
# fig_anim, ax_anim = plt.subplots(figsize=(6, 6))
# ax_anim.set_xlim(trayectorias[:, :, 0].min() - 0.5, trayectorias[:, :, 0].max() + 0.5)
# ax_anim.set_ylim(trayectorias[:, :, 1].min() - 0.5, trayectorias[:, :, 1].max() + 0.5)
# puntos = ax_anim.scatter(*trayectorias[0].T, c=colores, s=100)
#
# def update(frame):
#     puntos.set_offsets(trayectorias[frame])
#     return puntos,
#
# anim = FuncAnimation(fig_anim, update, frames=range(0, N_STEPS, 4), interval=20)
# anim.save("n_cargas_animacion.gif", writer="pillow", fps=30)
