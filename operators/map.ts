import type {
	And,
	AnyResult,
	Check,
	InferFail,
	InferOk,
	Match,
} from "../_internal/types.ts";
import { handleMap } from "../_internal/handlers.ts";
import { isErr, type Result } from "../result.ts";
import type { AsyncResult } from "../async_result.ts";
import { asyncResult } from "../async_result.ts";

type MapOperator = <R extends AnyResult, U>(
	fn: (value: InferOk<R>) => U,
) => (
	result: R,
) => Match<[
	{
		if: And<[
			Check<U, "extends", AnyResult>,
			Check<PromiseLike<any>, "extends", U | R>,
		]>;
		return: AsyncResult<InferOk<U>, InferFail<R> | InferFail<U>>;
	},
	{
		if: Check<U, "extends", AnyResult>;
		return: Result<InferOk<U>, InferFail<R> | InferFail<U>>;
	},
	{
		if: Check<U, "extends", Promise<any>>;
		return: AsyncResult<Awaited<U>, InferFail<R> | "UNKNOWN_ERR">;
	},
	{
		if: Check<R, "extends", PromiseLike<any>>;
		return: AsyncResult<U, InferFail<R>>;
	},
	{
		if: true;
		return: Result<U, InferFail<R>>;
	},
]>;

/**
 * Transforms the ok value. Skips if the result is an error.
 *
 * If `fn` returns a Result, it's automatically flattened (no nesting).
 * If `fn` returns a Promise, the pipeline becomes async. Resolved values
 * become ok, rejections become `UNKNOWN_ERR`.
 *
 * Throws {@link Panic} if `fn` throws synchronously.
 *
 * @example
 * ```ts
 * R.pipe(
 *   R.ok(5),
 *   R.map(n => n * 2),
 *   R.map(n => `Value: ${n}`),
 * );
 * // Ok("Value: 10")
 * ```
 */
export const map: MapOperator = (fn) => (result): any => {
	const handle = (r: Result<any, any>): any => {
		if (isErr(r)) return r;
		return handleMap(r.value, fn);
	};

	if (result instanceof Promise) {
		return asyncResult(
			(result as Promise<any>).then(handle) as Promise<Result<any, any>>,
		);
	}
	return handle(result as Result<any, any>);
};
