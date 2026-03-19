import { describe, it } from "@std/testing/bdd";
import { assertEquals } from "@std/assert";
import { assertType, type IsExact } from "@std/testing/types";
import {
	dependency,
	err,
	fn,
	fromThrowable,
	inject,
	isErr,
	isOk,
	ok,
	pipe,
	type Result,
	use,
} from "../mod.ts";

// ============================================================================
// fn() - Simple function wrapping
// ============================================================================

describe("fn() with regular functions", () => {
	it("collapses Result union into a single Result<T, E>", () => {
		const validateEmail = fn((email: string) => {
			if (!email.includes("@")) {
				return err("INVALID_EMAIL", "Email must contain @");
			}
			return ok(email);
		});

		assertType<
			IsExact<
				typeof validateEmail,
				(email: string) => Result<string, "INVALID_EMAIL">
			>
		>(true);
	});

	it("is callable and returns correct values", () => {
		const validateAge = fn((age: number) => {
			if (age < 0) return err("NEGATIVE", "Age cannot be negative");
			return ok(age);
		});

		const okResult = validateAge(25);
		if (isOk(okResult)) assertEquals(okResult.ok, 25);

		const errResult = validateAge(-1);
		if (isErr(errResult)) assertEquals(errResult.err.code, "NEGATIVE");
	});
});

// ============================================================================
// fn() - Generator functions with yield*
// ============================================================================

