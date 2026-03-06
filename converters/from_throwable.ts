import { ok, type Result } from "../result.ts";
import { type AsyncResult, asyncResult } from "../async_result.ts";
import { type UNKNOWN_ERR, unknownErr } from "../_internal/errors.ts";

/**
 * Converts a Promise that might reject into an async Result.
 * Rejections become `UNKNOWN_ERR`.
 *
 * @example
 * ```ts
 * const result = await R.fromThrowable(fetch("https://api.example.com"));
 * ```
 */
export function fromThrowable<T>(
	promise: Promise<T>,
): AsyncResult<T, UNKNOWN_ERR>;

/**
 * Converts a Promise that might reject into an async Result with a custom error mapper.
 *
 * @example
 * ```ts
 * const result = await R.fromThrowable(
 *   fetch("https://api.example.com"),
 *   (e) => R.err("FETCH_ERROR", "Request failed", e),
 * );
 * ```
 */
export function fromThrowable<T, E extends string>(
	promise: Promise<T>,
	mapper: (error: unknown) => Result<never, E>,
): AsyncResult<T, E>;

/**
 * Calls a function synchronously and catches any thrown error as `UNKNOWN_ERR`.
 *
 * @example
 * ```ts
 * const result = R.fromThrowable(() => JSON.parse(input));
 * ```
 */
export function fromThrowable<T>(
	fn: () => T,
): Result<T, UNKNOWN_ERR>;

/**
 * Calls a function synchronously and maps any thrown error with a custom mapper.
 *
 * @example
 * ```ts
 * const result = R.fromThrowable(
 *   () => JSON.parse(input),
 *   (e) => R.err("PARSE_ERROR", "Invalid JSON", e),
 * );
 * ```
 */
export function fromThrowable<T, E extends string>(
	fn: () => T,
	mapper: (error: unknown) => Result<never, E>,
): Result<T, E>;

export function fromThrowable<
	T,
	E extends string = UNKNOWN_ERR,
>(
	fnOrPromise: (() => T) | Promise<T>,
	mapper?: (error: unknown) => Result<never, E>,
) {
	// Check if it's a Promise
	if (fnOrPromise instanceof Promise) {
		return asyncResult(
			fnOrPromise
				.then((value) => ok(value) as Result<T, E>)
				.catch((cause) => {
					if (mapper) {
						return mapper(cause);
					}
					return unknownErr("Promise rejected", cause) as any;
				}),
		);
	}

	// Handle function
	try {
		const value = fnOrPromise();
		return ok(value);
	} catch (cause) {
		if (mapper) {
			return mapper(cause);
		}
		return unknownErr("Function threw an error", cause) as any;
	}
}
