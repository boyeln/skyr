/**
 * Tests for the method chaining API on Result and AsyncResult.
 */
import { describe, it } from "@std/testing/bdd";
import {
	assertEquals,
	assertInstanceOf,
	assertStrictEquals,
} from "@std/assert";
import { assertType, type IsExact } from "@std/testing/types";
import { err, isOk, ok, Panic, type Result } from "./mod.ts";

// =============================================================================
// isOk() / isErr() methods
// =============================================================================

describe("Result.isOk() method", () => {
	it("returns true for Ok", () => {
		assertEquals(ok(42).isOk(), true);
	});

	it("returns false for Err", () => {
		assertEquals(err("E", "msg").isOk(), false);
	});

	it("narrows type in if/else", () => {
		const result: Result<number, "ERR"> = ok(42);
		if (result.isOk()) {
			assertEquals(result.ok, 42);
		} else {
			// Should not reach here
			throw new Error("Expected Ok");
		}
	});
});

describe("Result.isErr() method", () => {
	it("returns true for Err", () => {
		assertEquals(err("E", "msg").isErr(), true);
	});

	it("returns false for Ok", () => {
		assertEquals(ok(42).isErr(), false);
	});

	it("narrows type in if/else", () => {
		const result: Result<number, "ERR"> = err("ERR", "oops");
		if (result.isErr()) {
			assertEquals(result.err.code, "ERR");
			assertEquals(result.err.message, "oops");
		} else {
			throw new Error("Expected Err");
		}
	});
});

// =============================================================================
// .map() method
// =============================================================================

describe("Result.map() method", () => {
	it("transforms the ok value", () => {
		const result = ok(5).map((n) => n * 2);
		assertEquals(isOk(result), true);
		if (isOk(result)) assertEquals(result.ok, 10);
	});

	it("chains multiple maps", () => {
		const result = ok(5)
			.map((n) => n * 2)
			.map((n) => `Value: ${n}`);
		if (isOk(result)) assertEquals(result.ok, "Value: 10");
	});

	it("skips on Err", () => {
		const result: Result<number, "E"> = err("E", "msg");
		const mapped = result.map((n) => n * 2);
		assertEquals(mapped._tag, "Err");
	});

	it("flattens when fn returns a Result", () => {
		const result = ok(5).map((n) => ok(n * 2));
		// Should be Result<number, never>, not Result<Result<number, never>, never>
		if (isOk(result)) assertEquals(result.ok, 10);
	});

	it("flattens when fn returns an Err", () => {
		const result = ok(5).map((_n) => err("BAD", "nope"));
		assertEquals(result._tag, "Err");
		if (result.isErr()) assertEquals(result.err.code, "BAD");
	});

	it("returns AsyncResult when fn returns Promise", async () => {
		const result = ok(5).map((n) => Promise.resolve(n * 2));
		// Should be AsyncResult
		assertInstanceOf(result, Promise);
		const resolved = await result;
		if (isOk(resolved)) assertEquals(resolved.ok, 10);
	});

	it("returns AsyncResult with UNKNOWN_ERR on rejected Promise", async () => {
		const result = ok(5).map((_n) => Promise.reject(new Error("fail")));
		const resolved = await result;
		assertEquals(resolved._tag, "Err");
		if (resolved.isErr()) assertEquals(resolved.err.code, "UNKNOWN_ERR");
	});

	it("throws Panic on sync throw", () => {
		let caught: unknown;
		try {
			ok(5).map(() => {
				throw new Error("oops");
			});
		} catch (e) {
			caught = e;
		}
		assertInstanceOf(caught, Panic);
	});

	it("preserves error type through map chain", () => {
		const result: Result<number, "ERR"> = err("ERR", "oops");
		const mapped = result.map((n) => n * 2).map((n) => `${n}`);
		assertType<IsExact<typeof mapped, Result<string, "ERR">>>(true);
	});
});

// =============================================================================
// .mapErr() method
// =============================================================================

