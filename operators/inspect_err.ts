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
import { isErr, type Result } from "../result.ts";
import type { AsyncResult } from "../async_result.ts";
import { asyncResult } from "../async_result.ts";

type InspectErrOperator = <R extends AnyResult, U>(
	fn: (err: Extract<Awaited<R>, { _tag: "Err" }>) => U,
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
 * Runs a side effect on the error without changing the Result.
 *
 * The callback's return value is ignored. If the callback throws or
 * returns a rejected Promise, the error is silently swallowed — side
 * effects never break the pipeline.
 *
 * @example
 * ```ts
 * R.pipe(
 *   R.err("NOT_FOUND", "User not found"),
 *   R.inspectErr(e => console.error("Failed:", e.code)),
 *   R.mapErr(e => R.err("DEFAULT", e.message)),
 * );
 * ```
 */
export const inspectErr: InspectErrOperator =
	(fn: any) => (result: any): any => {
		const handle = (r: Result<any, any>): any => {
			if (!isErr(r)) return r;
			return handleInspect(r, fn);
		};

		if (result instanceof Promise) {
			return asyncResult(
				(result as Promise<any>).then(handle) as Promise<Result<any, any>>,
			);
		}
		return handle(result as Result<any, any>);
	};
