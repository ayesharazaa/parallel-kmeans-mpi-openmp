/*
 * kmeans_hybrid.c - hybrid MPI + OpenMP version.
 *
 * Same as kmeans_mpi.c (MPI splits the points between processes and combines
 * partial results with MPI_Allreduce), but inside each process the assignment
 * loop is run by several OpenMP threads (assign_omp in common.h).
 *
 * MPI_THREAD_FUNNELED: only the main thread of each process calls MPI, which is
 * true here because MPI calls happen outside the OpenMP parallel region.
 * Run with:  mpiexec -n 2 kmeans_hybrid data.bin k -T 2 ...
 */
#include <mpi.h>
#include "common.h"

int main(int argc, char **argv) {
    int provided;
    MPI_Init_thread(&argc, &argv, MPI_THREAD_FUNNELED, &provided);
    int rank, size;
    MPI_Comm_rank(MPI_COMM_WORLD, &rank);
    MPI_Comm_size(MPI_COMM_WORLD, &size);

    Options o = parse_args(argc, argv);
    setup_openmp(&o);
    int n, d;
    read_header(o.file, &n, &d);
    if (o.k < 1 || o.k > n) die("k must be between 1 and n");
    int k = o.k;

    long base = n / size, rem = n % size;
    long local_n = base + (rank < rem ? 1 : 0);
    long start = rank * base + (rank < rem ? rank : rem);

    double *pts = read_rows(o.file, start, local_n, d);
    double *cent = (double *)malloc(sizeof(double) * (size_t)k * d);
    init_random(o.file, n, d, k, o.seed, cent);

    double *buf = (double *)malloc(sizeof(double) * ((size_t)k * d + 1));
    long long *counts = (long long *)malloc(sizeof(long long) * (size_t)k);
    double sse = 0.0, t_comm = 0.0, t_wait = 0.0;
    int iters = 0;

    MPI_Barrier(MPI_COMM_WORLD);
    double t0 = MPI_Wtime();
    while (iters < o.max_iter) {
        /* 1) local assignment, split over this process's OpenMP threads */
        assign_omp(pts, local_n, d, k, cent, buf, counts, &buf[(size_t)k * d], NULL);
        iters++;

        /* Barrier first: its time is "waiting for the slowest rank" (load
         * imbalance), not communication cost. */
        double w0 = MPI_Wtime();
        MPI_Barrier(MPI_COMM_WORLD);
        t_wait += MPI_Wtime() - w0;

        /* 2) combine across processes (called by the main thread only) */
        double c0 = MPI_Wtime();
        MPI_Allreduce(MPI_IN_PLACE, buf, k * d + 1, MPI_DOUBLE, MPI_SUM, MPI_COMM_WORLD);
        MPI_Allreduce(MPI_IN_PLACE, counts, k, MPI_LONG_LONG, MPI_SUM, MPI_COMM_WORLD);
        t_comm += MPI_Wtime() - c0;

        sse = buf[(size_t)k * d];
        double shift = update_centroids(cent, buf, counts, k, d);
        if (shift < o.tol) break;
    }
    double t = MPI_Wtime() - t0;

    double tmax, cmax, wmax;
    MPI_Reduce(&t, &tmax, 1, MPI_DOUBLE, MPI_MAX, 0, MPI_COMM_WORLD);
    MPI_Reduce(&t_comm, &cmax, 1, MPI_DOUBLE, MPI_MAX, 0, MPI_COMM_WORLD);
    MPI_Reduce(&t_wait, &wmax, 1, MPI_DOUBLE, MPI_MAX, 0, MPI_COMM_WORLD);
    if (rank == 0) {
        if (o.out) write_result(o.out, cent, counts, k, d, sse, iters);
        print_result("hybrid", size, omp_get_max_threads(), n, d, k, iters, sse, tmax, cmax, wmax, 0.0);
    }
    MPI_Finalize();
    return 0;
}