describe("Result.mapErr() method", () => {
	it("transforms error with function form", () => {
		const result = err("OLD", "old msg")
			.mapErr((e) => err("NEW", e.message));
		if (result.isErr()) {
			assertEquals(result.err.code, "NEW");
			assertEquals(result.err.message, "old msg");
		}
	});

	it("recovers with plain value", () => {
		const result: Result<number, "ERR"> = err("ERR", "oops");
		const recovered = result.mapErr((_e) => 42);
		if (isOk(recovered)) assertEquals(recovered.ok, 42);
	});

	it("recovers with ok()", () => {
		const result: Result<number, "ERR"> = err("ERR", "oops");
		const recovered = result.mapErr((_e) => ok(42));
		if (isOk(recovered)) assertEquals(recovered.ok, 42);
	});

	it("skips on Ok", () => {
		const result = ok(42).mapErr((_e) => err("X", "x"));
		if (isOk(result)) assertEquals(result.ok, 42);
	});

	it("handles specific error codes with handler object", () => {
		const result: Result<string, "NOT_FOUND" | "TIMEOUT"> = err(
			"NOT_FOUND",
			"gone",
		);
		const handled = result.mapErr({
			NOT_FOUND: () => ok("default"),
		});
		if (isOk(handled)) assertEquals(handled.ok, "default");
	});

	it("passes through unhandled error codes", () => {
		const result: Result<string, "NOT_FOUND" | "TIMEOUT"> = err(
			"TIMEOUT",
			"slow",
		);
		const handled = result.mapErr({
			NOT_FOUND: () => ok("default"),
		});
		assertEquals(handled._tag, "Err");
		if (handled.isErr()) assertEquals(handled.err.code, "TIMEOUT");
	});

	it("handler recovers with plain value", () => {
		const result: Result<string, "NOT_FOUND"> = err("NOT_FOUND", "gone");
		const handled = result.mapErr({
			NOT_FOUND: () => "fallback",
		});
		if (isOk(handled)) assertEquals(handled.ok, "fallback");
	});

	it("throws Panic on sync throw in handler", () => {
		let caught: unknown;
		try {
			err("E", "msg").mapErr(() => {
				throw new Error("oops");
			});
		} catch (e) {
			caught = e;
		}
		assertInstanceOf(caught, Panic);
	});

	it("returns AsyncResult when function handler returns Promise", async () => {
		const result: Result<number, "ERR"> = err("ERR", "oops");
		const asyncR = result.mapErr(() => Promise.resolve(ok(99)));
		const resolved = await asyncR;
		if (isOk(resolved)) assertEquals(resolved.ok, 99);
	});

	it("captures rejected Promise in function handler as UNKNOWN_ERR", async () => {
		const result: Result<number, "ERR"> = err("ERR", "oops");
		const asyncR = result.mapErr(() => Promise.reject(new Error("boom")));
		const resolved = await asyncR;
		if (resolved.isErr()) assertEquals(resolved.err.code, "UNKNOWN_ERR");
	});

	it("handler object with async handler on sync Result produces AsyncResult", async () => {
		const result: Result<number, "ERR"> = err("ERR", "oops");
		const asyncR = result.mapErr({
			ERR: () => Promise.resolve(ok(99)),
		});
		const resolved = await asyncR;
		if (isOk(resolved)) assertEquals(resolved.ok, 99);
	});

	it("handler object with async handler on AsyncResult", async () => {
		const start: Result<string, "NOT_FOUND" | "TIMEOUT"> = err(
			"NOT_FOUND",
			"gone",
		);
		const result = await start
			.map((s) => Promise.resolve(s))
			.mapErr({
				NOT_FOUND: () => ok("recovered"),
			});
		if (isOk(result)) assertEquals(result.ok, "recovered");
	});
});

// =============================================================================
// .match() method
// =============================================================================

describe("Result.match() method", () => {
	it("calls ok handler for Ok", () => {
		const result = ok(42).match({
			ok: (n) => `Got ${n}`,
			err: (e) => `Error: ${e.code}`,
		});
		assertEquals(result, "Got 42");
	});

	it("calls err handler for Err", () => {
		const result = err("E", "msg").match({
			ok: (_v: never) => "ok",
			err: (e) => `Error: ${e.code}`,
		});
		assertEquals(result, "Error: E");
	});

	it("returns union type", () => {
		const result: Result<number, "ERR"> = ok(42);
		const matched = result.match({
			ok: (n) => n * 2,
			err: (_e) => "error",
		});
		assertType<IsExact<typeof matched, number | string>>(true);
	});

	it("returns a Result when handler returns a Result", () => {
		const result: Result<number, "ERR"> = ok(42);
		const matched = result.match({
			ok: (n) => ok(String(n)),
			err: (e) => err("MAPPED", e.message),
		});
		if (isOk(matched)) assertEquals(matched.ok, "42");
	});

	it("throws Panic on sync throw", () => {
		let caught: unknown;
		try {
			ok(42).match({
				ok: () => {
					throw new Error("oops");
				},
				err: () => "err",
			});
		} catch (e) {
			caught = e;
		}
		assertInstanceOf(caught, Panic);
	});
});

