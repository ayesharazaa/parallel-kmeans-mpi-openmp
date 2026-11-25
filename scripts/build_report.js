// build_report.js - builds the Word report (black text only) from the project's results.
//
//   Needs the npm package "docx":   npm install docx
//   Run:   node scripts/build_report.js report/Parallel_KMeans_Report.docx
//   (set DOCX_PATH to the folder that contains node_modules/docx if it is installed elsewhere)
//
// Every table and number comes from results/*.csv, linux/results/*.csv and
// results/validation_summary.json, so the report always matches the measurements.
const fs = require("fs");
const path = require("path");
const D = require(process.env.DOCX_PATH ? path.join(process.env.DOCX_PATH, "node_modules", "docx") : "docx");
const {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell, ImageRun, Footer, AlignmentType,
  HeadingLevel, LevelFormat, BorderStyle, HeightRule, VerticalAlign, WidthType, ShadingType, PageNumber, TableOfContents, PageBreak,
} = D;

const ROOT = path.resolve(__dirname, "..");
const OUT = process.argv[2] || path.join(ROOT, "report", "Parallel_KMeans_Report.docx");

// ------------------------------------------------------------------ data helpers
function readCsv(file) {
  const lines = fs.readFileSync(file, "utf8").trim().split(/\r?\n/);
  const head = lines[0].split(",");
  return lines.slice(1).map((l) => {
    const c = l.split(","), o = {};
    head.forEach((h, i) => { const v = Number(c[i]); o[h] = c[i] !== "" && !isNaN(v) ? v : c[i]; });
    return o;
  });
}
const exists = (rel) => fs.existsSync(path.join(ROOT, rel));
const load = (dir, name) => readCsv(path.join(ROOT, dir, "results", name + ".csv"));
const W = {}, L = {};
for (const n of ["omp_threads", "omp_sched", "mpi_procs", "hybrid", "size", "kvals", "dvals", "init_compare"]) {
  W[n] = load("", n); L[n] = load("linux", n);
}
const REAL = exists("results/real.csv") ? load("", "real") : [];
const LREAL = exists("linux/results/real.csv") ? load("linux", "real") : [];
const VAL = JSON.parse(fs.readFileSync(path.join(ROOT, "results", "validation_summary.json"), "utf8"));
const serialOf = (rows, r) => rows.find((s) => s.version === "serial" && s.n === r.n && s.d === r.d && s.k === r.k).time;
const spd = (rows, r) => serialOf(rows, r) / r.time;
const eff = (rows, r) => spd(rows, r) / r.workers;
const find = (rows, q) => {
  const r = rows.find((x) => Object.keys(q).every((k) => x[k] === q[k]));
  if (!r) throw new Error("row not found " + JSON.stringify(q));
  return r;
};
const f = (x, d = 2) => Number(x).toFixed(d);
const X = (x) => f(x, 2) + "x";
const O = (t) => find(W.omp_threads, { version: "omp", threads: t });
const Mi = (p) => find(W.mpi_procs, { version: "mpi", procs: p });
const Hy = (p, t) => find(W.hybrid, { version: "hybrid", procs: p, threads: t });
const Sc = (s, c) => find(W.omp_sched, { version: "omp", sched: s, chunk: c });
const LO = (t) => find(L.omp_threads, { version: "omp", threads: t });
const LM = (p) => find(L.mpi_procs, { version: "mpi", procs: p });
const LH = (p, t) => find(L.hybrid, { version: "hybrid", procs: p, threads: t });
const so = (r) => spd(W.omp_threads, r), sm = (r) => spd(W.mpi_procs, r), sh = (r) => spd(W.hybrid, r);
const lso = (r) => spd(L.omp_threads, r), lsm = (r) => spd(L.mpi_procs, r), lsh = (r) => spd(L.hybrid, r);
const serialBase = W.omp_threads.find((r) => r.version === "serial").time;
const lserialBase = L.omp_threads.find((r) => r.version === "serial").time;
function initStats(rows) {
  const out = {};
  for (const init of ["random", "plus"]) {
    const s = rows.filter((r) => r.init === init);
    const mean = (k) => s.reduce((a, r) => a + r[k], 0) / s.length;
    out[init] = { iters: mean("iters"), sse: mean("sse"), best: Math.min(...s.map((r) => r.sse)), worst: Math.max(...s.map((r) => r.sse)) };
  }
  return out;
}
const IS = initStats(W.init_compare);
const sci = (x) => Number(x).toExponential(3);
const comma = (x) => Number(x).toLocaleString("en-US");

