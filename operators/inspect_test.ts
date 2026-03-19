import { describe, it } from "@std/testing/bdd";
import { assertEquals, assertStrictEquals } from "@std/assert";
import { err, inspect, isOk, ok, pipe, type Result } from "../mod.ts";

describe("inspect()", () => {
	it("calls the callback with the ok value", () => {
		let captured: number | undefined;
		pipe(
			ok(42),
			inspect((n) => {
				captured = n;
			}),
		);
		assertEquals(captured, 42);
	});

	it("returns the original Result unchanged", () => {
		const original = ok(42);
		const result = pipe(
			original,
			inspect(() => {}),
		);
		assertStrictEquals(result, original);
	});

	it("does not call the callback when result is an Err", () => {
		let called = false;
		pipe(
			err("ERR", "msg"),
			inspect(() => {
				called = true;
			}),
		);
		assertEquals(called, false);
	});

	it("ignores the callback's return value", () => {
		const result = pipe(
			ok(42),
			inspect(() => 999),
		);
		if (isOk(result)) assertEquals(result.ok, 42);
	});

	it("silently swallows sync throws, returning the original Result", () => {
		const original = ok(42);
		const result = pipe(
			original,
			inspect(() => {
				throw new Error("side effect failed");
			}),
		);
		assertStrictEquals(result, original);
	});

	it("silently swallows promise rejections", async () => {
		const result = await pipe(
			ok(42),
			inspect(() => Promise.reject(new Error("async fail"))),
		);
		if (isOk(result)) assertEquals(result.ok, 42);
	});

	it("works with Promise<Result> input", async () => {
		let captured: number | undefined;
		const result = await pipe(
			Promise.resolve(ok(42) as Result<number, "ERR">),
			inspect((n) => {
				captured = n;
			}),
		);
		assertEquals(captured, 42);
		if (isOk(result)) assertEquals(result.ok, 42);
	});
});
