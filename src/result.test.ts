import { expect, test } from "bun:test";
import { fn } from "./di.js";
import {
	type Failure,
	fail,
	fromThrowable,
	ok,
	type Result,
	wrapThrowable,
} from "./result.js";

test("ok creates successful result", () => {
	const result = ok(42);
	expect(result.isOk()).toBe(true);
	expect(result.hasFailed()).toBe(false);
	expect(result.unwrap()).toBe(42);
});

test("fail creates error result", () => {
	const result = fail("FAILED", "Operation failed");
	expect(result.isOk()).toBe(false);
	expect(result.hasFailed()).toBe(true);
	expect(result.unwrapOr("default")).toBe("default");
});

test("map transforms ok values", () => {
	const initial = ok(5);
	if (!initial.isOk()) throw new Error("Expected ok");
	const result = initial.map((n: number) => n * 2);
	expect(result.unwrap()).toBe(10);
});

test("map preserves err", () => {
	const result = fail("OOPS", "Something went wrong").map((n: number) => n * 2);
	expect(result.hasFailed()).toBe(true);
});

test("mapFailure transforms error values", () => {
	const initial = fail("FAILED", "Operation failed");
	if (!initial.hasFailed()) throw new globalThis.Error("Expected fail");
	const result = initial.mapFailure((e) => ({
		code: e.code.toUpperCase(),
		message: e.message,
		cause: e.cause,
	}));
	expect(result.hasFailed()).toBe(true);
	if (result.hasFailed()) {
		const failure = result.unwrap();
		expect(failure.code).toBe("FAILED");
	}
});

test("match handles both cases", () => {
	const okResult = ok(42).match({
		ok: (v) => v * 2,
		failed: () => 0,
	});
	expect(okResult).toBe(84);

	const errResult = fail("FAILED", "Operation failed").match({
		ok: () => 0,
		failed: (e) => e.code.length,
	});
	expect(errResult).toBe(6);
});

test("unwrap on Fail returns failure", () => {
	const result = fail("FAILED", "Operation failed");
	const unwrapped = result.unwrap();
	expect(unwrapped.code).toBe("FAILED");
	expect(unwrapped.message).toBe("Operation failed");
});

test("fromThrowable catches sync errors", () => {
	const result = fromThrowable((): number => {
		throw new Error("boom");
	});
	expect(result.hasFailed()).toBe(true);
});

test("fromThrowable handles sync success", () => {
	const result = fromThrowable(() => 42);
	expect(result.unwrap()).toBe(42);
});

test("fromThrowable handles async success", async () => {
	const result = fromThrowable(() => Promise.resolve(42));
	const unwrapped = await result.unwrap();
	expect(unwrapped).toBe(42);
});

test("fromThrowable catches async errors", async () => {
	const result = fromThrowable(() => Promise.reject("boom"));
	const resolved = await result;
	expect(resolved.hasFailed()).toBe(true);
});

test("wrapThrowable creates wrapped function", () => {
	const safeFn = wrapThrowable((x: number) => {
		if (x < 0) throw new Error("negative");
		return x * 2;
	});

	expect(safeFn(5).unwrap()).toBe(10);
	expect(safeFn(-1).hasFailed()).toBe(true);
});

test("AsyncResult map chains", async () => {
	const result = fromThrowable(() => Promise.resolve(5))
		.map((n) => n * 2)
		.map((n) => n + 1);

	const value = await result.unwrap();
	expect(value).toBe(11);
});

test("yield* unwraps ok in generator", () => {
	function* gen() {
		const value = yield* ok(42);
		return value + 1;
	}

	const iterator = gen();
	const result = iterator.next();
	expect(result.value).toBe(43);
	expect(result.done).toBe(true);
});

test("fromThrowable catches sync non-Error", () => {
	const result = fromThrowable((): number => {
		throw "string error";
	});
	expect(result.hasFailed()).toBe(true);
});

