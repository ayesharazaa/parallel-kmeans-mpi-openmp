# Makefile for the parallel K-Means project.
#
#   make all     build every program into bin/
#   make test    check that OpenMP / MPI / hybrid give the same answer as serial
#   make bench   run all benchmarks (writes results/*.csv)
#   make plots   draw all graphs (writes plots/*.png and results/tables.md)
#   make clean   delete bin/
#
# On Windows, run from an MSYS2 shell after:  source env.sh

CC       = gcc
CFLAGS   = -O2 -std=gnu11 -Wall -Wextra
OMPFLAGS = -fopenmp
LDLIBS   = -lm
# Python: "python" on Windows, "python3" on Ubuntu (use the first one that exists).
PYTHON  ?= $(shell command -v python >/dev/null 2>&1 && echo python || echo python3)

# MPI: use the mpicc wrapper if there is one (Linux); otherwise fall back to
# plain gcc linked with Microsoft MPI (Windows).
MPICC := $(shell command -v mpicc 2>/dev/null)
ifeq ($(MPICC),)
  MPI_CC   = gcc
  MPI_LIBS = -lmsmpi
else
  MPI_CC   = mpicc
  MPI_LIBS =
endif

# Windows (MinGW) gcc always adds ".exe" to program names.
EXE := $(if $(findstring mingw,$(shell $(CC) -dumpmachine)),.exe,)
BIN  = bin
PROGS = $(BIN)/gen_data$(EXE) $(BIN)/kmeans_serial$(EXE) $(BIN)/kmeans_omp$(EXE) \
        $(BIN)/kmeans_mpi$(EXE) $(BIN)/kmeans_hybrid$(EXE)

.PHONY: all test bench plots clean
all: $(PROGS)

$(BIN):
	mkdir -p $(BIN)

$(BIN)/gen_data$(EXE): src/gen_data.c src/common.h | $(BIN)
	$(CC) $(CFLAGS) $< -o $@ $(LDLIBS)

$(BIN)/kmeans_serial$(EXE): src/kmeans_serial.c src/common.h | $(BIN)
	$(CC) $(CFLAGS) $< -o $@ $(LDLIBS)

$(BIN)/kmeans_omp$(EXE): src/kmeans_omp.c src/common.h | $(BIN)
	$(CC) $(CFLAGS) $(OMPFLAGS) $< -o $@ $(LDLIBS)

$(BIN)/kmeans_mpi$(EXE): src/kmeans_mpi.c src/common.h | $(BIN)
	$(MPI_CC) $(CFLAGS) $< -o $@ $(LDLIBS) $(MPI_LIBS)

$(BIN)/kmeans_hybrid$(EXE): src/kmeans_hybrid.c src/common.h | $(BIN)
	$(MPI_CC) $(CFLAGS) $(OMPFLAGS) $< -o $@ $(LDLIBS) $(MPI_LIBS)

test: all
	$(PYTHON) scripts/validate.py

bench: all
	$(PYTHON) scripts/run_benchmarks.py

plots:
	$(PYTHON) scripts/make_plots.py

clean:
	rm -rf $(BIN)
