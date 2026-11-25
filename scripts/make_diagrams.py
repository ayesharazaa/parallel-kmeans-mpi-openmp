"""make_diagrams.py - black-and-white diagram of how the four versions divide the work.
Output: report/code_images/diagram_workers.png
"""
import os

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib.patches import FancyBboxPatch, Rectangle

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "report", "code_images")
os.makedirs(OUT, exist_ok=True)

fig, ax = plt.subplots(figsize=(10, 8.2))
ax.set_xlim(0, 100)
ax.set_ylim(0, 100)
ax.axis("off")


def box(x, y, w, h, text="", fill="white", lw=1.5, fs=9, bold=False, ls="-"):
    ax.add_patch(Rectangle((x, y), w, h, fill=True, facecolor=fill, edgecolor="black", linewidth=lw, linestyle=ls))
    if text:
        ax.text(x + w / 2, y + h / 2, text, ha="center", va="center", fontsize=fs, fontweight="bold" if bold else "normal")


def title(y, text):
    ax.text(1, y, text, fontsize=11, fontweight="bold", va="center")


# 1 serial
title(97, "1. Serial: one worker does everything")
box(3, 85, 94, 9, "", lw=2)
ax.text(5, 91.2, "One process, one memory", fontsize=8, va="center")
box(40, 86.5, 55, 4.2, "ONE core: assign all points, then update the centroids", fill="#e6e6e6", fs=8.5)

# 2 OpenMP
title(81, "2. OpenMP: one process, several threads that share the same memory")
box(3, 57, 94, 21, "", lw=2)
ax.text(5, 75.3, "One process, one shared memory (all points, all centroids)", fontsize=8, va="center")
for i in range(4):
    x = 6 + i * 22.5
    box(x, 59, 20, 13, "", fill="#e6e6e6")
    ax.text(x + 10, 69.5, "thread %d" % (i + 1), ha="center", fontsize=8.5, fontweight="bold")
    ax.text(x + 10, 65.2, "works on its own\npart of the points", ha="center", va="center", fontsize=7.5)
    ax.text(x + 10, 61.2, "private sums", ha="center", fontsize=7.5)
ax.text(50, 56.7, "", fontsize=1)

# 3 MPI
title(52, "3. MPI: several processes, each with its OWN memory, talking by messages")
for i in range(4):
    x = 3 + i * 24
    box(x, 28, 21, 21, "", lw=2)
    ax.text(x + 10.5, 46.2, "process %d" % (i + 1), ha="center", fontsize=8.5, fontweight="bold")
    box(x + 2, 36, 17, 7, "its own slice\nof the points", fill="#e6e6e6", fs=7.5)
    box(x + 2, 30, 17, 4.5, "copy of centroids", fs=7.5)
ax.annotate("", xy=(97, 26), xytext=(3, 26), arrowprops=dict(arrowstyle="<->", lw=1.5))
ax.text(50, 23.5, "MPI_Allreduce: every iteration the partial sums are added together and every process gets the total", ha="center", fontsize=8)

# 4 Hybrid
title(18, "4. Hybrid: MPI between processes, OpenMP threads inside each process")
for j in range(2):
    x = 3 + j * 48
    box(x, 1, 46, 14, "", lw=2)
    ax.text(x + 23, 12.4, "process %d (its own slice of the points)" % (j + 1), ha="center", fontsize=8, fontweight="bold")
    for i in range(2):
        box(x + 3 + i * 21, 2.5, 19, 7, "thread %d" % (i + 1), fill="#e6e6e6", fs=8)
ax.annotate("", xy=(51, 7.5), xytext=(49, 7.5), arrowprops=dict(arrowstyle="<->", lw=1.5))
fig.savefig(os.path.join(OUT, "diagram_workers.png"), dpi=140, bbox_inches="tight")
print("wrote", os.path.join(OUT, "diagram_workers.png"))