test("fromThrowable catches async non-Error", async () => {
	const result = fromThrowable(() => Promise.reject("async string error"));
	const resolved = await result;
	expect(resolved.hasFailed()).toBe(true);
});

test("fromThrowable with direct Promise", async () => {
	const result = fromThrowable(Promise.resolve(100));
	const value = await result.unwrap();
	expect(value).toBe(100);
});

test("fromThrowable with direct Promise rejection", async () => {
	const result = fromThrowable(Promise.reject("rejected"));
	const resolved = await result;
	expect(resolved.hasFailed()).toBe(true);
});

test("Ok.inspect calls function", () => {
	let inspected = 0;
	const result = ok(42).inspect((v) => {
		inspected = v;
	});
	expect(inspected).toBe(42);
	expect(result.unwrap()).toBe(42);
});

test("Ok.inspectFailure does nothing", () => {
	let called = false;
	const result = ok(42).inspectFailure(() => {
		called = true;
	});
	expect(called).toBe(false);
	expect(result.unwrap()).toBe(42);
});

test("Ok.unwrapOr returns value", () => {
	const result = ok(42).unwrapOr(100);
	expect(result).toBe(42);
});

test("Ok.expect returns value", () => {
	const result = ok(42).expect("should not throw");
	expect(result).toBe(42);
});

test("Err.inspect does nothing", () => {
	let called = false;
	const result = fail("FAILED", "Operation failed").inspect(() => {
		called = true;
	});
	expect(called).toBe(false);
	expect(result.hasFailed()).toBe(true);
});

test("Fail.inspectFailure calls function", () => {
	let inspected = "";
	const result = fail("FAILED", "Operation failed").inspectFailure((e) => {
		inspected = e.code;
	});
	expect(inspected).toBe("FAILED");
	expect(result.hasFailed()).toBe(true);
});

test("Fail.expect throws with message", () => {
	const result = fail("FAILED", "Operation failed");
	expect(() => result.expect("Custom message")).toThrow();
	try {
		result.expect("Custom message");
	} catch (e) {
		expect(String(e)).toContain("Custom message:");
	}
});

test("AsyncResult.map with Promise", async () => {
	const result = fromThrowable(() => Promise.resolve(5)).map((n) =>
		Promise.resolve(n * 2),
	);
	const value = await result.unwrap();
	expect(value).toBe(10);
});

test("AsyncResult.map with Promise rejection", async () => {
	const result = fromThrowable(() => Promise.resolve(5)).map(() =>
		Promise.reject("failed"),
	);
	const resolved = await result;
	expect(resolved.hasFailed()).toBe(true);
});

test("AsyncResult.map with Result", async () => {
	const result = fromThrowable(() => Promise.resolve(5)).map((n) => ok(n * 2));
	const value = await result.unwrap();
	expect(value).toBe(10);
});

test("AsyncResult.map with AsyncResult", async () => {
	const result = fromThrowable(() => Promise.resolve(5)).map((n) =>
		fromThrowable(() => Promise.resolve(n * 2)),
	);
	const value = await result.unwrap();
	expect(value).toBe(10);
});

test("AsyncResult.mapFailure with Result", async () => {
	const result = fromThrowable(() => Promise.reject("failed")).mapFailure((e) =>
		ok(e.message.toUpperCase()),
	);
	const value = await result.unwrap();
	expect(value).toBe("FAILED");
});

test("AsyncResult.mapFailure with AsyncResult", async () => {
	const result = fromThrowable(() => Promise.reject("failed")).mapFailure((e) =>
		fromThrowable(() => Promise.resolve(e.message.toUpperCase())),
	);
	const resolved = await result;
	expect(resolved.isOk()).toBe(true);
	if (resolved.isOk()) {
		const value = resolved.unwrap();
		expect(typeof value).toBe("string");
		expect(value.includes("FAILED")).toBe(true);
	}
});

test("AsyncResult.mapFailure with Promise", async () => {
	const result = fromThrowable(() => Promise.reject("failed")).mapFailure((e) =>
		Promise.resolve(String(e).toUpperCase()),
	);
	const resolved = await result;
	expect(resolved.hasFailed()).toBe(true);
});

