import { expect, test } from "bun:test";
import { fn } from "./di.ts";
import { fail, fromThrowable, ok } from "./result.ts";

test("fn with no dependencies", () => {
	const add = fn(function* (a: number, b: number) {
		const n1 = yield* ok(a);
		const n2 = yield* ok(b);
		return n1 + n2;
	});

	const result = add.run(2, 3);
	expect(result.unwrap()).toBe(5);
});

test("fn with single dependency", () => {
	const PrefixService = fn.dependency<string>()("prefix");

	const greet = fn(function* (name: string) {
		const prefix = yield* fn.require(PrefixService);
		return ok(`${prefix} ${name}`);
	});

	const result = greet.inject(PrefixService.impl("Hello")).run("World");
	expect(result.unwrap()).toBe("Hello World");
});

test("fn with multiple dependencies", () => {
	const MultiplierService = fn.dependency<number>()("multiplier");
	const OffsetService = fn.dependency<number>()("offset");

	const calculate = fn(function* (x: number) {
		const multiplier = yield* fn.require(MultiplierService);
		const offset = yield* fn.require(OffsetService);
		return ok(x * multiplier + offset);
	});

	const result = calculate
		.inject(MultiplierService.impl(2), OffsetService.impl(10))
		.run(5);
	expect(result.unwrap()).toBe(20);
});

test("fn throws on missing dependency", () => {
	const MissingService = fn.dependency<number>()("missing");

	const needsDep = fn(function* () {
		const value = yield* fn.require(MissingService);
		return ok(value);
	});

	expect(() => needsDep.run()).toThrow("Missing dependency: missing");
});

test("yield* unwraps ok results", () => {
	const double = fn(function* (n: number) {
		const result = yield* ok(n * 2);
		return ok(result + 1);
	});

	const result = double.run(5);
	expect(result.unwrap()).toBe(11);
});

test("yield* short-circuits on err", () => {
	const failing = fn(function* (n: number) {
		const _result = yield* fail("FAILED", "Operation failed");
		return ok(n * 2); // Should not reach here
	});

	const result = failing.run(5);
	expect(result.hasFailed()).toBe(true);
});

test("async result handling", async () => {
	const fetchValue = fn(function* () {
		yield Promise.resolve(42);
		return ok(10);
	});

	const result = await fetchValue.run();
	expect(result.unwrap()).toBe(10);
});

test("auto-wraps plain return values in ok", () => {
	const add = fn(function* (a: number, b: number) {
		return a + b;
	});

	const result = add.run(2, 3);
	expect(result.isOk()).toBe(true);
	expect(result.unwrap()).toBe(5);
});

test("auto-wrapping preserves explicit Result returns", () => {
	const mayFail = fn(function* (n: number) {
		if (n < 0) return fail("NEGATIVE", "Number is negative");
		return ok(n * 2);
	});

	const okResult = mayFail.run(5);
	expect(okResult.isOk()).toBe(true);
	expect(okResult.unwrap()).toBe(10);

	const errResult = mayFail.run(-5);
	expect(errResult.hasFailed()).toBe(true);
});

test("async generator switches to async mode", async () => {
	const fetchValue = fn(function* (n: number) {
		yield fromThrowable(() => Promise.resolve(n));
		return ok(10);
	});

	const result = await fetchValue.run(5);
	expect(result.unwrap()).toBe(10);
});

test("async generator with early error from AsyncResult", async () => {
	const fetchValue = fn(function* () {
		yield fromThrowable(() => Promise.reject("failed"));
		return ok(10);
	});

	const result = await fetchValue.run();
	expect(result.hasFailed()).toBe(true);
});

test("async generator with dependency after async", async () => {
	const MultiplierService = fn.dependency<number>()("multiplier");

	const compute = fn(function* (n: number) {
		yield Promise.resolve(n);
		const multiplier = yield* fn.require(MultiplierService);
		return ok(n * multiplier);
	});

	const result = await compute.inject(MultiplierService.impl(3)).run(5);
	expect(result.unwrap()).toBe(15);
});

