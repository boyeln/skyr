import { describe, it } from "@std/testing/bdd";
import { assertEquals } from "@std/assert";
import { assertType, type IsExact } from "@std/testing/types";
import { err, ok, pipe, type Result, unwrapOr } from "../mod.ts";

describe("unwrapOr()", () => {
	it("returns the ok value when result is Ok", () => {
		const value = pipe(ok(42), unwrapOr(0));
		assertEquals(value, 42);
	});

	it("returns the default value when result is Err", () => {
		const value = pipe(err("ERR", "msg"), unwrapOr(0));
		assertEquals(value, 0);
	});

	it("type: return type is T | D", () => {
		const value = pipe(
			ok(42) as Result<number, "ERR">,
			unwrapOr("default"),
		);
		assertType<IsExact<typeof value, number | string>>(true);
	});

	it("with Promise<Result> input, returns Promise<T | D>", async () => {
		const value = pipe(
			Promise.resolve(ok(42) as Result<number, "ERR">),
			unwrapOr("default"),
		);
		assertType<IsExact<typeof value, Promise<number | string>>>(true);
		assertEquals(await value, 42);
	});

	it("with Promise<Result> Err input, resolves to default", async () => {
		const value = await pipe(
			Promise.resolve(err("ERR", "msg") as Result<number, "ERR">),
			unwrapOr(0),
		);
		assertEquals(value, 0);
	});
});