test("AsyncResult.mapFailure with Promise rejection", async () => {
	const result = fromThrowable(() => Promise.reject("failed")).mapFailure(() =>
		Promise.reject("another error"),
	);
	const resolved = await result;
	expect(resolved.hasFailed()).toBe(true);
});

test("AsyncResult.inspect with ok", async () => {
	let inspected = 0;
	const result = fromThrowable(() => Promise.resolve(42)).inspect((v) => {
		inspected = v;
	});
	await result;
	expect(inspected).toBe(42);
});

test("AsyncResult.inspect with err", async () => {
	let inspected = 0;
	const result = fromThrowable(() => Promise.reject("failed")).inspect((v) => {
		inspected = v;
	});
	await result;
	expect(inspected).toBe(0);
});

test("AsyncResult.inspectFailure with ok", async () => {
	let inspected = false;
	const result = fromThrowable(() => Promise.resolve(42)).inspectFailure(() => {
		inspected = true;
	});
	await result;
	expect(inspected).toBe(false);
});

test("AsyncResult.inspectFailure with err", async () => {
	let inspected = "";
	const result = fromThrowable(() => Promise.reject("failed")).inspectFailure(
		(e) => {
			inspected = e.message;
		},
	);
	await result;
	expect(inspected.includes("failed")).toBe(true);
});

test("AsyncResult.unwrapOr with ok", async () => {
	const result = fromThrowable(() => Promise.resolve(42));
	const value = await result.unwrapOr(100);
	expect(value).toBe(42);
});

test("AsyncResult.unwrapOr with err", async () => {
	const result = fromThrowable(() => Promise.reject("failed"));
	const value = await result.unwrapOr(100);
	expect(value).toBe(100);
});

test("AsyncResult.expect with ok", async () => {
	const result = fromThrowable(() => Promise.resolve(42));
	const value = await result.expect("should not throw");
	expect(value).toBe(42);
});

test("AsyncResult.expect with err", async () => {
	const result = fromThrowable(() => Promise.reject("failed"));
	try {
		await result.expect("Custom message");
		throw new Error("Should have thrown");
	} catch (e) {
		expect(String(e).includes("Custom message")).toBe(true);
	}
});

test("AsyncResult.match with ok", async () => {
	const result = fromThrowable(() => Promise.resolve(42));
	const matched = await result.match({
		ok: (v) => v * 2,
		failed: () => 0,
	});
	expect(matched).toBe(84);
});

test("AsyncResult.match with err", async () => {
	const result = fromThrowable(() => Promise.reject("failed"));
	const matched = await result.match({
		ok: () => 0,
		failed: (e) => String(e).length,
	});
	expect(matched > 0).toBe(true);
});

test("AsyncResult.isOk with ok", async () => {
	const result = fromThrowable(() => Promise.resolve(42));
	const isOk = await result.isOk();
	expect(isOk).toBe(true);
});

test("AsyncResult.isOk with err", async () => {
	const result = fromThrowable(() => Promise.reject("failed"));
	const isOk = await result.isOk();
	expect(isOk).toBe(false);
});

test("AsyncResult.isErr with ok", async () => {
	const result = fromThrowable(() => Promise.resolve(42));
	const isErr = await result.hasFailed();
	expect(isErr).toBe(false);
});

test("AsyncResult.isErr with err", async () => {
	const result = fromThrowable(() => Promise.reject("failed"));
	const isErr = await result.hasFailed();
	expect(isErr).toBe(true);
});

test("fromThrowable direct Promise with non-Error", async () => {
	const result = fromThrowable(Promise.reject("non-error rejection"));
	const resolved = await result;
	expect(resolved.hasFailed()).toBe(true);
});

test("AsyncResult.map on Err passes through", async () => {
	const result = fromThrowable(() => Promise.reject("failed")).map(() => 100);
	const resolved = await result;
	expect(resolved.hasFailed()).toBe(true);
});

