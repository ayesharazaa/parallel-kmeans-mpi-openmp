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
  HeadingLevel, LevelFormat, WidthType, ShadingType, PageNumber, TableOfContents, PageBreak,
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
const FONT = "Calibri", HFONT = "Arial", CW = 9026, BLACK = "000000";
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
  spacing: { after: o.after === undefined ? 120 : o.after, line: 288 }, keepNext: o.keepNext });
const H1 = (t, pb) => new Paragraph({ heading: HeadingLevel.HEADING_1, pageBreakBefore: !!pb, children: [new TextRun({ text: t, color: BLACK })] });
const H2 = (t) => new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun({ text: t, color: BLACK })] });
const B = (t) => new Paragraph({ numbering: { reference: "bul", level: 0 }, children: runs(t), spacing: { after: 60, line: 288 } });
const mkNum = (ref) => (t) => new Paragraph({ numbering: { reference: ref, level: 0 }, children: runs(t), spacing: { after: 60, line: 288 } });
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
    shading: head ? { type: ShadingType.CLEAR, fill: "D9D9D9", color: "auto" } : shade ? { type: ShadingType.CLEAR, fill: "F2F2F2", color: "auto" } : undefined,
    margins: { top: 50, bottom: 50, left: 90, right: 90 },
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
function pngSize(file) { const b = fs.readFileSync(file); return [b.readUInt32BE(16), b.readUInt32BE(20)]; }
function figure(rel, text, widthIn = 6.2) {
  const file = path.join(ROOT, rel);
  if (!fs.existsSync(file)) { console.log("MISSING image", rel); return []; }
  const [w, h] = pngSize(file);
  const wpx = Math.round(widthIn * 96), hpx = Math.round((wpx * h) / w);
  return [
    new Paragraph({ alignment: AlignmentType.CENTER, keepNext: true, spacing: { before: 120, after: 40 },
      children: [new ImageRun({ type: "png", data: fs.readFileSync(file), transformation: { width: wpx, height: hpx },
        altText: { title: text, description: text, name: path.basename(rel) } })] }),
    caption("Figure", text),
  ];
}
const fig = (n, text, w) => figure("plots_bw/" + n, text, w);

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
const NUM = mkNum("num"), NUM2 = mkNum("num2");

// ---- cover
const center = (text, size, o = {}) => new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: o.before || 0, after: o.after === undefined ? 120 : o.after },
  children: [new TextRun({ text, size, bold: o.bold, font: o.font, color: BLACK })] });
c.push(center("FAST-NUCES Karachi", 28, { before: 1800, after: 200, font: HFONT }));
c.push(center("Parallel and Distributed Computing: Course Project", 24, { after: 700, font: HFONT }));
c.push(center("Parallel K-Means Clustering", 56, { bold: true, font: HFONT, after: 200 }));
c.push(center("using MPI and OpenMP", 40, { bold: true, font: HFONT, after: 800 }));
c.push(center("Final Report", 30, { font: HFONT }));
c.push(center("Ayesha Raza (23K-3015)", 26, { bold: true, before: 1200, after: 80 }));
c.push(center("Instructor: Simran Mehlwani", 24, { after: 80 }));
c.push(center("Proposal date: 5 November 2026. Final submission: 5 December 2026", 22, { after: 80 }));
c.push(center("Source code: https://github.com/ayesharazaa/parallel-kmeans-mpi-openmp", 20, { before: 400 }));
c.push(new Paragraph({ children: [new PageBreak()] }));
c.push(new Paragraph({ children: [new TextRun({ text: "Contents", font: HFONT, size: 32, bold: true, color: BLACK })], spacing: { after: 200 } }));
c.push(new TableOfContents("Contents", { hyperlink: true, headingStyleRange: "1-2" }));

// ---- Abstract
const bestOmp = so(O(4)), bestMpi = sm(Mi(4)), bestHy = sh(Hy(2, 2));
c.push(H1("Abstract", true));
c.push(P(`K-Means is a popular method that groups similar data points into clusters. It is slow on big data because every point must be compared with every cluster centre, again and again. In this project we wrote K-Means in C in four versions: a normal serial version, a version for shared memory using OpenMP, a version for distributed memory using MPI, and a hybrid version that uses both.`));
c.push(P(`We checked that all parallel versions give the same clusters as the serial version, using synthetic data and real data from the UCI Machine Learning Repository. Then we measured how much faster they are. The test computer has 2 physical cores and 4 hardware threads. On a problem with 1,000,000 points, 4 workers made the program ${X(bestOmp)} faster with OpenMP, ${X(bestMpi)} faster with MPI and ${X(bestHy)} faster with the hybrid version (2 processes with 2 threads each).${realNames.length ? " We also ran all versions on " + realNames.length + " large real data set" + (realNames.length > 1 ? "s" : "") + " (" + realNames.map((n) => meta[n].title).join(", ") + ")." : ""}`));
c.push(P(`The speedup stops near 2.3 times, which is about the most this laptop can give. We explain the results with Amdahl's law, communication cost and memory speed, and we also repeated the tests on Linux with Open MPI to see how much the MPI library matters.`));

