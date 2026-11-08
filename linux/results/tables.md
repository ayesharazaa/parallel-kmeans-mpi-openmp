### OpenMP: threads (n=1000000, d=8, k=8, 20 iterations; serial = 1.597 s)

| threads | time (s) | speedup | efficiency |
|---|---|---|---|
| 1 | 1.609 | 0.99 | 0.99 |
| 2 | 0.971 | 1.65 | 0.82 |
| 4 | 0.718 | 2.22 | 0.56 |
| 8 | 0.722 | 2.21 | 0.28 |

### OpenMP: schedules at 4 threads

| schedule | time (s) | speedup |
|---|---|---|
| static | 0.799 | 1.96 |
| dynamic,1 | 0.941 | 1.66 |
| dynamic,1024 | 0.676 | 2.31 |
| guided | 0.687 | 2.28 |

### MPI: processes (serial = 1.660 s)

| processes | time (s) | waiting for slowest (s) | Allreduce (s) | speedup | efficiency |
|---|---|---|---|---|---|
| 1 | 1.625 | 0.000 | 0.0000 | 1.02 | 1.02 |
| 2 | 0.958 | 0.024 | 0.0009 | 1.73 | 0.87 |
| 4 | 0.850 | 0.097 | 0.0223 | 1.95 | 0.49 |
| 8 | 0.810 | 0.182 | 0.0893 | 2.05 | 0.26 |

### Hybrid: processes x threads (serial = 1.605 s)

| procs x threads | workers | time (s) | waiting (s) | Allreduce (s) | speedup | efficiency |
|---|---|---|---|---|---|---|
| 1x1 | 1 | 1.633 | 0.000 | 0.0000 | 0.98 | 0.98 |
| 1x2 | 2 | 1.014 | 0.000 | 0.0000 | 1.58 | 0.79 |
| 1x4 | 4 | 0.742 | 0.000 | 0.0000 | 2.16 | 0.54 |
| 2x1 | 2 | 0.954 | 0.020 | 0.0006 | 1.68 | 0.84 |
| 2x2 | 4 | 0.728 | 0.027 | 0.0004 | 2.20 | 0.55 |
| 4x1 | 4 | 0.763 | 0.072 | 0.0076 | 2.10 | 0.53 |

### Effect of n (OpenMP 4 threads, MPI 4 processes, hybrid 2x2)

| n | serial (s) | OpenMP (s, speedup) | MPI (s, speedup) | hybrid (s, speedup) |
|---|---|---|---|---|
| 100000 | 0.169 | 0.085 (1.99x) | 0.081 (2.09x) | 0.084 (2.02x) |
| 500000 | 0.783 | 0.354 (2.21x) | 0.366 (2.14x) | 0.373 (2.10x) |
| 1000000 | 1.560 | 0.712 (2.19x) | 0.801 (1.95x) | 0.743 (2.10x) |
| 2000000 | 3.101 | 1.386 (2.24x) | 1.621 (1.91x) | 1.488 (2.08x) |

### Effect of k (OpenMP 4 threads, MPI 4 processes, hybrid 2x2)

| k | serial (s) | OpenMP (s, speedup) | MPI (s, speedup) | hybrid (s, speedup) |
|---|---|---|---|---|
| 4 | 0.961 | 0.436 (2.21x) | 0.438 (2.20x) | 0.422 (2.28x) |
| 8 | 1.609 | 0.799 (2.01x) | 0.786 (2.05x) | 0.736 (2.19x) |
| 16 | 2.701 | 1.280 (2.11x) | 1.360 (1.99x) | 1.395 (1.94x) |
| 32 | 4.849 | 2.359 (2.06x) | 2.478 (1.96x) | 2.494 (1.94x) |

### Effect of d (OpenMP 4 threads, MPI 4 processes, hybrid 2x2)

| d | serial (s) | OpenMP (s, speedup) | MPI (s, speedup) | hybrid (s, speedup) |
|---|---|---|---|---|
| 2 | 0.945 | 0.538 (1.75x) | 0.418 (2.26x) | 0.409 (2.31x) |
| 8 | 1.708 | 0.763 (2.24x) | 0.789 (2.17x) | 0.778 (2.20x) |
| 32 | 6.358 | 2.300 (2.76x) | 2.557 (2.49x) | 2.551 (2.49x) |

### Random vs K-Means++ start (10 seeds; black bar in the figure = mean)

| start | mean iterations | mean SSE | best SSE | worst SSE |
|---|---|---|---|---|
| random | 109.6 | 1.537e+08 | 1.105e+08 | 2.148e+08 |
| K-Means++ | 117.1 | 1.437e+08 | 1.105e+08 | 1.983e+08 |