test("AsyncResult.mapFailure on Ok passes through", async () => {
	const result = fromThrowable(() => Promise.resolve(42)).mapFailure(
		() => "error",
	);
	const value = await result.unwrap();
	expect(value).toBe(42);
});

test("wrapThrowable with async non-Error throw", async () => {
	const safeFn = wrapThrowable(async () => {
		throw "string error";
	});

	const result = await safeFn();
	expect(result.hasFailed()).toBe(true);
});

test("wrapThrowable with async success", async () => {
	const safeFn = wrapThrowable((x: number) => {
		return Promise.resolve(x * 2);
	});

	const result = await safeFn(5);
	expect(result.unwrap()).toBe(10);
});

test("fromThrowable with custom error mapper (sync)", () => {
	type CustomError = { code: number; msg: string };
	const result = fromThrowable(
		(): number => {
			throw new Error("boom");
		},
		(e): CustomError => ({ code: 500, msg: String(e) }),
	);

	expect(result.hasFailed()).toBe(true);
	if (result.hasFailed()) {
		expect(result.failure.code).toBe(500);
		expect(result.failure.msg).toBe("Error: boom");
	}
});

test("fromThrowable with string literal error mapper (sync)", () => {
	const result = fromThrowable(
		(): number => {
			throw "oops";
		},
		(e) => `Caught: ${e}` as const,
	);

	expect(result.hasFailed()).toBe(true);
	if (result.hasFailed()) {
		expect(result.failure).toBe("Caught: oops");
	}
});

test("fromThrowable with custom error mapper (async)", async () => {
	type CustomError = { code: number; msg: string };
	const result = fromThrowable(
		() => Promise.reject("async error"),
		(e): CustomError => ({ code: 404, msg: String(e) }),
	);

	const resolved = await result;
	expect(resolved.hasFailed()).toBe(true);
	if (resolved.hasFailed()) {
		expect(resolved.failure.code).toBe(404);
		expect(resolved.failure.msg).toBe("async error");
	}
});

test("fromThrowable with custom error mapper (async function)", async () => {
	type CustomError = { code: number; msg: string };
	const result = fromThrowable(
		async () => {
			throw "async fn error";
		},
		(e): CustomError => ({ code: 503, msg: String(e) }),
	);

	const resolved = await result;
	expect(resolved.hasFailed()).toBe(true);
	if (resolved.hasFailed()) {
		expect(resolved.failure.code).toBe(503);
		expect(resolved.failure.msg).toBe("async fn error");
	}
});

test("fromThrowable with custom error mapper (direct Promise)", async () => {
	const result = fromThrowable(
		Promise.reject("promise error"),
		(e) => `Error: ${e}`,
	);

	const resolved = await result;
	expect(resolved.hasFailed()).toBe(true);
	if (resolved.hasFailed()) {
		expect(resolved.failure).toBe("Error: promise error");
	}
});

test("wrapThrowable with custom error mapper (sync)", () => {
	type CustomError = { code: number; msg: string };
	const safeFn = wrapThrowable(
		(x: number) => {
			if (x < 0) throw "negative number";
			return x * 2;
		},
		(e): CustomError => ({ code: 400, msg: String(e) }),
	);

	const result = safeFn(-5);
	expect(result.hasFailed()).toBe(true);
	if (result.hasFailed()) {
		expect(result.failure.code).toBe(400);
		expect(result.failure.msg).toBe("negative number");
	}
});

test("wrapThrowable with custom error mapper (async)", async () => {
	type CustomError = { code: number; msg: string };
	const safeFn = wrapThrowable(
		(x: number) => {
			if (x < 0) throw "negative number";
			return Promise.resolve(x * 2);
		},
		(e): CustomError => ({ code: 400, msg: String(e) }),
	);

	const result = await safeFn(-5);
	expect(result.hasFailed()).toBe(true);
	if (result.hasFailed()) {
		expect(result.failure.code).toBe(400);
		expect(result.failure.msg).toBe("negative number");
	}
});

