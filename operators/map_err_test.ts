import { describe, it } from "@std/testing/bdd";
import { assertEquals, assertThrows } from "@std/assert";
import { assertType, type IsExact } from "@std/testing/types";
import {
	err,
	isErr,
	isOk,
	mapErr,
	ok,
	Panic,
	pipe,
	type Result,
} from "../mod.ts";

describe("mapErr()", () => {
	describe("function form", () => {
		it("transforms an error with the callback", () => {
			const result = pipe(
				err("NOT_FOUND", "User not found"),
				mapErr((e) => err("DEFAULT", e.message)),
			);
			if (isErr(result)) {
				assertEquals(result.code, "DEFAULT");
				assertEquals(result.message, "User not found");
			}
		});

		it("skips the callback when result is Ok", () => {
			let called = false;
			const result = pipe(
				ok(42),
				mapErr(() => {
					called = true;
					return err("ERR", "msg");
				}),
			);
			assertEquals(called, false);
			if (isOk(result)) assertEquals(result.value, 42);
		});

		it("recovers with ok()", () => {
			const result = pipe(
				err("ERR", "msg") as Result<number, "ERR">,
				mapErr(() => ok(0)),
			);
			if (isOk(result)) assertEquals(result.value, 0);
		});

		it("recovers with a plain value (treated as ok)", () => {
			const result = pipe(
				err("ERR", "msg") as Result<number, "ERR">,
				mapErr(() => 0),
			);
			if (isOk(result)) assertEquals(result.value, 0);
		});

		it("type: replaces error type based on callback return", () => {
			const result = pipe(
				err("NOT_FOUND", "msg") as Result<string, "NOT_FOUND">,
				mapErr(() => err("REMAPPED", "new msg")),
			);
			assertType<
				IsExact<typeof result, Result<string, "REMAPPED">>
			>(true);
		});

		it("type: recovery adds to ok union and removes error", () => {
			const result = pipe(
				err("ERR", "msg") as Result<string, "ERR">,
				mapErr(() => ok(42)),
			);
			assertType<
				IsExact<typeof result, Result<string | number, never>>
			>(true);
		});
	});

	describe("handler object form", () => {
		it("handles a specific error code", () => {
			const result = pipe(
				err("NOT_FOUND", "msg") as Result<
					string,
					"NOT_FOUND" | "TIMEOUT"
				>,
				mapErr({
					NOT_FOUND: () => ok("default"),
				}),
			);
			if (isOk(result)) assertEquals(result.value, "default");
		});

		it("passes through unhandled error codes unchanged", () => {
			const result = pipe(
				err("TIMEOUT", "timed out") as Result<
					string,
					"NOT_FOUND" | "TIMEOUT"
				>,
				mapErr({
					NOT_FOUND: () => ok("default"),
				}),
			);
			if (isErr(result)) assertEquals(result.code, "TIMEOUT");
		});

		it("type: handled codes are removed, unhandled remain", () => {
			const result = pipe(
				ok("hi") as Result<
					string,
					"NOT_FOUND" | "TIMEOUT" | "AUTH_FAILED"
				>,
				mapErr({
					NOT_FOUND: () => ok("guest"),
					TIMEOUT: () => ok("cached"),
				}),
			);
			assertType<
				IsExact<typeof result, Result<string, "AUTH_FAILED">>
			>(true);
		});

		it("handler can recover with ok()", () => {
			const result = pipe(
				err("ERR", "msg") as Result<number, "ERR">,
				mapErr({ ERR: () => ok(0) }),
			);
			if (isOk(result)) assertEquals(result.value, 0);
		});

		it("handler can recover with a plain value", () => {
			const result = pipe(
				err("ERR", "msg") as Result<number, "ERR">,
				mapErr({ ERR: () => 0 }),
			);
			if (isOk(result)) assertEquals(result.value, 0);
		});

		it("handler can transform to a different error", () => {
			const result = pipe(
				err("NOT_FOUND", "msg") as Result<
					string,
					"NOT_FOUND" | "OTHER"
				>,
				mapErr({
					NOT_FOUND: () => err("GONE", "permanently gone"),
				}),
			);
			if (isErr(result)) assertEquals(result.code, "GONE");
		});

		it("handler receives the narrowed Err", () => {
			pipe(
				err("NOT_FOUND", "user missing") as Result<
					string,
					"NOT_FOUND" | "TIMEOUT"
				>,
				mapErr({
					NOT_FOUND: (e) => {
						assertType<IsExact<typeof e.code, "NOT_FOUND">>(true);
						assertEquals(e.code, "NOT_FOUND");
						assertEquals(e.message, "user missing");
						return ok("default");
					},
				}),
			);
		});
	});

	describe("async", () => {
		it("works with Promise<Result> input", async () => {
			const result = await pipe(
				Promise.resolve(
					err("ERR", "msg") as Result<number, "ERR">,
				),
				mapErr(() => ok(0)),
			);
			if (isOk(result)) assertEquals(result.value, 0);
		});

		it("handler object with Promise-returning handler", async () => {
			const result = await pipe(
				err("ERR", "msg") as Result<number, "ERR">,
				mapErr({
					ERR: () => Promise.resolve(ok(99)),
				}),
			);
			if (isOk(result)) assertEquals(result.value, 99);
		});

		it("function form captures rejected Promise as UNKNOWN_ERR", async () => {
			const result = await pipe(
				err("ERR", "msg") as Result<number, "ERR">,
				mapErr(() => Promise.reject(new Error("boom"))),
			);
			if (isErr(result)) assertEquals(result.code, "UNKNOWN_ERR");
		});
	});

	describe("panics", () => {
		it("throws Panic when function callback throws synchronously", () => {
			assertThrows(
				() =>
					pipe(
						err("ERR", "msg"),
						mapErr(() => {
							throw new Error("oops");
						}),
					),
				Panic,
			);
		});

		it("throws Panic when handler throws synchronously", () => {
			assertThrows(
				() =>
					pipe(
						err("ERR", "msg") as Result<string, "ERR">,
						mapErr({
							ERR: () => {
								throw new Error("oops");
							},
						}),
					),
				Panic,
			);
		});
	});
});
