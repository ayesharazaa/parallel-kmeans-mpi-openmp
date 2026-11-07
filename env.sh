# Source this file in an MSYS2 (UCRT64) or Git Bash shell on Windows:   source env.sh
# It puts gcc, make, the Microsoft MPI tools (mpiexec) and Python on the PATH.

export PATH="/c/msys64/ucrt64/bin:/c/Program Files/Microsoft MPI/Bin:$PATH:/c/msys64/usr/bin"

# Find the Windows user folder (some shells do not pass USERPROFILE / LOCALAPPDATA on).
WINHOME=""
if [ -n "$USERPROFILE" ]; then WINHOME="$(cygpath -u "$USERPROFILE")"; fi
if [ ! -d "$WINHOME" ]; then WINHOME="/c/Users/$(basename "$HOME")"; fi
LAD="$WINHOME/AppData/Local"

# gcc needs a writable temp folder without spaces (use the short 8.3 form of the path).
if [ -d "$LAD/Temp" ]; then
  T="$(cygpath -m "$(cygpath -d "$LAD/Temp")")"
  export TMP="$T" TEMP="$T" TMPDIR="$T"
fi

# Use the MinGW build of make under the usual name (MSYS2's own make cannot run gcc here).
if command -v mingw32-make >/dev/null 2>&1; then make() { mingw32-make "$@"; }; fi

# Python with numpy + matplotlib: if "python" is not on the PATH of this shell,
# look for the usual per-user Windows install.
if ! command -v python >/dev/null 2>&1; then
  for p in "$LAD"/Programs/Python/Python3*; do
    if [ -x "$p/python.exe" ]; then export PATH="$PATH:$p"; break; fi
  done
fi
if [ -z "$PYTHON" ]; then export PYTHON=python; fi
