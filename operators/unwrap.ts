import type { AnyResult, Check, InferOk, Match } from "../_internal/types.ts";
import { isOk, type Result } from "../result.ts";

type UnwrapOperator = <R extends AnyResult>(
	result: R,
) => Match<[
	{
		if: Check<R, "extends", PromiseLike<any>>;
		return: Promise<InferOk<R> | undefined>;
	},
	{
		if: true;
		return: InferOk<R> | undefined;
	},
]>;

/**
 * Extracts the ok value, or returns `undefined` on error.
 *
 * Works well with optional chaining and non-null assertion:
 * ```ts
 * R.pipe(fetchUser("123"), R.unwrap)?.name;
 * R.pipe(R.ok(42), R.unwrap)!;
 * ```
 *
 * With `Promise<Result>` input, returns `Promise<T | undefined>`.
 *
 * Note: `unwrap` is a value (not a function call) — use it without parentheses.
 */
export const unwrap: UnwrapOperator = (result: AnyResult): any => {
	const handle = (r: Result<any, any>) => {
		if (isOk(r)) {
			return r.value;
		}
		return undefined;
	};

	if (result instanceof Promise) {
		return (result as Promise<any>).then(handle) as Promise<any>;
	}
	return handle(result as Result<any, any>);
};
