import { describe, it } from "@std/testing/bdd";
import { assertEquals, assertInstanceOf } from "@std/assert";
import { Panic } from "./mod.ts";

describe("Panic", () => {
	it("extends Error", () => {
		const panic = new Panic("something broke");
		assertInstanceOf(panic, Error);
		assertInstanceOf(panic, Panic);
	});

	it("has the original error as cause", () => {
		const original = new Error("root cause");
		const panic = new Panic("something broke", { cause: original });
		assertEquals(panic.cause, original);
	});

	it("is detectable with instanceof", () => {
		const panic = new Panic("msg");
		assertEquals(panic instanceof Panic, true);
		assertEquals(panic instanceof Error, true);
	});

	it("has name 'Panic'", () => {
		const panic = new Panic("msg");
		assertEquals(panic.name, "Panic");
	});
});