// =============================================================================
// .inspect() / .inspectErr() methods
// =============================================================================

describe("Result.inspect() method", () => {
	it("runs side effect on Ok", () => {
		let seen: number | undefined;
		const result = ok(42).inspect((n) => {
			seen = n;
		});
		assertEquals(seen, 42);
		if (isOk(result)) assertEquals(result.ok, 42);
	});

	it("skips on Err", () => {
		let called = false;
		err("E", "msg").inspect(() => {
			called = true;
		});
		assertEquals(called, false);
	});

	it("returns same Result (chainable)", () => {
		const original = ok(42);
		const result = original.inspect(() => {});
		assertStrictEquals(result, original);
	});

	it("swallows sync throws", () => {
		const thrower = () => {
			throw new Error("oops");
		};
		const result = ok(42).inspect(() => thrower());
		if (isOk(result)) assertEquals(result.ok, 42);
	});

	it("returns AsyncResult when callback returns Promise", async () => {
		const asyncR = ok(42).inspect(() => Promise.resolve());
		assertInstanceOf(asyncR, Promise);
		const result = await ok(42).inspect(() => Promise.resolve());
		if (isOk(result)) assertEquals(result.ok, 42);
	});
});

describe("Result.inspectErr() method", () => {
	it("runs side effect on Err", () => {
		let seen: string | undefined;
		err("E", "msg").inspectErr((e) => {
			seen = e.code;
		});
		assertEquals(seen, "E");
	});

	it("skips on Ok", () => {
		let called = false;
		ok(42).inspectErr(() => {
			called = true;
		});
		assertEquals(called, false);
	});

	it("returns same Result (chainable)", () => {
		const original = err("E", "msg");
		const result = original.inspectErr(() => {});
		assertStrictEquals(result, original);
	});

	it("swallows sync throws", () => {
		const thrower = () => {
			throw new Error("oops");
		};
		const result = err("E", "msg").inspectErr(() => thrower());
		assertEquals(result._tag, "Err");
	});
});

// =============================================================================
// .unwrap() / .unwrapOr() methods
// =============================================================================

describe("Result.unwrap() method", () => {
	it("returns value for Ok", () => {
		assertEquals(ok(42).unwrap(), 42);
	});

	it("returns undefined for Err", () => {
		assertEquals(err("E", "msg").unwrap(), undefined);
	});

	it("works with optional chaining", () => {
		const result = ok({ name: "Alice" }).unwrap()?.name;
		assertEquals(result, "Alice");
	});
});

describe("Result.unwrapOr() method", () => {
	it("returns value for Ok", () => {
		assertEquals(ok(42).unwrapOr(0), 42);
	});

	it("returns default for Err", () => {
		assertEquals(err("E", "msg").unwrapOr(0), 0);
	});
});

// =============================================================================
// AsyncResult chaining
// =============================================================================

