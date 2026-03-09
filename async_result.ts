/**
 * AsyncResult: a Promise<Result<T, E>> with chainable methods.
 *
 * All methods return AsyncResult (async poison), except terminal operations
 * (match, unwrap, unwrapOr) which return Promise. AsyncResult is PromiseLike -
 * await it to get back a sync Result with all its methods.
 */

import type { Err, Result } from "./result.ts";
import type {
	HandlerErr,
	HandlerOk,
	InferHandlerReturns,
} from "./_internal/types.ts";

// ============================================================================
// AsyncResult Type
// ============================================================================

/**
 * A `Promise<Result<T, E>>` with chainable methods. Wraps an async Result
 * and provides the same transformation API as sync Result.
 *
 * All methods return `AsyncResult` (async poison). Terminal operations
 * (`match`, `unwrap`, `unwrapOr`) return `Promise`.
 *
 * Implements `PromiseLike`; `await` it to get back a sync `Result`.
 */
export type AsyncResult<T, E extends string> = PromiseLike<Result<T, E>> & {
	// map overloads (most specific first)
	map<T2, E2 extends string>(
		fn: (value: T) => Promise<Result<T2, E2>>,
	): AsyncResult<T2, E | E2 | "UNKNOWN_ERR">;
	map<T2, E2 extends string>(
		fn: (value: T) => Result<T2, E2>,
	): AsyncResult<T2, E | E2>;
	map<U>(
		fn: (value: T) => Promise<U>,
	): AsyncResult<Awaited<U>, E | "UNKNOWN_ERR">;
	map<U>(fn: (value: T) => U): AsyncResult<U, E>;

	// mapErr - function form overloads
	mapErr<T2, E2 extends string>(
		fn: (e: Err<E>) => Result<T2, E2>,
	): AsyncResult<T | T2, E2>;
	mapErr<U>(fn: (e: Err<E>) => U): AsyncResult<T | U, never>;
	// mapErr - handler form
	mapErr<H extends { [K in E]?: (e: Err<K>) => any }>(
		handlers: H,
	): AsyncResult<
		T | HandlerOk<InferHandlerReturns<H>>,
		Exclude<E, keyof H & string> | HandlerErr<InferHandlerReturns<H>>
	>;

	// match - terminal, returns Promise
	match<A, B>(handlers: {
		ok: (value: T) => A;
		err: (e: Err<E>) => B;
	}): Promise<A | B>;

	// inspect / inspectErr - always async
	inspect(fn: (value: T) => any): AsyncResult<T, E>;
	inspectErr(fn: (e: Err<E>) => any): AsyncResult<T, E>;

	// unwrap - terminal, returns Promise
	unwrap(): Promise<T | undefined>;
	unwrapOr<D>(d: D): Promise<T | D>;

	// Iterable for yield* support in generators
	[Symbol.iterator](): Generator<Promise<Result<T, E>>, T, T>;
};

// ============================================================================
// Constructor
// ============================================================================

/**
 * Wraps a `Promise<Result<T, E>>` into an `AsyncResult` with chainable methods.
 *
 * The methods delegate to the resolved Result's methods. Since AsyncResult
 * extends Promise, `.then()` auto-chains any PromiseLike returns from the
 * inner Result methods, so the outer promise always resolves to `Result`.
 */
export function asyncResult<T, E extends string>(
	promise: Promise<Result<T, E>>,
): AsyncResult<T, E> {
	// Create a fresh Promise via .then() so we can attach methods without
	// mutating the caller's promise. The result is still a real Promise
	// (passes instanceof Promise), which pipe() operators rely on.
	const ar = promise.then((r) => r) as any;

	ar.map = (fn: any) => asyncResult(ar.then((r: any) => r.map(fn)));

	ar.mapErr = (fnOrHandlers: any) =>
		asyncResult(ar.then((r: any) => r.mapErr(fnOrHandlers)));

	ar.match = (handlers: any) => ar.then((r: any) => r.match(handlers));

	ar.inspect = (fn: any) => asyncResult(ar.then((r: any) => r.inspect(fn)));

	ar.inspectErr = (fn: any) =>
		asyncResult(ar.then((r: any) => r.inspectErr(fn)));

	ar.unwrap = () => ar.then((r: any) => r.unwrap());

	ar.unwrapOr = (d: any) => ar.then((r: any) => r.unwrapOr(d));

	ar[Symbol.iterator] = function* (): Generator<
		Promise<Result<T, E>>,
		T,
		T
	> {
		const resolved: T = yield ar;
		return resolved;
	};

	return ar as AsyncResult<T, E>;
}
