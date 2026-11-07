/*
 * kmeans_serial.c - serial baseline: standard Lloyd's K-Means.
 *
 * Repeat:  1) assign every point to its nearest centroid
 *          2) move each centroid to the mean of its points
 * until the centroids stop moving (or max_iter is reached).
 *
 * Timing covers only the iteration loop (not file reading or the choice of
 * starting centroids), the same as in all the parallel versions.
 */
#include "common.h"

int main(int argc, char **argv) {
    Options o = parse_args(argc, argv);
    int n, d;
    read_header(o.file, &n, &d);
    if (o.k < 1 || o.k > n) die("k must be between 1 and n");
    int k = o.k;

    double *pts = read_rows(o.file, 0, n, d);            /* all points */
    double *cent = (double *)malloc(sizeof(double) * (size_t)k * d);

    /* starting centroids: random points, or K-Means++ if "-i plus" */
    double t_init = wtime();
    if (o.init_plus) init_plus(pts, n, d, k, o.seed, cent);
    else             init_random(o.file, n, d, k, o.seed, cent);
    t_init = wtime() - t_init;

    double *sums = (double *)malloc(sizeof(double) * (size_t)k * d);
    long long *counts = (long long *)malloc(sizeof(long long) * (size_t)k);
    int *labels = o.labels_out ? (int *)malloc(sizeof(int) * (size_t)n) : NULL;
    double sse = 0.0;
    int iters = 0;

    double t0 = wtime();
    while (iters < o.max_iter) {
        assign_serial(pts, n, d, k, cent, sums, counts, &sse, labels); /* step 1 */
        iters++;
        double shift = update_centroids(cent, sums, counts, k, d);     /* step 2 */
        if (shift < o.tol) break;                                      /* converged */
    }
    double t = wtime() - t0;

    if (o.out) write_result(o.out, cent, counts, k, d, sse, iters);
    if (labels) {
        FILE *f = fopen(o.labels_out, "wb");
        if (!f) die("cannot open labels file");
        fwrite(labels, sizeof(int), (size_t)n, f);
        fclose(f);
    }
    print_result("serial", 1, 1, n, d, k, iters, sse, t, 0.0, 0.0, t_init);
    return 0;
}
