import { describe, it } from "@std/testing/bdd";
import { assertEquals, assertStrictEquals } from "@std/assert";
import { err, inspectErr, isErr, ok, pipe, type Result } from "../mod.ts";

describe("inspectErr()", () => {
	it("calls the callback with the error", () => {
		let captured: string | undefined;
		pipe(
			err("ERR", "msg"),
			inspectErr((e) => {
				captured = e.code;
			}),
		);
		assertEquals(captured, "ERR");
	});

	it("returns the original Result unchanged", () => {
		const original = err("ERR", "msg");
		const result = pipe(
			original,
			inspectErr(() => {}),
		);
		assertStrictEquals(result, original);
	});

	it("does not call the callback when result is Ok", () => {
		let called = false;
		pipe(
			ok(42),
			inspectErr(() => {
				called = true;
			}),
		);
		assertEquals(called, false);
	});

	it("silently swallows sync throws, returning the original Result", () => {
		const original = err("ERR", "msg");
		const result = pipe(
			original,
			inspectErr(() => {
				throw new Error("side effect failed");
			}),
		);
		assertStrictEquals(result, original);
	});

	it("silently swallows promise rejections", async () => {
		const result = await pipe(
			err("ERR", "msg"),
			inspectErr(() => Promise.reject(new Error("async fail"))),
		);
		if (isErr(result)) assertEquals(result.err.code, "ERR");
	});

	it("works with Promise<Result> input", async () => {
		let captured: string | undefined;
		await pipe(
			Promise.resolve(err("ERR", "msg") as Result<number, "ERR">),
			inspectErr((e) => {
				captured = e.code;
			}),
		);
		assertEquals(captured, "ERR");
	});
});