test("fromThrowable default behavior without mapper", () => {
	const result = fromThrowable((): number => {
		throw "string error";
	});

	expect(result.hasFailed()).toBe(true);
	if (result.hasFailed()) {
		// Default mapper should convert to structured Failure
		expect(result.failure.code).toBe("UNKNOWN_FAILURE");
		expect(result.failure.message).toBe("string error");
		expect(result.failure.cause).toBe("string error");
	}
});

test("fail() curried usage creates reusable factory", () => {
	const NotFoundError = fail("NOT_FOUND");

	const result1 = NotFoundError("User not found");
	const result2 = NotFoundError("Post not found", { id: 123 });

	expect(result1.hasFailed()).toBe(true);
	if (result1.hasFailed()) {
		expect(result1.failure.code).toBe("NOT_FOUND");
		expect(result1.failure.message).toBe("User not found");
	}

	expect(result2.hasFailed()).toBe(true);
	if (result2.hasFailed()) {
		expect(result2.failure.code).toBe("NOT_FOUND");
		expect(result2.failure.message).toBe("Post not found");
		expect(result2.failure.cause).toEqual({ id: 123 });
	}
});

// gen() tests

test("fn() with generator - single ok result", () => {
	const result = fn(function* () {
		const value = yield* ok(42);
		return value;
	})();

	expect(result.isOk()).toBe(true);
	expect(result.unwrap()).toBe(42);
});

test("fn() with generator - multiple ok results", () => {
	const result = fn(function* () {
		const a = yield* ok(10);
		const b = yield* ok(20);
		const c = yield* ok(30);
		return a + b + c;
	})();

	expect(result.isOk()).toBe(true);
	expect(result.unwrap()).toBe(60);
});

test("fn() with generator - short-circuits on fail", () => {
	const result = fn(function* () {
		const a = yield* ok(10);
		const b = yield* fail("ERROR", "Something went wrong");
		const c = yield* ok(30); // Should not execute
		return a + b + c;
	})();

	expect(result.hasFailed()).toBe(true);
});

test("fn() with generator - auto-wraps return value in ok", () => {
	const result = fn(function* () {
		return 100;
	})();

	expect(result.isOk()).toBe(true);
	expect(result.unwrap()).toBe(100);
});

test("fn() with generator - unwraps yielded Results", () => {
	const result = fn(function* () {
		const value = yield* ok(200);
		return value;
	})();

	expect(result.isOk()).toBe(true);
	expect(result.unwrap()).toBe(200);
});

test("fn() with generator - async result", async () => {
	const result = fn(function* () {
		const a = yield* ok(10);
		const b = yield* fromThrowable(Promise.resolve(20));
		return a + b;
	})();

	const value = await result.unwrap();
	expect(value).toBe(30);
});

test("fn() with generator - async result that fails", async () => {
	const result = fn(function* () {
		const a = yield* ok(10);
		const b = yield* fromThrowable(Promise.reject("async error"));
		return a + b;
	})();

	const resolved = await result;
	expect(resolved.hasFailed()).toBe(true);
});

test("fn() with generator - mixed sync and async", async () => {
	const result = fn(function* () {
		const a = yield* ok(5);
		const b = yield* fromThrowable(Promise.resolve(10));
		const c = yield* ok(15);
		return a + b + c;
	})();

	const value = await result.unwrap();
	expect(value).toBe(30);
});

test("fn() with generator - helper function returning Result", () => {
	const divide = (
		a: number,
		b: number,
	): Result<number, { code: "DIV_ZERO"; message: string }> => {
		if (b === 0) return fail("DIV_ZERO", "Cannot divide by zero");
		return ok(a / b);
	};

	const result = fn(function* () {
		const a = yield* divide(10, 2);
		const b = yield* divide(20, 4);
		return a + b;
	})();

	expect(result.isOk()).toBe(true);
	expect(result.unwrap()).toBe(10);
});

