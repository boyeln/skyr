import { describe, it } from "@std/testing/bdd";
import { assertEquals } from "@std/assert";
import { assertType, type IsExact } from "@std/testing/types";
import { err, ok, pipe, type Result, unwrap } from "../mod.ts";

describe("unwrap", () => {
	it("returns the ok value when result is Ok", () => {
		const value = pipe(ok(42), unwrap);
		assertEquals(value, 42);
	});

	it("returns undefined when result is Err", () => {
		const value = pipe(err("ERR", "msg"), unwrap);
		assertEquals(value, undefined);
	});

	it("type: Result<T, E> becomes T | undefined", () => {
		const value = pipe(
			ok(42) as Result<number, "ERR">,
			unwrap,
		);
		assertType<IsExact<typeof value, number | undefined>>(true);
	});

	it("type: Result<T, never> becomes T | undefined", () => {
		const value = pipe(ok(42), unwrap);
		assertType<IsExact<typeof value, number | undefined>>(true);
	});

	it("with Promise<Result> input, returns Promise<T | undefined>", async () => {
		const value = pipe(
			Promise.resolve(ok(42) as Result<number, "ERR">),
			unwrap,
		);
		assertType<IsExact<typeof value, Promise<number | undefined>>>(true);
		assertEquals(await value, 42);
	});

	it("with Promise<Result> Err input, resolves to undefined", async () => {
		const value = await pipe(
			Promise.resolve(err("ERR", "msg") as Result<number, "ERR">),
			unwrap,
		);
		assertEquals(value, undefined);
	});
});
