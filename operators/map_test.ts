import { describe, it } from "@std/testing/bdd";
import { assertEquals, assertThrows } from "@std/assert";
import { assertType, type IsExact } from "@std/testing/types";
import {
	type AsyncResult,
	err,
	isErr,
	isOk,
	map,
	ok,
	Panic,
	pipe,
	type Result,
} from "../mod.ts";

describe("map()", () => {
	describe("sync", () => {
		it("transforms the ok value", () => {
			const result = pipe(ok(5), map((n) => n * 2));
			if (isOk(result)) assertEquals(result.value, 10);
		});

		it("skips the callback when result is an Err", () => {
			let called = false;
			const result = pipe(
				err("ERR", "msg"),
				map(() => {
					called = true;
					return 42;
				}),
			);
			assertEquals(called, false);
			if (isErr(result)) assertEquals(result.code, "ERR");
		});

		it("type: maps Result<T, E> to Result<U, E>", () => {
			const result = pipe(
				ok(5) as Result<number, "ERR">,
				map((n) => String(n)),
			);
			assertType<IsExact<typeof result, Result<string, "ERR">>>(true);
		});
	});

	describe("flattening", () => {
		it("flattens when callback returns an Ok Result", () => {
			const result = pipe(ok(5), map((n) => ok(String(n))));
			if (isOk(result)) assertEquals(result.value, "5");
		});

		it("flattens when callback returns an Err Result", () => {
			const result = pipe(
				ok(5),
				map(() => err("INNER", "inner error")),
			);
			if (isErr(result)) assertEquals(result.code, "INNER");
		});

		it("type: flattening merges error types", () => {
			const result = pipe(
				ok(5) as Result<number, "OUTER">,
				map((n) => n > 0 ? ok(String(n)) : err("INNER", "negative")),
			);
			assertType<
				IsExact<typeof result, Result<string, "OUTER" | "INNER">>
			>(true);
		});
	});

	describe("async", () => {
		it("becomes async when callback returns a Promise", async () => {
			const result = pipe(ok(5), map((n) => Promise.resolve(n * 2)));
			assertType<
				IsExact<
					typeof result,
					AsyncResult<number, "UNKNOWN_ERR">
				>
			>(true);
			const awaited = await result;
			if (isOk(awaited)) assertEquals(awaited.value, 10);
		});

		it("becomes async when input is a Promise<Result>", async () => {
			const result = pipe(
				Promise.resolve(ok(5)),
				map((n) => n * 2),
			);
			assertType<
				IsExact<typeof result, AsyncResult<number, never>>
			>(true);
			const awaited = await result;
			if (isOk(awaited)) assertEquals(awaited.value, 10);
		});

		it("converts rejected promise in callback to UNKNOWN_ERR", async () => {
			const result = await pipe(
				ok(5),
				map(() => Promise.reject(new Error("boom"))),
			);
			if (isErr(result)) {
				assertEquals(result.code, "UNKNOWN_ERR");
			}
		});
	});

	describe("panics", () => {
		it("throws Panic when callback throws synchronously", () => {
			assertThrows(
				() =>
					pipe(
						ok(5),
						map(() => {
							throw new Error("oops");
						}),
					),
				Panic,
			);
		});
	});
});