// ---- 1 Introduction
c.push(H1("1. Introduction"));
c.push(H2("1.1 What is clustering and what is K-Means?"));
c.push(P(`Clustering means putting similar things into the same group without being told the groups in advance. For example, a shop can group customers by what they buy, and a map program can group houses by location. Each group is called a cluster.`));
c.push(P(`K-Means is one of the simplest and most used clustering methods. You choose the number of clusters, k. The method keeps one special point for each cluster, called its centroid (the centre of the cluster). It repeats two steps:`));
c.push(NUM(`**Assignment step:** give every data point to the cluster whose centroid is nearest.`));
c.push(NUM(`**Update step:** move every centroid to the average position of the points that now belong to it.`));
c.push(P(`The two steps are repeated until the centroids stop moving or until a fixed number of repeats (iterations) is done.`));
c.push(H2("1.2 Why is K-Means slow, and why make it parallel?"));
c.push(P(`In the assignment step every point is compared with every centroid, and each comparison looks at every dimension (feature). So the work in one iteration is about n x k x d, where n is the number of points, k the number of clusters and d the number of dimensions. For n = 1,000,000 points, k = 8 and d = 8, 20 iterations need about ${comma(OPS)} basic operations (more than a billion). One core does them one after another, so it takes seconds, and for bigger data it takes minutes or hours.`));
c.push(P(`The good news is that the comparisons for different points do not depend on each other. We can give different points to different workers and let them work at the same time. This is called parallel computing. If we use several computers that do not share memory, it is called distributed computing. This project uses both ideas.`));
c.push(H2("1.3 Objectives"));
c.push(B("Write a simple serial K-Means in C (the baseline for comparison)."));
c.push(B("Make the assignment and update steps parallel with OpenMP (threads that share memory)."));
c.push(B("Write a distributed version with MPI (processes with separate memory), and a hybrid version that combines MPI and OpenMP."));
c.push(B("Measure speedup, efficiency and scalability for different numbers of threads, processes and data sizes, on synthetic and real data."));
c.push(B("Check that the parallel versions give the same clusters as the serial version."));
c.push(H2("1.4 Key terms used in this report"));
c.push(...table(["Term", "Simple meaning"], [
  ["Thread", "A worker inside one program. All threads of a program share the same memory."],
  ["Process", "A separate running program with its own private memory. Processes talk by sending messages."],
  ["OpenMP", "A tool for C that splits a loop between threads by adding one line (a pragma) before the loop."],
  ["MPI", "Message Passing Interface: a library that lets processes send data to each other and combine results."],
  ["Hybrid", "MPI between processes and OpenMP threads inside each process."],
  ["Speedup", "How many times faster the parallel program is: serial time divided by parallel time."],
  ["Efficiency", "Speedup divided by the number of workers. 1.0 means every worker is used perfectly."],
  ["Race condition", "A bug where two threads change the same variable at the same time and the result becomes wrong."],
  ["False sharing", "A slowdown where two threads write to different variables that sit in the same cache line, so the cores keep fighting over it."],
  ["MPI_Allreduce", "An MPI operation that adds up a value from every process and gives the total back to every process."],
  ["SSE", "Sum of squared errors: the total squared distance from each point to its centroid. Smaller means tighter clusters."],
], [1.4, 4.6], "Key terms.", { leftAll: true }));

// ---- 2 Dataset Description
c.push(H1("2. Dataset Description"));
c.push(H2("2.1 Why we use more than one kind of data"));
c.push(P(`We use two kinds of data for two different reasons. **Synthetic data** (made by our own generator) lets us change one thing at a time, such as only the number of points, so we can see exactly how the program scales. **Real data** from the UCI Machine Learning Repository shows that the programs also work on data from the real world, which is messy and has many features. We also use three small data sets only to check that the answers are correct.`));
c.push(H2("2.2 Overview of all data sets"));
const dsRows = [
  ["Synthetic (our generator)", "100,000 to 2,000,000", "2 to 32", "Scaling tests (n, k and d)"],
];
const vget = (nm) => VAL.find((v) => v.name === nm);
const addVal = (nm, label, src, use) => { const v = vget(nm); dsRows.push([label + " (" + src + ")", v ? comma(v.n) : meta[nm] ? meta[nm].n : "-", v ? String(v.d) : meta[nm] ? meta[nm].d : "-", use]); };
addVal("covertype", "Covertype", "UCI", "Real data benchmark");
addVal("census1990", "US Census 1990", "UCI", "Real data benchmark");
addVal("letter", "Letter Recognition", "UCI", "Correctness check");
addVal("wine", "Wine", "UCI", "Correctness check");
addVal("iris", "Iris", "UCI", "Correctness check");
c.push(...table(["Data set", "Points (n)", "Features (d)", "Used for"], dsRows.filter((r) => r[1] !== "-" || r[0].startsWith("Synthetic")), [2.6, 1.5, 1, 2], "The data sets of this project.", { leftAll: false }));
c.push(H2("2.3 Synthetic data"));
c.push(P(`Our program \`gen_data\` makes the data. It first picks k random cluster centres inside a box of size 100 in every dimension. Then, for each point, it picks one centre at random and adds random noise (a bell-shaped Gaussian error with standard deviation 5). The result looks like k fuzzy clouds of points. The same seed always gives the same file, so experiments can be repeated exactly. The main test problem has 1,000,000 points, 8 dimensions and 8 clusters.`));
c.push(H2("2.4 Large real data sets (UCI)"));
const covV = vget("covertype"), msdV = vget("yearpredictionmsd"), cenV = vget("census1990");
c.push(P(`**Covertype.** Each row describes one small square of forest (30 m x 30 m) in the Roosevelt National Forest in Colorado. The original file has ${covV ? comma(covV.n) : "581,012"} rows and 54 columns, plus a label telling the real forest cover type (7 types, such as spruce/fir and lodgepole pine). We use the 10 measured number columns (for example elevation, slope, distances to water and roads, and hillshade). The other 44 columns are only 0/1 flags and are not used. We use k = 7, the number of real cover types. The label is used only to compute purity, never to cluster.`));
c.push(P(`**US Census 1990.** Each row is a person from a sample of the 1990 US Census, described by ${cenV ? cenV.d : 68} coded attributes (such as age group, education and work type) stored as whole numbers. The full file has 2,458,285 rows, and we use the first ${cenV ? comma(cenV.n) : "1,000,000"} of them so that one run stays short on a laptop. It has no labels. It is a well known benchmark for K-Means because of its size. We use it as a computing benchmark. K-Means treats the codes as numbers, which is not perfect for category codes, but the aim here is to measure speed and to check that all versions agree. We use k = 8.`));
c.push(H2("2.5 Small data sets used for the correctness check"));
c.push(B("**Iris:** 150 flowers with 4 measurements, 3 real species (k = 3)."));
c.push(B("**Wine:** 178 wines with 13 chemical measurements, 3 grape types (k = 3)."));
c.push(B("**Letter Recognition:** 20,000 images of letters described by 16 numbers, 26 letters (k = 26)."));
c.push(P(`They are too small to measure speed, but they have real class labels, so we can also check that the clusters make sense by computing purity.`));
c.push(H2("2.6 How the data was prepared"));
c.push(B("**One binary file format.** Every data set is converted to the same simple file: two integers (n and d) followed by all the numbers, point after point. The C programs read this directly, and each MPI process can jump to its own part of the file."));
c.push(B("**Standardising.** The columns of real data have very different sizes. For example, elevation is in the thousands but slope is below 60. K-Means uses distances, so a big column would hide the small ones. We therefore standardise every real column (subtract its average and divide by its standard deviation) so that all columns count equally. Iris and Letter Recognition were left unchanged because their columns have similar sizes."));
c.push(B("**Dropped columns.** Class labels, years and ID columns are not used as features."));
c.push(P(`The data files are included in the submission as a ZIP file (see Appendix A).`));

