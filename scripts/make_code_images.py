"""make_code_images.py - make the black-and-white images used in the report.

1. Code images: real excerpts of the source files, with numbered markers on the
   lines that use a parallel (PDC) concept, and a legend that explains each marker.
2. Terminal images: the real output of the programs (captured by running them now).

Output: report/code_images/*.png   (needs Pillow, which comes with matplotlib)
Run from the project folder after 'make all':   python scripts/make_code_images.py
"""
import os
import subprocess
import sys
import textwrap

import matplotlib
from PIL import Image, ImageDraw, ImageFont

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "report", "code_images")
os.makedirs(OUT, exist_ok=True)
sys.path.insert(0, os.path.join(ROOT, "scripts"))

FONT_PATH = os.path.join(os.path.dirname(matplotlib.__file__), "mpl-data", "fonts", "ttf", "DejaVuSansMono.ttf")
FONT_BOLD = os.path.join(os.path.dirname(matplotlib.__file__), "mpl-data", "fonts", "ttf", "DejaVuSansMono-Bold.ttf")
SANS = os.path.join(os.path.dirname(matplotlib.__file__), "mpl-data", "fonts", "ttf", "DejaVuSans.ttf")
SANS_BOLD = os.path.join(os.path.dirname(matplotlib.__file__), "mpl-data", "fonts", "ttf", "DejaVuSans-Bold.ttf")
CODE_SIZE = 17
mono = ImageFont.truetype(FONT_PATH, CODE_SIZE)
mono_b = ImageFont.truetype(FONT_BOLD, CODE_SIZE)
sans = ImageFont.truetype(SANS, 18)
sans_b = ImageFont.truetype(SANS_BOLD, 18)
LH = 26          # line height in pixels
CHAR_W = mono.getlength("M")


def read_src(rel):
    with open(os.path.join(ROOT, rel), encoding="utf8") as f:
        return f.read().split("\n")


def find(lines, text, start=0):
    for i in range(start, len(lines)):
        if text in lines[i]:
            return i
    raise ValueError("text not found: " + text)


def excerpt(rel, first, last):
    """Lines from the first line containing `first` to the first later line containing `last`."""
    lines = read_src(rel)
    a = find(lines, first)
    b = find(lines, last, a)
    return lines[a:b + 1]


def wrap_legend(items, width_chars):
    out = []
    for num, text in items:
        w = textwrap.wrap(text, width_chars - 5)
        for j, t in enumerate(w):
            out.append((num if j == 0 else None, t))
    return out


def code_image(name, title, code, marks, legend, width_px=1250):
    """code: list of lines. marks: list of (first_text, last_text, number). legend: [(number, text)]."""
    n = len(code)
    marked = {}  # line index -> number
    for first, last, num in marks:
        a = find(code, first)
        b = find(code, last, a)
        for i in range(a, b + 1):
            marked[i] = num
    left = 70
    leg = wrap_legend(legend, 92)
    height = 20 + 40 + n * LH + 20 + 36 + len(leg) * 28 + 24
    img = Image.new("RGB", (width_px, height), "white")
    d = ImageDraw.Draw(img)
    d.rectangle([0, 0, width_px - 1, height - 1], outline="black", width=2)
    d.text((20, 14), title, font=sans_b, fill="black")
    y0 = 56
    for i, line in enumerate(code):
        y = y0 + i * LH
        if i in marked:
            d.rectangle([left - 8, y, width_px - 70, y + LH], fill="#e4e4e4")
            d.rectangle([left - 8, y, left - 4, y + LH], fill="black")
        d.text((12, y + 3), "%2d" % (i + 1), font=mono, fill="#777777")
        d.text((left, y + 3), line.replace("\t", "    "), font=mono, fill="black")
    # circled numbers on the right, once per marked group (first line of each group)
    seen = set()
    for i in sorted(marked):
        num = marked[i]
        if num in seen:
            continue
        seen.add(num)
        cx, cy = width_px - 40, y0 + i * LH + LH // 2
        d.ellipse([cx - 14, cy - 14, cx + 14, cy + 14], fill="black")
        d.text((cx, cy), str(num), font=sans_b, fill="white", anchor="mm")
    # legend
    ly = y0 + n * LH + 18
    d.line([20, ly, width_px - 20, ly], fill="black", width=1)
    ly += 12
    for num, text in leg:
        if num is not None:
            d.ellipse([22, ly + 1, 44, ly + 23], fill="black")
            d.text((33, ly + 12), str(num), font=sans_b, fill="white", anchor="mm")
        d.text((58, ly), text, font=sans, fill="black")
        ly += 28
    path = os.path.join(OUT, name)
    img.save(path)
    print("wrote", path)