test("fn() with generator - helper function that fails", () => {
	const divide = (
		a: number,
		b: number,
	): Result<number, { code: "DIV_ZERO"; message: string }> => {
		if (b === 0) return fail("DIV_ZERO", "Cannot divide by zero");
		return ok(a / b);
	};

	const result = fn(function* () {
		const a = yield* divide(10, 2);
		const b = yield* divide(20, 0); // This will fail
		const c = yield* divide(30, 3); // This won't execute
		return a + b + c;
	})();

	expect(result.hasFailed()).toBe(true);
});

test("fn() with generator - can be nested", () => {
	const inner = (): Result<number, never> =>
		fn(function* () {
			const a = yield* ok(10);
			const b = yield* ok(20);
			return a + b;
		})();

	const result = fn(function* () {
		const x: number = yield* inner();
		const y = yield* ok(5);
		return x + y;
	})();

	expect(result.isOk()).toBe(true);
	expect(result.unwrap()).toBe(35);
});

test("fn() with generator - nested failure propagates", () => {
	const inner = (): Result<number, { code: "INNER_ERROR"; message: string }> =>
		fn(function* () {
			const a = yield* ok(10);
			const b = yield* fail("INNER_ERROR", "Inner failed");
			return a + b;
		})();

	const result = fn(function* () {
		const x: number = yield* inner();
		const y = yield* ok(5);
		return x + y;
	})();

	expect(result.hasFailed()).toBe(true);
});

test("fn() with generator - Promise yield (not wrapped in Result)", async () => {
	const result = fn(function* () {
		const a = yield* ok(10);
		yield Promise.resolve(); // Just for side effects
		const b = yield* ok(20);
		return a + b;
	})();

	const value = await result.unwrap();
	expect(value).toBe(30);
});

test("fn() with generator - empty generator returns ok(undefined)", () => {
	const result = fn(function* () {
		// Empty generator
	})();

	expect(result.isOk()).toBe(true);
	expect(result.unwrap()).toBe(undefined);
});

// fn() with regular functions

test("fn() with regular function - creates clean Result type", () => {
	const divide = fn((a: number, b: number) =>
		b === 0 ? fail("DIV_ZERO", "Cannot divide by zero") : ok(a / b),
	);

	const result1 = divide(10, 2);
	expect(result1.isOk()).toBe(true);
	expect(result1.unwrap()).toBe(5);

	const result2 = divide(10, 0);
	expect(result2.hasFailed()).toBe(true);
});

test("fn() with regular function - preserves function behavior", () => {
	const validate = fn((age: number) =>
		age < 0
			? fail("INVALID", "Age cannot be negative")
			: age > 150
				? fail("INVALID", "Age too high")
				: ok(age),
	);

	expect(validate(25).unwrap()).toBe(25);
	expect(validate(-1).hasFailed()).toBe(true);
	expect(validate(200).hasFailed()).toBe(true);
});

test("fn() with regular function works with generator", () => {
	const divide = fn((a: number, b: number) =>
		b === 0 ? fail("DIV_ZERO", "Cannot divide by zero") : ok(a / b),
	);

	const calculation = fn(function* () {
		const a = yield* divide(10, 2);
		const b = yield* divide(20, 4);
		return a + b;
	})();

	expect(calculation.unwrap()).toBe(10);
});

test("fn() with generator accepting parameters", () => {
	const calculate = fn(function* (a: number, b: number) {
		const x = yield* ok(a * 2);
		const y = yield* ok(b * 3);
		return x + y;
	});

	const result = calculate(5, 10);
	expect(result.unwrap()).toBe(40); // (5*2) + (10*3) = 10 + 30 = 40
});

// unwrap() type narrowing

test("unwrap() on Ok returns value", () => {
	const result = ok(42);
	expect(result.unwrap()).toBe(42);
});

test("unwrap() on Fail returns failure", () => {
	const result = fail("TEST_ERROR", "Something went wrong");
	const unwrapped = result.unwrap();
	expect(unwrapped.code).toBe("TEST_ERROR");
	expect(unwrapped.message).toBe("Something went wrong");
});

