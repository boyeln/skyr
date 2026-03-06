import { describe, it } from "@std/testing/bdd";
import { assertEquals } from "@std/assert";
import { assertType, type IsExact } from "@std/testing/types";
import {
	type Dependency,
	dependency,
	type DependencyImpl,
	fn,
	inject,
	isOk,
	ok,
	pipe,
	use,
} from "../mod.ts";

describe("dependency()", () => {
	it("declares a dependency with a typed key", () => {
		const Database = dependency<{ query: (sql: string) => string }>()("db");
		assertEquals(Database.key, "db");
	});

	it("type: key is a string literal", () => {
		const Database = dependency<{ query: () => void }>()("database");
		assertType<IsExact<typeof Database.key, "database">>(true);
	});

	it("type: has the correct Dependency type", () => {
		type DbType = { query: (sql: string) => string };
		const Database = dependency<DbType>()("database");
		assertType<
			IsExact<typeof Database, Dependency<DbType, "database">>
		>(true);
	});

	it("impl() creates a DependencyImpl with the correct key and value", () => {
		type DbType = { query: () => string };
		const Database = dependency<DbType>()("db");
		const impl = Database.impl({ query: () => "result" });

		assertEquals(impl.key, "db");
		assertEquals(typeof impl.value.query, "function");
	});

	it("type: impl() returns DependencyImpl<T, K>", () => {
		type DbType = { query: () => string };
		const Database = dependency<DbType>()("db");
		const impl = Database.impl({ query: () => "result" });
		assertType<
			IsExact<typeof impl, DependencyImpl<DbType, "db">>
		>(true);
	});
});

describe("use()", () => {
	it("acquires a dependency inside a generator", async () => {
		type LoggerType = { info: (msg: string) => void };
		const Logger = dependency<LoggerType>()("logger");

		const messages: string[] = [];
		const MyFn = fn(function* () {
			const logger = yield* use(Logger);
			logger.info("hello");
			return ok("done");
		});

		const myFn = pipe(
			MyFn,
			inject(Logger.impl({ info: (msg) => messages.push(msg) })),
		);

		const result = await Promise.resolve(myFn());
		if (isOk(result)) assertEquals(result.value, "done");
		assertEquals(messages, ["hello"]);
	});

	it("rejects dependency-free Fn at the type level", () => {
		const NoDeps = fn(function* (x: number) {
			const v = yield* ok(x);
			return ok(v * 2);
		});

		// use() on a dep-free Fn should not compile.
		// @ts-expect-error use() is not needed for functions without dependencies
		use(NoDeps);
	});

	it("accumulates dependencies across multiple use() calls", () => {
		const Database = dependency<{ query: () => string }>()("db");
		const Logger = dependency<{ info: (msg: string) => void }>()("logger");

		const MyFn = fn(function* () {
			const _db = yield* use(Database);
			const _logger = yield* use(Logger);
			return ok("done");
		});

		// Type should require both dependencies
		// This test verifies that inject() with both deps compiles
		const _myFn = pipe(
			MyFn,
			inject(
				Database.impl({ query: () => "result" }),
				Logger.impl({ info: () => {} }),
			),
		);
	});
});