def terminal_image(name, title, blocks, width_px=1250):
    """blocks: list of (command, output text). Black text on light grey."""
    lines = []
    for cmd, out in blocks:
        lines.append(("$ " + cmd, True))
        for l in out.rstrip("\n").split("\n"):
            lines.append((l, False))
        lines.append(("", False))
    maxc = int((width_px - 40) / CHAR_W)
    wrapped = []
    for text, bold in lines:
        if len(text) <= maxc:
            wrapped.append((text, bold))
        else:
            for j, t in enumerate(textwrap.wrap(text, maxc - 2, subsequent_indent="  ", break_long_words=True)):
                wrapped.append((t, bold))
    height = 50 + len(wrapped) * LH + 20
    img = Image.new("RGB", (width_px, height), "#f3f3f3")
    d = ImageDraw.Draw(img)
    d.rectangle([0, 0, width_px - 1, 34], fill="#d0d0d0")
    d.text((14, 8), title, font=sans_b, fill="black")
    d.rectangle([0, 0, width_px - 1, height - 1], outline="black", width=2)
    y = 44
    for text, bold in wrapped:
        d.text((16, y), text, font=mono_b if bold else mono, fill="black")
        y += LH
    path = os.path.join(OUT, name)
    img.save(path)
    print("wrote", path)


def run(cmd):
    p = subprocess.run(cmd, shell=True, capture_output=True, text=True, cwd=ROOT)
    return p.stdout + p.stderr


