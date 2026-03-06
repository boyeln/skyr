/**
 * Core Result types, constructors, and type guards.
 *
 * @module
 */

import type {
	HandlerErr,
	HandlerOk,
	InferHandlerReturns,
} from "./_internal/types.ts";
import {
	handleInspect,
	handleMap,
	handleMapErr,
	handleMatch,
} from "./_internal/handlers.ts";
import type { AsyncResult } from "./async_result.ts";

// ============================================================================
// Data Types (structural shapes without methods)
// ============================================================================

/**
 * A successful Result containing a value of type `T`.
 *
 * Plain object with `{ _tag: "Ok", value }`. Implements the iterable protocol
 * so `yield*` in generator functions unwraps the value.
 *
 * @typeParam T - The type of the success value
 */
export type Ok<T> = {
	readonly _tag: "Ok";
	readonly value: T;
	[Symbol.iterator](): Generator<never, Awaited<T>, unknown>;
};

/**
 * An error Result containing a typed `code`, a `message`, and an optional `cause`.
 *
 * Plain object with `{ _tag: "Err", code, message, cause }`. Error codes are
 * string literals tracked by the type system. Implements the iterable protocol
 * so `yield*` in generator functions short-circuits on error.
 *
 * @typeParam C - The error code (a string literal or union of string literals)
 */
export type Err<C extends string> = {
	readonly _tag: "Err";
	readonly code: C;
	readonly message: string;
	readonly cause?: unknown;
	[Symbol.iterator](): Generator<Err<C>, never, unknown>;
};

// ============================================================================
// Method Interface
// ============================================================================

/**
 * Methods available on every `Result<T, E>`. These provide chainable
 * transformations, error handling, and value extraction.
 */
export interface ResultMethods<T, E extends string> {
	/** Type guard — narrows to Ok with methods preserved. */
	isOk(): this is Ok<T> & ResultMethods<T, E>;
	/** Type guard — narrows to Err with methods preserved. */
	isErr(): this is Err<E> & ResultMethods<T, E>;

	// -- map overloads (most specific first) --

	/** Transform ok value; if fn returns Promise<Result>, becomes AsyncResult. */
	map<T2, E2 extends string>(
		fn: (value: T) => Promise<Result<T2, E2>>,
	): AsyncResult<T2, E | E2 | "UNKNOWN_ERR">;
	/** Transform ok value; if fn returns Result, it's flattened. */
	map<T2, E2 extends string>(
		fn: (value: T) => Result<T2, E2>,
	): Result<T2, E | E2>;
	/** Transform ok value; if fn returns Promise, becomes AsyncResult. */
	map<U>(
		fn: (value: T) => Promise<U>,
	): AsyncResult<Awaited<U>, E | "UNKNOWN_ERR">;
	/** Transform ok value with a pure function. */
	map<U>(fn: (value: T) => U): Result<U, E>;

	// -- mapErr overloads --

	/** Transform error into a new Result. */
	mapErr<T2, E2 extends string>(
		fn: (e: Err<E>) => Result<T2, E2>,
	): Result<T | T2, E2>;
	/** Recover from error with a plain value. */
	mapErr<U>(fn: (e: Err<E>) => U): Result<T | U, never>;
	/** Handle specific error codes with a handler object. */
	mapErr<H extends { [K in E]?: (e: Err<K>) => any }>(
		handlers: H,
	): Result<
		T | HandlerOk<InferHandlerReturns<H>>,
		Exclude<E, keyof H & string> | HandlerErr<InferHandlerReturns<H>>
	>;

	// -- match --

	/** Pattern match both cases and leave the Result world. */
	match<A, B>(handlers: {
		ok: (value: T) => A;
		err: (e: Err<E>) => B;
	}): A | B;

	// -- inspect --

	/** Side effect on ok value. Errors swallowed. Returns self. */
	inspect(fn: (value: T) => void): Result<T, E>;
	/** Side effect on ok value (async callback → AsyncResult). */
	inspect(fn: (value: T) => Promise<any>): AsyncResult<T, E>;
	/** Side effect on ok value (any return). */
	inspect(fn: (value: T) => unknown): Result<T, E>;

	/** Side effect on error. Errors swallowed. Returns self. */
	inspectErr(fn: (e: Err<E>) => void): Result<T, E>;
	/** Side effect on error (async callback → AsyncResult). */
	inspectErr(fn: (e: Err<E>) => Promise<any>): AsyncResult<T, E>;
	/** Side effect on error (any return). */
	inspectErr(fn: (e: Err<E>) => unknown): Result<T, E>;

	// -- unwrap --