describe("fn() with generator functions", () => {
	it("yield* on Ok unwraps and returns the value", async () => {
		const myFn = fn(function* () {
			const value = yield* ok(42);
			return ok(value * 2);
		});

		const injected = pipe(myFn, inject());
		const result = await Promise.resolve(injected());
		if (isOk(result)) assertEquals(result.ok, 84);
	});

	it("yield* on Err short-circuits the generator", async () => {
		let reachedEnd = false;

		const myFn = fn(function* () {
			yield* err("EARLY_EXIT", "stopping here");
			reachedEnd = true;
			return ok("should not reach");
		});

		const injected = pipe(myFn, inject());
		const result = await Promise.resolve(injected());
		assertEquals(reachedEnd, false);
		if (isErr(result)) assertEquals(result.err.code, "EARLY_EXIT");
	});

	it("error types accumulate across multiple yield* calls", async () => {
		const step1 = fn((x: number) => {
			if (x < 0) return err("NEGATIVE", "negative");
			return ok(x);
		});

		const step2 = fn((x: number) => {
			if (x > 100) return err("TOO_BIG", "too big");
			return ok(x);
		});

		const combined = fn(function* (x: number) {
			const a = yield* step1(x);
			const b = yield* step2(a);
			return ok(b);
		});

		const injected = pipe(combined, inject());

		const okResult = await Promise.resolve(injected(50));
		if (isOk(okResult)) assertEquals(okResult.ok, 50);

		const errResult = await Promise.resolve(injected(-1));
		if (isErr(errResult)) assertEquals(errResult.err.code, "NEGATIVE");
	});

	it("works with async results via yield*", async () => {
		const myFn = fn(function* () {
			const value = yield* fromThrowable(Promise.resolve(42));
			return ok(value);
		});

		const injected = pipe(myFn, inject());
		const result = await Promise.resolve(injected());
		if (isOk(result)) assertEquals(result.ok, 42);
	});

	it("short-circuits on failure mid-way through multiple yields", async () => {
		const log: string[] = [];

		const myFn = fn(function* () {
			log.push("before first");
			const a = yield* ok(1);
			log.push("after first");
			yield* err("STOP", "stopped");
			log.push("after err - should not reach");
			const _b = yield* ok(2);
			log.push("after second - should not reach");
			return ok(a);
		});

		const injected = pipe(myFn, inject());
		const result = await Promise.resolve(injected());
		if (isErr(result)) assertEquals(result.err.code, "STOP");
		assertEquals(log, ["before first", "after first"]);
	});

	it("chains multiple async operations via yield*", async () => {
		const myFn = fn(function* () {
			const a = yield* fromThrowable(Promise.resolve(10));
			const b = yield* fromThrowable(Promise.resolve(20));
			return ok(a + b);
		});

		const injected = pipe(myFn, inject());
		const result = await Promise.resolve(injected());
		if (isOk(result)) assertEquals(result.ok, 30);
	});

	it("dependency-free generators are callable directly without pipe/inject", async () => {
		const add = fn(function* (a: number, b: number) {
			const x = yield* ok(a);
			const y = yield* ok(b);
			return ok(x + y);
		});

		// No pipe(add, inject()) needed - no deps means directly callable
		const result = await Promise.resolve(add(3, 4));
		if (isOk(result)) assertEquals(result.ok, 7);
	});

	it("dependency-free generator short-circuits without pipe/inject", async () => {
		const myFn = fn(function* () {
			yield* err("NOPE", "stopped");
			return ok("unreachable");
		});

		const result = await Promise.resolve(myFn());
		if (isErr(result)) assertEquals(result.err.code, "NOPE");
	});

	it("handles a rejected promise as UNKNOWN_ERR", async () => {
		const myFn = fn(function* () {
			const value = yield* fromThrowable(
				Promise.reject(new Error("boom")) as Promise<string>,
			);
			return ok(value);
		});

		const result = await myFn();
		assertEquals(isErr(result), true);
		if (isErr(result)) assertEquals(result.err.code, "UNKNOWN_ERR");
	});

	it("short-circuits on error after an async operation", async () => {
		const log: string[] = [];

		const myFn = fn(function* () {
			log.push("before async");
			const a = yield* fromThrowable(Promise.resolve(10));
			log.push("after async");
			yield* err("FAIL", "fail");
			log.push("after err - should not reach");
			return ok(a);
		});

		const result = await myFn();
		assertEquals(isErr(result), true);
		if (isErr(result)) assertEquals(result.err.code, "FAIL");
		assertEquals(log, ["before async", "after async"]);
	});

	it("mixes sync and async yields in the same generator", async () => {
		const myFn = fn(function* () {
			const a = yield* ok(1);
			const b = yield* fromThrowable(Promise.resolve(2));
			const c = yield* ok(3);
			return ok(a + b + c);
		});

		const result = await myFn();
		assertEquals(isOk(result), true);
		if (isOk(result)) assertEquals(result.ok, 6);
	});

	it("composes async child fn with dependency via use()", async () => {
		const Config = dependency<{ baseUrl: string }>()("config");

		const FetchData = fn(function* (path: string) {
			const config = yield* use(Config);
			const data = yield* fromThrowable(
				Promise.resolve(`${config.baseUrl}/${path}`),
			);
			return ok(data);
		});

		const Parent = fn(function* () {
			const fetchData = yield* use(FetchData);
			const a = yield* fetchData("users");
			const b = yield* fetchData("posts");
			return ok([a, b]);
		});

		const parent = pipe(
			Parent,
			inject(Config.impl({ baseUrl: "https://api.test" })),
		);
		const result = await parent();
		assertEquals(isOk(result), true);
		if (isOk(result)) {
			assertEquals(result.ok, [
				"https://api.test/users",
				"https://api.test/posts",
			]);
		}
	});

	it("propagates child fn error through use() in async context", async () => {
		const Config = dependency<{ baseUrl: string }>()("config");

		const ChildFn = fn(function* () {
			const _config = yield* use(Config);
			yield* fromThrowable(Promise.resolve("ok"));
			return err("CHILD_ERR", "child failed");
		});

		const Parent = fn(function* () {
			const childFn = yield* use(ChildFn);
			const _value = yield* childFn();
			return ok("should not reach");
		});

		const parent = pipe(
			Parent,
			inject(Config.impl({ baseUrl: "https://api.test" })),
		);
		const result = await parent();
		assertEquals(isErr(result), true);
		if (isErr(result)) assertEquals(result.err.code, "CHILD_ERR");
	});
});
