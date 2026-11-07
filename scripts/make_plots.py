"""make_plots.py - draw every graph and write results/tables.md from results/*.csv.

Speedup  S = T_serial / T_parallel   (T_serial = the serial program on the same data)
Efficiency E = S / (processes x threads)

Colours: a colour-blind-safe palette (Okabe-Ito); every series also has its own
marker so the graphs still work in black and white.
"""
import csv
import os
import sys
from collections import defaultdict

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RES = os.path.join(ROOT, "results")
OUT = os.path.join(ROOT, "plots")
os.makedirs(OUT, exist_ok=True)

BLUE, ORANGE, GREEN, PINK, GREY = "#0072B2", "#E69F00", "#009E73", "#CC79A7", "#555555"
STYLE = {  # version -> (colour, marker, label)
    "serial": (GREY, "s", "serial"),
    "omp": (BLUE, "o", "OpenMP"),
    "mpi": (ORANGE, "^", "MPI"),
    "hybrid": (GREEN, "D", "hybrid"),
}
plt.rcParams.update({
    "figure.dpi": 130, "axes.spines.top": False, "axes.spines.right": False,
    "axes.grid": True, "grid.alpha": 0.25, "grid.linewidth": 0.6,
    "axes.titlesize": 10, "axes.labelsize": 9, "legend.fontsize": 8,
    "xtick.labelsize": 8, "ytick.labelsize": 8, "lines.linewidth": 1.6,
})


def load(name):
    """Read results/<name>.csv -> list of dicts with numbers converted."""
    path = os.path.join(RES, name + ".csv")
    if not os.path.exists(path):
        sys.exit("missing %s - run scripts/run_benchmarks.py first" % path)
    rows = []
    with open(path) as f:
        for r in csv.DictReader(f):
            for key, val in r.items():
                try:
                    r[key] = float(val) if ("." in val or "e" in val) else int(val)
                except ValueError:
                    pass
            rows.append(r)
    return rows


def serial_time(rows, r):
    """Serial time for the same (n, d, k) as row r."""
    for s in rows:
        if s["version"] == "serial" and (s["n"], s["d"], s["k"]) == (r["n"], r["d"], r["k"]):
            return s["time"]
    raise KeyError("no serial row for %r" % ((r["n"], r["d"], r["k"]),))


def speedup(rows, r):
    return serial_time(rows, r) / r["time"]


def efficiency(rows, r):
    return speedup(rows, r) / r["workers"]


def save(fig, name):
    fig.tight_layout()
    fig.savefig(os.path.join(OUT, name))
    plt.close(fig)
    print("wrote plots/" + name)


def ideal_line(ax, xs):
    ax.plot(xs, xs, ls=":", color="#999999", label="ideal")


# ---------------------------------------------------------------------------
tables = []  # lines of markdown


def add_table(title, header, body):
    tables.append("### " + title + "\n")
    tables.append("| " + " | ".join(header) + " |")
    tables.append("|" + "|".join("---" for _ in header) + "|")
    for row in body:
        tables.append("| " + " | ".join(str(c) for c in row) + " |")
    tables.append("")


# ---- 1. OpenMP threads ------------------------------------------------------
rows = load("omp_threads")
omp = [r for r in rows if r["version"] == "omp"]
T = [r["threads"] for r in omp]
fig, ax = plt.subplots(1, 3, figsize=(10, 3.2))
ax[0].plot(T, [r["time"] for r in omp], "o-", color=BLUE, label="OpenMP")
ax[0].axhline(serial_time(rows, omp[0]), ls="--", color=GREY, label="serial")
ax[0].set(title="Time vs threads", xlabel="threads", ylabel="time for 20 iterations (s)")
ax[0].set_ylim(bottom=0); ax[0].legend()
ax[1].plot(T, [speedup(rows, r) for r in omp], "o-", color=BLUE, label="OpenMP")
ideal_line(ax[1], T)
ax[1].set(title="Speedup vs threads", xlabel="threads", ylabel="speedup"); ax[1].legend()
ax[2].plot(T, [efficiency(rows, r) for r in omp], "o-", color=BLUE)
ax[2].axhline(1.0, ls=":", color="#999999")
ax[2].set(title="Efficiency vs threads", xlabel="threads", ylabel="efficiency", ylim=(0, 1.15))
for a in ax:
    a.set_xticks(T)
