import { describe, it } from "@std/testing/bdd";
import { assertEquals, assertStrictEquals } from "@std/assert";
import { assertType, type IsExact } from "@std/testing/types";
import { err, isErr, isOk, isResult, ok, type Result } from "./mod.ts";

// =============================================================================
// Constructors & Result Structure
// =============================================================================

describe("ok()", () => {
	it("creates an object with _tag 'Ok', ok value, and err null", () => {
		const result = ok(42);
		assertEquals(result._tag, "Ok");
		// Narrow to access .ok
		if (isOk(result)) {
			assertEquals(result.ok, 42);
		}
		assertEquals(result.err, null);
	});

	it("works with different value types", () => {
		const str = ok("hello");
		if (isOk(str)) assertEquals(str.ok, "hello");

		const nul = ok(null);
		if (isOk(nul)) assertEquals(nul.ok, null);

		const undef = ok(undefined);
		if (isOk(undef)) assertEquals(undef.ok, undefined);

		const obj = { a: 1 };
		const wrapped = ok(obj);
		if (isOk(wrapped)) assertStrictEquals(wrapped.ok, obj);
	});

	it("has type Result<T, never>", () => {
		const num = ok(42);
		assertType<IsExact<typeof num, Result<number, never>>>(true);

		const str = ok("hello");
		assertType<IsExact<typeof str, Result<string, never>>>(true);
	});

	it("is iterable for use with yield* in generators", () => {
		const result = ok(42);
		assertEquals(typeof result[Symbol.iterator], "function");
	});
});

describe("err()", () => {
	it("creates an object with _tag 'Err', ok null, and err object", () => {
		const result = err("NOT_FOUND", "User not found");
		assertEquals(result._tag, "Err");
		assertEquals(result.ok, null);
		if (isErr(result)) {
			assertEquals(result.err.code, "NOT_FOUND");
			assertEquals(result.err.message, "User not found");
		}
	});

	it("has cause undefined when not provided", () => {
		const result = err("ERR", "msg");
		if (isErr(result)) {
			assertEquals(result.err.cause, undefined);
		}
	});

	it("includes cause when provided", () => {
		const cause = new Error("original");
		const result = err("ERR", "msg", cause);
		if (isErr(result)) {
			assertStrictEquals(result.err.cause, cause);
		}
	});

	it("has type Result<never, C> where C is the string literal code", () => {
		const result = err("NOT_FOUND", "msg");
		assertType<IsExact<typeof result, Result<never, "NOT_FOUND">>>(true);
	});

	it("is iterable for use with yield* in generators", () => {
		const result = err("ERR", "msg");
		assertEquals(typeof result[Symbol.iterator], "function");
	});
});

// =============================================================================
// Type Guards
// =============================================================================

describe("isOk()", () => {
	it("returns true for Ok results", () => {
		assertEquals(isOk(ok(1)), true);
	});

	it("returns false for Err results", () => {
		assertEquals(isOk(err("ERR", "msg")), false);
	});

	it("narrows type to Ok<T> with methods preserved", () => {
		const result: Result<number, "ERR"> = ok(42);
		if (isOk(result)) {
			// After narrowing, we have Ok data fields AND ResultMethods
			assertEquals(result._tag, "Ok");
			assertEquals(result.ok, 42);
			// Methods still available after narrowing
			assertEquals(typeof result.map, "function");
		}
	});
});

describe("isErr()", () => {
	it("returns true for Err results", () => {
		assertEquals(isErr(err("ERR", "msg")), true);
	});

	it("returns false for Ok results", () => {
		assertEquals(isErr(ok(1)), false);
	});

	it("narrows type to Err<E> with methods preserved", () => {
		const result: Result<number, "NOT_FOUND" | "TIMEOUT"> = err(
			"NOT_FOUND",
			"msg",
		);
		if (isErr(result)) {
			// After narrowing, we have Err data fields AND ResultMethods
			assertEquals(result._tag, "Err");
			assertEquals(result.err.code, "NOT_FOUND");
			assertEquals(result.err.message, "msg");
			// Methods still available after narrowing
			assertEquals(typeof result.mapErr, "function");
		}
	});
});

describe("isResult()", () => {
	it("returns true for Ok values", () => {
		assertEquals(isResult(ok(1)), true);
	});

	it("returns true for Err values", () => {
		assertEquals(isResult(err("ERR", "msg")), true);
	});

	it("returns false for null and undefined", () => {
		assertEquals(isResult(null), false);
		assertEquals(isResult(undefined), false);
	});

	it("returns false for primitives", () => {
		assertEquals(isResult(42), false);
		assertEquals(isResult("hello"), false);
		assertEquals(isResult(true), false);
	});

	it("returns false for plain objects without _tag", () => {
		assertEquals(isResult({ ok: 1 }), false);
		assertEquals(isResult({}), false);
	});

	it("returns false for objects with wrong _tag", () => {
		assertEquals(isResult({ _tag: "Something" }), false);
		assertEquals(isResult({ _tag: 42 }), false);
	});

	it("returns true for objects that structurally match Results", () => {
		assertEquals(isResult({ _tag: "Ok", ok: 1, err: null }), true);
		assertEquals(
			isResult({
				_tag: "Err",
				ok: null,
				err: { code: "E", message: "m" },
			}),
			true,
		);
	});
});
