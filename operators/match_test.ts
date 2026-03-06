import { describe, it } from "@std/testing/bdd";
import { assertEquals, assertThrows } from "@std/assert";
import { assertType, type IsExact } from "@std/testing/types";
import { err, isOk, match, ok, Panic, pipe, type Result } from "../mod.ts";

describe("match()", () => {
	it("calls the ok handler when result is Ok", () => {
		const result = pipe(
			ok(42),
			match({
				ok: (n) => `Got ${n}`,
				err: (e) => `Error: ${e.code}`,
			}),
		);
		assertEquals(result, "Got 42");
	});

	it("calls the err handler when result is Err", () => {
		const result = pipe(
			err("NOT_FOUND", "missing"),
			match({
				ok: () => "ok",
				err: (e) => `Error: ${e.code}`,
			}),
		);
		assertEquals(result, "Error: NOT_FOUND");
	});

	it("type: return type is the union of both handler return types", () => {
		const result = pipe(
			ok(42) as Result<number, "ERR">,
			match({
				ok: (n) => n * 2,
				err: () => "fallback",
			}),
		);
		assertType<IsExact<typeof result, number | string>>(true);
	});

	it("if a handler returns a Result, output is a Result", () => {
		const result = pipe(
			ok(42) as Result<number, "ERR">,
			match({
				ok: (n) => ok(String(n)),
				err: (e) => err("MAPPED", e.message),
			}),
		);
		assertType<
			IsExact<typeof result, Result<string, "MAPPED">>
		>(true);
		if (isOk(result)) assertEquals(result.value, "42");
	});

	describe("async", () => {
		it("works with Promise<Result> input", async () => {
			const result = await pipe(
				Promise.resolve(ok(42) as Result<number, "ERR">),
				match({
					ok: (n) => `Got ${n}`,
					err: (e) => `Error: ${e.code}`,
				}),
			);
			assertEquals(result, "Got 42");
		});

		it("flattens Promise<Result> returned by ok handler", async () => {
			const result = await pipe(
				ok(42),
				match({
					ok: (n) => Promise.resolve(ok(String(n))),
					err: () => Promise.resolve(err("ERR", "msg")),
				}),
			);
			if (isOk(result)) assertEquals(result.value, "42");
		});

		it("flattens Promise<Result> returned by err handler", async () => {
			const result = await pipe(
				err("ERR", "msg") as Result<number, "ERR">,
				match({
					ok: (n) => Promise.resolve(ok(String(n))),
					err: () => Promise.resolve(ok("recovered")),
				}),
			);
			if (isOk(result)) assertEquals(result.value, "recovered");
		});
	});

	describe("panics", () => {
		it("throws Panic when ok handler throws synchronously", () => {
			assertThrows(
				() =>
					pipe(
						ok(42),
						match({
							ok: () => {
								throw new Error("oops");
							},
							err: () => "safe",
						}),
					),
				Panic,
			);
		});

		it("throws Panic when err handler throws synchronously", () => {
			assertThrows(
				() =>
					pipe(
						err("ERR", "msg"),
						match({
							ok: () => "safe",
							err: () => {
								throw new Error("oops");
							},
						}),
					),
				Panic,
			);
		});
	});
});