test("async generator with error after dependency", async () => {
	const MultiplierService = fn.dependency<number>()("multiplier");

	const compute = fn(function* (n: number) {
		yield Promise.resolve(42);
		const multiplier = yield* fn.require(MultiplierService);
		if (multiplier < 0) {
			return fail("NEGATIVE_MULTIPLIER", "Multiplier is negative");
		}
		return ok(n * multiplier);
	});

	const result = await compute.inject(MultiplierService.impl(-1)).run(5);
	expect(result.hasFailed()).toBe(true);
});

test("async generator with plain Promise", async () => {
	const compute = fn(function* (n: number) {
		yield Promise.resolve(100);
		return ok(n * 2);
	});

	const result = await compute.run(5);
	expect(result.unwrap()).toBe(10);
});

test("async generator with multiple async yields", async () => {
	const compute = fn(function* (n: number) {
		yield fromThrowable(() => Promise.resolve(10));
		yield fromThrowable(() => Promise.resolve(20));
		return ok(n * 2);
	});

	const result = await compute.run(5);
	expect(result.unwrap()).toBe(10);
});

test("async generator with error in middle", async () => {
	const compute = fn(function* () {
		yield fromThrowable(() => Promise.resolve(10));
		yield fromThrowable(() => Promise.reject("failed"));
		return ok(30);
	});

	const result = await compute.run();
	expect(result.hasFailed()).toBe(true);
});

test("async generator returning Result", async () => {
	const compute = fn(function* (n: number) {
		yield Promise.resolve(42);
		return ok(n * 2);
	});

	const result = await compute.run(5);
	expect(result.isOk()).toBe(true);
	expect(result.unwrap()).toBe(10);
});

test("async generator returning plain value", async () => {
	const compute = fn(function* (n: number) {
		yield Promise.resolve(42);
		return n * 2;
	});

	const result = await compute.run(5);
	expect(result.isOk()).toBe(true);
	expect(result.unwrap()).toBe(10);
});

test("async generator with err after async", async () => {
	const compute = fn(function* () {
		yield Promise.resolve(42);
		return fail("FAILED", "Operation failed");
	});

	const result = await compute.run();
	expect(result.hasFailed()).toBe(true);
});

test("sync generator with plain Ok yield", () => {
	const compute = fn(function* () {
		yield ok(42);
		return ok(10);
	});

	const result = compute.run();
	expect(result.unwrap()).toBe(10);
});

test("yield* unwraps AsyncResult", async () => {
	const compute = fn(function* (n: number) {
		const value = yield* fromThrowable(() => Promise.resolve(n * 2));
		return ok(value + 10);
	});

	const result = await compute.run(5);
	expect(result.unwrap()).toBe(20);
});

test("yield* short-circuits on AsyncResult error", async () => {
	const compute = fn(function* () {
		const _value = yield* fromThrowable(() => Promise.reject("failed"));
		return ok(10); // Should not reach here
	});

	const result = await compute.run();
	expect(result.hasFailed()).toBe(true);
});

test("yield() inherits dependencies from child function", () => {
	const MultiplierService = fn.dependency<number>()("multiplier");

	const child = fn(function* (n: number) {
		const multiplier = yield* fn.require(MultiplierService);
		return ok(n * multiplier);
	});

	const parent = fn(function* (n: number) {
		const result = yield* child.yield(n);
		return ok(result + 10);
	});

	const output = parent.inject(MultiplierService.impl(3)).run(5);
	expect(output.unwrap()).toBe(25);
});

test("yield() with child that fails", () => {
	const child = fn(function* () {
		yield* fail("CHILD_ERROR", "Child failed");
		return ok("should not reach");
	});

	const parent = fn(function* () {
		const result = yield* child.yield();
		return ok(result);
	});

	const output = parent.run();
	expect(output.hasFailed()).toBe(true);
});

test("yield() with pre-injected dependency in child", () => {
	const DepService = fn.dependency<string>()("service");

	const child = fn(function* () {
		const dep = yield* fn.require(DepService);
		return ok(dep);
	}).inject(DepService.impl("injected"));

	const parent = fn(function* () {
		const result = yield* child.yield();
		return ok(result);
	});

	const output = parent.run();
	expect(output.unwrap()).toBe("injected");
});
