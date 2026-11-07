/*
 * kmeans_mpi.c - distributed-memory version using MPI (no OpenMP).
 *
 * The n points are split into p nearly equal slices; each process (rank)
 * reads and keeps only its own slice.  Every rank holds a full copy of the k
 * centroids (they are small).  Each iteration:
 *   1) every rank assigns ITS points and builds partial sums / counts / SSE
 *   2) MPI_Allreduce adds the partial results of all ranks and gives every
 *      rank the total, so all ranks compute the same new centroids
 * Run with:  mpiexec -n 4 kmeans_mpi data.bin k ...
 */
#include <mpi.h>
#include "common.h"

int main(int argc, char **argv) {
    MPI_Init(&argc, &argv);
    int rank, size;
    MPI_Comm_rank(MPI_COMM_WORLD, &rank);
    MPI_Comm_size(MPI_COMM_WORLD, &size);

    Options o = parse_args(argc, argv);
    int n, d;
    read_header(o.file, &n, &d);
    if (o.k < 1 || o.k > n) die("k must be between 1 and n");
    int k = o.k;

    /* Split the points: the first (n % size) ranks get one extra point. */
    long base = n / size, rem = n % size;
    long local_n = base + (rank < rem ? 1 : 0);
    long start = rank * base + (rank < rem ? rank : rem);

    double *pts = read_rows(o.file, start, local_n, d); /* only my slice */
    double *cent = (double *)malloc(sizeof(double) * (size_t)k * d);
    init_random(o.file, n, d, k, o.seed, cent);         /* same on every rank */

    /* buf holds k*d partial sums followed by 1 partial SSE, so a single
     * Allreduce can add them all. */
    double *buf = (double *)malloc(sizeof(double) * ((size_t)k * d + 1));
    long long *counts = (long long *)malloc(sizeof(long long) * (size_t)k);
    double sse = 0.0, t_comm = 0.0, t_wait = 0.0;
    int iters = 0;

    MPI_Barrier(MPI_COMM_WORLD); /* start the clock together */
    double t0 = MPI_Wtime();
    while (iters < o.max_iter) {
        /* 1) local assignment (writes partial sums into buf, SSE into buf[k*d]) */
        assign_serial(pts, local_n, d, k, cent, buf, counts, &buf[(size_t)k * d], NULL);
        iters++;

        /* Barrier first: its time is "waiting for the slowest rank" (load
         * imbalance), so it is not counted as communication cost. */
        double w0 = MPI_Wtime();
        MPI_Barrier(MPI_COMM_WORLD);
        t_wait += MPI_Wtime() - w0;

        /* 2) add up the partial results from all ranks (result on every rank) */
        double c0 = MPI_Wtime();
        MPI_Allreduce(MPI_IN_PLACE, buf, k * d + 1, MPI_DOUBLE, MPI_SUM, MPI_COMM_WORLD);
        MPI_Allreduce(MPI_IN_PLACE, counts, k, MPI_LONG_LONG, MPI_SUM, MPI_COMM_WORLD);
        t_comm += MPI_Wtime() - c0;

        sse = buf[(size_t)k * d];
        double shift = update_centroids(cent, buf, counts, k, d);
        if (shift < o.tol) break; /* every rank sees the same shift, so all stop together */
    }
    double t = MPI_Wtime() - t0;

    /* Report the slowest rank's times. */
    double tmax, cmax, wmax;
    MPI_Reduce(&t, &tmax, 1, MPI_DOUBLE, MPI_MAX, 0, MPI_COMM_WORLD);
    MPI_Reduce(&t_comm, &cmax, 1, MPI_DOUBLE, MPI_MAX, 0, MPI_COMM_WORLD);
    MPI_Reduce(&t_wait, &wmax, 1, MPI_DOUBLE, MPI_MAX, 0, MPI_COMM_WORLD);
    if (rank == 0) {
        if (o.out) write_result(o.out, cent, counts, k, d, sse, iters);
        print_result("mpi", size, 1, n, d, k, iters, sse, tmax, cmax, wmax, 0.0);
    }
    MPI_Finalize();
    return 0;
}
