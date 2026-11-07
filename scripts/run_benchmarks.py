"""run_benchmarks.py - run every experiment and write CSV files to results/.

Every timing is the MEDIAN of 5 runs (1 with --quick) of the iteration loop (file reading
is not timed).  All speed experiments use exactly 20 iterations (-m 20 -t -1)
so every run does the same amount of work.

Experiments (see README for the reasoning):
  omp_threads  - OpenMP, 1/2/4/8 threads
  omp_sched    - OpenMP scheduling policies at 4 threads
  mpi_procs    - MPI, 1/2/4/8 processes
  hybrid       - MPI processes x OpenMP threads
  size / kvals / dvals - how n, k and d change serial vs parallel times
  init_compare - random vs K-Means++ starting centroids (quality, not speed)

Use  --quick  for a fast smoke test (smaller data, 1 repeat).
"""
import argparse
import csv
import os
import statistics
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from runlib import RESULTS, make_data, run_program

FIXED = ["-m", "20", "-t", "-1"]  # exactly 20 iterations, never stop early
FIELDS = ["experiment", "version", "procs", "threads", "workers", "sched", "chunk",
          "n", "d", "k", "iters", "sse", "time", "tmin", "tmax", "t_comm", "t_wait"]


def cfg(version, path, k, procs=1, threads=1, sched="", chunk=0):
    """Describe one configuration to run."""
    return dict(version=version, path=path, k=k, procs=procs, threads=threads,
                sched=sched, chunk=chunk)


def bench(rows, exp, configs, repeats):
    """Run every configuration `repeats` times and append each median to rows.

    The repeats are INTERLEAVED (round 1 runs every configuration once, then round 2,
    ...) so that slow periods of the laptop (heat, background programs) affect all
    configurations equally instead of whichever one happened to run at that moment.
    """
    results = [[] for _ in configs]
    for _ in range(repeats):
        for i, c in enumerate(configs):
            extra = list(FIXED)
            if c["sched"]:
                extra += ["-S", c["sched"], "-C", str(c["chunk"])]
            results[i].append(run_program(c["version"], c["path"], c["k"], c["procs"],
                                          c["threads"], extra))
    for c, res in zip(configs, results):
        times = [r["time"] for r in res]
        r0 = res[0]
        row = {
            "experiment": exp, "version": c["version"], "procs": c["procs"],
            "threads": c["threads"], "workers": c["procs"] * c["threads"],
            "sched": c["sched"], "chunk": c["chunk"],
            "n": r0["n"], "d": r0["d"], "k": c["k"], "iters": r0["iters"], "sse": r0["sse"],
            "time": statistics.median(times), "tmin": min(times), "tmax": max(times),
            "t_comm": statistics.median([r["t_comm"] for r in res]),
            "t_wait": statistics.median([r["t_wait"] for r in res]),
        }
        rows.append(row)
        print("  %-12s %-7s P=%d T=%d %-8s n=%d d=%d k=%d  time=%.3fs (min %.3f max %.3f)" % (
            exp, c["version"], c["procs"], c["threads"], c["sched"], row["n"], row["d"],
            c["k"], row["time"], row["tmin"], row["tmax"]), flush=True)


def save(rows, name):
    path = os.path.join(RESULTS, name)
    with open(path, "w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=FIELDS)
        w.writeheader()
        w.writerows(rows)
    print("wrote", path)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--quick", action="store_true", help="small smoke test")
    args = ap.parse_args()
    scale = 0.05 if args.quick else 1.0
    repeats = 1 if args.quick else 5
    N = lambda n: max(1000, int(n * scale))
    os.makedirs(RESULTS, exist_ok=True)
    t_start = time.time()

    # ---- datasets (created once, reused on later runs) -------------------
    tag = "_quick" if args.quick else ""
    base = make_data(N(1000000), 8, 8, 1, "syn_n%d_d8%s" % (N(1000000), tag))
    sizes = {n: make_data(N(n), 8, 8, 1, "syn_n%d_d8%s" % (N(n), tag))
             for n in (100000, 500000, 1000000, 2000000)}
    dims = {d: make_data(N(1000000), d, 8, 1, "syn_n%d_d%d%s" % (N(1000000), d, tag))
            for d in (2, 8, 32)}
    K = 8

    # ---- OpenMP: threads ---------------------------------------------------
    print("OpenMP threads")
    rows = []
    bench(rows, "omp_threads", [cfg("serial", base, K)] +
          [cfg("omp", base, K, threads=t, sched="static") for t in (1, 2, 4, 8)], repeats)
    save(rows, "omp_threads.csv")

    # ---- OpenMP: scheduling policies ---------------------------------------
    print("OpenMP schedules (4 threads)")
    rows = []
    bench(rows, "omp_sched", [cfg("serial", base, K)] +
          [cfg("omp", base, K, threads=4, sched=s_, chunk=c_)
           for s_, c_ in (("static", 0), ("dynamic", 1), ("dynamic", 1024), ("guided", 0))], repeats)
    save(rows, "omp_sched.csv")

    # ---- MPI: processes ------------------------------------------------------
    print("MPI processes")
    rows = []
    bench(rows, "mpi_procs", [cfg("serial", base, K)] +
          [cfg("mpi", base, K, procs=p) for p in (1, 2, 4, 8)], repeats)
    save(rows, "mpi_procs.csv")

    # ---- Hybrid: processes x threads ------------------------------------------
    print("Hybrid")
    rows = []
    bench(rows, "hybrid", [cfg("serial", base, K)] +
          [cfg("hybrid", base, K, procs=p, threads=t, sched="static")
           for p, t in ((1, 1), (1, 2), (1, 4), (2, 1), (2, 2), (4, 1))], repeats)
    save(rows, "hybrid.csv")

    # ---- problem-size sweeps: serial vs the four-worker parallel versions ---------
    def four(path, k):
        return [cfg("serial", path, k),
                cfg("omp", path, k, threads=4, sched="static"),
                cfg("mpi", path, k, procs=4),
                cfg("hybrid", path, k, procs=2, threads=2, sched="static")]

    print("Effect of n")
    rows = []
    for n, path in sizes.items():
        bench(rows, "size", four(path, K), repeats)
    save(rows, "size.csv")

    print("Effect of k")
    rows = []
    for k in (4, 8, 16, 32):
        bench(rows, "kvals", four(base, k), repeats)
    save(rows, "kvals.csv")

    print("Effect of d")
    rows = []
    for d, path in dims.items():
        bench(rows, "dvals", four(path, K), repeats)
    save(rows, "dvals.csv")

    # ---- random vs K-Means++ starting centroids (serial) ----------------------------
    print("Initialisation: random vs K-Means++")
    path = make_data(N(200000), 8, 16, 3, "syn_init%s" % tag, std=8.0)
    rows = []
    for seed in range(1, 11):
        for init in ("random", "plus"):
            r = run_program("serial", path, 16, extra=["-m", "300", "-t", "1e-4",
                                                       "-s", str(seed), "-i", init])
            rows.append({"init": init, "seed": seed, "iters": r["iters"], "sse": r["sse"],
                         "time": r["time"], "t_init": r["t_init"]})
    with open(os.path.join(RESULTS, "init_compare.csv"), "w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=["init", "seed", "iters", "sse", "time", "t_init"])
        w.writeheader()
        w.writerows(rows)
    print("wrote init_compare.csv")

    print("\nAll benchmarks done in %.1f minutes." % ((time.time() - t_start) / 60))


if __name__ == "__main__":
    main()
