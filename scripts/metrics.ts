/**
 * Compare coverage and benchmarks between the current branch and main.
 * Outputs a markdown report to stdout.
 *
 * Usage: deno run -A scripts/metrics.ts
 */

/** Decimal places for rounding percentages */
const DECIMAL_PLACES = 1;

/** Minimum change to bold a coverage row (percentage points) */
const COVERAGE_BOLD_THRESHOLD = 0.1;

/** Minimum change to bold a benchmark row (percent) */
const BENCHMARK_BOLD_THRESHOLD = 100;

// --- Helpers ---

interface RunResult {
	stdout: string;
	stderr: string;
}

async function run(cmd: string[]): Promise<RunResult> {
	const proc = new Deno.Command(cmd[0], {
		args: cmd.slice(1),
		stdout: "piped",
		stderr: "piped",
	}).spawn();
	const { code, stdout, stderr } = await proc.output();
	const out = new TextDecoder().decode(stdout);
	const err = new TextDecoder().decode(stderr);
	if (code !== 0) {
		throw new Error(`Command failed: ${cmd.join(" ")}\n${err}`);
	}
	return { stdout: out, stderr: err };
}

function stripAnsi(s: string): string {
	// deno-lint-ignore no-control-regex
	return s.replace(/\x1b\[[0-9;]*m/g, "");
}

const ROUNDING_FACTOR = Math.pow(10, DECIMAL_PLACES);

function fmt(n: number): string {
	return n.toFixed(DECIMAL_PLACES);
}

function round(n: number): number {
	return Math.round(n * ROUNDING_FACTOR) / ROUNDING_FACTOR;
}

function formatDelta(n: number): string {
	if (round(Math.abs(n)) === 0) return "0%";
	return n > 0 ? `↑ ${fmt(n)}%` : `↓ ${fmt(Math.abs(n))}%`;
}

function boldRow(cells: string[]): string {
	return `| ${cells.map((c) => `**${c}**`).join(" | ")} |`;
}

function normalRow(cells: string[]): string {
	return `| ${cells.join(" | ")} |`;
}

// --- Parsers ---

interface FileCoverage {
	file: string;
	branch: number;
	line: number;
}

interface CoverageReport {
	total: { branch: number; line: number };
	files: FileCoverage[];
}

function parseCoverage(output: string): CoverageReport {
	const lines = stripAnsi(output).trim().split("\n");
	const files: FileCoverage[] = [];
	for (const line of lines) {
		const parts = line.split("|").map((s) => s.trim()).filter(Boolean);
		if (parts[0] === "File" || parts[0]?.startsWith("-")) continue;
		// Support both 3-column (Branch, Line) and 4-column (Branch, Function, Line) formats
		if (parts.length !== 3 && parts.length !== 4) continue;
		const branch = parseFloat(parts[1]);
		const linePct = parseFloat(parts[parts.length - 1]);
		if (isNaN(branch) || isNaN(linePct)) continue;
		files.push({ file: parts[0], branch, line: linePct });
	}
	// "All files" is the last row
	const total = files.pop();
	if (!total) {
		throw new Error(
			`Failed to parse coverage output. Raw output:\n${output}`,
		);
	}
	return { total: { branch: total.branch, line: total.line }, files };
}

interface BenchResult {
	name: string;
	avg: number;
}

function parseBenchmarks(output: string): BenchResult[] {
	const data = JSON.parse(output);
	return data.benches
		.map((b: { name: string; results: { ok?: { avg: number } }[] }) => ({
			name: b.name,
			avg: b.results?.[0]?.ok?.avg,
		}))
		.filter((b: BenchResult) => b.avg != null);
}

// --- Collect metrics ---

console.error("Running metrics on current branch...");
await run(["rm", "-rf", "coverage"]);
await run(["deno", "test", "--coverage"]);
const prCovRun = await run(["deno", "coverage", "coverage"]);
const prCov = parseCoverage(prCovRun.stdout || prCovRun.stderr);
const prBench = parseBenchmarks(
	(await run(["deno", "bench", "--json"])).stdout,
);

console.error("Running metrics on main...");
await run(["git", "fetch", "origin", "main"]);
await run(["git", "checkout", "origin/main"]);
await run(["rm", "-rf", "coverage"]);
await run(["deno", "test", "--coverage"]);
const mainCovRun = await run(["deno", "coverage", "coverage"]);
const mainCov = parseCoverage(mainCovRun.stdout || mainCovRun.stderr);
const mainBench = parseBenchmarks(
	(await run(["deno", "bench", "--json"])).stdout,
);
await run(["git", "checkout", "-"]);

// --- Build report ---

const mainFileMap = new Map(mainCov.files.map((f) => [f.file, f]));
const prFileMap = new Map(prCov.files.map((f) => [f.file, f]));
const allFiles = [...new Set([...mainFileMap.keys(), ...prFileMap.keys()])]
	.sort();

const coverageRows: string[] = [];
for (const file of allFiles) {
	const main = mainFileMap.get(file);
	const pr = prFileMap.get(file);
	const branchDiff = (pr?.branch ?? 0) - (main?.branch ?? 0);
	const lineDiff = (pr?.line ?? 0) - (main?.line ?? 0);
	const cells = [
		file,
		`${fmt(pr?.branch ?? 0)}%`,
		`${fmt(pr?.line ?? 0)}%`,
		formatDelta(lineDiff),
	];
	const bold = Math.abs(branchDiff) >= COVERAGE_BOLD_THRESHOLD ||
		Math.abs(lineDiff) >= COVERAGE_BOLD_THRESHOLD;
	coverageRows.push(bold ? boldRow(cells) : normalRow(cells));
}

const totalLineDiff = prCov.total.line - mainCov.total.line;
const totalCells = [
	"All files",
	`${fmt(prCov.total.branch)}%`,
	`${fmt(prCov.total.line)}%`,
	formatDelta(totalLineDiff),
];
const totalBold = Math.abs(totalLineDiff) >= COVERAGE_BOLD_THRESHOLD;
coverageRows.push(totalBold ? boldRow(totalCells) : normalRow(totalCells));

const mainBenchMap = new Map(mainBench.map((b) => [b.name, b.avg]));

const benchRows: string[] = [];
for (const b of prBench) {
	const mainAvg = mainBenchMap.get(b.name);
	const pct = mainAvg ? ((b.avg - mainAvg) / mainAvg) * 100 : null;
	const change = pct != null ? formatDelta(pct) : "new";
	const cells = [b.name, `${fmt(b.avg)} ns`, change];
	const bold = pct == null || round(Math.abs(pct)) >= BENCHMARK_BOLD_THRESHOLD;
	benchRows.push(bold ? boldRow(cells) : normalRow(cells));
}

console.log(`**Benchmarks**

| Name | PR | +/- |
|------|---:|----:|
${benchRows.join("\n")}

**Coverage**

| File | Branch | Line | +/- |
|------|-------:|-----:|----:|
${coverageRows.join("\n")}`);
