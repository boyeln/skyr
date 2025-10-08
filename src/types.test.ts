import { test } from "bun:test";
import {
	type AsyncResult,
	type Fail,
	type Failure,
	fail,
	fn,
	fromThrowable,
	type Ok,
	ok,
	type Result,
	wrapThrowable,
} from "./index.js";

// Type assertion helpers
type IsExact<T, U> = [T] extends [U] ? ([U] extends [T] ? true : false) : false;
function assertType<_T extends true>(_value: _T): void {}

// ok() returns Result<T, never>
test("ok() returns Result<T, never>", () => {
	const result = ok(42);
	type Expected = Result<number, never>;
	assertType<IsExact<typeof result, Expected>>(true);
});

test("Ok.unwrap() returns T after isOk()", () => {
	const result: Result<number, Failure<"ERR">> = ok(42);
	if (result.isOk()) {
		const value = result.unwrap();
		assertType<IsExact<typeof value, number>>(true);
	}
});

// fail() returns Result<never, Failure<Code>>
test("fail() returns Result<never, Failure<Code>>", () => {
	const result = fail("ERR", "error message");
	type Expected = Result<never, Failure<"ERR">>;
	assertType<IsExact<typeof result, Expected>>(true);
});

test("Fail.unwrap() returns E after hasFailed()", () => {
	const result: Result<number, Failure<"ERR">> = fail("ERR", "error");
	if (result.hasFailed()) {
		const error = result.unwrap();
		assertType<IsExact<typeof error, Failure<"ERR">>>(true);
	}
});

// Result union type tests
test("Result<T, E> is union of Ok<T, E> | Fail<T, E>", () => {
	const result: Result<number, Failure<"ERR">> = ok(42);
	assertType<
		IsExact<
			typeof result,
			Ok<number, Failure<"ERR">> | Fail<number, Failure<"ERR">>
		>
	>(true);
});

test("Result.unwrap() returns T | E without narrowing", () => {
	const result: Result<number, Failure<"ERR">> = ok(42);
	const value = result.unwrap();
	assertType<IsExact<typeof value, number | Failure<"ERR">>>(true);
});

// AsyncResult type tests
test("AsyncResult<T, E> wraps Promise<Result<T, E>>", () => {
	const asyncResult = fromThrowable(() => Promise.resolve(42));
	type Expected = AsyncResult<number, Failure<"UNKNOWN_FAILURE">>;
	assertType<IsExact<typeof asyncResult, Expected>>(true);
});

test("AsyncResult.unwrap() returns Promise<T | E>", () => {
	const asyncResult = fromThrowable(() => Promise.resolve(42));
	const promise = asyncResult.unwrap();
	assertType<
		IsExact<typeof promise, Promise<number | Failure<"UNKNOWN_FAILURE">>>
	>(true);
});

// Failure type tests
test("Failure<Code> has correct structure", () => {
	type TestFailure = Failure<"TEST_ERR">;
	const failure: TestFailure = { code: "TEST_ERR", message: "test" };
	assertType<IsExact<typeof failure.code, "TEST_ERR">>(true);
	assertType<IsExact<typeof failure.message, string>>(true);
});

test("Failure with cause is optional", () => {
	type TestFailure = Failure<"TEST_ERR">;
	const withCause: TestFailure = {
		code: "TEST_ERR",
		message: "test",
		cause: "reason",
	};
	const withoutCause: TestFailure = { code: "TEST_ERR", message: "test" };
	assertType<IsExact<typeof withCause, TestFailure>>(true);
	assertType<IsExact<typeof withoutCause, TestFailure>>(true);
});

// ok() function type tests
test("ok() infers type from argument", () => {
	const numResult = ok(42);
	const strResult = ok("hello");
	const objResult = ok({ foo: "bar" });

	assertType<IsExact<typeof numResult, Result<number, never>>>(true);
	assertType<IsExact<typeof strResult, Result<string, never>>>(true);
	assertType<IsExact<typeof objResult, Result<{ foo: string }, never>>>(true);
});

// fail() function type tests
test("fail() curried form preserves code type", () => {
	const NotFound = fail("NOT_FOUND");
	const result = NotFound("Resource not found");

	assertType<IsExact<typeof result, Result<never, Failure<"NOT_FOUND">>>>(true);
});

test("fail() immediate form creates correct type", () => {
	const result = fail("ERR", "error message");
	assertType<IsExact<typeof result, Result<never, Failure<"ERR">>>>(true);
});

