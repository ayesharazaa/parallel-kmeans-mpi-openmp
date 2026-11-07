/*
 * kmeans_omp.c - shared-memory version using OpenMP.
 *
 * Identical to the serial program except that the assignment step (the
 * expensive one) runs on several threads: see assign_omp() in common.h.
 * The update step is tiny (k*d work) so it stays serial.
 *
 * Choose threads with -T and the loop schedule with -S static|dynamic|guided
 * and -C chunk_size.
 */
#include "common.h"

int main(int argc, char **argv) {
    Options o = parse_args(argc, argv);
    setup_openmp(&o);
    int n, d;
    read_header(o.file, &n, &d);
    if (o.k < 1 || o.k > n) die("k must be between 1 and n");
    int k = o.k;

    double *pts = read_rows(o.file, 0, n, d);
    double *cent = (double *)malloc(sizeof(double) * (size_t)k * d);
    init_random(o.file, n, d, k, o.seed, cent);

    double *sums = (double *)malloc(sizeof(double) * (size_t)k * d);
    long long *counts = (long long *)malloc(sizeof(long long) * (size_t)k);
    double sse = 0.0;
    int iters = 0;

    double t0 = omp_get_wtime();
    while (iters < o.max_iter) {
        assign_omp(pts, n, d, k, cent, sums, counts, &sse, NULL);  /* parallel */
        iters++;
        double shift = update_centroids(cent, sums, counts, k, d); /* serial   */
        if (shift < o.tol) break;
    }
    double t = omp_get_wtime() - t0;

    if (o.out) write_result(o.out, cent, counts, k, d, sse, iters);
    print_result("omp", 1, omp_get_max_threads(), n, d, k, iters, sse, t, 0.0, 0.0, 0.0);
    return 0;
}
