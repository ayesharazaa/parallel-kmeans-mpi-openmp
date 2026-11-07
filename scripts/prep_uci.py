"""prep_uci.py - turn the three UCI text files into the binary format used by
the C programs (int32 n, int32 d, then n*d doubles) plus a label file.

  iris    : 150 x 4,   k=3   (raw values)
  wine    : 178 x 13,  k=3   (standardised: columns have very different scales)
  letter  : 20000 x 16, k=26 (raw values, all columns are on a 0-15 scale)

Downloads the text files into data/ if they are missing.
"""
import os
import urllib.request

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(os.path.dirname(HERE), "data")
BASE = "https://archive.ics.uci.edu/ml/machine-learning-databases/"

# name: (url path, file, label column, first feature column, last feature column+1, standardise)
SETS = {
    "iris": ("iris/iris.data", "iris.data", 4, 0, 4, False),
    "wine": ("wine/wine.data", "wine.data", 0, 1, 14, True),
    "letter": ("letter-recognition/letter-recognition.data", "letter-recognition.data", 0, 1, 17, False),
}


def prepare(name):
    url, fname, lab, c0, c1, std = SETS[name]
    path = os.path.join(DATA, fname)
    if not os.path.exists(path):
        os.makedirs(DATA, exist_ok=True)
        print("downloading", url)
        urllib.request.urlretrieve(BASE + url, path)
    rows = [l.strip().split(",") for l in open(path) if l.strip()]
    x = np.array([[float(v) for v in r[c0:c1]] for r in rows], dtype=np.float64)
    classes = sorted(set(r[lab] for r in rows))
    y = np.array([classes.index(r[lab]) for r in rows], dtype=np.int32)
    if std:
        x = (x - x.mean(axis=0)) / x.std(axis=0)
    out = os.path.join(DATA, name + ".bin")
    with open(out, "wb") as f:
        np.array([x.shape[0], x.shape[1]], dtype=np.int32).tofile(f)
        np.ascontiguousarray(x).tofile(f)
    y.tofile(os.path.join(DATA, name + ".labels"))
    print("wrote %s: n=%d d=%d classes=%d" % (out, x.shape[0], x.shape[1], len(classes)))


if __name__ == "__main__":
    for s in SETS:
        prepare(s)
