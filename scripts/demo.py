"""demo.py - run all four versions on the same data and print a comparison table.

A quick hands-on demo (about 30 seconds): it shows that every version finds the
same clustering (same SSE) and how much faster the parallel versions are.

Usage:  python scripts/demo.py            (1,000,000 points)
        python scripts/demo.py 200000     (smaller / faster)
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from runlib import make_data, run_program

n = int(sys.argv[1]) if len(sys.argv) > 1 else 1000000
K = 8
FIXED = ["-m", "20", "-t", "-1"]  # exactly 20 iterations for every version
path = make_data(n, 8, 8, 1, "demo_n%d" % n)

# (label, version, processes, threads, extra options)
runs = [
    ("serial (1 core)",              "serial", 1, 1, []),
    ("OpenMP, 1 thread",             "omp",    1, 1, []),
    ("OpenMP, 2 threads",            "omp",    1, 2, []),
    ("OpenMP, 4 threads (static)",   "omp",    1, 4, ["-S", "static"]),
    ("OpenMP, 4 threads (dynamic,1)", "omp",   1, 4, ["-S", "dynamic", "-C", "1"]),
    ("OpenMP, 4 threads (dynamic,1024)", "omp", 1, 4, ["-S", "dynamic", "-C", "1024"]),
    ("OpenMP, 4 threads (guided)",   "omp",    1, 4, ["-S", "guided"]),
    ("MPI, 2 processes",             "mpi",    2, 1, []),
    ("MPI, 4 processes",             "mpi",    4, 1, []),
    ("hybrid, 2 procs x 2 threads",  "hybrid", 2, 2, []),
    ("hybrid, 1 proc x 4 threads",   "hybrid", 1, 4, []),
]

print("K-Means demo: n=%d points, d=8, k=8, exactly 20 iterations (median of 3 runs)\n" % n)
print("%-34s %9s %8s %11s %9s" % ("version", "time (s)", "speedup", "SSE", "iters"))
print("-" * 76)
t_serial = None
for label, version, procs, threads, extra in runs:
    res = [run_program(version, path, K, procs, threads, FIXED + extra) for _ in range(3)]
    res.sort(key=lambda r: r["time"])
    r = res[1]  # the median of the three
    if t_serial is None:
        t_serial = r["time"]
    print("%-34s %9.3f %7.2fx %11.6g %9d" % (label, r["time"], t_serial / r["time"], r["sse"], r["iters"]))
print("\nSame SSE and iteration count in every row = every version found the same clustering.")
print("Only the time changes. Speedup = serial time / this time.")
