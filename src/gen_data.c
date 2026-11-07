/*
 * gen_data.c - synthetic data generator.
 *
 * Usage: gen_data n d k seed out.bin [std]
 *   n    number of points
 *   d    number of dimensions
 *   k    number of true clusters
 *   seed random seed (same seed -> same file)
 *   std  spread of each cluster (default 5.0)
 *
 * The k true cluster centres are random points in the box [0,100]^d.
 * Every point picks a random centre and adds Gaussian noise to it.
 */
#include <math.h>
#include "common.h"

/* Standard normal random number using the Box-Muller transform. */
static double rng_normal(uint64_t *s) {
    double u1 = rng_uniform(s), u2 = rng_uniform(s);
    if (u1 < 1e-300) u1 = 1e-300; /* avoid log(0) */
    return sqrt(-2.0 * log(u1)) * cos(2.0 * 3.14159265358979323846 * u2);
}

int main(int argc, char **argv) {
    if (argc < 6) {
        fprintf(stderr, "Usage: %s n d k seed out.bin [std]\n", argv[0]);
        return 1;
    }
    long n = atol(argv[1]);
    int d = atoi(argv[2]), k = atoi(argv[3]);
    uint64_t seed = strtoull(argv[4], NULL, 10);
    const char *out = argv[5];
    double sd = (argc > 6) ? atof(argv[6]) : 5.0;
    if (n < 1 || d < 1 || k < 1) die("n, d and k must be positive");

    uint64_t s = rng_seed(seed);

    /* true cluster centres */
    double *centres = (double *)malloc(sizeof(double) * (size_t)k * d);
    for (size_t i = 0; i < (size_t)k * d; i++) centres[i] = 100.0 * rng_uniform(&s);

    FILE *f = fopen(out, "wb");
    if (!f) { perror(out); return 1; }
    int h[2] = {(int)n, d};
    fwrite(h, sizeof(int), 2, f);

    /* write the points in blocks of 65536 rows to keep memory small */
    long block = 65536;
    double *buf = (double *)malloc(sizeof(double) * (size_t)block * d);
    for (long done = 0; done < n; done += block) {
        long m = (n - done < block) ? (n - done) : block;
        for (long i = 0; i < m; i++) {
            int c = (int)(rng_next(&s) % (uint64_t)k);
            for (int j = 0; j < d; j++)
                buf[(size_t)i * d + j] = centres[(size_t)c * d + j] + sd * rng_normal(&s);
        }
        fwrite(buf, sizeof(double), (size_t)m * d, f);
    }
    fclose(f);
    free(buf);
    free(centres);
    printf("wrote %s: n=%ld d=%d k=%d seed=%llu std=%g\n", out, n, d, k,
           (unsigned long long)seed, sd);
    return 0;
}
