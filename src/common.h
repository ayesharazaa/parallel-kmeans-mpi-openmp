/*
 * common.h - code shared by all K-Means programs (serial, OpenMP, MPI, hybrid).
 *
 * Data file format (binary, written by gen_data and scripts/prep_uci.py):
 *     int32 n, int32 d, then n*d doubles stored row by row (point after point).
 *
 * Everything here is "static inline" so each program just #includes this file.
 */
#ifndef COMMON_H
#define COMMON_H

#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <stdint.h>
#include <float.h>
#ifdef _WIN32
#include <windows.h>
#else
#include <time.h>
#endif
#ifdef _OPENMP
#include <omp.h>
#endif

/* ------------------------------------------------------------------ */
/* Small utilities                                                     */
/* ------------------------------------------------------------------ */

/* Print an error message and stop. */
static inline void die(const char *msg) {
    fprintf(stderr, "error: %s\n", msg);
    exit(1);
}

/* Wall-clock time in seconds (used by the serial and OpenMP programs;
 * the MPI programs use MPI_Wtime instead). */
static inline double wtime(void) {
#ifdef _WIN32
    LARGE_INTEGER f, c;
    QueryPerformanceFrequency(&f);
    QueryPerformanceCounter(&c);
    return (double)c.QuadPart / (double)f.QuadPart;
#else
    struct timespec ts;
    clock_gettime(CLOCK_MONOTONIC, &ts);
    return (double)ts.tv_sec + 1e-9 * (double)ts.tv_nsec;
#endif
}

/* 64-bit file seek, so files bigger than 2 GB work on Windows too. */
#ifdef _WIN32
#define SEEK64(f, off) _fseeki64((f), (__int64)(off), SEEK_SET)
#else
#define SEEK64(f, off) fseeko((f), (off_t)(off), SEEK_SET)
#endif

/* ------------------------------------------------------------------ */
/* Random numbers (xorshift64*): tiny, fast and the same on every OS,  */
/* so every program picks exactly the same starting centroids.         */
/* ------------------------------------------------------------------ */
static inline uint64_t rng_seed(uint64_t seed) {
    return seed * 0x9E3779B97F4A7C15ULL + 0x1234567ULL; /* never zero in practice */
}
static inline uint64_t rng_next(uint64_t *s) {
    uint64_t x = *s;
    x ^= x >> 12;
    x ^= x << 25;
    x ^= x >> 27;
    *s = x;
    return x * 0x2545F4914F6CDD1DULL;
}
/* Uniform double in [0,1). */
static inline double rng_uniform(uint64_t *s) {
    return (double)(rng_next(s) >> 11) * (1.0 / 9007199254740992.0);
}

/* ------------------------------------------------------------------ */
/* Reading the data file                                               */
/* ------------------------------------------------------------------ */
#define HEADER_BYTES 8 /* two int32 values: n and d */

/* Read only the header: number of points n and dimensions d. */
static inline void read_header(const char *path, int *n, int *d) {
    FILE *f = fopen(path, "rb");
    if (!f) { perror(path); exit(1); }
    int h[2];
    if (fread(h, sizeof(int), 2, f) != 2) die("could not read file header");
    fclose(f);
    *n = h[0];
    *d = h[1];
}

/* Read `count` rows starting at row `start` (so MPI ranks can each read
 * just their own slice).  Returns a malloc'ed array of count*d doubles. */
static inline double *read_rows(const char *path, long start, long count, int d) {
    size_t items = (size_t)count * (size_t)d;
    double *buf = (double *)malloc(sizeof(double) * (items > 0 ? items : 1));
    if (!buf) die("out of memory");
    FILE *f = fopen(path, "rb");
    if (!f) { perror(path); exit(1); }
    long long off = (long long)HEADER_BYTES + (long long)start * d * (long long)sizeof(double);
    if (SEEK64(f, off) != 0) die("seek failed");
    if (items > 0 && fread(buf, sizeof(double), items, f) != items) die("file too short");
    fclose(f);
    return buf;
}