test("unwrap() with type narrowing after isOk()", () => {
	const result: Result<number, Failure<"DIV_ZERO">> = ok(10);

	if (result.isOk()) {
		// After isOk(), unwrap() should return just T (number)
		const value = result.unwrap();
		expect(value).toBe(10);
	}
});

test("unwrap() with type narrowing after hasFailed()", () => {
	const result: Result<number, Failure<"DIV_ZERO">> = fail(
		"DIV_ZERO",
		"Cannot divide by zero",
	);

	if (result.hasFailed()) {
		// After hasFailed(), unwrap() should return just E (Failure)
		const error = result.unwrap();
		expect(error.code).toBe("DIV_ZERO");
		expect(error.message).toBe("Cannot divide by zero");
	}
});

test("unwrap() without type guard returns union type", () => {
	const divide = (a: number, b: number): Result<number, Failure<"DIV_ZERO">> =>
		b === 0 ? fail("DIV_ZERO", "Cannot divide by zero") : ok(a / b);

	const result1 = divide(10, 2);
	const value1 = result1.unwrap(); // Type: number | Failure<"DIV_ZERO">
	expect(value1).toBe(5);

	const result2 = divide(10, 0);
	const value2 = result2.unwrap(); // Type: number | Failure<"DIV_ZERO">
	expect((value2 as Failure<"DIV_ZERO">).code).toBe("DIV_ZERO");
});

test("AsyncResult.unwrap() returns Promise<T | E>", async () => {
	const asyncResult = fromThrowable(Promise.resolve(42));
	const value = await asyncResult.unwrap();
	expect(value).toBe(42);

	const asyncFail = fromThrowable(Promise.reject("error"));
	const error = await asyncFail.unwrap();
	expect((error as Failure<"UNKNOWN_FAILURE">).code).toBe("UNKNOWN_FAILURE");
});

// Pattern matching tests

test("mapFailure with handler map - handles specific code", () => {
	const result: Result<number, Failure<"NOT_FOUND"> | Failure<"TIMEOUT">> =
		fail("NOT_FOUND", "User not found");

	const recovered = result.mapFailure({
		NOT_FOUND: () => ok(42), // Recovery
	});

	expect(recovered.isOk()).toBe(true);
	expect(recovered.unwrap()).toBe(42);
});

test("mapFailure with handler map - transforms specific code", () => {
	const result: Result<number, Failure<"NOT_FOUND"> | Failure<"TIMEOUT">> =
		fail("NOT_FOUND", "User not found");

	const transformed = result.mapFailure({
		NOT_FOUND: (f: Failure<"NOT_FOUND">) => fail("MISSING")(f.message),
	});

	expect(transformed.hasFailed()).toBe(true);
	if (transformed.hasFailed()) {
		expect(transformed.failure.code).toBe("MISSING");
		expect(transformed.failure.message).toBe("User not found");
	}
});

test("mapFailure with handler map - passes through unhandled code", () => {
	const result: Result<number, Failure<"NOT_FOUND"> | Failure<"TIMEOUT">> =
		fail("TIMEOUT", "Request timed out");

	const transformed = result.mapFailure({
		NOT_FOUND: () => ok(42),
		// TIMEOUT not handled - should pass through
	});

	expect(transformed.hasFailed()).toBe(true);
	if (transformed.hasFailed()) {
		expect(transformed.failure.code).toBe("TIMEOUT");
		expect(transformed.failure.message).toBe("Request timed out");
	}
});