// ---- 3 Methodology
c.push(H1("3. Methodology"));
c.push(H2("3.1 The algorithm we implement"));
c.push(P(`We use the standard K-Means method (Lloyd's algorithm). In plain steps:`));
c.push(NUM2("Choose k starting centroids (we pick k random data points)."));
c.push(NUM2("Assignment step: for every point, find the nearest centroid (smallest squared distance) and add the point to that cluster's running sum and count."));
c.push(NUM2("Update step: new centroid of each cluster = sum of its points divided by its count. A cluster with no points keeps its old centroid."));
c.push(NUM2("Stop if the centroids moved less than a tiny limit, or after the maximum number of iterations. Otherwise go back to step 2."));
c.push(H2("3.2 What to make parallel"));
c.push(P(`The assignment step does n x k x d work. The update step only does k x d work, which is tiny. So almost all the time is in the assignment step, and that is the step we share between workers. This idea is called data parallelism: every worker does the same job on a different part of the data.`));
c.push(H2("3.3 Three ways to share the work"));
c.push(...figure("report/code_images/diagram_workers.png", "How the work is divided in the four versions.", 6.0));
c.push(B("**OpenMP (shared memory).** One process and several threads. Every thread can see all the points. The loop over points is split between the threads. The danger is a race condition, so each thread keeps its own private sums and the sums are added together at the end."));
c.push(B("**MPI (distributed memory).** Several processes, each with its own memory. We cut the points into slices, one slice per process, and each process reads only its own slice. Since processes cannot see each other's memory, they must send messages. Once per iteration, they add their partial sums together with one `MPI_Allreduce` call and every process gets the totals."));
c.push(B("**Hybrid.** MPI cuts the points between processes, and inside each process OpenMP threads share that process's slice. This uses both ideas. It is meant for clusters of computers where each computer has many cores."));
c.push(H2("3.4 Making the comparison fair"));
c.push(B("All versions start from the same centroids (the same k points, chosen by our own seeded random generator, which gives the same numbers on every computer)."));
c.push(B("For speed tests every version runs exactly 20 iterations (`-m 20 -t -1`), so the amount of work is identical."));
c.push(B("Only the iteration loop is timed. Reading the file and choosing the start centroids are not counted."));
c.push(B("Speedup is always computed against our own serial program on the same data."));
c.push(H2("3.5 Experiments"));
c.push(...table(["Experiment", "What changes", "Question it answers"], [
  ["E1 OpenMP threads", "1, 2, 4, 8 threads", "How much faster do more threads make it?"],
  ["E2 OpenMP schedules", "static, dynamic, guided", "Does the way iterations are given to threads matter?"],
  ["E3 MPI processes", "1, 2, 4, 8 processes", "How does MPI scale, and what does communication cost?"],
  ["E4 Hybrid", "processes x threads", "Is a mix better than only threads or only processes?"],
  ["E5 Data size, clusters, dimensions", "n, k and d, one at a time", "Does the speedup depend on the problem size?"],
  ["E6 Real data sets", "Covertype, US Census 1990", "Do the results hold on real data?"],
  ["E7 Linux and Open MPI", "operating system and MPI library", "Do the results depend on the MPI library?"],
  ["E8 Starting centroids", "random or K-Means++", "Does a smarter start give better clusters?"],
], [1.7, 1.8, 2.5], "The experiments.", { leftAll: true }));
c.push(H2("3.6 How we measure"));
c.push(B("**Speedup** S = T_serial / T_parallel. **Efficiency** E = S / (processes x threads)."));
c.push(B("Each setting is run several times (5 for the synthetic tests and 3 for the long real-data runs) and we report the **median** time. The repeats of all settings in one experiment are **interleaved** (all settings once, then all settings again, and so on), so a slow moment of the laptop affects all of them equally."));
c.push(B("For the MPI programs we also measure the time spent waiting for the slowest process (a barrier before the communication) and the time of the `MPI_Allreduce` call itself. This separates real communication cost from waiting."));
c.push(H2("3.7 How we check correctness"));
c.push(P(`A script runs the serial program, then OpenMP (1, 3 and 4 threads, with static, dynamic and guided schedules), MPI (1, 3 and 4 processes) and hybrid (2 x 2 and 3 x 2), and compares each result with the serial one. We compare the number of iterations, the size of each cluster, the SSE and the centroid positions. Three processes do not divide the points evenly, so this also tests uneven slices. Because floating-point numbers are added in a different order in parallel, tiny differences of about 1e-13 are expected and accepted.`));
c.push(H2("3.8 Test computers"));
c.push(...table(["Item", "Windows (main results)", "Linux (second set of results)"], [
  ["Processor", "Intel Core i7-6600U, 2 cores, 4 hardware threads", "Same laptop (through WSL2)"],
  ["Memory", "7.9 GB", "3 GB given to the Linux virtual machine"],
  ["Operating system", "Windows 10", "Ubuntu 26.04 under WSL2"],
  ["Compiler", "GCC 16.2, option -O2", "GCC 15.2, option -O2"],
  ["MPI library", "Microsoft MPI", "Open MPI"],
], [1.2, 2.4, 2.4], "The two test environments.", { leftAll: true }));
c.push(P(`The laptop has 2 physical cores. Each core can run 2 threads at once (hyper-threading), so the computer shows 4 hardware threads. Two threads on one core do not give twice the speed, so we expect a best speedup of about 2.2 to 2.6 times on this machine.`));

