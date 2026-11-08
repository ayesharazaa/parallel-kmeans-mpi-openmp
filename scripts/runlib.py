"""runlib.py - small helpers shared by validate.py and run_benchmarks.py.

It finds the compiled programs in bin/, runs them (through mpiexec when
needed) and turns the single "RESULT key=value ..." line they print into a
Python dictionary.
"""
import os
import shutil
import subprocess
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BIN = os.path.join(ROOT, "bin")
DATA = os.path.join(ROOT, "data")
RESULTS = os.path.join(ROOT, "results")
EXE = ".exe" if os.name == "nt" else ""


def exe(name):
    """Full path of a program built by make, e.g. exe('kmeans_omp')."""
    path = os.path.join(BIN, name + EXE)
    if not os.path.exists(path):
        sys.exit("missing %s - run 'make all' first" % path)
    return path


def _mpiexec():
    found = shutil.which("mpiexec") or shutil.which("mpirun")
    if found:
        return found
    ms = r"C:\Program Files\Microsoft MPI\Bin\mpiexec.exe"
    if os.path.exists(ms):
        return ms
    sys.exit("mpiexec not found - on Windows run 'source env.sh' first")


def parse_result(text):
    """Turn 'RESULT a=1 b=x ...' into {'a': 1.0 or 'x', ...}."""
    for line in text.splitlines():
        if line.startswith("RESULT"):
            out = {}
            for tok in line.split()[1:]:
                key, val = tok.split("=", 1)
                try:
                    out[key] = float(val) if ("." in val or "e" in val) else int(val)
                except ValueError:
                    out[key] = val
            return out
    raise RuntimeError("no RESULT line in output:\n" + text)


def run_program(version, datafile, k, procs=1, threads=1, extra=None):
    """Run one K-Means program and return its result dictionary.

    version : 'serial', 'omp', 'mpi' or 'hybrid'
    extra   : list of extra command-line options, e.g. ['-m', '20', '-t', '-1']
    """
    extra = list(extra or [])
    cmd = [exe("kmeans_" + version), datafile, str(k)] + extra
    if version in ("omp", "hybrid"):
        cmd += ["-T", str(threads)]
    if version in ("mpi", "hybrid"):
        launcher = [_mpiexec()]
        if shutil.which("ompi_info"):
            # Open MPI: allow more processes than CPU slots (the 8-process test), and do
            # not pin each process to one core (that would trap its OpenMP threads).
            launcher += ["--oversubscribe", "--bind-to", "none"]
        cmd = launcher + ["-n", str(procs)] + cmd
    proc = subprocess.run(cmd, capture_output=True, text=True)
    if proc.returncode != 0:
        raise RuntimeError("command failed: %s\n%s%s" % (" ".join(cmd), proc.stdout, proc.stderr))
    return parse_result(proc.stdout)


def make_data(n, d, k, seed, name, std=5.0):
    """Create data/<name>.bin with gen_data unless it already exists."""
    path = os.path.join(DATA, name + ".bin")
    if not os.path.exists(path):
        os.makedirs(DATA, exist_ok=True)
        subprocess.run([exe("gen_data"), str(n), str(d), str(k), str(seed), path, str(std)],
                       check=True, capture_output=True)
    return path