def main():
    # ------------------------------------------------------------------ code images
    serial = excerpt("src/kmeans_serial.c", "double t0 = wtime();", "double t = wtime() - t0;")
    code_image("code_serial.png", "Serial baseline: src/kmeans_serial.c (main loop)", serial,
               [("assign_serial(", "assign_serial(", 1), ("update_centroids(", "update_centroids(", 2),
                ("if (shift < o.tol)", "if (shift < o.tol)", 3)],
               [(1, "Step 1, assignment: every point is compared with every centroid. This is almost all of the running time, so it is the part we make parallel."),
                (2, "Step 2, update: each centroid moves to the mean of its points. This is tiny work (k x d), so it stays serial in every version."),
                (3, "Stop when the centroids have almost stopped moving (or after the maximum number of iterations).")])

    omp = excerpt("src/common.h", "static inline void assign_omp", "free(lcounts);")
    omp = [l for l in omp if not l.strip().startswith(("/*", "*", " *"))]   # keep only the code lines
    omp = [l for l in omp if "labels" not in l or "if (labels)" not in l]
    omp.append("}")
    code_image("code_openmp.png", "OpenMP: assign_omp() in src/common.h (comments removed)", omp,
               [("size_t sstride", "size_t cstride", 1),
                ("double *lsums", "long long *lcounts", 2),
                ("#pragma omp parallel reduction", "#pragma omp parallel reduction", 3),
                ("double *my_sums", "long long *my_counts", 2),
                ("#pragma omp for schedule(runtime)", "#pragma omp for schedule(runtime)", 4),
                ("for (int t = 0; t < T; t++)", "counts[c] +=", 5)],
               [(1, "No false sharing: each thread block is followed by 16 unused doubles (128 bytes), so two threads never write to the same cache line."),
                (2, "No race condition: each thread adds only into its own private block (my_sums, my_counts). Two threads never write to the same number at the same time."),
                (3, "Reduction: reduction(+ : total) gives each thread its own copy of the SSE and adds the copies together at the end."),
                (4, "Work sharing: '#pragma omp for' splits the loop over the points between the threads. schedule(runtime) lets us choose static, dynamic or guided when we run the program."),
                (5, "Merge: after the parallel loop, the private blocks are added together in thread order. This is small, serial work, and it keeps the result the same every run.")])

    mpi = excerpt("src/kmeans_mpi.c", "long base = n / size", "if (shift < o.tol)")
    mpi = [l for l in mpi if l.strip() and not l.strip().startswith(("/*", "*"))]
    code_image("code_mpi.png", "MPI: main part of src/kmeans_mpi.c", mpi,
               [("long base = n / size", "long start =", 1),
                ("double *pts = read_rows", "double *pts = read_rows", 2),
                ("assign_serial(", "assign_serial(", 3),
                ("double w0 = MPI_Wtime();", "t_wait +=", 4),
                ("MPI_Allreduce(MPI_IN_PLACE, buf", "MPI_Allreduce(MPI_IN_PLACE, counts", 5),
                ("double shift = update_centroids", "if (shift < o.tol)", 6)],
               [(1, "Data decomposition: the n points are divided into nearly equal slices, one per process. The first (n % size) processes get one extra point."),
                (2, "Each process reads only its own slice from the file, so the data is spread over the memory of all processes."),
                (3, "Local computation: each process finds the nearest centroid for its own points only. The results are partial sums, counts and SSE."),
                (4, "Barrier: wait here until every process is ready. The time spent waiting is the load imbalance, and we measure it separately from communication."),
                (5, "Collective communication: MPI_Allreduce adds the partial results of all processes and gives the total to every process. Only k x d + 1 numbers are sent."),
                (6, "Every process now has the same totals, so every process computes the same new centroids and stops in the same iteration.")])

    hyb = excerpt("src/kmeans_hybrid.c", "MPI_Init_thread", "MPI_Allreduce(MPI_IN_PLACE, counts")
    hyb = [l for l in hyb if l.strip() and not l.strip().startswith(("/*", "*", "//"))]
    hyb = [l for l in hyb if not any(t in l for t in ("MPI_Comm_rank", "MPI_Comm_size", "int rank, size", "read_header",
                                                         "die(", "int k = o.k", "int n, d", "malloc"))]
    code_image("code_hybrid.png", "Hybrid MPI + OpenMP: src/kmeans_hybrid.c (shortened)", hyb,
               [("MPI_Init_thread", "MPI_Init_thread", 1),
                ("setup_openmp(&o);", "setup_openmp(&o);", 2),
                ("long base = n / size", "double *pts = read_rows", 3),
                ("assign_omp(", "assign_omp(", 4),
                ("double w0 = MPI_Wtime();", "MPI_Allreduce(MPI_IN_PLACE, counts", 5)],
               [(1, "MPI is started with MPI_THREAD_FUNNELED: only the main thread of each process is allowed to call MPI."),
                (2, "Choose how many OpenMP threads each process uses (the -T option)."),
                (3, "Data decomposition: the points are split between processes, and each process reads only its own slice (the same as in the MPI version)."),
                (4, "Level 2 of parallelism: inside each process the assignment loop is shared between OpenMP threads (the same function as in the OpenMP version)."),
                (5, "Level 1 of parallelism: after the threads are finished, the main thread waits for the other processes (barrier) and combines all results with MPI_Allreduce. MPI calls are outside the parallel region.")])

    # ------------------------------------------------------------------ terminal images
    data = os.path.join(ROOT, "data", "syn_n1000000_d8.bin")
    if os.name == "nt":
        s, o, m, h = "bin\\kmeans_serial.exe", "bin\\kmeans_omp.exe", "bin\\kmeans_mpi.exe", "bin\\kmeans_hybrid.exe"
    else:
        s, o, m, h = "bin/kmeans_serial", "bin/kmeans_omp", "bin/kmeans_mpi", "bin/kmeans_hybrid"
    opts = "data/syn_n1000000_d8.bin 8 -m 20 -t -1"
    shown = "data/big.bin 8 -m 20 -t -1"
    blocks = []
    for label, cmd, shown_cmd in [
        ("serial", "%s %s" % (s, opts), "bin/kmeans_serial %s" % shown),
        ("omp", "%s %s -T 4" % (o, opts), "bin/kmeans_omp %s -T 4" % shown),
        ("mpi", "mpiexec -n 4 %s %s" % (m, opts), "mpiexec -n 4 bin/kmeans_mpi %s" % shown),
        ("hybrid", "mpiexec -n 2 %s %s -T 2" % (h, opts), "mpiexec -n 2 bin/kmeans_hybrid %s -T 2" % shown)]:
        if os.path.exists(data):
            blocks.append((shown_cmd, run(cmd)))
    if blocks:
        terminal_image("terminal_four_versions.png", "Terminal: the four versions on 1,000,000 points (k = 8, 20 iterations)", blocks)
    ps = "python" if os.name == "nt" else "python3"
    val = run("%s scripts/validate.py" % ps)
    keep = []
    for l in val.split("\n"):
        keep.append(l)
    # show the first data set block and the last lines
    first = val.split("\n")
    idx = [i for i, l in enumerate(first) if l.startswith("wine")]
    short = first[:idx[0]] if idx else first[:12]
    short += ["   ...", ""] + [l for l in first[-3:]]
    terminal_image("terminal_validation.png", "Terminal: correctness test (parallel versions against serial)", [("python scripts/validate.py", "\n".join(short))])


if __name__ == "__main__":
    main()