// ---- 4 Implementation
c.push(H1("4. Implementation"));
c.push(P(`The code is written in C. One header file, \`src/common.h\`, holds the parts that all versions share (reading data, random numbers, the assignment step and the update step). Each program (\`kmeans_serial.c\`, \`kmeans_omp.c\`, \`kmeans_mpi.c\`, \`kmeans_hybrid.c\`) is short and only decides how the work is divided. The pictures below show the real code. The black numbers mark the lines that use a parallel (PDC) idea, and the notes under each picture explain them.`));
c.push(H2("4.1 Serial baseline"));
c.push(...figure("report/code_images/code_serial.png", "The main loop of the serial program.", 6.2));
c.push(P(`This is the plain version. It reads all points, then repeats the assignment step and the update step. Everything else in the project is a way to make step 1 faster.`));
c.push(H2("4.2 OpenMP version"));
c.push(...figure("report/code_images/code_openmp.png", "The OpenMP assignment step, with the PDC ideas marked.", 6.2));
c.push(P(`**Work sharing.** The line \`#pragma omp for\` tells OpenMP to split the loop over points between the threads. We use \`schedule(runtime)\` so that we can choose static, dynamic or guided scheduling when we run the program.`));
c.push(P(`**Avoiding a race condition.** If all threads added into the same sums and counts, they would overwrite each other and the answer would be wrong. Locks would fix it but make the program slow. Instead, each thread has its own private block of sums and counts. After the loop, the blocks are added together in a fixed order.`));
c.push(P(`**Avoiding false sharing.** If the private blocks sat next to each other in memory, two threads could write to the same cache line, and the cores would keep taking it away from each other. We leave 16 unused numbers (128 bytes) after each block so this cannot happen.`));
c.push(H2("4.3 MPI version"));
c.push(...figure("report/code_images/code_mpi.png", "The main part of the MPI program, with the PDC ideas marked.", 6.2));
c.push(P(`**Splitting the data.** Process number \`rank\` takes its own slice of the points. If n cannot be divided evenly, the first few processes take one extra point. Each process reads only its slice from the file.`));
c.push(P(`**Communication.** After each process has found the nearest centroids for its own points, \`MPI_Allreduce\` adds the partial sums and counts of all processes and gives the totals to all of them. Only k x d + 1 numbers are sent, no matter how many points there are. Because all processes now have the same totals, they all compute the same new centroids and all decide to stop in the same iteration.`));
c.push(P(`**Measuring waiting.** The barrier before the communication shows how long the fast processes wait for the slowest one (load imbalance). We time it separately so that it is not mistaken for communication cost.`));
c.push(H2("4.4 Hybrid version"));
c.push(...figure("report/code_images/code_hybrid.png", "The hybrid program: MPI between processes and OpenMP inside each process.", 6.2));
c.push(P(`The hybrid program is the MPI program in which the local assignment step is done by OpenMP threads. It starts MPI with \`MPI_THREAD_FUNNELED\`, which means that only the main thread of each process calls MPI. This is safe because all MPI calls happen outside the OpenMP parallel region.`));
c.push(H2("4.5 Where each PDC concept is used"));
c.push(...table(["PDC concept", "Where in the code", "Why it is needed"], [
  ["Data parallelism", "assign_omp loop, MPI slices", "Different workers handle different points at the same time."],
  ["Work sharing and scheduling", "#pragma omp for schedule(runtime)", "Splits the loop between threads; the schedule decides how."],
  ["Race condition avoided", "private sums per thread", "Threads never write to the same variable at the same time."],
  ["False sharing avoided", "128 byte padding between thread blocks", "Stops cores from fighting over one cache line."],
  ["Reduction", "reduction(+ : total), merge of private blocks", "Combines the partial results of all threads."],
  ["Data decomposition", "base, rem, local_n, start in the MPI code", "Gives each process an equal slice of the points."],
  ["Distributed memory", "each process reads its own slice", "Processes cannot see each other's memory."],
  ["Collective communication", "MPI_Allreduce", "Adds the partial results of all processes and shares the total."],
  ["Synchronisation", "MPI_Barrier", "Waits for the slowest process and measures the waiting."],
  ["Hybrid parallelism", "MPI_Init_thread + assign_omp", "Two levels: processes between nodes, threads inside a node."],
  ["Load balancing", "equal slices, static schedule", "Every worker gets about the same amount of work."],
], [1.5, 2.2, 2.6], "PDC concepts and where they appear.", { leftAll: true }));
c.push(H2("4.6 Running the programs"));
c.push(P(`The next two pictures show real terminal output. The first runs the four versions on the same 1,000,000 points. Every version prints the same \`iters\` and \`sse\`, which means that all of them found the same clusters. The times are from one single run; the Results section uses the median of several runs because a single run can be slower or faster by 10 to 15 percent on a laptop.`));
c.push(...figure("report/code_images/terminal_four_versions.png", "Terminal output: the four versions on 1,000,000 points.", 6.2));
c.push(P(`The second picture shows the correctness test. Every parallel configuration prints PASS next to the size of the difference from the serial result.`));
c.push(...figure("report/code_images/terminal_validation.png", "Terminal output: the correctness test.", 6.2));

// ---- 5 Results
c.push(H1("5. Results"));
c.push(P(`All numbers are medians of repeated runs (see Section 3.6). Times are in seconds for 20 iterations. The main test problem has 1,000,000 points, 8 dimensions and 8 clusters, and the serial program needs about ${f(serialBase, 2)} s for it.`));
c.push(H2("5.1 Correctness"));
const totalCases = VAL.reduce((a, v) => a + v.cases, 0), totalPassed = VAL.reduce((a, v) => a + v.passed, 0);
const maxDiff = Math.max(...VAL.map((v) => v.max_cent_diff));
c.push(...table(["Data set", "n", "d", "k", "Serial iterations", "Purity", "Cases passed"],
  VAL.map((v) => [v.name, comma(v.n), v.d, v.k, v.iters, v.purity === null ? "no labels" : f(v.purity, 3), v.passed + " of " + v.cases]),
  [2.1, 1, 0.5, 0.5, 1.2, 1, 1.2], "Correctness check of OpenMP, MPI and hybrid against serial."));