	/** Extract the ok value, or `undefined` on error. */
	unwrap(): T | undefined;
	/** Extract the ok value, or the default on error. */
	unwrapOr<D>(d: D): T | D;
}

// ============================================================================
// Result Type
// ============================================================================

/**
 * A discriminated union of `Ok<T>` and `Err<E>` with chainable methods.
 *
 * Either a success value or a structured error. Use `.isOk()` / `.isErr()`
 * to narrow, and `.map()`, `.mapErr()`, `.match()` etc. to transform.
 *
 * @typeParam T - The type of the success value
 * @typeParam E - Error code(s) as string literal(s) (defaults to `never`)
 */
export type Result<T, E extends string = never> =
	& (Ok<T> | Err<E>)
	& ResultMethods<T, E>;

// Re-export AsyncResult for convenience
export type { AsyncResult } from "./async_result.ts";

// ============================================================================
// Constructors
// ============================================================================

/**
 * Creates a successful Result: `{ _tag: "Ok", value }` with chainable methods.
 *
 * @example
 * ```ts
 * R.ok(42)   // Result<number, never>
 * R.ok("hi") // Result<string, never>
 * ```
 */
export const ok = <T>(value: T): Result<T, never> => {
	const self: any = {
		_tag: "Ok" as const,
		value,

		// --- Type guards ---
		isOk: () => true,
		isErr: () => false,

		// --- map ---
		map(fn: (value: T) => any): any {
			return handleMap(self.value, fn);
		},

		// --- mapErr (no-op on Ok) ---
		mapErr(_fnOrHandlers: any): any {
			return self;
		},

		// --- match ---
		match(handlers: any): any {
			return handleMatch(self, handlers);
		},

		// --- inspect ---
		inspect(fn: (value: T) => any): any {
			return handleInspect(self, fn);
		},

		// --- inspectErr (no-op on Ok) ---
		inspectErr(_fn: any): any {
			return self;
		},

		// --- unwrap ---
		unwrap(): T {
			return self.value;
		},
		unwrapOr(_d: any): T {
			return self.value;
		},

		// --- Iterable for yield* ---
		[Symbol.iterator]: (function* (): Generator<any, Awaited<T>, any> {
			if (value instanceof Promise) {
				const awaited = (yield value) as Awaited<T>;
				return awaited;
			}
			return value as Awaited<T>;
		}) as any,
	};

	return self as Result<T, never>;
};

/**
 * Creates an error Result: `{ _tag: "Err", code, message, cause }` with
 * chainable methods.
 *
 * The `code` is a string literal tracked by the type system.
 * The `cause` field is `undefined` when not provided.
 *
 * @example
 * ```ts
 * R.err("NOT_FOUND", "User not found")
 * R.err("DB_ERROR", "Query failed", originalError)
 * ```
 */
export const err = <C extends string>(
	code: C,
	message: string,
	cause?: unknown,
): Result<never, C> => {
	const self: any = {
		_tag: "Err" as const,
		code,
		message,
		cause,

		// --- Type guards ---
		isOk: () => false,
		isErr: () => true,

		// --- map (no-op on Err) ---
		map(_fn: any): any {
			return self;
		},

		// --- mapErr ---
		mapErr(fnOrHandlers: any): any {
			return handleMapErr(self, fnOrHandlers);
		},

		// --- match ---
		match(handlers: any): any {
			return handleMatch(self, handlers);
		},

		// --- inspect (no-op on Err) ---
		inspect(_fn: any): any {
			return self;
		},

		// --- inspectErr ---
		inspectErr(fn: any): any {
			return handleInspect(self, fn);
		},

		// --- unwrap ---
		unwrap(): undefined {
			return undefined;
		},
		unwrapOr(d: any): any {
			return d;
		},

		// --- Iterable for yield* ---
		*[Symbol.iterator]() {
			yield self;
			return self;
		},
	};

	return self as Result<never, C>;
};

// ============================================================================
// Type Guards
// ============================================================================

/** Type guard that narrows a Result to `Ok<T>` (preserving methods). */
export const isOk = <T, E extends string>(
	result: Result<T, E>,
): result is Result<T, E> & Ok<T> => result._tag === "Ok";

/** Type guard that narrows a Result to `Err<E>` (preserving methods). */
export const isErr = <T, E extends string>(
	result: Result<T, E>,
): result is Result<T, E> & Err<E> => result._tag === "Err";

/**
 * Checks whether an unknown value is a Result.
 *
 * A value is considered a Result if it's a non-null object with `_tag`
 * equal to `"Ok"` or `"Err"`.
 */
export const isResult = (value: unknown): value is Result<unknown, string> =>
	value != null &&
	typeof value === "object" &&
	"_tag" in value &&
	(value._tag === "Ok" || value._tag === "Err");