/* ------------------------------------------------------------------ */
/* Command-line options (same for every program)                       */
/* ------------------------------------------------------------------ */
typedef struct {
    const char *file;       /* data file                                  */
    int k;                  /* number of clusters                         */
    int max_iter;           /* maximum number of iterations               */
    double tol;             /* stop when largest centroid move^2 < tol    */
    uint64_t seed;          /* seed for choosing the starting centroids   */
    const char *out;        /* optional: write final centroids here       */
    const char *labels_out; /* optional (serial only): write labels here  */
    int threads;            /* OpenMP threads (0 = use default)           */
    const char *sched;      /* OpenMP schedule: static|dynamic|guided     */
    int chunk;              /* OpenMP chunk size (0 = default)            */
    int init_plus;          /* 1 = K-Means++ start (serial only)          */
} Options;

static inline void usage(const char *prog) {
    fprintf(stderr,
        "Usage: %s data.bin k [-m max_iter] [-t tol] [-s seed] [-o centroids.txt]\n"
        "          [-T threads] [-S static|dynamic|guided] [-C chunk]\n"
        "          [-a labels.bin] [-i random|plus]\n"
        "  -t -1 (or 0) means: never stop early, always run max_iter iterations\n",
        prog);
    exit(1);
}

static inline Options parse_args(int argc, char **argv) {
    Options o;
    memset(&o, 0, sizeof o);
    o.max_iter = 100;
    o.tol = 1e-4;
    o.seed = 1;
    o.sched = "static";
    if (argc < 3) usage(argv[0]);
    o.file = argv[1];
    o.k = atoi(argv[2]);
    for (int i = 3; i < argc; i += 2) {
        if (i + 1 >= argc) usage(argv[0]);
        const char *a = argv[i], *v = argv[i + 1];
        if      (!strcmp(a, "-m")) o.max_iter = atoi(v);
        else if (!strcmp(a, "-t")) o.tol = atof(v);
        else if (!strcmp(a, "-s")) o.seed = strtoull(v, NULL, 10);
        else if (!strcmp(a, "-o")) o.out = v;
        else if (!strcmp(a, "-a")) o.labels_out = v;
        else if (!strcmp(a, "-T")) o.threads = atoi(v);
        else if (!strcmp(a, "-S")) o.sched = v;
        else if (!strcmp(a, "-C")) o.chunk = atoi(v);
        else if (!strcmp(a, "-i")) o.init_plus = !strcmp(v, "plus");
        else usage(argv[0]);
    }
    return o;
}

#ifdef _OPENMP
/* Apply -T and -S/-C.  The loops use schedule(runtime), so this choice
 * decides how iterations are handed to threads. */
static inline void setup_openmp(const Options *o) {
    if (o->threads > 0) omp_set_num_threads(o->threads);
    omp_sched_t kind = omp_sched_static;
    if (!strcmp(o->sched, "dynamic")) kind = omp_sched_dynamic;
    else if (!strcmp(o->sched, "guided")) kind = omp_sched_guided;
    omp_set_schedule(kind, o->chunk);
}
#endif

/* ------------------------------------------------------------------ */
/* Starting centroids                                                  */
/* ------------------------------------------------------------------ */

/* Random start: pick k distinct point numbers with the seeded generator and
 * read those rows straight from the file.  Every program (and every MPI
 * rank) does exactly the same thing, so all versions start identically. */
static inline void init_random(const char *path, int n, int d, int k,
                               uint64_t seed, double *cent) {
    uint64_t s = rng_seed(seed);
    long *idx = (long *)malloc(sizeof(long) * (size_t)k);
    for (int i = 0; i < k; i++) {
        int dup;
        do {
            idx[i] = (long)(rng_next(&s) % (uint64_t)n);
            dup = 0;
            for (int j = 0; j < i; j++) if (idx[j] == idx[i]) dup = 1;
        } while (dup);
        double *row = read_rows(path, idx[i], 1, d);
        memcpy(cent + (size_t)i * d, row, sizeof(double) * (size_t)d);
        free(row);
    }
    free(idx);
}