c.push(P(`All ${totalPassed} of ${totalCases} comparisons passed. In every case the number of iterations and the size of every cluster were identical to the serial result, and the centroids were the same up to a difference of ${maxDiff.toExponential(0)} (just rounding). The same tests also passed on Linux with Open MPI. Purity on Letter Recognition is low (about 0.28) because letters overlap a lot in these features and K-Means does not use the labels. The goal of this table is that the parallel programs agree with the serial one, not that the clusters are perfect.`));
c.push(H2("5.2 OpenMP: effect of the number of threads"));
c.push(...table(["Threads", "Time (s)", "Speedup", "Efficiency"], [1, 2, 4, 8].map((t) => [t, f(O(t).time, 3), f(so(O(t))), f(eff(W.omp_threads, O(t)))]), [1, 1, 1, 1], "OpenMP time, speedup and efficiency."));
c.push(...fig("fig1_openmp_threads.png", "OpenMP: time, speedup and efficiency against the number of threads."));
c.push(B(`One thread takes the same time as the serial program (speedup ${f(so(O(1)))}), so the extra code for OpenMP costs almost nothing.`));
c.push(B(`Speedup rises to ${X(so(O(4)))} with 4 threads and then stops: 8 threads give ${X(so(O(8)))}. The computer has only 4 hardware threads, so extra threads just wait for a turn.`));
c.push(B(`2 threads give only ${X(so(O(2)))} (efficiency ${f(eff(W.omp_threads, O(2)))}) even though there are 2 cores. Possible reasons, which we did not test, are that the processor lowers its clock speed when more cores are busy, or that two threads were placed on the same core.`));
c.push(H2("5.3 OpenMP: loop scheduling"));
const schedRows = [["static", 0], ["dynamic", 1], ["dynamic", 1024], ["guided", 0]];
c.push(...table(["Schedule", "Time (s)", "Speedup"], schedRows.map(([s, ch]) => { const r = Sc(s, ch); return [s + (ch ? ", chunk " + ch : ""), f(r.time, 3), f(spd(W.omp_sched, r))]; }), [2, 1, 1], "OpenMP schedules with 4 threads."));
c.push(...fig("fig2_openmp_schedules.png", "Run time of the OpenMP scheduling options (4 threads).", 4.6));
c.push(P(`Static, dynamic with a big chunk, and guided are practically equal (the differences are within the normal noise). Every point costs the same work, so there is no unfair load that dynamic scheduling could fix. Dynamic with chunk size 1 is about ${f((Sc("dynamic", 1).time / Sc("static", 0).time - 1) * 100, 0)}% slower, because each thread has to ask for work one point at a time, about a million times per iteration. For equal-sized work, static scheduling is the best choice.`));
c.push(H2("5.4 MPI: effect of the number of processes"));
c.push(...table(["Processes", "Time (s)", "Waiting (s)", "Allreduce (s)", "Speedup", "Efficiency"], [1, 2, 4, 8].map((p) => { const r = Mi(p); return [p, f(r.time, 3), f(r.t_wait, 3), f(r.t_comm, 4), f(sm(r)), f(eff(W.mpi_procs, r))]; }), [1, 1, 1, 1.1, 1, 1], "MPI with Microsoft MPI on Windows."));
c.push(...fig("fig3_mpi_processes.png", "MPI: time (computation, waiting and communication), speedup and efficiency."));
c.push(B(`Up to 4 processes MPI behaves like OpenMP (${X(sm(Mi(4)))} at 4). The speedup of ${f(sm(Mi(1)))} at one process is only measurement noise.`));
c.push(B(`**Communication is cheap.** Each iteration sends only 65 numbers. The total Allreduce time for 4 processes is about ${f(Mi(4).t_comm * 1000, 1)} milliseconds (${f(Mi(4).t_comm / Mi(4).time * 100, 1)}% of the run).`));
c.push(B(`**8 processes are slower than 4** (speedup ${f(sm(Mi(8)))} against ${f(sm(Mi(4)))}). With only 4 hardware threads, 8 processes must take turns, and each process often waits for a partner that is not running at that moment. About ${f((Mi(8).t_wait + Mi(8).t_comm) / Mi(8).time * 100, 0)}% of the time is spent waiting. Section 5.9 shows that this depends on the MPI library.`));
c.push(H2("5.5 Hybrid MPI + OpenMP"));
const hyCfg = [[1, 1], [1, 2], [1, 4], [2, 1], [2, 2], [4, 1]];
c.push(...table(["Processes x threads", "Workers", "Time (s)", "Waiting (s)", "Allreduce (s)", "Speedup"], hyCfg.map(([p, t]) => { const r = Hy(p, t); return [p + " x " + t, r.workers, f(r.time, 3), f(r.t_wait, 3), f(r.t_comm, 4), f(sh(r))]; }), [1.4, 0.9, 1, 1, 1.1, 1], "Hybrid configurations."));
c.push(...fig("fig4_hybrid.png", "Hybrid: run time and speedup for each split between processes and threads.", 6.0));
c.push(P(`With 4 workers, the three splits are close: 1 x 4 gives ${X(sh(Hy(1, 4)))}, 2 x 2 gives ${X(sh(Hy(2, 2)))} and 4 x 1 gives ${X(sh(Hy(4, 1)))}. Fewer processes mean less waiting and less communication, but on a single laptop the difference is small. The real advantage of the hybrid model, fewer MPI processes and less repeated data on big clusters, cannot be shown on one machine.`));
c.push(...fig("fig8_summary_4_workers.png", "Speedup of each version with 4 workers.", 4.4));
c.push(H2("5.6 Effect of n, k and d"));
const four = (rows, key, val) => ["serial", "omp", "mpi", "hybrid"].map((v) => find(rows, { version: v, [key]: val }));
function sweepTable(rows, key, vals, label, title, fmt = (x) => x) {
  return table([label, "Serial (s)", "OpenMP 4 threads", "MPI 4 processes", "Hybrid 2 x 2"],
    vals.map((v) => { const [s, o, m, h] = four(rows, key, v); const cell = (r) => f(r.time, 3) + " s (" + X(spd(rows, r)) + ")"; return [fmt(v), f(s.time, 3), cell(o), cell(m), cell(h)]; }),
    [1, 1, 1.5, 1.5, 1.5], title);
}
c.push(...sweepTable(W.size, "n", [100000, 500000, 1000000, 2000000], "n (points)", "Effect of the number of points n.", comma));
c.push(...fig("fig5_effect_of_n.png", "Run time and speedup against the number of points n."));
c.push(...sweepTable(W.kvals, "k", [4, 8, 16, 32], "k (clusters)", "Effect of the number of clusters k."));
c.push(...fig("fig6_effect_of_k.png", "Run time and speedup against the number of clusters k."));
c.push(...sweepTable(W.dvals, "d", [2, 8, 32], "d (dimensions)", "Effect of the number of dimensions d."));
c.push(...fig("fig7_effect_of_d.png", "Run time and speedup against the number of dimensions d."));
const s1 = find(W.size, { version: "serial", n: 100000 }).time, s2 = find(W.size, { version: "serial", n: 2000000 }).time;
c.push(B(`The serial time grows in a straight line with n, k and d, as the formula n x k x d predicts. For example, it grows from ${f(s1, 3)} s to ${f(s2, 3)} s when n grows from 100,000 to 2,000,000.`));
c.push(B(`The speedup stays about the same (roughly 2.0 to 2.5 times with 4 workers) for every size. The parallel part is a fixed share of the work, and the cost of combining results depends only on k x d, not on n.`));
c.push(B(`Differences of 5 to 15% between OpenMP, MPI and hybrid in these tables are close to the noise and should not be read as a ranking.`));

