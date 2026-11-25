"""prep_real.py - convert the three large UCI data sets into the binary format
used by the C programs (int32 n, int32 d, then n*d doubles, row by row).

  covertype          : forest cover type. Uses the first 10 numeric columns
                       (elevation, slope, distances, hill shade, ...). The 44 columns
                       that are only 0/1 flags and the class label are not used as features.
  yearpredictionmsd  : song audio features. Uses the 90 audio features, drops the year.
  census1990         : US Census 1990, 68 coded attributes. Drops the case id column.

Every column is standardised (mean 0, standard deviation 1) because the columns
have very different scales, and K-Means uses plain distances.

Input : data/raw/<name>/<name>.zip   (downloaded from the UCI repository; see README)
Output: data/<name>.bin  (+ data/<name>.labels for covertype, the 7 real cover types)

Usage:  python scripts/prep_real.py [name ...]      (default: every zip that is present)
        python scripts/prep_real.py census1990 --rows 1000000   (only the first N rows)
"""
import gzip
import io
import os
import sys
import zipfile

import numpy as np
import pandas as pd

HERE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(os.path.dirname(HERE), "data")
RAW = os.path.join(DATA, "raw")

# name: (substring of the file inside the zip, columns to use as features or None, label column or None)
SETS = {
    "covertype": ("covtype.data", list(range(10)), 54),
    "yearpredictionmsd": ("YearPredictionMSD", list(range(1, 91)), None),
    "census1990": ("USCensus1990.data", None, None),
}


def open_member(zf, key, outdir):
    """Find the data file inside the zip and return a binary file object for it."""
    names = [n for n in zf.namelist() if key.lower() in n.lower() and not n.endswith("/")]
    names = [n for n in names if not n.lower().endswith((".info", ".names", ".html"))]
    if not names:
        sys.exit("no file containing '%s' in the zip (found: %s)" % (key, zf.namelist()))
    name = names[0]
    data = zf.open(name)
    if name.endswith(".gz"):
        data = gzip.open(data)
    print("  reading", name)
    return data


def convert(name, max_rows=None):
    key, cols, label_col = SETS[name]
    zpath = os.path.join(RAW, name, name + ".zip")
    if not os.path.exists(zpath):
        print("skipping %s: %s not found" % (name, zpath))
        return
    print("converting", name)
    with zipfile.ZipFile(zpath) as zf:
        f = open_member(zf, key, os.path.join(RAW, name))
        # header row? (the census file has one, the others do not)
        head = f.readline()
        has_header = not head.split(b",")[0].strip().lstrip(b"-").replace(b".", b"", 1).isdigit()
        f2 = io.BytesIO(head) if not has_header else io.BytesIO()
        rest = f.read()
        buf = io.BytesIO(f2.getvalue() + rest)
        sep = r"[,\s]+" if name == "yearpredictionmsd" else ","
        df = pd.read_csv(buf, header=None, sep=sep, engine="c" if sep == "," else "python",
                         dtype=np.float32, nrows=max_rows)
    del rest, buf
    labels = df.iloc[:, label_col].to_numpy().astype(np.int32) if label_col is not None else None
    if cols is None:                                  # census: drop the first column (case id)
        cols = list(range(1, df.shape[1]))
    x = df.iloc[:, cols].to_numpy(dtype=np.float32)
    del df
    mean = x.mean(axis=0, dtype=np.float64)
    std = x.std(axis=0, dtype=np.float64)
    std[std == 0] = 1.0                               # constant column: leave as 0 after centring
    n, d = x.shape
    out = os.path.join(DATA, name + ".bin")
    with open(out, "wb") as g:
        np.array([n, d], dtype=np.int32).tofile(g)
        for i in range(0, n, 200000):                 # write in blocks to limit memory
            block = (x[i:i + 200000].astype(np.float64) - mean) / std
            np.ascontiguousarray(block).tofile(g)
    if labels is not None:
        labels.tofile(os.path.join(DATA, name + ".labels"))
    print("  wrote %s: n=%d d=%d (%.0f MB)" % (out, n, d, os.path.getsize(out) / 1e6))


if __name__ == "__main__":
    args = [a for a in sys.argv[1:]]
    rows = None
    if "--rows" in args:
        i = args.index("--rows")
        rows = int(args[i + 1])
        del args[i:i + 2]
    for nm in (args or list(SETS)):
        convert(nm, rows)
