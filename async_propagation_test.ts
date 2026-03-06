import { describe, it } from "@std/testing/bdd";
import { assertEquals } from "@std/assert";
import { assertType, type IsExact } from "@std/testing/types";
import {
	type AsyncResult,
	err,
	inspect,
	inspectErr,
	map,
	mapErr,
	match,
	ok,
	pipe,
	type Result,
	unwrapOr,
} from "./mod.ts";

describe("async propagation", () => {
	it("sync → async transition when map callback returns Promise", () => {
		const result = pipe(
			ok(5),
			map(() => Promise.resolve(10)),
		);
		assertType<
			IsExact<
				typeof result,
				AsyncResult<number, "UNKNOWN_ERR">
			>
		>(true);
	});

	it("subsequent operators after async transition return AsyncResult", () => {
		const result = pipe(
			ok(5),
			map(() => Promise.resolve(10)),
			map((n) => n * 2),
		);
		assertType<
			IsExact<
				typeof result,
				AsyncResult<number, "UNKNOWN_ERR">
			>
		>(true);
	});

	it("full async pipeline produces correct values", async () => {
		const result = await pipe(
			ok(5),
			map(() => Promise.resolve(10)),
			map((n) => n * 2),
			match({
				ok: (n) => `Result: ${n}`,
				err: (e) => `Error: ${e.code}`,
			}),
		);
		assertEquals(result, "Result: 20");
	});

	it("error flows through async pipeline to match", async () => {
		const result = await pipe(
			err("EARLY", "stopped") as Result<number, "EARLY">,
			map(() => Promise.resolve(10)),
			map((n) => n * 2),
			match({
				ok: (n) => `Result: ${n}`,
				err: (e) => `Error: ${e.code}`,
			}),
		);
		assertEquals(result, "Error: EARLY");
	});

	it("unwrapOr after async returns Promise<T | D>", async () => {
		const value = await pipe(
			ok(5),
			map(() => Promise.resolve(10)),
			unwrapOr(0),
		);
		assertEquals(value, 10);
	});

	it("mixed sync and async operators in a long pipeline", async () => {
		const result = await pipe(
			ok(1),
			map((n) => n + 1),
			map((n) => n + 1),
			map(() => Promise.resolve(100)),
			map((n) => n * 2),
			map((n) => String(n)),
			match({
				ok: (s) => `final: ${s}`,
				err: (e) => `error: ${e.code}`,
			}),
		);
		assertEquals(result, "final: 200");
	});

	it("inspect does not break async pipeline", async () => {
		const log: number[] = [];
		const result = await pipe(
			ok(5),
			map(() => Promise.resolve(10)),
			inspect((n) => log.push(n)),
			map((n) => n + 1),
			unwrapOr(0),
		);
		assertEquals(result, 11);
		assertEquals(log, [10]);
	});

	it("mapErr recovery works in async pipeline", async () => {
		const result = await pipe(
			err("ERR", "msg") as Result<number, "ERR">,
			map(() => Promise.resolve(10)),
			mapErr({ ERR: () => ok(99) }),
			unwrapOr(0),
		);
		assertEquals(result, 99);
	});

	it("inspectErr does not break async pipeline", async () => {
		const codes: string[] = [];
		const result = await pipe(
			err("ERR", "msg") as Result<number, "ERR">,
			map(() => Promise.resolve(10)),
			inspectErr((e) => codes.push(e.code)),
			unwrapOr(0),
		);
		assertEquals(result, 0);
		assertEquals(codes, ["ERR"]);
	});
});