c.push(H2("5.7 Real data sets"));
if (REAL.length) {
  c.push(P(`These tests use the real data described in Section 2.4, with 20 iterations and the settings serial, OpenMP with 2 and 4 threads, MPI with 4 processes and hybrid 2 x 2.`));
  const rrows = [];
  for (const nm of realNames) {
    const s = rSerial(nm);
    for (const r of realRows(nm)) {
      const lab = { serial: "serial", omp: "OpenMP " + r.threads + " threads", mpi: "MPI " + r.procs + " processes", hybrid: "hybrid " + r.procs + " x " + r.threads }[r.version];
      rrows.push([r.version === "serial" ? meta[nm].title.split(" (")[0] + " (n = " + comma(s.n) + ", d = " + s.d + ", k = " + s.k + ")" : "", lab, f(r.time, 3), f(s.time / r.time)]);
    }
  }
  c.push(...table(["Data set", "Version", "Time (s)", "Speedup"], rrows, [3, 1.6, 1, 1], "Results on the real data sets.", { leftAll: false }));
  c.push(...fig("fig10_real_datasets.png", "Speedup on the real data sets (20 iterations).", 6.0));
  for (const nm of realNames) {
    const s = rSerial(nm), o4 = rGet(nm, "omp", 1, 4), m4 = rGet(nm, "mpi", 4, 1), h = rGet(nm, "hybrid", 2, 2);
    c.push(B(`**${meta[nm].title.split(" (")[0]}:** serial ${f(s.time, 2)} s; OpenMP 4 threads ${f(o4.time, 2)} s (${X(rSp(nm, o4))}); MPI 4 processes ${f(m4.time, 2)} s (${X(rSp(nm, m4))}); hybrid 2 x 2 ${f(h.time, 2)} s (${X(rSp(nm, h))}).`));
  }
  const four4 = [];
  for (const nm of realNames) for (const r of realRows(nm)) if (r.workers === 4) four4.push(rSp(nm, r));
  c.push(P(`With 4 workers, the speedups on the real data sets range from ${X(Math.min(...four4))} to ${X(Math.max(...four4))}. The data set with more work per point (Census, 68 features) gets the best speedup, because each point needs more computing compared with the fixed cost of reading and combining results. Covertype has only 10 features, so the fixed parts are a bigger share and the speedup is lower. All values stay below 4 because the laptop has only 2 physical cores. Every parallel version produced the same SSE and the same clusters as the serial version on these data sets (Section 5.1).`));
} else {
  c.push(P(`(The real data sets were not available when this report was built.)`));
}

c.push(H2("5.8 Random start against K-Means++ start"));
c.push(P(`K-Means++ chooses the starting centroids so that they are far from each other. The first centroid is random, and each next one is chosen with a higher chance if it is far from the centroids chosen already. We tested it in the serial program with 200,000 points, 8 dimensions, k = 16 and overlapping clusters, using 10 different random seeds.`));
c.push(...table(["Start", "Mean iterations", "Mean SSE", "Best SSE", "Worst SSE"], [
  ["Random", f(IS.random.iters, 1), sci(IS.random.sse), sci(IS.random.best), sci(IS.random.worst)],
  ["K-Means++", f(IS.plus.iters, 1), sci(IS.plus.sse), sci(IS.plus.best), sci(IS.plus.worst)],
], [1.2, 1.2, 1.2, 1.2, 1.2], "Random against K-Means++ start (10 seeds)."));
c.push(...fig("fig9_initialisation.png", "Iterations and final SSE for 10 seeds (the black bar is the mean).", 5.4));
c.push(P(`K-Means++ gave a lower average SSE (about ${f((1 - IS.plus.sse / IS.random.sse) * 100, 0)}% lower) and a better worst case, but it did not reduce the number of iterations (${f(IS.plus.iters, 0)} against ${f(IS.random.iters, 0)}). With only 10 seeds the difference is not strong evidence. Its main benefit is that it avoids some bad results.`));