/* Squared Euclidean distance between two d-dimensional vectors. */
static inline double sqdist(const double *a, const double *b, int d) {
    double s = 0.0;
    for (int j = 0; j < d; j++) { double t = a[j] - b[j]; s += t * t; }
    return s;
}

/* K-Means++ start (optional experiment, needs all points in memory):
 * first centroid is random; each next one is picked with probability
 * proportional to its squared distance from the nearest centroid so far. */
static inline void init_plus(const double *pts, int n, int d, int k,
                             uint64_t seed, double *cent) {
    uint64_t s = rng_seed(seed);
    double *dist2 = (double *)malloc(sizeof(double) * (size_t)n);
    long first = (long)(rng_next(&s) % (uint64_t)n);
    memcpy(cent, pts + (size_t)first * d, sizeof(double) * (size_t)d);
    for (int i = 0; i < n; i++) dist2[i] = DBL_MAX;
    for (int c = 1; c < k; c++) {
        double total = 0.0;
        for (int i = 0; i < n; i++) {
            double dd = sqdist(pts + (size_t)i * d, cent + (size_t)(c - 1) * d, d);
            if (dd < dist2[i]) dist2[i] = dd;
            total += dist2[i];
        }
        double r = rng_uniform(&s) * total, acc = 0.0;
        int pick = n - 1;
        for (int i = 0; i < n; i++) {
            acc += dist2[i];
            if (acc >= r) { pick = i; break; }
        }
        memcpy(cent + (size_t)c * d, pts + (size_t)pick * d, sizeof(double) * (size_t)d);
    }
    free(dist2);
}

/* ------------------------------------------------------------------ */
/* The K-Means core                                                    */
/* ------------------------------------------------------------------ */

/* Index of the nearest centroid to point p; its squared distance goes to *bd. */
static inline int nearest(const double *p, const double *cent, int k, int d, double *bd) {
    int best = 0;
    double bestd = DBL_MAX;
    for (int c = 0; c < k; c++) {
        double s = sqdist(p, cent + (size_t)c * d, d);
        if (s < bestd) { bestd = s; best = c; }
    }
    *bd = bestd;
    return best;
}

/* ASSIGNMENT STEP, serial.
 * For each of the n points: find the nearest centroid, add the point to that
 * centroid's running sum, and bump that cluster's count.
 *   sums   : k*d doubles (output)  - sum of the points in each cluster
 *   counts : k long longs (output) - number of points in each cluster
 *   sse    : output - sum of squared distances point->its centroid
 *   labels : optional output (may be NULL) - cluster number of each point   */
static inline void assign_serial(const double *pts, long n, int d, int k,
                                 const double *cent, double *sums,
                                 long long *counts, double *sse, int *labels) {
    memset(sums, 0, sizeof(double) * (size_t)k * d);
    memset(counts, 0, sizeof(long long) * (size_t)k);
    double total = 0.0;
    for (long i = 0; i < n; i++) {
        const double *p = pts + (size_t)i * d;
        double bd;
        int c = nearest(p, cent, k, d, &bd);
        counts[c]++;
        for (int j = 0; j < d; j++) sums[(size_t)c * d + j] += p[j];
        total += bd;
        if (labels) labels[i] = c;
    }
    *sse = total;
}

#ifdef _OPENMP
/* ASSIGNMENT STEP, OpenMP.
 * Same work as assign_serial, but the loop over points is shared among
 * threads.  Threads must not update the same sums/counts at once (a race
 * condition), so every thread gets its OWN private copy of sums and counts.
 * After the loop the private copies are added together in thread order.
 * Each thread's block is followed by 16 unused doubles (128 bytes) so two
 * threads never write to the same cache line (that would be "false sharing"). */
