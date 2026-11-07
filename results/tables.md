### OpenMP: threads (n=1000000, d=8, k=8, 20 iterations; serial = 1.386 s)

| threads | time (s) | speedup | efficiency |
|---|---|---|---|
| 1 | 1.393 | 1.00 | 1.00 |
| 2 | 0.866 | 1.60 | 0.80 |
| 4 | 0.625 | 2.22 | 0.55 |
| 8 | 0.609 | 2.28 | 0.28 |

### OpenMP: schedules at 4 threads

| schedule | time (s) | speedup |
|---|---|---|
| static | 0.618 | 2.26 |
| dynamic,1 | 0.886 | 1.57 |
| dynamic,1024 | 0.604 | 2.31 |
| guided | 0.611 | 2.28 |

### MPI: processes (serial = 1.435 s)

| processes | time (s) | waiting for slowest (s) | Allreduce (s) | speedup | efficiency |
|---|---|---|---|---|---|
| 1 | 1.381 | 0.000 | 0.0001 | 1.04 | 1.04 |
| 2 | 0.847 | 0.009 | 0.0008 | 1.69 | 0.85 |
| 4 | 0.619 | 0.039 | 0.0013 | 2.32 | 0.58 |
| 8 | 1.020 | 0.353 | 0.4089 | 1.41 | 0.18 |

### Hybrid: processes x threads (serial = 1.412 s)

| procs x threads | workers | time (s) | waiting (s) | Allreduce (s) | speedup | efficiency |
|---|---|---|---|---|---|---|
| 1x1 | 1 | 1.394 | 0.000 | 0.0001 | 1.01 | 1.01 |
| 1x2 | 2 | 0.834 | 0.000 | 0.0001 | 1.69 | 0.85 |
| 1x4 | 4 | 0.616 | 0.000 | 0.0001 | 2.29 | 0.57 |
| 2x1 | 2 | 0.851 | 0.009 | 0.0006 | 1.66 | 0.83 |
| 2x2 | 4 | 0.618 | 0.013 | 0.0003 | 2.29 | 0.57 |
| 4x1 | 4 | 0.667 | 0.027 | 0.0081 | 2.12 | 0.53 |

### Effect of n (OpenMP 4 threads, MPI 4 processes, hybrid 2x2)

| n | serial (s) | OpenMP (s, speedup) | MPI (s, speedup) | hybrid (s, speedup) |
|---|---|---|---|---|
| 100000 | 0.158 | 0.070 (2.26x) | 0.067 (2.36x) | 0.073 (2.17x) |
| 500000 | 0.723 | 0.313 (2.31x) | 0.342 (2.11x) | 0.337 (2.15x) |
| 1000000 | 1.518 | 0.628 (2.42x) | 0.635 (2.39x) | 0.666 (2.28x) |
| 2000000 | 2.728 | 1.188 (2.30x) | 1.270 (2.15x) | 1.317 (2.07x) |

### Effect of k (OpenMP 4 threads, MPI 4 processes, hybrid 2x2)

| k | serial (s) | OpenMP (s, speedup) | MPI (s, speedup) | hybrid (s, speedup) |
|---|---|---|---|---|
| 4 | 0.845 | 0.355 (2.38x) | 0.382 (2.21x) | 0.385 (2.19x) |
| 8 | 1.404 | 0.610 (2.30x) | 0.629 (2.23x) | 0.670 (2.09x) |
| 16 | 2.420 | 1.075 (2.25x) | 1.161 (2.08x) | 1.167 (2.07x) |
| 32 | 4.124 | 2.052 (2.01x) | 2.136 (1.93x) | 2.145 (1.92x) |

### Effect of d (OpenMP 4 threads, MPI 4 processes, hybrid 2x2)

| d | serial (s) | OpenMP (s, speedup) | MPI (s, speedup) | hybrid (s, speedup) |
|---|---|---|---|---|
| 2 | 0.718 | 0.304 (2.36x) | 0.290 (2.47x) | 0.306 (2.35x) |
| 8 | 1.409 | 0.612 (2.30x) | 0.628 (2.24x) | 0.663 (2.12x) |
| 32 | 6.979 | 3.008 (2.32x) | 3.238 (2.16x) | 2.813 (2.48x) |

### Random vs K-Means++ start (10 seeds; black bar in the figure = mean)

| start | mean iterations | mean SSE | best SSE | worst SSE |
|---|---|---|---|---|
| random | 109.6 | 1.537e+08 | 1.105e+08 | 2.148e+08 |
| K-Means++ | 117.1 | 1.437e+08 | 1.105e+08 | 1.983e+08 |
