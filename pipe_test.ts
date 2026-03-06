import { describe, it } from "@std/testing/bdd";
import { assertEquals } from "@std/assert";
import { assertType, type IsExact } from "@std/testing/types";
import { pipe } from "./mod.ts";

describe("pipe()", () => {
	it("returns the input when called with no transform functions", () => {
		const result = pipe(42);
		assertEquals(result, 42);
	});

	it("applies a single transform function", () => {
		const result = pipe(5, (n) => n * 2);
		assertEquals(result, 10);
	});

	it("threads a value through multiple functions left-to-right", () => {
		const result = pipe(
			"hello",
			(s) => s.toUpperCase(),
			(s) => s + "!",
			(s) => s.length,
		);
		assertEquals(result, 6);
	});

	it("infers types through the chain", () => {
		const result = pipe(
			1,
			(n) => {
				assertType<IsExact<typeof n, number>>(true);
				return String(n);
			},
			(s) => {
				assertType<IsExact<typeof s, string>>(true);
				return s === "1";
			},
		);
		assertType<IsExact<typeof result, boolean>>(true);
	});

	it("works with non-Result values", () => {
		const result = pipe(
			[1, 2, 3],
			(arr) => arr.map((n) => n * 2),
			(arr) => arr.reduce((a, b) => a + b, 0),
		);
		assertEquals(result, 12);
	});
});
