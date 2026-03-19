import type {
	And,
	AnyResult,
	Check,
	InferErrObj,
	InferFail,
	InferOk,
	Match,
	Or,
} from "../_internal/types.ts";
import { handleMatch } from "../_internal/handlers.ts";
import type { Result } from "../result.ts";

type MatchOperator = <R extends AnyResult, OkReturn, ErrReturn>(
	handlers: {
		ok: (value: InferOk<R>) => OkReturn;
		err: (err: InferErrObj<R>) => ErrReturn;
	},
) => (
	result: R,
) => Match<[
	// If either handler returns a Result and any component is async → Promise<Result>
	{
		if: And<[
			Or<[
				Check<OkReturn, "extends", AnyResult>,
				Check<ErrReturn, "extends", AnyResult>,
			]>,
			Or<[
				Check<R, "extends", PromiseLike<any>>,
				Check<OkReturn, "extends", Promise<any>>,
				Check<ErrReturn, "extends", Promise<any>>,
			]>,
		]>;
		return: Promise<
			Result<
				InferOk<OkReturn> | InferOk<ErrReturn>,
				InferFail<OkReturn> | InferFail<ErrReturn>
			>
		>;
	},
	// If either handler returns a Result (all sync) → Result
	{
		if: Or<[
			Check<OkReturn, "extends", AnyResult>,
			Check<ErrReturn, "extends", AnyResult>,
		]>;
		return: Result<
			InferOk<OkReturn> | InferOk<ErrReturn>,
			InferFail<OkReturn> | InferFail<ErrReturn>
		>;
	},
	// If any component is async but handlers don't return Results → Promise with union
	{
		if: Or<[
			Check<R, "extends", PromiseLike<any>>,
			Check<OkReturn, "extends", Promise<any>>,
			Check<ErrReturn, "extends", Promise<any>>,
		]>;
		return: Promise<Awaited<OkReturn> | Awaited<ErrReturn>>;
	},
	// Default: sync union
	{
		if: true;
		return: OkReturn | ErrReturn;
	},
]>;

/**
 * Pattern-matches both cases of a Result to leave the Result world.
 *
 * If either handler returns a Result, the output is a Result.
 * Otherwise it's a plain value.
 *
 * Throws {@link Panic} if a handler throws synchronously.
 *
 * @example
 * ```ts
 * const label = R.pipe(
 *   R.ok(42),
 *   R.match({
 *     ok: n => `Got ${n}`,
 *     err: e => `Error: ${e.code}`,
 *   }),
 * );
 * // "Got 42"
 * ```
 */
export const match: MatchOperator = (handlers) => (result): any => {
	if (result instanceof Promise) {
		return (result as Promise<any>).then((r) =>
			handleMatch(r, handlers)
		) as Promise<any>;
	}
	return handleMatch(result as Result<any, any>, handlers);
};