for a in (ax[0], ax[1], ax[2]):
    a.axvline(2, color="#cccccc", lw=0.8); a.axvline(4, color="#cccccc", lw=0.8)
save(fig, "fig1_openmp_threads.png")
st = serial_time(rows, omp[0])
add_table("OpenMP: threads (n=%d, d=%d, k=%d, 20 iterations; serial = %.3f s)" % (
    omp[0]["n"], omp[0]["d"], omp[0]["k"], st),
    ["threads", "time (s)", "speedup", "efficiency"],
    [(r["threads"], "%.3f" % r["time"], "%.2f" % speedup(rows, r), "%.2f" % efficiency(rows, r)) for r in omp])

# ---- 2. OpenMP schedules ------------------------------------------------------
rows = load("omp_sched")
sc = [r for r in rows if r["version"] == "omp"]
labels = [r["sched"] + (",%d" % r["chunk"] if r["chunk"] else "") for r in sc]
fig, ax = plt.subplots(figsize=(5.2, 3.2))
bars = ax.bar(labels, [r["time"] for r in sc], color=BLUE, width=0.55)
ax.axhline(serial_time(rows, sc[0]), ls="--", color=GREY, label="serial")
for b, r in zip(bars, sc):
    ax.text(b.get_x() + b.get_width() / 2, b.get_height(), "%.2f" % r["time"],
            ha="center", va="bottom", fontsize=8)
ax.set(title="OpenMP loop schedules (4 threads)", ylabel="time for 20 iterations (s)")
ax.legend(); ax.grid(axis="x", visible=False)
save(fig, "fig2_openmp_schedules.png")
add_table("OpenMP: schedules at 4 threads",
          ["schedule", "time (s)", "speedup"],
          [(l, "%.3f" % r["time"], "%.2f" % speedup(rows, r)) for l, r in zip(labels, sc)])

# ---- 3. MPI processes -------------------------------------------------------------
rows = load("mpi_procs")
mp = [r for r in rows if r["version"] == "mpi"]
P = [r["procs"] for r in mp]
fig, ax = plt.subplots(1, 3, figsize=(10, 3.2))
comp = np.array([r["time"] - r["t_comm"] - r["t_wait"] for r in mp])
wait = np.array([r["t_wait"] for r in mp])
ax[0].bar(range(len(P)), comp, color=ORANGE, width=0.55, label="computation")
ax[0].bar(range(len(P)), wait, bottom=comp, color="#b5b5b5", width=0.55,
          label="waiting for slowest process")
ax[0].bar(range(len(P)), [r["t_comm"] for r in mp], bottom=comp + wait, color="#333333", width=0.55,
          label="communication (Allreduce)")
ax[0].axhline(serial_time(rows, mp[0]), ls="--", color=GREY, label="serial")
ax[0].set_xticks(range(len(P))); ax[0].set_xticklabels(P)
ax[0].set(title="Time vs processes", xlabel="processes", ylabel="time for 20 iterations (s)")
ax[0].set_ylim(0, 1.9)
ax[0].legend(loc="upper center", ncol=2, fontsize=7); ax[0].grid(axis="x", visible=False)
ax[1].plot(P, [speedup(rows, r) for r in mp], "^-", color=ORANGE, label="MPI")
ideal_line(ax[1], P); ax[1].set_xticks(P)
ax[1].set(title="Speedup vs processes", xlabel="processes", ylabel="speedup"); ax[1].legend()
ax[2].plot(P, [efficiency(rows, r) for r in mp], "^-", color=ORANGE)
ax[2].axhline(1.0, ls=":", color="#999999"); ax[2].set_xticks(P)
ax[2].set(title="Efficiency vs processes", xlabel="processes", ylabel="efficiency", ylim=(0, 1.15))
for a in (ax[1], ax[2]):
    a.axvline(2, color="#cccccc", lw=0.8); a.axvline(4, color="#cccccc", lw=0.8)
