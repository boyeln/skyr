import { build, emptyDir } from "@deno/dnt";

const version = (await Deno.readTextFile("./version.txt")).trim();

if (!version) {
	throw new Error("No version found in version.txt");
}

await emptyDir("./dist");

await build({
	entryPoints: ["./mod.ts"],
	outDir: "./dist",
	shims: {},
	test: false,
	compilerOptions: {
		lib: ["ESNext", "DOM"],
	},
	package: {
		name: "skyr",
		version,
		description:
			"Type-safe error handling for TypeScript, inspired by Rust's Result type.",
		license: "MIT",
		repository: {
			type: "git",
			url: "git+https://github.com/boyeln/skyr.git",
		},
		bugs: {
			url: "https://github.com/boyeln/skyr/issues",
		},
		homepage: "https://github.com/boyeln/skyr#readme",
		keywords: [
			"result",
			"error-handling",
			"typescript",
			"rust",
			"functional",
			"pipe",
			"async",
			"dependency-injection",
		],
	},
});

Deno.copyFileSync("LICENSE", "dist/LICENSE");
Deno.copyFileSync("README.md", "dist/README.md");

console.log(`\nBuilt skyr@${version} to ./dist`);
