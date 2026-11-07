"""validate.py - correctness check of every parallel version against serial.

For each dataset it runs the serial program, then OpenMP / MPI / hybrid
versions (several thread/process counts and schedules, including process
counts that do not divide n evenly) and compares the final centroids, cluster
sizes, SSE and iteration count with the serial result (see compare.py).
It also prints the cluster "purity" on the real UCI data: the fraction of
points whose cluster's majority class equals their own class.

Exit status is 1 if anything fails.
"""
import os
import sys

import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import prep_uci
from compare import compare
from runlib import DATA, RESULTS, make_data, run_program

# (label, version, procs, threads, extra options)
CASES = [
    ("omp  T=1", "omp", 1, 1, []),
    ("omp  T=4 static", "omp", 1, 4, ["-S", "static"]),
    ("omp  T=4 dynamic,16", "omp", 1, 4, ["-S", "dynamic", "-C", "16"]),
    ("omp  T=3 guided", "omp", 1, 3, ["-S", "guided"]),
    ("mpi  P=1", "mpi", 1, 1, []),
    ("mpi  P=3", "mpi", 3, 1, []),
    ("mpi  P=4", "mpi", 4, 1, []),
    ("hyb  P=2 T=2", "hybrid", 2, 2, []),
    ("hyb  P=3 T=2", "hybrid", 3, 2, []),
]


def purity(labels_file, truth_file, k):
    """Share of points that belong to the majority class of their cluster."""
    pred = np.fromfile(labels_file, dtype=np.int32)
    truth = np.fromfile(truth_file, dtype=np.int32)
    total = 0
    for c in range(k):
        members = truth[pred == c]
        if len(members):
            total += np.bincount(members).max()
    return total / len(truth)


def main():
    os.makedirs(RESULTS, exist_ok=True)
    prep_uci.prepare("iris"), prep_uci.prepare("wine"), prep_uci.prepare("letter")
    synth = make_data(50000, 8, 8, 7, "validate_synth")
    # (name, file, k, options for the run)
    datasets = [
        ("iris", os.path.join(DATA, "iris.bin"), 3, ["-m", "100", "-t", "1e-4"]),
        ("wine", os.path.join(DATA, "wine.bin"), 3, ["-m", "100", "-t", "1e-4"]),
        ("letter", os.path.join(DATA, "letter.bin"), 26, ["-m", "100", "-t", "1e-4"]),
        ("synthetic 50k fixed 20 iters", synth, 8, ["-m", "20", "-t", "-1"]),
    ]
    failures = 0
    for name, path, k, opts in datasets:
        ref_file = os.path.join(RESULTS, "ref_serial.txt")
        lab_file = os.path.join(RESULTS, "ref_labels.bin")
        ref = run_program("serial", path, k, extra=opts + ["-o", ref_file, "-a", lab_file])
        line = "%s (n=%d, d=%d, k=%d): serial %d iters, SSE %.6g" % (
            name, ref["n"], ref["d"], k, ref["iters"], ref["sse"])
        truth = os.path.join(DATA, name + ".labels")
        if os.path.exists(truth):
            line += ", purity %.3f" % purity(lab_file, truth, k)
        print(line)
        for label, version, procs, threads, extra in CASES:
            out = os.path.join(RESULTS, "tmp_out.txt")
            run_program(version, path, k, procs, threads, opts + extra + ["-o", out])
            ok, msg = compare(ref_file, out)
            failures += (not ok)
            print("   %-22s %s  %s" % (label, "PASS" if ok else "FAIL", msg))
    for f in ("tmp_out.txt", "ref_serial.txt", "ref_labels.bin"):
        os.remove(os.path.join(RESULTS, f))
    print("\nALL PASSED" if failures == 0 else "\n%d FAILURES" % failures)
    sys.exit(1 if failures else 0)


if __name__ == "__main__":
    main()
