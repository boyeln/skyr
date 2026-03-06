import { describe, it } from "@std/testing/bdd";
import { assertEquals, assertThrows } from "@std/assert";
import {
	dependency,
	err,
	fn,
	inject,
	isErr,
	isOk,
	ok,
	pipe,
	use,
} from "../mod.ts";

describe("inject()", () => {
	const Database = dependency<{ query: (sql: string) => string }>()("db");
	const Logger = dependency<{ info: (msg: string) => void }>()("logger");

	it("provides dependency implementations", async () => {
		const MyFn = fn(function* () {
			const db = yield* use(Database);
			return ok(db.query("SELECT 1"));
		});

		const myFn = pipe(
			MyFn,
			inject(Database.impl({ query: (sql) => `result: ${sql}` })),
		);

		const result = await Promise.resolve(myFn());
		if (isOk(result)) assertEquals(result.value, "result: SELECT 1");
	});

	it("after all dependencies are injected, the function is callable", async () => {
		const MyFn = fn(function* () {
			const db = yield* use(Database);
			const _logger = yield* use(Logger);
			return ok(db.query("SELECT 1"));
		});

		const myFn = pipe(
			MyFn,
			inject(
				Database.impl({ query: () => "done" }),
				Logger.impl({ info: () => {} }),
			),
		);

		const result = await Promise.resolve(myFn());
		if (isOk(result)) assertEquals(result.value, "done");
	});

	it("supports incremental injection", async () => {
		const MyFn = fn(function* () {
			const db = yield* use(Database);
			const _logger = yield* use(Logger);
			return ok(db.query("SELECT 1"));
		});

		const withDb = pipe(
			MyFn,
			inject(Database.impl({ query: () => "done" })),
		);

		const myFn = pipe(
			withDb,
			inject(Logger.impl({ info: () => {} })),
		);

		const result = await Promise.resolve(myFn());
		if (isOk(result)) assertEquals(result.value, "done");
	});

	it("throws runtime Error with specific message when calling with missing dependencies", () => {
		const MyFn = fn(function* () {
			const _db = yield* use(Database);
			return ok("done");
		});

		// Force call without injection — bypass type system
		const uninjected = MyFn as unknown as () => unknown;
		assertThrows(
			() => uninjected(),
			Error,
			'Missing dependency: "db". Use inject() to provide this dependency.',
		);
	});
});

describe("nested fn() with use()", () => {
	const Database = dependency<{ query: (sql: string) => string }>()("db");
	const Logger = dependency<{ info: (msg: string) => void }>()("logger");

	it("child function's dependencies are inherited by parent", async () => {
		const ChildFn = fn(function* (id: string) {
			const db = yield* use(Database);
			return ok(db.query(`SELECT * FROM users WHERE id = ${id}`));
		});

		const ParentFn = fn(function* () {
			const logger = yield* use(Logger);
			logger.info("calling child");

			const child = yield* use(ChildFn);
			const result = yield* child("123");

			return ok(result);
		});

		const messages: string[] = [];
		const parentFn = pipe(
			ParentFn,
			inject(
				Database.impl({
					query: (sql) => `result: ${sql}`,
				}),
				Logger.impl({ info: (msg) => messages.push(msg) }),
			),
		);

		const result = await Promise.resolve(parentFn());
		if (isOk(result)) {
			assertEquals(
				result.value,
				"result: SELECT * FROM users WHERE id = 123",
			);
		}
		assertEquals(messages, ["calling child"]);
	});

	it("child's error types propagate to parent", async () => {
		const childFn = fn((x: number) => {
			if (x < 0) return err("CHILD_ERR", "negative");
			return ok(x);
		});

		const ParentFn = fn(function* () {
			const value = yield* childFn(-1);
			return ok(value);
		});

		const parentFn = pipe(ParentFn, inject());
		const result = await Promise.resolve(parentFn());
		if (isErr(result)) assertEquals(result.code, "CHILD_ERR");
	});

	it("three levels of nesting share dependencies", async () => {
		const Config = dependency<{ url: string }>()("config");

		const Level3 = fn(function* () {
			const config = yield* use(Config);
			return ok(config.url);
		});

		const Level2 = fn(function* () {
			const l3 = yield* use(Level3);
			const url = yield* l3();
			return ok(`fetched: ${url}`);
		});

		const Level1 = fn(function* () {
			const l2 = yield* use(Level2);
			const msg = yield* l2();
			return ok(`result: ${msg}`);
		});

		const level1 = pipe(
			Level1,
			inject(Config.impl({ url: "https://example.com" })),
		);

		const result = await Promise.resolve(level1());
		if (isOk(result)) {
			assertEquals(
				result.value,
				"result: fetched: https://example.com",
			);
		}
	});

	it("parent and child sharing the same dependency get the same impl", async () => {
		const Counter = dependency<{ count: () => number }>()("counter");

		let n = 0;
		const counterImpl = Counter.impl({ count: () => ++n });

		const ChildFn = fn(function* () {
			const counter = yield* use(Counter);
			return ok(counter.count());
		});

		const ParentFn = fn(function* () {
			const counter = yield* use(Counter);
			const parentCount = counter.count();
			const child = yield* use(ChildFn);
			const childCount = yield* child();
			return ok({ parentCount, childCount });
		});

		const parentFn = pipe(ParentFn, inject(counterImpl));
		const result = await Promise.resolve(parentFn());
		if (isOk(result)) {
			assertEquals(result.value.parentCount, 1);
			assertEquals(result.value.childCount, 2);
		}
	});

	it("child err short-circuits the parent", async () => {
		const childFn = fn(() => {
			return err("CHILD_FAILED", "child broke");
		});

		let reachedAfterChild = false;

		const ParentFn = fn(function* () {
			yield* childFn();
			reachedAfterChild = true;
			return ok("should not reach");
		});

		const parentFn = pipe(ParentFn, inject());
		const result = await Promise.resolve(parentFn());
		if (isErr(result)) assertEquals(result.code, "CHILD_FAILED");
		assertEquals(reachedAfterChild, false);
	});
});