describe("AsyncResult", () => {
	it("chains .map() on async result", async () => {
		const result = await ok(5)
			.map((n) => Promise.resolve(n * 2))
			.map((n) => n + 1);
		if (isOk(result)) assertEquals(result.ok, 11);
	});

	it("chains multiple .map() calls", async () => {
		const result = await ok("hello")
			.map((s) => Promise.resolve(s.toUpperCase()))
			.map((s) => s + "!")
			.map((s) => s.length);
		if (isOk(result)) assertEquals(result.ok, 6);
	});

	it("chains .mapErr() on async result", async () => {
		const start: Result<number, "ERR"> = err("ERR", "oops");
		const result = await start
			.map((n) => Promise.resolve(n))
			.mapErr((e) => err("NEW", e.message));
		if (result.isErr()) assertEquals(result.err.code, "NEW");
	});

	it("chains .match() on async result", async () => {
		const message = await ok(5)
			.map((n) => Promise.resolve(n * 2))
			.match({
				ok: (n) => `Got ${n}`,
				err: (e) => `Error: ${e.code}`,
			});
		assertEquals(message, "Got 10");
	});

	it("chains .inspect() on async result", async () => {
		let seen: number | undefined;
		const result = await ok(5)
			.map((n) => Promise.resolve(n * 2))
			.inspect((n) => {
				seen = n;
			});
		assertEquals(seen, 10);
		if (isOk(result)) assertEquals(result.ok, 10);
	});

	it("chains .inspectErr() on async result", async () => {
		let seen: string | undefined;
		const start: Result<number, "ERR"> = err("ERR", "oops");
		await start
			.map((n) => Promise.resolve(n))
			.inspectErr((e) => {
				seen = e.code;
			});
		assertEquals(seen, "ERR");
	});

	it(".unwrap() returns Promise", async () => {
		const value = await ok(42)
			.map((n) => Promise.resolve(n * 2))
			.unwrap();
		assertEquals(value, 84);
	});

	it(".unwrap() returns undefined for async Err", async () => {
		const start: Result<number, "ERR"> = err("ERR", "oops");
		const value = await start
			.map((n) => Promise.resolve(n))
			.unwrap();
		assertEquals(value, undefined);
	});

	it(".unwrapOr() returns value for async Ok", async () => {
		const value = await ok(42)
			.map((n) => Promise.resolve(n * 2))
			.unwrapOr(0);
		assertEquals(value, 84);
	});

	it(".unwrapOr() returns default for async Err", async () => {
		const start: Result<number, "ERR"> = err("ERR", "oops");
		const value = await start
			.map((n) => Promise.resolve(n))
			.unwrapOr(0);
		assertEquals(value, 0);
	});

	it("is awaitable to get back sync Result with methods", async () => {
		const asyncR = ok(5).map((n) => Promise.resolve(n * 2));
		const syncR = await asyncR;
		// syncR has methods again
		const mapped = syncR.map((n) => n + 1);
		if (isOk(mapped)) assertEquals(mapped.ok, 11);
	});

	it("preserves async poison through the chain", async () => {
		const result = ok(5)
			.map((n) => Promise.resolve(n * 2)) // → AsyncResult
			.map((n) => n + 1) // still AsyncResult
			.map((n) => `${n}`); // still AsyncResult
		assertInstanceOf(result, Promise);
		const resolved = await result;
		if (isOk(resolved)) assertEquals(resolved.ok, "11");
	});

	it("error flows through async chain to match", async () => {
		const start: Result<number, "ERR"> = err("ERR", "oops");
		const message = await start
			.map((n) => Promise.resolve(n * 2))
			.map((n) => n + 1)
			.match({
				ok: (n) => `Got ${n}`,
				err: (e) => `Error: ${e.code}`,
			});
		assertEquals(message, "Error: ERR");
	});

	it("mapErr handler form works on async result", async () => {
		const start: Result<string, "NOT_FOUND" | "TIMEOUT"> = err(
			"NOT_FOUND",
			"gone",
		);
		const result = await start
			.map((s) => Promise.resolve(s))
			.mapErr({
				NOT_FOUND: () => ok("default"),
			});
		if (isOk(result)) assertEquals(result.ok, "default");
	});
});

// =============================================================================
// Method chaining end-to-end
// =============================================================================

describe("end-to-end method chaining", () => {
	it("validates, transforms, and matches", () => {
		const validateEmail = (email: string): Result<string, "INVALID"> => {
			if (!email.includes("@")) return err("INVALID", "No @");
			return ok(email);
		};

		const message = validateEmail("user@example.com")
			.map((e) => e.toLowerCase())
			.map((e) => `Welcome, ${e}!`)
			.match({
				ok: (greeting) => greeting,
				err: (e) => `Error: ${e.message}`,
			});
		assertEquals(message, "Welcome, user@example.com!");
	});

	it("error path skips maps and reaches match", () => {
		const validateEmail = (email: string): Result<string, "INVALID"> => {
			if (!email.includes("@")) return err("INVALID", "No @");
			return ok(email);
		};

		const message = validateEmail("bad-email")
			.map((e) => e.toLowerCase())
			.map((e) => `Welcome, ${e}!`)
			.match({
				ok: (greeting) => greeting,
				err: (e) => `Error: ${e.message}`,
			});
		assertEquals(message, "Error: No @");
	});

	it("async pipeline with method chaining", async () => {
		const fetchUser = (id: string): Promise<string> =>
			Promise.resolve(`User-${id}`);

		const result = await ok("123")
			.map((id) => fetchUser(id))
			.map((name) => name.toUpperCase());

		if (isOk(result)) assertEquals(result.ok, "USER-123");
	});
});
