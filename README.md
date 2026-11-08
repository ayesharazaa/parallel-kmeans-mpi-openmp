# Parallel K-Means Clustering using MPI + OpenMP

Course project for Parallel and Distributed Computing (PDC). K-Means is implemented in C four ways
(serial, OpenMP, MPI, hybrid MPI + OpenMP) and benchmarked for speedup, efficiency and scalability.

* **MPI** = Message Passing Interface (distributed memory: separate processes send messages).
* **OpenMP** = Open Multi-Processing (shared memory: several threads in one process).
* **SSE** = sum of squared errors (the sum of squared distances from every point to its centroid).

## How K-Means works (Lloyd's algorithm)

Repeat until the centroids stop moving (or a fixed number of iterations):

1. **Assignment step**: give every point to its nearest centroid. This costs O(n·k·d) per iteration
   (n points, k clusters, d dimensions) and is almost all of the running time, so it is what we parallelise.
2. **Update step**: move each centroid to the mean of its points (only O(k·d) work, stays serial).

## Folder layout

```
Makefile                    make all / test / bench / plots / clean
env.sh                      Windows only: puts gcc, make and mpiexec on the PATH
src/common.h                shared code: file reading, random numbers, the assignment and update steps
src/gen_data.c              synthetic data generator
src/kmeans_serial.c         serial baseline
src/kmeans_omp.c            OpenMP version
src/kmeans_mpi.c            MPI version
src/kmeans_hybrid.c         MPI + OpenMP version
scripts/runlib.py           helpers: find programs, run them, parse their output
scripts/compare.py          checks that a parallel result equals the serial result
scripts/prep_uci.py         converts the UCI text files to the binary format
scripts/validate.py         correctness tests (synthetic + 3 real UCI datasets)
scripts/run_benchmarks.py   runs every experiment -> results/*.csv
scripts/make_plots.py       draws plots/*.png and writes results/tables.md
scripts/run_all.sh          build + test + benchmark + plots in one command
data/                       datasets (UCI text files, generated .bin files)
results/                    CSV tables, tables.md, benchmark_log.txt
plots/                      graphs (PNG)
report/results_draft.md     draft of the results and analysis section
```

## The four versions in one paragraph each

* **Serial** (`kmeans_serial.c`): reads all points, loops assignment + update.
* **OpenMP** (`kmeans_omp.c`, `assign_omp` in `common.h`): the loop over points is shared by threads
  (`#pragma omp for schedule(runtime)`). Many threads adding into the same sums would be a *race condition*,
  so each thread has its own private sums/counts; they are added together after the loop. The private blocks
  are separated by 128 bytes of padding so threads never write to the same cache line (*false sharing*).
  The schedule (`static`, `dynamic`, `guided`) and chunk size are chosen on the command line (`-S`, `-C`).
* **MPI** (`kmeans_mpi.c`): points are split into equal slices, one per process; each process reads only its slice
  and keeps a full copy of the k centroids. Each iteration every process computes partial sums and counts for its
  points and `MPI_Allreduce` adds them across all processes, so everyone gets the same new centroids.
* **Hybrid** (`kmeans_hybrid.c`): MPI splits the points between processes, and inside each process OpenMP threads
  run the assignment loop. MPI is called only by the main thread, outside the parallel region
  (`MPI_THREAD_FUNNELED`).

All four use the same starting centroids (the same k random points, chosen with a seeded generator) so their
results can be compared exactly. Timing covers only the iteration loop (not file reading). The MPI programs also
report time spent waiting at a barrier for the slowest process (`t_wait`) separately from the time of
`MPI_Allreduce` itself (`t_comm`).

## Setup

**Windows (what this project was developed on)**: install MSYS2 (gcc, make), Microsoft MPI (runtime + SDK) and
Python with numpy and matplotlib:

```bash
winget install MSYS2.MSYS2
winget install Microsoft.msmpi          # needs the Windows administrator prompt
pip install numpy matplotlib
# inside the MSYS2 shell:
pacman -S mingw-w64-ucrt-x86_64-gcc mingw-w64-ucrt-x86_64-libgomp mingw-w64-ucrt-x86_64-msmpi mingw-w64-ucrt-x86_64-make
```

Then in Git Bash or an MSYS2 shell, from the project folder: `source env.sh`.

**Linux**: `sudo apt install build-essential openmpi-bin libopenmpi-dev make python3-numpy python3-matplotlib`
(no `env.sh` needed; the Makefile uses `mpicc` automatically).

## Reproduce everything

```bash
source env.sh            # Windows only
make all                 # build into bin/    (on Windows: mingw32-make all)
make test                # correctness: every version vs serial, 4 datasets
make bench               # all experiments -> results/*.csv   (about 10 minutes)
make plots               # plots/*.png and results/tables.md
```

or all of it with one command: `bash scripts/run_all.sh`.

Run a single program by hand:

```bash
bin/gen_data.exe 1000000 8 8 1 data/my.bin          # n d k_true seed output
bin/kmeans_serial.exe data/my.bin 8 -m 20 -t -1      # k=8, exactly 20 iterations
bin/kmeans_omp.exe data/my.bin 8 -m 20 -t -1 -T 4 -S dynamic -C 1024
mpiexec -n 4 bin/kmeans_mpi.exe data/my.bin 8 -m 20 -t -1
mpiexec -n 2 bin/kmeans_hybrid.exe data/my.bin 8 -m 20 -t -1 -T 2
```

Options: `-m` max iterations, `-t` stop tolerance (`-1` = never stop early), `-s` seed, `-o` write centroids,
`-T` threads, `-S`/`-C` OpenMP schedule and chunk, `-i plus` K-Means++ start (serial only), `-a` write labels (serial only).

## Datasets

* Synthetic Gaussian blobs from `gen_data` (any n, d, k).
* UCI Machine Learning Repository, used for validation: **Iris** (150 x 4), **Wine** (178 x 13, standardised),
  **Letter Recognition** (20000 x 16).

## Correctness check

`scripts/validate.py` runs each parallel version (several thread/process counts and schedules, including process
counts that do not divide n) and compares with the serial result: same iteration count, identical cluster sizes,
SSE and centroids equal up to floating-point rounding (relative difference about 1e-15; sums are added in a
different order in the parallel versions).

## Running on Linux (Ubuntu / WSL2) with Open MPI

Same code and commands, no `env.sh` needed. In Ubuntu (for Windows users: `wsl --install -d Ubuntu`):

```bash
sudo apt install -y build-essential openmpi-bin libopenmpi-dev make python3-numpy python3-matplotlib
make all && make test && make bench && make plots
```

`scripts/runlib.py` adds `--oversubscribe --bind-to none` to `mpiexec` automatically when Open MPI is detected.
The Linux results of this project are kept separately in `linux/results/` and `linux/plots/`
(the Windows results are in `results/` and `plots/`).

## Machine used

Intel Core i7-6600U, 2 physical cores / 4 hardware threads (hyper-threading), 7.9 GB RAM, Windows 10,
GCC 16.2 (`-O2`), Microsoft MPI. With only 2 physical cores, speedup is limited to roughly 2 to 2.5x; see the
analysis in `report/results_draft.md`. Timings on a laptop vary by up to about 10 to 15% between runs
(heat, background programs), which is why each point is the median of 5 runs.