// ------------------------------------------------------------------ document helpers
const FONT = "Calibri", HFONT = "Arial", CW = 9500, BLACK = "000000";
function runs(text, base = {}) {
  const out = [];
  const re = /(\*\*[^*]+\*\*|`[^`]+`)/g;
  let last = 0, m;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(new TextRun({ text: text.slice(last, m.index), color: BLACK, ...base }));
    const t = m[0];
    if (t.startsWith("**")) out.push(new TextRun({ text: t.slice(2, -2), bold: true, color: BLACK, ...base }));
    else out.push(new TextRun({ text: t.slice(1, -1), font: "Consolas", size: 20, color: BLACK, ...base }));
    last = m.index + t.length;
  }
  if (last < text.length) out.push(new TextRun({ text: text.slice(last), color: BLACK, ...base }));
  return out;
}
const P = (text, o = {}) => new Paragraph({ children: runs(text), alignment: o.align || AlignmentType.LEFT,
  spacing: { after: o.after === undefined ? 100 : o.after, line: 264 }, keepNext: o.keepNext });
const H1 = (t, pb) => new Paragraph({ heading: HeadingLevel.HEADING_1, pageBreakBefore: !!pb, children: [new TextRun({ text: t, color: BLACK })] });
const H2 = (t) => new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun({ text: t, color: BLACK })] });
const B = (t) => new Paragraph({ numbering: { reference: "bul", level: 0 }, children: runs(t), spacing: { after: 40, line: 264 } });
const mkNum = (ref) => (t) => new Paragraph({ numbering: { reference: ref, level: 0 }, children: runs(t), spacing: { after: 40, line: 264 } });
const gap = () => new Paragraph({ children: [], spacing: { after: 60 } });

let tabN = 0, figN = 0;
const caption = (kind, text, keepNext) => new Paragraph({
  children: [new TextRun({ text: kind + " " + (kind === "Table" ? ++tabN : ++figN) + ": ", bold: true, size: 20, color: BLACK }),
    new TextRun({ text, size: 20, italics: true, color: BLACK })],
  alignment: AlignmentType.CENTER, spacing: { before: 80, after: 160 }, keepNext,
});
function table(headers, rows, widths, title, opt = {}) {
  const sum = widths.reduce((a, b) => a + b, 0);
  const sc = widths.map((w) => Math.round((w * CW) / sum));
  sc[sc.length - 1] += CW - sc.reduce((a, b) => a + b, 0);
  const cell = (t, i, head, shade) => new TableCell({
    width: { size: sc[i], type: WidthType.DXA },
    
    margins: { top: 30, bottom: 30, left: 90, right: 90 },
    children: [new Paragraph({ alignment: opt.leftAll || (i === 0) ? AlignmentType.LEFT : AlignmentType.CENTER,
      children: [new TextRun({ text: String(t), size: 19, bold: head, color: BLACK })] })],
  });
  const out = [];
  if (title) out.push(caption("Table", title, true));
  out.push(new Table({ width: { size: CW, type: WidthType.DXA }, columnWidths: sc,
    rows: [new TableRow({ tableHeader: true, cantSplit: true, children: headers.map((h, i) => cell(h, i, true)) }),
      ...rows.map((r, ri) => new TableRow({ cantSplit: true, children: r.map((c, i) => cell(c, i, false, ri % 2 === 1)) }))] }));
  out.push(gap());
  return out;
}
function shot(kind, what, file, heightIn = 1.6) {
  const none = { style: BorderStyle.DASHED, size: 6, color: BLACK };
  const lines = [["INSERT " + kind + " HERE", true], [what, false], [file, false]];
  return [
    new Table({ width: { size: CW, type: WidthType.DXA }, columnWidths: [CW],
      rows: [new TableRow({ cantSplit: true, height: { value: Math.round(heightIn * 1440), rule: HeightRule.ATLEAST }, children: [new TableCell({
        width: { size: CW, type: WidthType.DXA }, verticalAlign: VerticalAlign.CENTER,
        borders: { top: none, bottom: none, left: none, right: none },
        children: lines.map(([t, b]) => new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 30 }, keepNext: true,
          children: [new TextRun({ text: t, bold: b, size: 19, color: BLACK, font: b ? undefined : "Consolas" })] })) })] })] }),
    caption("Figure", what),
  ];
}
const plot = (n, text, win = true, h = 1.7) => shot("PLOT", text, (win ? "plots_bw/" : "plots_bw_linux/") + n, h);
const screen = (text, how, h = 1.7) => shot("SCREENSHOT", text, how, h);

// ------------------------------------------------------------------ numbers used in the text
const OPS = 1000000 * 8 * 8 * 20;
const meta = {
  covertype: { title: "Covertype (forest cover type)", n: "581,012", d: "10" },
  yearpredictionmsd: { title: "YearPredictionMSD (song audio features)", n: "515,345", d: "90" },
  census1990: { title: "US Census 1990", n: "1,000,000", d: "68" },
};
const realNames = [...new Set(REAL.map((r) => r.dataset))];
const realRows = (nm) => REAL.filter((r) => r.dataset === nm);
const rSerial = (nm) => realRows(nm).find((r) => r.version === "serial");
const rGet = (nm, v, p, t) => realRows(nm).find((r) => r.version === v && r.procs === p && r.threads === t);
const rSp = (nm, r) => rSerial(nm).time / r.time;


// ------------------------------------------------------------------ content
const c = [];
const NUM = mkNum("num"), NUM2 = mkNum("num2"), NUM3 = mkNum("num3"), NUM4 = mkNum("num4"), NUM5 = mkNum("num5"), NUM6 = mkNum("num6");
const vget = (nm) => VAL.find((v) => v.name === nm);

// ---- cover
const center = (text, size, o = {}) => new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: o.before || 0, after: o.after === undefined ? 120 : o.after },
  children: [new TextRun({ text, size, bold: o.bold, font: o.font, color: BLACK })] });
c.push(center("FAST-NUCES Karachi", 28, { before: 2200, after: 200, font: HFONT }));
c.push(center("Parallel and Distributed Computing: Course Project", 24, { after: 700, font: HFONT }));
c.push(center("Parallel K-Means Clustering", 56, { bold: true, font: HFONT, after: 200 }));
c.push(center("using MPI and OpenMP", 40, { bold: true, font: HFONT, after: 800 }));
c.push(center("Final Report", 30, { font: HFONT }));
c.push(center("Ayesha Raza (23K-3015)", 26, { bold: true, before: 1200, after: 80 }));
c.push(center("Instructor: Simran Mehlwani", 24, { after: 80 }));
c.push(center("Final submission: 5 December 2026", 22, { after: 80 }));
c.push(center("Source code: https://github.com/ayesharazaa/parallel-kmeans-mpi-openmp", 20, { before: 400 }));
c.push(new Paragraph({ children: [new PageBreak()] }));
c.push(new Paragraph({ children: [new TextRun({ text: "Contents", font: HFONT, size: 28, bold: true, color: BLACK })], spacing: { after: 100 } }));
c.push(new TableOfContents("Contents", { hyperlink: true, headingStyleRange: "1-1" }));

// ---- Abstract
const bestOmp = so(O(4)), bestMpi = sm(Mi(4)), bestHy = sh(Hy(2, 2));
c.push(H1("Abstract"));
c.push(P(`K-Means groups similar data points into clusters. It is slow on big data because every point is compared with every cluster centre again and again. We wrote K-Means in C in four versions: serial, OpenMP (threads with shared memory), MPI (processes with separate memory) and hybrid (MPI and OpenMP together). We checked that all parallel versions give the same clusters as the serial one, then measured the speedup on synthetic data and on two large real data sets from the UCI repository (Covertype and US Census 1990), on Windows with Microsoft MPI and on Linux with Open MPI.`));
c.push(P(`The test laptop has 2 physical cores and 4 hardware threads. On the main problem (1,000,000 points), 4 workers gave ${X(bestOmp)} speedup with OpenMP, ${X(bestMpi)} with MPI and ${X(bestHy)} with hybrid. On the real Census data the speedup reached ${X(rSp("census1990", rGet("census1990", "omp", 1, 4)))}. This is close to the most this processor can give. We explain the results with Amdahl's law, communication cost and the effect of the MPI library.`));

// ---- 1 Introduction
c.push(H1("1. Introduction"));
c.push(P(`Clustering means putting similar items into the same group without being told the groups in advance. K-Means is one of the simplest clustering methods. You choose the number of clusters k. The method keeps one centre point (centroid) for each cluster and repeats two steps until the centroids stop moving:`));
c.push(NUM(`**Assignment step:** give every point to the cluster whose centroid is nearest.`));
c.push(NUM(`**Update step:** move each centroid to the average position of the points that belong to it.`));
c.push(P(`In the assignment step every point is compared with every centroid, and each comparison uses all d features. So one iteration needs about n x k x d operations (n = number of points). For n = 1,000,000, k = 8, d = 8 and 20 iterations this is about ${comma(OPS)} operations. The comparisons for different points do not depend on each other, so different workers can handle different points at the same time. That is what we do in parallel.`));
c.push(P(`**Objectives:** (1) write a simple serial K-Means in C as a baseline; (2) parallelise it with OpenMP; (3) write an MPI version and a hybrid MPI + OpenMP version; (4) measure speedup, efficiency and scalability on synthetic and real data; (5) check that all versions give the same result as serial.`));
c.push(...table(["Term", "Simple meaning"], [
  ["Thread / process", "A thread is a worker inside one program and shares its memory. A process is a separate program with its own memory; processes talk by messages."],
  ["OpenMP / MPI", "OpenMP splits a loop between threads with one pragma line. MPI is a library for sending data between processes."],
  ["Speedup / efficiency", "Speedup = serial time divided by parallel time. Efficiency = speedup divided by the number of workers."],
  ["Race condition", "A bug where two threads change the same variable at once and the result is wrong."],
  ["False sharing", "A slowdown where two threads write different variables that sit in the same cache line."],
  ["SSE", "Sum of squared errors: total squared distance from each point to its centroid. Smaller is tighter."],
], [1.5, 5.5], "Key terms.", { leftAll: true }));

// ---- 2 Dataset Description
c.push(H1("2. Dataset Description"));
c.push(P(`We use three kinds of data. **Synthetic data** from our own generator lets us change one thing at a time (n, k or d). **Large real data** from the UCI Machine Learning Repository shows that the programs work on messy real data. **Three small UCI data sets** are used only to check correctness. All files are included in \`Datasets.zip\`.`));
const dsRows = [["Synthetic (gen_data)", "100,000 to 2,000,000", "2 to 32", "Scaling tests"]];
const addVal = (nm, label, use) => { const v = vget(nm); dsRows.push([label, v ? comma(v.n) : "-", v ? String(v.d) : "-", use]); };
addVal("covertype", "Covertype (UCI)", "Real benchmark");
addVal("census1990", "US Census 1990 (UCI)", "Real benchmark");
addVal("letter", "Letter Recognition (UCI)", "Correctness check");
addVal("wine", "Wine (UCI)", "Correctness check");
addVal("iris", "Iris (UCI)", "Correctness check");
c.push(...table(["Data set", "Points (n)", "Features (d)", "Used for"], dsRows, [2.4, 1.7, 1.2, 1.7], "The data sets of this project."));
c.push(P(`**Synthetic data.** The program \`gen_data\` picks k random cluster centres in a box of size 100, then for every point picks one centre at random and adds Gaussian noise (standard deviation 5). The same seed always gives the same file. The main test problem has 1,000,000 points, 8 dimensions and 8 clusters.`));
c.push(P(`**Covertype.** Each row is a 30 m x 30 m square of forest in Colorado. The file has 581,012 rows. We use its 10 measured columns (elevation, slope, distances, hillshade) and ignore the 44 columns that are only 0/1 flags. We use k = 7 (the number of real cover types). The real label is used only to compute purity.`));
c.push(P(`**US Census 1990.** Each row is a person described by 68 coded attributes (age group, education, work type and so on), stored as numbers. The full file has 2,458,285 rows; we use the first 1,000,000 so that one run stays short on a laptop. It has no labels. We use it as a computing benchmark with k = 8. K-Means treats the codes as numbers, which is not ideal, but here we measure speed and agreement between versions.`));
c.push(P(`**Small sets.** Iris (150 flowers, 4 features, k = 3), Wine (178 wines, 13 features, k = 3) and Letter Recognition (20,000 letters, 16 features, k = 26). They are too small to time, but they have real labels, so we also compute purity.`));
c.push(P(`**Preparation.** Every data set is converted to one binary format: two integers (n and d) followed by all the numbers, point after point, so each MPI process can jump straight to its own slice. Real columns are standardised (subtract the average, divide by the standard deviation) because columns such as elevation (thousands) and slope (below 60) have very different sizes and K-Means uses distances. Class labels and ID columns are not used as features.`));

// ---- 3 Methodology
c.push(H1("3. Methodology"));
c.push(P(`**Algorithm (Lloyd's K-Means).**`, { after: 40 }));
c.push(NUM2("Choose k starting centroids: k random data points."));
c.push(NUM2("Assignment step: for every point find the nearest centroid and add the point to that cluster's running sum and count."));
c.push(NUM2("Update step: new centroid = sum of its points divided by its count (an empty cluster keeps its old centroid)."));
c.push(NUM2("Stop when the centroids move less than a tiny limit or after the maximum number of iterations; otherwise go to step 2."));
c.push(P(`**What to parallelise.** The assignment step costs n x k x d, the update step only k x d. So we share the assignment step between workers (data parallelism: same job, different data).`));
c.push(P(`**The four versions.**`, { after: 40 }));
c.push(B("**Serial:** one core does everything. This is the baseline for all speedups."));
c.push(B("**OpenMP (shared memory):** one process, several threads. The loop over the points is split between the threads. To avoid a race condition each thread keeps private sums that are added together after the loop."));
c.push(B("**MPI (distributed memory):** several processes. The points are cut into slices and each process reads only its own slice. Once per iteration, `MPI_Allreduce` adds the partial sums of all processes and gives every process the totals."));
c.push(B("**Hybrid:** MPI cuts the points between processes and OpenMP threads share each process's slice."));
c.push(P(`**Fair comparison.** All versions start from the same centroids (a seeded random generator that gives the same numbers everywhere). Speed tests run exactly 20 iterations (\`-m 20 -t -1\`). Only the iteration loop is timed, not file reading. Each setting is run 5 times (3 times for the long real-data runs) and the **median** is reported. The repeats of all settings are interleaved so a slow moment of the laptop affects all of them equally. For MPI we also time the barrier before the communication (waiting for the slowest process) separately from the \`MPI_Allreduce\` call itself.`));
c.push(P(`**Correctness check.** A script runs serial, then OpenMP (1, 3, 4 threads; static, dynamic, guided), MPI (1, 3, 4 processes) and hybrid (2 x 2, 3 x 2) and compares iterations, cluster sizes, SSE and centroids with the serial result. Three processes do not divide n evenly, so uneven slices are tested too. Differences of about 1e-13 (different order of floating-point additions) are accepted.`));
c.push(...table(["Item", "Windows (main results)", "Linux (second set)"], [
  ["Processor", "Intel Core i7-6600U, 2 cores, 4 hardware threads", "Same laptop through WSL2"],
  ["Memory", "7.9 GB", "3 GB for the Linux virtual machine"],
  ["System / compiler", "Windows 10, GCC 16.2 -O2", "Ubuntu 26.04, GCC 15.2 -O2"],
  ["MPI library", "Microsoft MPI", "Open MPI"],
], [1.4, 2.8, 2.5], "The two test environments.", { leftAll: true }));
c.push(P(`The laptop has 2 physical cores. Each runs 2 threads (hyper-threading), but two threads on one core are not twice as fast, so we expect a best speedup of about 2.2 to 2.6 times.`));

// ---- 4 Implementation
c.push(H1("4. Implementation"));
c.push(P(`The code is in C. \`src/common.h\` holds the parts shared by all versions (reading data, random numbers, assignment and update steps). Each program is short and only decides how the work is divided. For every version below, the steps explain where and how the parallel (PDC) idea is used. Take the screenshot of the lines named under each heading and replace the placeholder.`));
c.push(H2("4.1 Serial version (src/kmeans_serial.c)"));
c.push(NUM3("Read all points, then choose k random points as starting centroids."));
c.push(NUM3("Loop: run the assignment step on all n points, then the update step."));
c.push(NUM3("Stop when the largest centroid move is below the tolerance or after the maximum iterations."));
c.push(...screen("The main loop of the serial program (VS Code).", "src/kmeans_serial.c, lines 30 to 50", 1.5));
c.push(H2("4.2 OpenMP version (assign_omp in src/common.h)"));
c.push(NUM4("**Private memory per thread.** Each thread gets its own block of sums and counts (`lsums`, `lcounts`). Threads never write to the same variable, so there is no race condition and no lock is needed."));
c.push(NUM4("**Padding against false sharing.** After each thread block we leave 16 unused numbers (128 bytes). Two threads then never write to the same cache line, so the cores do not fight over it."));
c.push(NUM4("**Work sharing.** `#pragma omp parallel` starts the threads and `#pragma omp for schedule(runtime)` splits the loop over the points between them. `runtime` lets us choose static, dynamic or guided at launch time."));
c.push(NUM4("**Reduction.** The SSE is summed with `reduction(+ : total)`; each thread keeps its own copy and OpenMP adds them at the end."));
c.push(NUM4("**Merge.** After the loop, one thread adds the T private blocks together in a fixed order. This is a tiny serial job (T x k x d additions), and the fixed order makes the result repeatable."));
c.push(...screen("The OpenMP assignment step.", "src/common.h, lines 285 to 325 (function assign_omp)", 2.2));
c.push(H2("4.3 MPI version (src/kmeans_mpi.c)"));
c.push(NUM5("**Data decomposition.** With `size` processes, `base = n / size` and `rem = n % size`. Process `rank` gets `local_n = base + 1` points if `rank < rem`, otherwise `base`, and starts at index `start`. The slices are as equal as possible."));
c.push(NUM5("**Distributed memory.** Each process reads only its own slice from the file with `fseek` (`read_rows`). No process holds all the data. Every process builds the same starting centroids, because the generator is seeded."));
c.push(NUM5("**Local work.** Each iteration, each process runs the assignment step on its own slice and gets partial sums and counts."));
c.push(NUM5("**Synchronisation.** `MPI_Barrier` makes every process wait for the slowest one. We time this wait separately; it shows load imbalance."));
c.push(NUM5("**Collective communication.** `MPI_Allreduce` adds the partial sums (k x d + 1 numbers) and the counts (k numbers) of all processes and gives the totals to every process. The message size does not depend on n."));
c.push(NUM5("**Same decision everywhere.** All processes now have the same totals, so they compute the same new centroids and stop in the same iteration, with no extra message."));
c.push(...screen("The main loop of the MPI program.", "src/kmeans_mpi.c, lines 25 to 65", 2.2));
c.push(H2("4.4 Hybrid version (src/kmeans_hybrid.c)"));
c.push(P(`The hybrid program is the MPI program where the local assignment step is done by OpenMP threads. It starts MPI with \`MPI_Init_thread(..., MPI_THREAD_FUNNELED, ...)\` (line 17), which means only the main thread of each process calls MPI. This is safe because all MPI calls are outside the OpenMP parallel region. Line 46 calls \`assign_omp\` for the local slice, and lines 52 to 58 do the barrier and the two \`MPI_Allreduce\` calls as in the MPI version. So there are two levels of parallelism: processes between slices and threads inside a slice.`));
c.push(...screen("The hybrid program.", "src/kmeans_hybrid.c, lines 15 to 60", 2.0));
c.push(H2("4.5 Where each PDC concept is used"));
c.push(...table(["PDC concept", "Where in the code"], [
  ["Data parallelism", "assign_omp loop and the MPI slices: workers handle different points"],
  ["Work sharing, scheduling", "#pragma omp for schedule(runtime) in common.h"],
  ["Race condition avoided", "private sums per thread (lsums, lcounts)"],
  ["False sharing avoided", "128 byte padding between thread blocks"],
  ["Reduction", "reduction(+ : total) and the merge of private blocks"],
  ["Data decomposition, distributed memory", "base, rem, local_n, start and read_rows in kmeans_mpi.c"],
  ["Collective communication, synchronisation", "MPI_Allreduce and MPI_Barrier"],
  ["Hybrid parallelism", "MPI_Init_thread with MPI_THREAD_FUNNELED, then assign_omp"],
], [2.6, 4.4], "PDC concepts and where they are used.", { leftAll: true }));
c.push(H2("4.6 How to run and what to screenshot"));
c.push(P(`Build with \`make all\`, check with \`make test\` (it ends with ALL PASSED) and compare the four versions with \`python scripts/demo.py\`. Every version prints the same \`iters\` and \`sse\`, which shows they found the same clusters. A single run varies by 10 to 15% on a laptop, so Section 5 uses medians.`));
c.push(...screen("Terminal after make all and make test (ends with ALL PASSED).", "Your terminal window", 1.5));
c.push(...screen("Terminal output of python scripts/demo.py (four versions compared).", "Your terminal window", 1.5));

// ---- 5 Results
c.push(H1("5. Results"));
c.push(P(`Times are medians in seconds for 20 iterations. The main problem has 1,000,000 points, d = 8, k = 8; the serial program needs ${f(serialBase, 2)} s for it. Each plot file named below is in the project folder; copy it in place of the placeholder.`));
c.push(H2("5.1 Correctness"));
const totalCases = VAL.reduce((a, v) => a + v.cases, 0), totalPassed = VAL.reduce((a, v) => a + v.passed, 0);
const maxDiff = Math.max(...VAL.map((v) => v.max_cent_diff));
c.push(...table(["Data set", "n", "d", "k", "Purity", "Cases passed"],
  VAL.map((v) => [v.name, comma(v.n), v.d, v.k, v.purity === null ? "no labels" : f(v.purity, 3), v.passed + " of " + v.cases]),
  [2.4, 1.2, 0.6, 0.6, 1, 1.3], "Correctness of OpenMP, MPI and hybrid against serial."));
c.push(P(`All ${totalPassed} of ${totalCases} comparisons passed, with identical iteration counts and cluster sizes and centroids equal up to ${maxDiff.toExponential(0)} (rounding). The same tests also passed on Linux. Purity on Letter Recognition is low (0.28) because letters overlap in these features; this table shows that the parallel programs agree with serial, not that the clusters are perfect.`));
c.push(H2("5.2 OpenMP: number of threads"));
c.push(...table(["Threads", "Time (s)", "Speedup", "Efficiency"], [1, 2, 4, 8].map((t) => [t, f(O(t).time, 3), f(so(O(t))), f(eff(W.omp_threads, O(t)))]), [1, 1, 1, 1], "OpenMP with 1, 2, 4 and 8 threads."));
c.push(...plot("fig1_openmp_threads.png", "OpenMP: time, speedup and efficiency against threads."));
c.push(P(`One thread equals the serial time (speedup ${f(so(O(1)))}), so OpenMP adds almost no cost. Speedup rises to ${X(so(O(4)))} at 4 threads and stops: 8 threads give ${X(so(O(8)))} because there are only 4 hardware threads. Two threads give only ${X(so(O(2)))}, possibly because the processor lowers its clock when more cores are busy or because both threads shared one core (not tested).`));
c.push(H2("5.3 OpenMP: loop scheduling (4 threads)"));
const schedRows = [["static", 0], ["dynamic", 1], ["dynamic", 1024], ["guided", 0]];
c.push(...table(["Schedule", "Time (s)", "Speedup"], schedRows.map(([s, ch]) => { const r = Sc(s, ch); return [s + (ch ? ", chunk " + ch : ""), f(r.time, 3), f(spd(W.omp_sched, r))]; }), [2, 1, 1], "OpenMP schedules."));
c.push(P(`Static, dynamic with a big chunk and guided are equal within noise, because every point costs the same work so there is no uneven load to fix. Dynamic with chunk 1 is about ${f((Sc("dynamic", 1).time / Sc("static", 0).time - 1) * 100, 0)}% slower because each thread asks for work one point at a time. For equal work, static is best.`));
c.push(H2("5.4 MPI: number of processes"));
c.push(...table(["Processes", "Time (s)", "Waiting (s)", "Allreduce (s)", "Speedup", "Efficiency"], [1, 2, 4, 8].map((p) => { const r = Mi(p); return [p, f(r.time, 3), f(r.t_wait, 3), f(r.t_comm, 4), f(sm(r)), f(eff(W.mpi_procs, r))]; }), [1, 1, 1, 1.1, 1, 1], "MPI with Microsoft MPI on Windows."));
c.push(...plot("fig3_mpi_processes.png", "MPI: time split into computing, waiting and communication; speedup; efficiency."));
c.push(P(`Up to 4 processes MPI behaves like OpenMP (${X(sm(Mi(4)))} at 4; the ${f(sm(Mi(1)))} at one process is noise). Communication is cheap: only 65 numbers are sent per iteration and the Allreduce takes about ${f(Mi(4).t_comm * 1000, 1)} ms in total (${f(Mi(4).t_comm / Mi(4).time * 100, 1)}% of the run). With **8 processes** the speedup drops to ${X(sm(Mi(8)))}: there are only 4 hardware threads, so processes wait for partners that are not running; about ${f((Mi(8).t_wait + Mi(8).t_comm) / Mi(8).time * 100, 0)}% of the time is waiting.`));
c.push(H2("5.5 Hybrid MPI + OpenMP"));
const hyCfg = [[1, 4], [2, 2], [4, 1]];
c.push(...table(["Processes x threads", "Time (s)", "Waiting (s)", "Allreduce (s)", "Speedup"], hyCfg.map(([p, t]) => { const r = Hy(p, t); return [p + " x " + t, f(r.time, 3), f(r.t_wait, 3), f(r.t_comm, 4), f(sh(r))]; }), [1.5, 1, 1, 1.1, 1], "Hybrid with 4 workers."));
c.push(...plot("fig4_hybrid.png", "Hybrid: run time and speedup for each split of 4 workers."));
c.push(P(`The three splits are close (${X(sh(Hy(1, 4)))}, ${X(sh(Hy(2, 2)))}, ${X(sh(Hy(4, 1)))}). The real advantage of the hybrid model, fewer MPI processes and less repeated data on a big cluster, cannot be shown on one laptop.`));
c.push(H2("5.6 Effect of n, k and d (4 workers)"));
const four = (rows, key, val) => ["serial", "omp", "mpi", "hybrid"].map((v) => find(rows, { version: v, [key]: val }));
const sweep = [];
const addSweep = (rows, key, vals, label, fmt = (x) => x) => vals.forEach((v) => { const [s, o, m, h] = four(rows, key, v); sweep.push([label + " = " + fmt(v), f(s.time, 3), X(spd(rows, o)), X(spd(rows, m)), X(spd(rows, h))]); });
addSweep(W.size, "n", [100000, 500000, 1000000, 2000000], "n", comma);
addSweep(W.kvals, "k", [4, 8, 16, 32], "k");
addSweep(W.dvals, "d", [2, 8, 32], "d");
c.push(...table(["Setting", "Serial (s)", "OpenMP 4", "MPI 4", "Hybrid 2 x 2"], sweep, [1.6, 1, 1, 1, 1.2], "Serial time and speedups for different n, k and d."));
c.push(...plot("fig5_effect_of_n.png", "Run time and speedup against n.", true, 1.3));
c.push(...plot("fig6_effect_of_k.png", "Run time and speedup against k.", true, 1.3));
c.push(...plot("fig7_effect_of_d.png", "Run time and speedup against d.", true, 1.3));
const s1 = find(W.size, { version: "serial", n: 100000 }).time, s2 = find(W.size, { version: "serial", n: 2000000 }).time;
c.push(P(`The serial time grows in a straight line with n, k and d, as n x k x d predicts (for n it grows from ${f(s1, 3)} s to ${f(s2, 3)} s). The speedup stays about 2.0 to 2.5 times for every size, because the parallel part is a fixed share of the work. Differences of 5 to 15% between the versions are within noise and are not a ranking.`));

c.push(H2("5.7 Real data sets (Windows and Linux)"));
const real2 = (R, nm, v, p, t) => R.find((r) => r.dataset === nm && r.version === v && r.procs === p && r.threads === t);
const realTable = [];
for (const nm of realNames) {
  const ws = real2(REAL, nm, "serial", 1, 1), ls = LREAL.length ? real2(LREAL, nm, "serial", 1, 1) : null;
  const label = { serial: "serial", omp2: "OpenMP 2 threads", omp4: "OpenMP 4 threads", mpi4: "MPI 4 processes", hy: "hybrid 2 x 2" };
  const defs = [["serial", "serial", 1, 1], ["omp2", "omp", 1, 2], ["omp4", "omp", 1, 4], ["mpi4", "mpi", 4, 1], ["hy", "hybrid", 2, 2]];
  defs.forEach(([k, v, p, t], i) => {
    const w = real2(REAL, nm, v, p, t), l = ls ? real2(LREAL, nm, v, p, t) : null;
    realTable.push([i === 0 ? meta[nm].title.split(" (")[0] + " (n = " + comma(ws.n) + ", d = " + ws.d + ", k = " + ws.k + ")" : "", label[k],
      f(w.time, 2) + " s (" + f(ws.time / w.time) + "x)", l ? f(l.time, 2) + " s (" + f(ls.time / l.time) + "x)" : "-"]);
  });
}
c.push(...table(["Data set", "Version", "Windows: time (speedup)", "Linux: time (speedup)"], realTable, [2.6, 1.5, 1.6, 1.6], "Results on the real data sets, 20 iterations."));
c.push(...plot("fig10_real_datasets.png", "Speedup on the real data sets, Windows.", true, 1.6));
c.push(...plot("fig10_real_datasets.png", "Speedup on the real data sets, Linux.", false, 1.6));
{
  const cw = (v, p, t) => rSp("census1990", rGet("census1990", v, p, t));
  const vw = (v, p, t) => rSp("covertype", rGet("covertype", v, p, t));
  c.push(P(`All parallel versions again produced the same SSE and clusters as serial on both data sets (Section 5.1). The speedups follow the same pattern as the synthetic data and are best for the data set with more work per point: Census (68 features) reaches ${X(cw("omp", 1, 4))} with OpenMP 4, ${X(cw("mpi", 4, 1))} with MPI 4 and ${X(cw("hybrid", 2, 2))} with hybrid, while Covertype (10 features) reaches ${X(vw("omp", 1, 4))}, ${X(vw("mpi", 4, 1))} and ${X(vw("hybrid", 2, 2))}. With few features each point needs little computing, so the fixed costs (starting threads, merging, communication) are a bigger share. No value goes above 4 because the laptop has 2 physical cores. Linux and Windows agree closely for OpenMP; MPI with Open MPI is a little slower than Microsoft MPI at 4 processes on these data sets.`));
}

c.push(H2("5.8 Random start against K-Means++"));
c.push(P(`K-Means++ picks starting centroids that are far from each other. In the serial program with 200,000 points, k = 16 and 10 seeds, it gave a mean SSE of ${sci(IS.plus.sse)} against ${sci(IS.random.sse)} for a random start (about ${f((1 - IS.plus.sse / IS.random.sse) * 100, 0)}% lower) and a better worst case, but not fewer iterations (${f(IS.plus.iters, 0)} against ${f(IS.random.iters, 0)}). With only 10 seeds this is weak evidence; its main benefit is avoiding some bad results.`));

c.push(H2("5.9 Windows against Linux (MPI library)"));
c.push(P(`We repeated everything on Ubuntu 26.04 under WSL2 with Open MPI. Open MPI needs two extra launcher options: \`--oversubscribe\` (more processes than CPU slots) and \`--bind-to none\` (otherwise each process is fixed to one core and its threads cannot spread out). All correctness tests passed again.`));
c.push(...table(["Quantity (main problem)", "Windows (MS-MPI)", "Linux (Open MPI)"], [
  ["Serial time (s)", f(serialBase, 2), f(lserialBase, 2)],
  ["OpenMP speedup, 1 / 2 / 4 / 8 threads", [1, 2, 4, 8].map((t) => f(so(O(t)))).join(" / "), [1, 2, 4, 8].map((t) => f(lso(LO(t)))).join(" / ")],
  ["MPI speedup, 1 / 2 / 4 / 8 processes", [1, 2, 4, 8].map((p) => f(sm(Mi(p)))).join(" / "), [1, 2, 4, 8].map((p) => f(lsm(LM(p)))).join(" / ")],
  ["MPI 8 processes: waiting + Allreduce (s)", f(Mi(8).t_wait, 3) + " + " + f(Mi(8).t_comm, 3), f(LM(8).t_wait, 3) + " + " + f(LM(8).t_comm, 3)],
], [2.6, 1.7, 1.7], "Windows and Linux compared.", { leftAll: false }));
c.push(...plot("fig3_mpi_processes.png", "MPI on Linux with Open MPI.", false, 1.5));
c.push(P(`OpenMP behaves the same on both systems (${X(lso(LO(4)))} at 4 threads), so its limit comes from the processor. MPI differs: with Open MPI 8 processes still gain (${X(lsm(LM(8)))}) while Microsoft MPI drops to ${X(sm(Mi(8)))}. So the drop on Windows comes from how that library waits when there are too many processes, not from our algorithm. Absolute times are about ${f((lserialBase / serialBase - 1) * 100, 0)}% slower on Linux, probably because of the virtual machine, so compare speedups, not seconds.`));

// ---- 6 Observations and conclusion
c.push(H1("6. Observations and Conclusion"));
c.push(H2("6.1 Observations"));
c.push(B(`**The limit is the hardware, not our code.** Amdahl's law says S(p) = 1 / (f + (1 - f) / p), where f is the serial fraction. Our serial parts (update step, merge, small message) are far below 1% of the time, so the law alone would allow nearly 4 times with 4 workers. We measured ${f(bestOmp, 1)} times because the laptop has only 2 real cores.`));
c.push(B(`**Communication is cheap.** MPI sends only k x d + 1 numbers per iteration (65 in the main test). Allreduce took about ${f(Mi(4).t_comm / Mi(4).time * 100, 1)}% of the run. It hurts only when there are more processes than hardware threads, because they then wait for each other.`));
c.push(B(`**Memory speed is probably not the limit at k = 8.** One iteration reads 64 MB, so 20 iterations read 1.28 GB; at ${f(O(8).time, 2)} s that is only about ${f(1.28 / O(8).time, 1)} GB per second (estimated, not measured). The program is mostly limited by computing.`));
c.push(B(`**Scheduling and size.** Static scheduling is best for equal work, and the speedup stays about the same for different n, k and d. Real data gave the same pattern, with a better speedup when each point needs more work (more features).`));
c.push(B(`**The MPI library matters.** Microsoft MPI lost much speed at 8 processes; Open MPI did not.`));
c.push(H2("6.2 Limitations"));
c.push(NUM6(`**Noise.** On a laptop the same run can differ by 10 to 15%. An early benchmark gave two misleading results (hybrid 1 x 1 speedup 0.88, and 3.0 at n = 100,000); repeating the runs showed they were noise, so we interleave repeats and use medians. Differences below 5 to 8% should be treated as equal.`));
c.push(NUM6(`**One computer with 2 cores.** We could not measure many workers or real network communication. The 8-worker results show too many workers, not scalability.`));
c.push(NUM6(`**Both setups run on the same laptop** (Windows with Microsoft MPI, and Ubuntu under WSL2 with Open MPI), and Census uses only the first 1,000,000 rows.`));
c.push(NUM6(`**Some explanations were not tested** (words like "possible" or "probably": processor clock changes, thread placement, MPI waiting). K-Means++ is only in the serial program.`));
c.push(H2("6.3 Conclusion"));
c.push(P(`We wrote serial, OpenMP, MPI and hybrid K-Means in C. All parallel versions gave the same clusters as serial on synthetic and real UCI data (${totalPassed} of ${totalCases} checks, on two operating systems and two MPI libraries). With 4 workers the speedups were ${X(bestOmp)} (OpenMP), ${X(bestMpi)} (MPI) and ${X(bestHy)} (hybrid) on the main problem and up to ${X(rSp("census1990", rGet("census1990", "omp", 1, 4)))} on real Census data. This is close to what a 2-core, 4-thread processor can give; more workers than hardware threads did not help. The limit came from the hardware, since the serial part is under 1% and the messages are tiny. Static scheduling is best for equal-sized work, and too many MPI processes hurt much more with Microsoft MPI than with Open MPI. On a computer with many cores or on several computers, we would expect to also see the benefit of the hybrid model and the cost of communication growing with k x d; this is future work.`));

// ---- References
c.push(H1("References"));
["Lloyd, S. P. (1982). Least squares quantization in PCM. IEEE Transactions on Information Theory, 28(2), 129 to 137.",
  "Arthur, D., and Vassilvitskii, S. (2007). k-means++: The advantages of careful seeding. SODA, 1027 to 1035.",
  "Amdahl, G. M. (1967). Validity of the single processor approach to achieving large scale computing capabilities. AFIPS Spring Joint Computer Conference, 483 to 485.",
  "OpenMP Architecture Review Board. OpenMP Application Programming Interface. https://www.openmp.org",
  "Message Passing Interface Forum. MPI: A Message-Passing Interface Standard. https://www.mpi-forum.org",
  "Dua, D., and Graff, C. (2019). UCI Machine Learning Repository. https://archive.ics.uci.edu",
].forEach((r) => c.push(new Paragraph({ children: [new TextRun({ text: r, size: 20, color: BLACK })], spacing: { after: 60 }, indent: { left: 360, hanging: 360 } })));

// ---- Appendix
c.push(H1("Appendix A. Files and How to Run"));
c.push(P(`**Submission:** this report, the source code (project folder, also on GitHub) and \`Datasets.zip\` (original UCI files and a README that explains how they were converted).`));
const code = (lines) => lines.map((l, i) => new Paragraph({ spacing: { after: i === lines.length - 1 ? 120 : 0, line: 240 },
  children: [new TextRun({ text: l, font: "Consolas", size: 18, color: BLACK })] }));
c.push(P(`**Windows** (MSYS2 UCRT64 or Git Bash, project folder):`, { after: 40 }));
c.push(...code(["source env.sh", "make all", "make test", "python scripts/prep_real.py", "make bench", "make plots"]));
c.push(P(`**Linux** (Ubuntu or WSL; same commands without \`source env.sh\`):`, { after: 40 }));
c.push(...code(["sudo apt install -y build-essential openmpi-bin libopenmpi-dev make python3-numpy python3-matplotlib", "make all && make test && make bench && make plots"]));
c.push(...table(["File", "Purpose"], [
  ["src/common.h", "Shared code: reading data, random numbers, assignment and update steps"],
  ["src/kmeans_serial.c, kmeans_omp.c, kmeans_mpi.c, kmeans_hybrid.c", "The four K-Means versions"],
  ["src/gen_data.c", "Synthetic data generator"],
  ["scripts/prep_uci.py, prep_real.py", "Convert UCI data to the binary format"],
  ["scripts/validate.py, run_benchmarks.py, make_plots.py", "Correctness tests, experiments, plots and tables"],
  ["results/, linux/results/ ; plots_bw/, plots_bw_linux/", "Measured numbers (CSV) and black and white plots, Windows and Linux"],
], [3, 3.6], "Main files of the project.", { leftAll: true }));
c.push(new Paragraph({ children: [] }));


// ------------------------------------------------------------------ assemble
const doc = new Document({
  creator: "Ayesha Raza", title: "Parallel K-Means Clustering using MPI and OpenMP - Final Report",
  styles: {
    default: { document: { run: { font: FONT, size: 21, color: BLACK } } },
    paragraphStyles: [
      { id: "Heading1", name: "Heading 1", basedOn: "Normal", next: "Normal", quickFormat: true, run: { font: HFONT, size: 28, bold: true, color: BLACK },
        paragraph: { spacing: { before: 240, after: 100 }, keepNext: true, outlineLevel: 0 } },
      { id: "Heading2", name: "Heading 2", basedOn: "Normal", next: "Normal", quickFormat: true, run: { font: HFONT, size: 23, bold: true, color: BLACK },
        paragraph: { spacing: { before: 160, after: 60 }, keepNext: true, outlineLevel: 1 } },
      { id: "TOC1", name: "toc 1", basedOn: "Normal", next: "Normal", run: { size: 21, bold: true, color: BLACK }, paragraph: { spacing: { before: 60, after: 20 } } },
      { id: "TOC2", name: "toc 2", basedOn: "Normal", next: "Normal", run: { size: 20, color: BLACK }, paragraph: { spacing: { before: 0, after: 0 }, indent: { left: 240 } } },
    ],
  },
  numbering: { config: [
    { reference: "bul", levels: [{ level: 0, format: LevelFormat.BULLET, text: "•", alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 540, hanging: 270 } } } }] },
    { reference: "num", levels: [{ level: 0, format: LevelFormat.DECIMAL, text: "%1.", alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 540, hanging: 360 } } } }] },
    { reference: "num2", levels: [{ level: 0, format: LevelFormat.DECIMAL, text: "%1.", alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 540, hanging: 360 } } } }] },
    { reference: "num3", levels: [{ level: 0, format: LevelFormat.DECIMAL, text: "%1.", alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 540, hanging: 360 } } } }] },
    { reference: "num4", levels: [{ level: 0, format: LevelFormat.DECIMAL, text: "%1.", alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 540, hanging: 360 } } } }] },
    { reference: "num5", levels: [{ level: 0, format: LevelFormat.DECIMAL, text: "%1.", alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 540, hanging: 360 } } } }] },
    { reference: "num6", levels: [{ level: 0, format: LevelFormat.DECIMAL, text: "%1.", alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 540, hanging: 360 } } } }] },
  ] },
  sections: [{
    properties: { page: { size: { width: 11906, height: 16838 }, margin: { top: 1200, right: 1150, bottom: 1200, left: 1150 } } },
    footers: { default: new Footer({ children: [new Paragraph({ alignment: AlignmentType.CENTER,
      children: [new TextRun({ text: "Parallel K-Means using MPI and OpenMP  |  Page ", size: 18, color: BLACK }), new TextRun({ children: [PageNumber.CURRENT], size: 18, color: BLACK })] })] }) },
    children: c,
  }],
});
Packer.toBuffer(doc).then((buf) => { fs.writeFileSync(OUT, buf); console.log("wrote", OUT, buf.length, "bytes"); });