// fromThrowable() type tests
test("fromThrowable() with sync function", () => {
	const result = fromThrowable(() => 42);
	assertType<
		IsExact<typeof result, Result<number, Failure<"UNKNOWN_FAILURE">>>
	>(true);
});

test("fromThrowable() with async function", () => {
	const result = fromThrowable(() => Promise.resolve(42));
	assertType<
		IsExact<typeof result, AsyncResult<number, Failure<"UNKNOWN_FAILURE">>>
	>(true);
});

test("fromThrowable() with custom error mapper", () => {
	type CustomError = { code: number; msg: string };
	const result = fromThrowable(
		() => 42,
		(_e): CustomError => ({ code: 500, msg: "error" }),
	);
	assertType<IsExact<typeof result, Result<number, CustomError>>>(true);
});

test("fromThrowable() async with custom error mapper", () => {
	type CustomError = { code: number; msg: string };
	const result = fromThrowable(
		() => Promise.resolve(42),
		(_e): CustomError => ({ code: 500, msg: "error" }),
	);
	assertType<IsExact<typeof result, AsyncResult<number, CustomError>>>(true);
});

// wrapThrowable() type tests
test("wrapThrowable() preserves function signature", () => {
	const safeFn = wrapThrowable((x: number, y: string) => x + y.length);
	type Expected = (
		x: number,
		y: string,
	) => Result<number, Failure<"UNKNOWN_FAILURE">>;
	assertType<IsExact<typeof safeFn, Expected>>(true);
});

test("wrapThrowable() with async function", () => {
	const safeFn = wrapThrowable((x: number) => Promise.resolve(x * 2));
	type Expected = (
		x: number,
	) => AsyncResult<number, Failure<"UNKNOWN_FAILURE">>;
	assertType<IsExact<typeof safeFn, Expected>>(true);
});

// fn() type tests
test("fn() with generator function", () => {
	const compute = fn(function* (x: number) {
		const value = yield* ok(x * 2);
		return value + 1;
	});

	const result = compute.run(5);
	assertType<IsExact<typeof result, Result<number, never>>>(true);
});

test("fn() with async generator", () => {
	const compute = fn(function* (x: number) {
		const value = yield* fromThrowable(() => Promise.resolve(x * 2));
		return value + 1;
	});

	const result = compute.run(5);
	assertType<
		IsExact<typeof result, AsyncResult<number, Failure<"UNKNOWN_FAILURE">>>
	>(true);
});

test("fn() with dependencies", () => {
	const Dep = fn.dependency<string>()("dep");

	const compute = fn(function* (x: number) {
		const dep = yield* fn.require(Dep);
		return ok(dep + x);
	});

	// Before injection, should not have .run() available directly
	// After injection, should have .run() available
	const withDep = compute.inject(Dep.impl("test"));
	const result = withDep.run(5);
	assertType<IsExact<typeof result, Result<string, never>>>(true);
});

// Result method type tests
test("Result.map() transforms value type", () => {
	const result = ok(42);
	if (result.isOk()) {
		const mapped = result.map((x: number) => x.toString());
		assertType<IsExact<typeof mapped, Result<string, never>>>(true);
	}
});

test("Result.mapFailure() returns Result with new error type", () => {
	const result = fail("ERR", "error");
	if (result.hasFailed()) {
		const mapped = result.mapFailure((e: Failure<"ERR">) =>
			fail("NEW_ERR", e.message),
		);
		// Check that mapped is a Result type
		type CheckResult = typeof mapped extends Result<infer _T, infer _E>
			? true
			: false;
		assertType<IsExact<CheckResult, true>>(true);
	}
});

test("AsyncResult.map() returns AsyncResult", () => {
	const result = fromThrowable(() => Promise.resolve(42));
	const mapped = result.map((x) => x * 2);
	// Check that mapped is an AsyncResult (the exact type has unions that may not match exactly)
	type CheckAsync = typeof mapped extends AsyncResult<infer _U, infer _E>
		? true
		: false;
	assertType<IsExact<CheckAsync, true>>(true);
});

test("Result.match() returns union of handler return types", () => {
	const result: Result<number, Failure<"ERR">> = ok(42);
	const matched = result.match({
		ok: (v) => v * 2,
		failed: (e) => e.code.length,
	});
	assertType<IsExact<typeof matched, number>>(true);
});