static inline void assign_omp(const double *pts, long n, int d, int k,
                              const double *cent, double *sums,
                              long long *counts, double *sse, int *labels) {
    int T = omp_get_max_threads();
    size_t sstride = (size_t)k * d + 16; /* doubles per thread block  */
    size_t cstride = (size_t)k + 16;     /* counts per thread block   */
    double *lsums = (double *)calloc((size_t)T * sstride, sizeof(double));
    long long *lcounts = (long long *)calloc((size_t)T * cstride, sizeof(long long));
    if (!lsums || !lcounts) die("out of memory");
    double total = 0.0;

    #pragma omp parallel reduction(+ : total)
    {
        int t = omp_get_thread_num();
        double *my_sums = lsums + (size_t)t * sstride;      /* private to thread t */
        long long *my_counts = lcounts + (size_t)t * cstride;

        /* schedule(runtime): the schedule chosen with -S / -C is used. */
        #pragma omp for schedule(runtime)
        for (long i = 0; i < n; i++) {
            const double *p = pts + (size_t)i * d;
            double bd;
            int c = nearest(p, cent, k, d, &bd);
            my_counts[c]++;
            for (int j = 0; j < d; j++) my_sums[(size_t)c * d + j] += p[j];
            total += bd;
            if (labels) labels[i] = c;
        }
    }

    /* Merge the per-thread copies (a tiny serial job: T*k*d additions). */
    memset(sums, 0, sizeof(double) * (size_t)k * d);
    memset(counts, 0, sizeof(long long) * (size_t)k);
    for (int t = 0; t < T; t++) {
        for (size_t e = 0; e < (size_t)k * d; e++) sums[e] += lsums[(size_t)t * sstride + e];
        for (int c = 0; c < k; c++) counts[c] += lcounts[(size_t)t * cstride + c];
    }
    *sse = total;
    free(lsums);
    free(lcounts);
}
#endif

/* UPDATE STEP: new centroid = sum of its points / number of its points.
 * An empty cluster keeps its old centroid.  Returns the largest squared
 * distance any centroid moved (used for the stopping test). */
static inline double update_centroids(double *cent, const double *sums,
                                      const long long *counts, int k, int d) {
    double maxshift = 0.0;
    for (int c = 0; c < k; c++) {
        if (counts[c] == 0) continue;
        double shift = 0.0;
        for (int j = 0; j < d; j++) {
            double nv = sums[(size_t)c * d + j] / (double)counts[c];
            double diff = nv - cent[(size_t)c * d + j];
            shift += diff * diff;
            cent[(size_t)c * d + j] = nv;
        }
        if (shift > maxshift) maxshift = shift;
    }
    return maxshift;
}

/* ------------------------------------------------------------------ */
/* Output                                                              */
/* ------------------------------------------------------------------ */

/* Text file used by scripts/compare.py: a header line, then one line per
 * cluster: "count c_0 c_1 ... c_{d-1}".  Counts and SSE come from the last
 * assignment pass; centroids are the values after the last update. */
static inline void write_result(const char *path, const double *cent,
                                const long long *counts, int k, int d,
                                double sse, int iters) {
    FILE *f = fopen(path, "w");
    if (!f) { perror(path); exit(1); }
    fprintf(f, "# k=%d d=%d iters=%d sse=%.17g\n", k, d, iters, sse);
    for (int c = 0; c < k; c++) {
        fprintf(f, "%lld", counts[c]);
        for (int j = 0; j < d; j++) fprintf(f, " %.17g", cent[(size_t)c * d + j]);
        fprintf(f, "\n");
    }
    fclose(f);
}

/* One machine-readable line that the benchmark script parses. */
static inline void print_result(const char *version, int procs, int threads,
                                long n, int d, int k, int iters, double sse,
                                double t_total, double t_comm, double t_wait, double t_init) {
    printf("RESULT version=%s procs=%d threads=%d n=%ld d=%d k=%d iters=%d "
           "sse=%.10g time=%.6f t_comm=%.6f t_wait=%.6f t_init=%.6f\n",
           version, procs, threads, n, d, k, iters, sse, t_total, t_comm, t_wait, t_init);
}

#endif /* COMMON_H */