save(fig, "fig3_mpi_processes.png")
add_table("MPI: processes (serial = %.3f s)" % serial_time(rows, mp[0]),
          ["processes", "time (s)", "waiting for slowest (s)", "Allreduce (s)", "speedup", "efficiency"],
          [(r["procs"], "%.3f" % r["time"], "%.3f" % r["t_wait"], "%.4f" % r["t_comm"],
            "%.2f" % speedup(rows, r), "%.2f" % efficiency(rows, r)) for r in mp])

# ---- 4. Hybrid ---------------------------------------------------------------------
rows = load("hybrid")
hy = [r for r in rows if r["version"] == "hybrid"]
labels = ["%dx%d" % (r["procs"], r["threads"]) for r in hy]
fig, ax = plt.subplots(1, 2, figsize=(9, 3.2))
bars = ax[0].bar(labels, [r["time"] for r in hy], color=GREEN, width=0.55)
ax[0].axhline(serial_time(rows, hy[0]), ls="--", color=GREY, label="serial")
for b, r in zip(bars, hy):
    ax[0].text(b.get_x() + b.get_width() / 2, b.get_height(), "%.2f" % r["time"],
               ha="center", va="bottom", fontsize=8)
ax[0].set(title="Hybrid: processes x threads", xlabel="processes x threads",
          ylabel="time for 20 iterations (s)")
ax[0].legend(); ax[0].grid(axis="x", visible=False)
bars = ax[1].bar(labels, [speedup(rows, r) for r in hy], color=GREEN, width=0.55)
for b, r in zip(bars, hy):
    ax[1].text(b.get_x() + b.get_width() / 2, b.get_height(), "%.2f" % speedup(rows, r),
               ha="center", va="bottom", fontsize=8)
ax[1].set(title="Hybrid speedup", xlabel="processes x threads", ylabel="speedup")
ax[1].grid(axis="x", visible=False)
save(fig, "fig4_hybrid.png")
add_table("Hybrid: processes x threads (serial = %.3f s)" % serial_time(rows, hy[0]),
          ["procs x threads", "workers", "time (s)", "waiting (s)", "Allreduce (s)", "speedup", "efficiency"],
          [(l, r["workers"], "%.3f" % r["time"], "%.3f" % r["t_wait"], "%.4f" % r["t_comm"],
            "%.2f" % speedup(rows, r), "%.2f" % efficiency(rows, r)) for l, r in zip(labels, hy)])

