import { describe, it } from "@std/testing/bdd";
import { assertEquals, assertInstanceOf } from "@std/assert";
import { assertType, type IsExact } from "@std/testing/types";
import {
	type AsyncResult,
	err,
	fromThrowable,
	isErr,
	isOk,
	type Result,
} from "../mod.ts";

describe("fromThrowable()", () => {
	describe("function overload", () => {
		it("returns Ok with the return value on success", () => {
			const result = fromThrowable(() => JSON.parse('{"a": 1}'));
			if (isOk(result)) assertEquals(result.value, { a: 1 });
		});

		it("catches sync throw and returns Err with mapper", () => {
			const result = fromThrowable(
				() => JSON.parse("not json"),
				(e) => err("PARSE_ERROR", "Invalid JSON", e),
			);
			if (isErr(result)) {
				assertEquals(result.code, "PARSE_ERROR");
				assertEquals(result.message, "Invalid JSON");
				assertInstanceOf(result.cause, SyntaxError);
			}
		});

		it("without mapper, caught error becomes UNKNOWN_ERR with cause", () => {
			const result = fromThrowable(() => JSON.parse("bad"));
			if (isErr(result)) {
				assertEquals(result.code, "UNKNOWN_ERR");
				assertInstanceOf(result.cause, SyntaxError);
			}
		});

		it("type: infers ok type from function return, error from mapper", () => {
			const result = fromThrowable(
				() => 42,
				(e) => err("MY_ERR", "msg", e),
			);
			assertType<IsExact<typeof result, Result<number, "MY_ERR">>>(
				true,
			);
		});

		it("type: without mapper, error type is UNKNOWN_ERR", () => {
			const result = fromThrowable(() => 42);
			assertType<
				IsExact<typeof result, Result<number, "UNKNOWN_ERR">>
			>(true);
		});
	});

	describe("promise overload", () => {
		it("resolves to Ok with the resolved value", async () => {
			const result = await fromThrowable(Promise.resolve(42));
			if (isOk(result)) assertEquals(result.value, 42);
		});

		it("rejects to Err with mapper applied", async () => {
			const result = await fromThrowable(
				Promise.reject(new Error("boom")),
				(e) => err("FETCH_ERROR", "Request failed", e),
			);
			if (isErr(result)) {
				assertEquals(result.code, "FETCH_ERROR");
				assertInstanceOf(result.cause, Error);
			}
		});

		it("without mapper, rejection becomes UNKNOWN_ERR with cause", async () => {
			const error = new Error("boom");
			const result = await fromThrowable(Promise.reject(error));
			if (isErr(result)) {
				assertEquals(result.code, "UNKNOWN_ERR");
				assertEquals(result.cause, error);
			}
		});

		it("returns an AsyncResult", () => {
			const result = fromThrowable(Promise.resolve(42));
			assertType<
				IsExact<
					typeof result,
					AsyncResult<number, "UNKNOWN_ERR">
				>
			>(true);
		});
	});
});