c.push(H2("5.9 Repeat on Linux with Open MPI"));
c.push(P(`We ran the whole project again on Ubuntu 26.04 under WSL2 with Open MPI. The only change was that the launcher needs two extra options for Open MPI: \`--oversubscribe\` (to run more processes than CPU slots) and \`--bind-to none\` (otherwise Open MPI fixes each process to one core and its threads cannot spread out). All correctness tests passed again with identical iteration counts and cluster sizes.`));
c.push(...table(["Quantity (main problem)", "Windows (MS-MPI)", "Linux (Open MPI)"], [
  ["Serial time (s)", f(serialBase, 2), f(lserialBase, 2)],
  ["OpenMP speedup, 1 / 2 / 4 / 8 threads", [1, 2, 4, 8].map((t) => f(so(O(t)))).join(" / "), [1, 2, 4, 8].map((t) => f(lso(LO(t)))).join(" / ")],
  ["MPI speedup, 1 / 2 / 4 / 8 processes", [1, 2, 4, 8].map((p) => f(sm(Mi(p)))).join(" / "), [1, 2, 4, 8].map((p) => f(lsm(LM(p)))).join(" / ")],
  ["MPI 8 processes: waiting + Allreduce (s)", f(Mi(8).t_wait, 3) + " + " + f(Mi(8).t_comm, 3), f(LM(8).t_wait, 3) + " + " + f(LM(8).t_comm, 3)],
  ["Hybrid speedup, 1x4 / 2x2 / 4x1", [[1, 4], [2, 2], [4, 1]].map(([p, t]) => f(sh(Hy(p, t)))).join(" / "), [[1, 4], [2, 2], [4, 1]].map(([p, t]) => f(lsh(LH(p, t)))).join(" / ")],
], [2.3, 1.7, 1.7], "Windows and Linux compared.", { leftAll: false }));
c.push(...figure("plots_bw_linux/fig3_mpi_processes.png", "MPI on Linux with Open MPI (compare with the Windows figure in Section 5.4).", 6.0));
c.push(B(`**OpenMP behaves the same on both systems** (${X(lso(LO(4)))} at 4 threads, no gain at 8). This supports the idea that the limit comes from the 2-core processor, not from the operating system.`));
c.push(B(`**MPI differs between the two libraries.** With Open MPI, 4 processes are slower than on Windows (${X(lsm(LM(4)))} against ${X(sm(Mi(4)))}), but 8 processes still gain (${X(lsm(LM(8)))}), whereas Microsoft MPI got much worse at 8 (${X(sm(Mi(8)))}). So the big drop at 8 processes on Windows comes from how that MPI library waits when there are too many processes, not from our algorithm. A likely reason is that Open MPI lets waiting processes give up the processor when it sees too many processes, but we did not test this.`));
c.push(B(`**Absolute times are about ${f((lserialBase / serialBase - 1) * 100, 0)}% slower on Linux** (${f(lserialBase, 2)} s against ${f(serialBase, 2)} s), probably because of the virtual machine. Compare speedups, not seconds, between the two systems.`));

// ---- 6 Observations and conclusion
c.push(H1("6. Observations and Conclusion"));
c.push(H2("6.1 Observations"));
c.push(P(`**The best speedup is limited by the processor, not by our code.** Amdahl's law says that the speedup of a program is limited by the part that cannot run in parallel: S(p) = 1 / (f + (1 - f) / p), where f is the serial fraction and p the number of workers. In our program the serial parts (the update step, merging the thread results and the small MPI message) are tiny compared with the assignment step, so f is far below 1%. By the law alone, 4 workers could give nearly 4 times. We measured ${f(bestOmp, 1)} times because the laptop has only 2 real cores, so the limit comes from the hardware.`));
c.push(P(`**Communication is cheap here.** MPI sends only k x d + 1 numbers per iteration (65 numbers in the main test), which is a few hundred bytes. The Allreduce took about ${f(Mi(4).t_comm / Mi(4).time * 100, 1)}% of the run with 4 processes. It becomes a problem only when there are more processes than hardware threads, because processes then wait for each other.`));
c.push(P(`**Memory speed is probably not the limit at k = 8.** In one iteration the program reads all 64 MB of data (1,000,000 x 8 numbers of 8 bytes), so 20 iterations read 1.28 GB. At our best time of ${f(O(8).time, 2)} s this is only about ${f(1.28 / O(8).time, 1)} GB per second, much less than normal laptop memory can deliver (we did not measure it on this machine). So the program is mostly limited by computing, not by memory. With small k or small d, memory would matter more.`));
c.push(P(`**Scheduling and size.** Static scheduling is as good as any other for equal-sized work, and dynamic scheduling with chunk size 1 is clearly slower. The speedup stays about the same for different n, k and d.`));
c.push(H2("6.2 Limitations"));
c.push(NUM2(`**Noise.** On a laptop, the same run can differ by 10 to 15% because of heat and background programs. An early benchmark gave two misleading results (a hybrid 1 x 1 speedup of 0.88 and a speedup of 3.0 at n = 100,000). Both were noise: repeating the runs showed the correct values. We then changed the benchmark to interleave the repeats and to use the median of several runs. Differences below about 5 to 8% should be treated as equal.`));
c.push(NUM2(`**Only one computer with 2 cores.** We could not measure larger numbers of workers or real network communication between computers. The 8-worker results show what happens when there are too many workers, not how the program scales.`));
c.push(NUM2(`**Two test setups, both on the same laptop:** Windows with Microsoft MPI, and Ubuntu under WSL2 with Open MPI. Neither is a bare Linux installation.`));
c.push(NUM2(`**Some explanations were not tested.** Where we write "possible" or "likely" (processor speed changes, thread placement, MPI waiting behaviour), we did not run a separate test.`));
c.push(NUM2(`**K-Means++ is in the serial program only,** and memory speed was estimated, not measured.`));
c.push(H2("6.3 Conclusion"));
c.push(P(`We wrote K-Means in C as a serial, an OpenMP, an MPI and a hybrid program. All parallel versions gave the same clusters as the serial one on synthetic data and on real UCI data (${totalPassed} of ${totalCases} checks passed on two operating systems and two MPI libraries).`));
c.push(B(`With 4 workers on the main problem, the speedups were ${X(bestOmp)} (OpenMP), ${X(bestMpi)} (MPI) and ${X(bestHy)} (hybrid 2 x 2). This is close to the most that a 2-core, 4-thread processor can give. More workers than hardware threads did not help.`));
c.push(B(`The limit came from the hardware and not from a serial part of the program. The serial part is below 1% and the messages are tiny.`));
c.push(B(`For equal-sized work, static scheduling is the best simple choice. Dynamic scheduling with chunk size 1 is about ${f((Sc("dynamic", 1).time / Sc("static", 0).time - 1) * 100, 0)}% slower.`));
c.push(B(`Too many MPI processes hurt a lot with Microsoft MPI (${X(sm(Mi(8)))} at 8 processes) but much less with Open MPI (${X(lsm(LM(8)))}). So results depend on the MPI library as well as on the algorithm.`));
c.push(B(`K-Means++ gave a somewhat better average SSE than a random start but did not reduce the number of iterations.`));
c.push(H2("6.4 Future work"));
c.push(P(`The same programs could be run on a computer with many cores or on several computers. There we would expect to see what one laptop cannot show: the benefit of the hybrid model, communication cost growing with k x d, and the point where memory speed limits OpenMP. Other ideas are using K-Means++ in the parallel versions, and testing other data with many more features.`));

