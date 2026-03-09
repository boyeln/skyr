import type {
	And,
	AnyResult,
	Check,
	InferFail,
	InferOk,
	Match,
	Not,
} from "../_internal/types.ts";
import { handleInspect } from "../_internal/handlers.ts";
import { isOk, type Result } from "../result.ts";
import type { AsyncResult } from "../async_result.ts";
import { asyncResult } from "../async_result.ts";

type InspectOperator = <R extends AnyResult, U>(
	fn: (value: InferOk<R>) => U,
) => (
	result: R,
) => Match<[
	{
		if: Check<R, "extends", PromiseLike<any>>;
		return: AsyncResult<InferOk<R>, InferFail<R>>;
	},
	{
		if: And<[
			Check<U, "extends", Promise<any>>,
			Not<Check<U, "extends", never>>,
		]>;
		return: AsyncResult<InferOk<R>, InferFail<R>>;
	},
	{
		if: true;
		return: Result<InferOk<R>, InferFail<R>>;
	},
]>;

/**
 * Runs a side effect on the ok value without changing the Result.
 *
 * The callback's return value is ignored. If the callback throws or
 * returns a rejected Promise, the error is silently swallowed. Side
 * effects never break the pipeline.
 *
 * @example
 * ```ts
 * R.pipe(
 *   R.ok(42),
 *   R.inspect(n => console.log("Value:", n)),
 *   R.map(n => n * 2),
 * );
 * ```
 */
export const inspect: InspectOperator = (fn) => (result): any => {
	const handle = (r: Result<any, any>): any => {
		if (!isOk(r)) return r;
		return handleInspect(r, fn);
	};

	if (result instanceof Promise) {
		return asyncResult(
			(result as Promise<any>).then(handle) as Promise<Result<any, any>>,
		);
	}
	return handle(result as Result<any, any>);
};
