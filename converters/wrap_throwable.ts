import type { Result } from "../result.ts";
import { fromThrowable } from "./from_throwable.ts";

/**
 * Like `fromThrowable`, but returns a reusable wrapper function.
 * Errors become `UNKNOWN_ERR`.
 *
 * @example
 * ```ts
 * const safeParse = R.wrapThrowable((s: string) => JSON.parse(s));
 * safeParse('{"ok": true}'); // Ok({ok: true})
 * safeParse("nope");         // Err("UNKNOWN_ERR")
 * ```
 */
export function wrapThrowable<Args extends any[], T>(
	fn: (...args: Args) => T,
): (...args: Args) => Result<T, "UNKNOWN_ERR">;

/**
 * Like `fromThrowable`, but returns a reusable wrapper function with a custom error mapper.
 *
 * @example
 * ```ts
 * const safeParse = R.wrapThrowable(
 *   (s: string) => JSON.parse(s),
 *   (e) => R.err("PARSE_ERROR", "Invalid JSON", e),
 * );
 * safeParse('{"ok": true}'); // Ok({ok: true})
 * safeParse("nope");         // Err("PARSE_ERROR")
 * ```
 */
export function wrapThrowable<Args extends any[], T, E extends string>(
	fn: (...args: Args) => T,
	mapper: (error: unknown) => Result<never, E>,
): (...args: Args) => Result<T, E>;

export function wrapThrowable<
	Args extends any[],
	T,
	E extends string = "UNKNOWN_ERR",
>(
	fn: (...args: Args) => T,
	mapper?: (error: unknown) => Result<never, E>,
): (...args: Args) => Result<T, E> {
	return (...args: Args) => {
		// Use fromThrowable to handle the actual execution
		return fromThrowable(() => fn(...args), mapper as any);
	};
}