// ---- References
c.push(H1("References"));
["Lloyd, S. P. (1982). Least squares quantization in PCM. IEEE Transactions on Information Theory, 28(2), 129 to 137.",
  "Arthur, D., and Vassilvitskii, S. (2007). k-means++: The advantages of careful seeding. Proceedings of the 18th ACM-SIAM Symposium on Discrete Algorithms (SODA), 1027 to 1035.",
  "Amdahl, G. M. (1967). Validity of the single processor approach to achieving large scale computing capabilities. AFIPS Spring Joint Computer Conference, 483 to 485.",
  "OpenMP Architecture Review Board. OpenMP Application Programming Interface. https://www.openmp.org",
  "Message Passing Interface Forum. MPI: A Message-Passing Interface Standard. https://www.mpi-forum.org",
  "Dua, D., and Graff, C. (2019). UCI Machine Learning Repository. University of California, Irvine. https://archive.ics.uci.edu",
].forEach((r) => c.push(new Paragraph({ children: [new TextRun({ text: r, size: 22, color: BLACK })], spacing: { after: 100 }, indent: { left: 360, hanging: 360 } })));

// ---- Appendix
c.push(H1("Appendix A. Files and How to Run the Project", true));
c.push(P(`**Submission contents:** this report, the source code (the project folder, also at https://github.com/ayesharazaa/parallel-kmeans-mpi-openmp) and the data sets in ZIP format (\`Datasets.zip\`, with a short README that explains each file and how it was converted).`));
c.push(P(`**To run on Windows** (MSYS2 UCRT64 or Git Bash shell, from the project folder):`));
const code = (lines) => lines.map((l, i) => new Paragraph({ shading: { type: ShadingType.CLEAR, fill: "F2F2F2", color: "auto" }, spacing: { after: i === lines.length - 1 ? 160 : 0, line: 240 },
  children: [new TextRun({ text: l, font: "Consolas", size: 18, color: BLACK })] }));
c.push(...code(["source env.sh", "make all", "make test", "python scripts/prep_real.py", "make bench", "make plots"]));
c.push(P(`**To run on Linux** (Ubuntu or WSL), install the tools once, then use the same commands without \`source env.sh\`:`));
c.push(...code(["sudo apt install -y build-essential openmpi-bin libopenmpi-dev make python3-numpy python3-matplotlib", "make all && make test && make bench && make plots"]));
c.push(H2("Project files"));
c.push(...table(["File", "Purpose"], [
  ["Makefile, env.sh", "Build commands; Windows environment setup"],
  ["src/common.h", "Shared code: reading data, random numbers, assignment and update steps, output"],
  ["src/gen_data.c", "Synthetic data generator"],
  ["src/kmeans_serial.c, kmeans_omp.c, kmeans_mpi.c, kmeans_hybrid.c", "The four K-Means versions"],
  ["scripts/prep_uci.py, prep_real.py", "Convert the UCI data to the binary format"],
  ["scripts/validate.py, compare.py", "Correctness tests against the serial result"],
  ["scripts/run_benchmarks.py, runlib.py", "Run all experiments and write results/*.csv"],
  ["scripts/make_plots.py", "Draw the figures and tables"],
  ["scripts/make_code_images.py, make_diagrams.py, build_report.js", "Make the report pictures and this report"],
  ["results/, linux/results/", "Measured numbers for Windows and Linux (CSV)"],
], [2.6, 3.4], "Files of the project.", { leftAll: true }));

// ------------------------------------------------------------------ assemble
const doc = new Document({
  creator: "Ayesha Raza", title: "Parallel K-Means Clustering using MPI and OpenMP - Final Report",
  styles: {
    default: { document: { run: { font: FONT, size: 22, color: BLACK } } },
    paragraphStyles: [
      { id: "Heading1", name: "Heading 1", basedOn: "Normal", next: "Normal", quickFormat: true, run: { font: HFONT, size: 32, bold: true, color: BLACK },
        paragraph: { spacing: { before: 360, after: 140 }, keepNext: true, outlineLevel: 0 } },
      { id: "Heading2", name: "Heading 2", basedOn: "Normal", next: "Normal", quickFormat: true, run: { font: HFONT, size: 26, bold: true, color: BLACK },
        paragraph: { spacing: { before: 260, after: 100 }, keepNext: true, outlineLevel: 1 } },
      { id: "TOC1", name: "toc 1", basedOn: "Normal", next: "Normal", run: { size: 21, bold: true, color: BLACK }, paragraph: { spacing: { before: 60, after: 20 } } },
      { id: "TOC2", name: "toc 2", basedOn: "Normal", next: "Normal", run: { size: 20, color: BLACK }, paragraph: { spacing: { before: 0, after: 0 }, indent: { left: 240 } } },
    ],
  },
  numbering: { config: [
    { reference: "bul", levels: [{ level: 0, format: LevelFormat.BULLET, text: "•", alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 540, hanging: 270 } } } }] },
    { reference: "num", levels: [{ level: 0, format: LevelFormat.DECIMAL, text: "%1.", alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 540, hanging: 360 } } } }] },
    { reference: "num2", levels: [{ level: 0, format: LevelFormat.DECIMAL, text: "%1.", alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 540, hanging: 360 } } } }] },
  ] },
  sections: [{
    properties: { page: { size: { width: 11906, height: 16838 }, margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 } } },
    footers: { default: new Footer({ children: [new Paragraph({ alignment: AlignmentType.CENTER,
      children: [new TextRun({ text: "Parallel K-Means using MPI and OpenMP  |  Page ", size: 18, color: BLACK }), new TextRun({ children: [PageNumber.CURRENT], size: 18, color: BLACK })] })] }) },
    children: c,
  }],
});
Packer.toBuffer(doc).then((buf) => { fs.writeFileSync(OUT, buf); console.log("wrote", OUT, buf.length, "bytes"); });
