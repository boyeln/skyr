import { describe, it } from "@std/testing/bdd";
import { assertEquals } from "@std/assert";
import { assertType, type IsExact } from "@std/testing/types";
import { err, isErr, isOk, type Result, wrapThrowable } from "../mod.ts";

describe("wrapThrowable()", () => {
	it("returns a reusable wrapper function", () => {
		const safeParse = wrapThrowable((s: string) => JSON.parse(s));
		assertEquals(typeof safeParse, "function");
	});

	it("wrapper returns Ok on successful call", () => {
		const safeParse = wrapThrowable((s: string) => JSON.parse(s));
		const result = safeParse('{"a": 1}');
		if (isOk(result)) assertEquals(result.value, { a: 1 });
	});

	it("wrapper returns Err on thrown error, with mapper applied", () => {
		const safeParse = wrapThrowable(
			(s: string) => JSON.parse(s),
			(e) => err("PARSE_ERROR", "Invalid JSON", e),
		);
		const result = safeParse("not json");
		if (isErr(result)) {
			assertEquals(result.code, "PARSE_ERROR");
			assertEquals(result.message, "Invalid JSON");
		}
	});

	it("without mapper, errors become UNKNOWN_ERR", () => {
		const safeParse = wrapThrowable((s: string) => JSON.parse(s));
		const result = safeParse("bad");
		if (isErr(result)) assertEquals(result.code, "UNKNOWN_ERR");
	});

	it("type: wrapper preserves original function's parameter types", () => {
		const wrapped = wrapThrowable(
			(a: string, b: number) => a.repeat(b),
			(e) => err("ERR", "msg", e),
		);
		assertType<
			IsExact<
				typeof wrapped,
				(a: string, b: number) => Result<string, "ERR">
			>
		>(true);
	});

	it("is reusable across multiple calls", () => {
		const safeParse = wrapThrowable((s: string) => JSON.parse(s));

		const ok1 = safeParse('{"a": 1}');
		const ok2 = safeParse('{"b": 2}');
		const err1 = safeParse("bad");

		assertEquals(isOk(ok1), true);
		assertEquals(isOk(ok2), true);
		assertEquals(isErr(err1), true);
	});
});