test("mapFailure with handler map - handles multiple codes", () => {
	type AppError = Failure<"NOT_FOUND"> | Failure<"TIMEOUT"> | Failure<"AUTH">;

	const notFound: Result<string, AppError> = fail(
		"NOT_FOUND",
		"User not found",
	);
	const timeout: Result<string, AppError> = fail(
		"TIMEOUT",
		"Request timed out",
	);
	const auth: Result<string, AppError> = fail("AUTH", "Unauthorized");

	const handleError = (r: Result<string, AppError>) =>
		r.mapFailure({
			NOT_FOUND: () => ok("default-user"),
			TIMEOUT: () => fail("RETRY")("Please try again"),
			// AUTH not handled
		});

	// NOT_FOUND -> recovered
	const r1 = handleError(notFound);
	expect(r1.isOk()).toBe(true);
	expect(r1.unwrap()).toBe("default-user");

	// TIMEOUT -> transformed
	const r2 = handleError(timeout);
	expect(r2.hasFailed()).toBe(true);
	if (r2.hasFailed()) {
		expect(r2.failure.code).toBe("RETRY");
	}

	// AUTH -> passed through
	const r3 = handleError(auth);
	expect(r3.hasFailed()).toBe(true);
	if (r3.hasFailed()) {
		expect(r3.failure.code).toBe("AUTH");
	}
});

test("mapFailure with handler map - Ok passes through", () => {
	const result: Result<number, Failure<"NOT_FOUND">> = ok(42);

	const transformed = result.mapFailure({
		NOT_FOUND: () => ok(0),
	});

	expect(transformed.isOk()).toBe(true);
	expect(transformed.unwrap()).toBe(42);
});

test("AsyncResult.mapFailure with handler map - handles specific code", async () => {
	const result = fromThrowable(
		Promise.reject("error"),
		(): Failure<"NOT_FOUND"> => ({
			code: "NOT_FOUND",
			message: "User not found",
		}),
	);

	const recovered = result.mapFailure({
		NOT_FOUND: () => ok(42),
	});

	const resolved = await recovered;
	expect(resolved.isOk()).toBe(true);
	expect(resolved.unwrap()).toBe(42);
});

test("AsyncResult.mapFailure with handler map - passes through unhandled", async () => {
	type AppError = Failure<"NOT_FOUND"> | Failure<"TIMEOUT">;
	const result = fromThrowable(
		Promise.reject("error"),
		(): AppError => ({ code: "TIMEOUT", message: "Request timed out" }),
	);

	const transformed = result.mapFailure({
		NOT_FOUND: () => ok(42),
		// TIMEOUT not handled
	});

	const resolved = await transformed;
	expect(resolved.hasFailed()).toBe(true);
	if (resolved.hasFailed()) {
		const failure = resolved.unwrap() as Failure<"TIMEOUT">;
		expect(failure.code).toBe("TIMEOUT");
	}
});

test("AsyncResult.mapFailure with handler map - async handler", async () => {
	const result = fromThrowable(
		Promise.reject("error"),
		(): Failure<"NOT_FOUND"> => ({
			code: "NOT_FOUND",
			message: "User not found",
		}),
	);

	const recovered = result.mapFailure({
		NOT_FOUND: () => fromThrowable(Promise.resolve(42)),
	});

	const resolved = await recovered;
	expect(resolved.isOk()).toBe(true);
	expect(resolved.unwrap()).toBe(42);
});

test("mapFailure with handler map - handler receives narrowed type", () => {
	const result: Result<number, Failure<"NOT_FOUND"> | Failure<"TIMEOUT">> =
		fail("NOT_FOUND", "User not found");

	const transformed = result.mapFailure({
		NOT_FOUND: (f: Failure<"NOT_FOUND">) => {
			// f should be narrowed to Failure<"NOT_FOUND">
			expect(f.code).toBe("NOT_FOUND");
			return ok(42);
		},
	});

	expect(transformed.isOk()).toBe(true);
});

test("async generator with failure after yield", async () => {
	const getAsync = () => fromThrowable(() => Promise.resolve(42));

	const testFn = fn(function* () {
		yield* getAsync();
		return fail("AFTER_ASYNC", "Failed after async");
	});

	const result = await testFn.run();
	expect(result.hasFailed()).toBe(true);
});

test("async generator with plain Promise then failure", async () => {
	const testFn = fn(function* () {
		yield Promise.resolve(10);
		return fail("ERROR", "Failed");
	});

	const result = await testFn.run();
	expect(result.hasFailed()).toBe(true);
});
