#!/bin/bash
# One command that rebuilds everything: compile, check correctness, rerun every
# benchmark and regenerate every plot and table.
#     bash scripts/run_all.sh
# (on Windows run it from an MSYS2 / Git Bash shell; env.sh sets up the PATH)
set -e
cd "$(dirname "$0")/.."
source env.sh
MAKE=make   # on Windows the MinGW build of make works; MSYS2's own make does not here
command -v mingw32-make >/dev/null 2>&1 && MAKE=mingw32-make

PY="${PYTHON:-$(command -v python || command -v python3)}"   # python on Windows, python3 on Ubuntu

$MAKE all                          # build bin/*
$PY scripts/validate.py            # correctness check against the serial version
$PY scripts/run_benchmarks.py      # all experiments -> results/*.csv   (takes a while)
$PY scripts/make_plots.py          # plots/*.png and results/tables.md
echo "Done. See results/tables.md and plots/."