# ---- 5. Sweeps over n, k, d (serial vs four-worker parallel versions) -----------------
for exp, key, xlabel, fname, title in (
        ("size", "n", "number of points n", "fig5_effect_of_n.png", "n"),
        ("kvals", "k", "number of clusters k", "fig6_effect_of_k.png", "k"),
        ("dvals", "d", "dimensions d", "fig7_effect_of_d.png", "d")):
    rows = load(exp)
    xs = sorted(set(r[key] for r in rows))
    fig, ax = plt.subplots(1, 2, figsize=(9, 3.2))
    body = []
    for v in ("serial", "omp", "mpi", "hybrid"):
        col, mk, lab = STYLE[v]
        sel = sorted([r for r in rows if r["version"] == v], key=lambda r: r[key])
        ax[0].plot([r[key] for r in sel], [r["time"] for r in sel], mk + "-", color=col, label=lab)
        if v != "serial":
            ax[1].plot([r[key] for r in sel], [speedup(rows, r) for r in sel], mk + "-", color=col, label=lab)
    for x in xs:
        line = [x]
        for v in ("serial", "omp", "mpi", "hybrid"):
            r = [q for q in rows if q["version"] == v and q[key] == x][0]
            line.append("%.3f" % r["time"] if v == "serial" else "%.3f (%.2fx)" % (r["time"], speedup(rows, r)))
        body.append(line)
    ax[0].set(title="Time vs " + title, xlabel=xlabel, ylabel="time for 20 iterations (s)")
    ax[1].set(title="Speedup vs " + title + " (4 workers)", xlabel=xlabel, ylabel="speedup")
    ax[1].axhline(1.0, ls=":", color="#999999"); ax[1].set_ylim(bottom=0)
    if key in ("n", "k", "d"):
        for a in ax:
            a.set_xscale("log", base=2 if key != "n" else 10)
            a.set_xticks(xs)
            a.set_xticklabels([("%dk" % (x // 1000)) if key == "n" else str(x) for x in xs])
            a.minorticks_off()
    ax[0].legend(); ax[1].legend()
    save(fig, fname)
    add_table("Effect of %s (OpenMP 4 threads, MPI 4 processes, hybrid 2x2)" % title,
              [key, "serial (s)", "OpenMP (s, speedup)", "MPI (s, speedup)", "hybrid (s, speedup)"], body)

# ---- 8. Summary at four workers --------------------------------------------------------
o = load("omp_threads"); m = load("mpi_procs"); h = load("hybrid")
pick = [("OpenMP\n1x4", o, lambda r: r["version"] == "omp" and r["threads"] == 4, BLUE),
        ("MPI\n4x1", m, lambda r: r["version"] == "mpi" and r["procs"] == 4, ORANGE),
        ("hybrid\n2x2", h, lambda r: r["version"] == "hybrid" and (r["procs"], r["threads"]) == (2, 2), GREEN),
        ("hybrid\n1x4", h, lambda r: r["version"] == "hybrid" and (r["procs"], r["threads"]) == (1, 4), GREEN)]
fig, ax = plt.subplots(figsize=(5.5, 3.2))
vals = []
for lab, rws, f, col in pick:
    r = [q for q in rws if f(q)][0]
    vals.append(speedup(rws, r))
bars = ax.bar([p[0] for p in pick], vals, color=[p[3] for p in pick], width=0.55)
for b, v in zip(bars, vals):
    ax.text(b.get_x() + b.get_width() / 2, v, "%.2fx" % v, ha="center", va="bottom", fontsize=8)
ax.axhline(1.0, ls=":", color="#999999")
ax.set(title="Speedup with 4 workers (4 logical cores)", ylabel="speedup over serial")
ax.grid(axis="x", visible=False)
save(fig, "fig8_summary_4_workers.png")

# ---- 9. Initialisation ---------------------------------------------------------------------
rows = load("init_compare")
fig, ax = plt.subplots(1, 2, figsize=(8, 3.2))
body = []
for i, (init, col, lab, mk) in enumerate((("random", GREY, "random", "o"), ("plus", BLUE, "K-Means++", "D"))):
    sel = [r for r in rows if r["init"] == init]
    for a, key in zip(ax, ("iters", "sse")):
        vals = [r[key] for r in sel]
        a.scatter([i] * len(vals), vals, color=col, marker=mk, alpha=0.6, s=22)
        a.plot([i - 0.25, i + 0.25], [np.mean(vals)] * 2, color="black", lw=2)
    body.append((lab, "%.1f" % np.mean([r["iters"] for r in sel]),
                 "%.4g" % np.mean([r["sse"] for r in sel]), "%.4g" % min(r["sse"] for r in sel),
                 "%.4g" % max(r["sse"] for r in sel)))
for a, t, yl in zip(ax, ("Iterations until converged", "Final SSE (lower is better)"), ("iterations", "SSE")):
    a.set_xticks([0, 1]); a.set_xticklabels(["random", "K-Means++"]); a.set_xlim(-0.6, 1.6)
    a.set(title=t, ylabel=yl); a.grid(axis="x", visible=False)
save(fig, "fig9_initialisation.png")
add_table("Random vs K-Means++ start (10 seeds; black bar in the figure = mean)",
          ["start", "mean iterations", "mean SSE", "best SSE", "worst SSE"], body)

with open(os.path.join(RES, "tables.md"), "w") as f:
    f.write("\n".join(tables))
print("wrote results/tables.md")
