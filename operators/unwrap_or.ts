import type { AnyResult, Check, InferOk, Match } from "../_internal/types.ts";
import { isOk, type Result } from "../result.ts";

type UnwrapOrOperator = <R extends AnyResult, D>(
	defaultValue: D,
) => (
	result: R,
) => Match<[
	{
		if: Check<R, "extends", PromiseLike<any>>;
		return: Promise<InferOk<R> | D>;
	},
	{
		if: true;
		return: InferOk<R> | D;
	},
]>;

/**
 * Extracts the ok value, or returns the provided default on error.
 *
 * With `Promise<Result>` input, returns `Promise<T | D>`.
 *
 * @example
 * ```ts
 * R.pipe(R.ok(42), R.unwrapOr(0));        // 42
 * R.pipe(R.err("E", "nope"), R.unwrapOr(0)); // 0
 * ```
 */
export const unwrapOr: UnwrapOrOperator = (defaultValue) => (result): any => {
	const handle = (r: Result<any, any>) => {
		if (isOk(r)) {
			return r.ok;
		}
		return defaultValue;
	};

	if (result instanceof Promise) {
		return (result as Promise<any>).then(handle) as Promise<any>;
	}
	return handle(result as Result<any, any>);
};
