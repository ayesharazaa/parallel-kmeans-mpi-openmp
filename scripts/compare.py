"""compare.py - check that a parallel result equals the serial result.

Each program can write a result file (-o option): a header line with k, d,
iterations and SSE, then one line per cluster: count followed by the centroid.

Usage:  python scripts/compare.py serial.txt parallel.txt
"""
import re
import sys

import numpy as np


def load(path):
    """Read a result file -> (header dict, counts array, centroid matrix)."""
    with open(path) as f:
        header = f.readline()
        info = dict(re.findall(r"(\w+)=(\S+)", header))
        rows = np.loadtxt(f, ndmin=2)
    counts = rows[:, 0].astype(np.int64)
    cent = rows[:, 1:]
    return {"iters": int(info["iters"]), "sse": float(info["sse"])}, counts, cent


def compare(ref_path, other_path, cent_tol=1e-7, sse_tol=1e-9):
    """Return (ok, message).  Rules:
       - same number of iterations
       - identical cluster sizes (so identical assignments in practice)
       - SSE equal to a relative 1e-9 (sums are added in a different order)
       - centroids equal to a relative 1e-7
    """
    ri, rc, rcent = load(ref_path)
    oi, oc, ocent = load(other_path)
    problems = []
    if ri["iters"] != oi["iters"]:
        problems.append("iterations %d vs %d" % (ri["iters"], oi["iters"]))
    if not np.array_equal(rc, oc):
        problems.append("cluster sizes differ")
    rel_sse = abs(ri["sse"] - oi["sse"]) / max(abs(ri["sse"]), 1e-300)
    if rel_sse > sse_tol:
        problems.append("SSE relative diff %.2e" % rel_sse)
    diff = np.max(np.abs(rcent - ocent) / np.maximum(1.0, np.abs(rcent)))
    if diff > cent_tol:
        problems.append("centroid diff %.2e" % diff)
    msg = "centroid diff %.1e, SSE rel diff %.1e" % (diff, rel_sse)
    return (not problems), ("; ".join(problems) if problems else msg)


if __name__ == "__main__":
    if len(sys.argv) != 3:
        sys.exit(__doc__)
    ok, msg = compare(sys.argv[1], sys.argv[2])
    print(("PASS: " if ok else "FAIL: ") + msg)
    sys.exit(0 if ok else 1)
