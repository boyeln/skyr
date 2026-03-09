import type {
	And,
	AnyResult,
	Check,
	InferFail,
	InferOk,
	Match,
} from "../_internal/types.ts";
import { handleMapErr } from "../_internal/handlers.ts";
import { type Err, isOk, type Result } from "../result.ts";
import type { AsyncResult } from "../async_result.ts";
import { asyncResult } from "../async_result.ts";

type ErrHandlers<E extends string, U> = {
	[K in E]?: (err: Err<K>) => U;
};

type InferHandlerReturn<H> = H extends ErrHandlers<any, infer U> ? U
	: never;

// Extract keys that are present in handlers object
type HandledKeys<H> = H extends ErrHandlers<any, any> ? keyof H & string
	: never;

// Get unhandled error codes (those not in handlers)
type UnhandledErrors<E extends string, H> = Exclude<E, HandledKeys<H>>;

// When a mapErr handler returns U:
// - If U is a Result: Ok type is InferOk<U>, Err type is InferFail<U>
// - If U is a plain value: Ok type is U, Err type is never (recovery)
// Non-distributive to avoid InferOk<Err<E>> resolving to unknown.
type RecoveryOk<U> = [U] extends [AnyResult] ? InferOk<U> : U;
type RecoveryErr<U> = [U] extends [AnyResult] ? InferFail<U> : never;

type MapErrOperator = {
	// Pattern matching overload
	<R extends AnyResult, H extends ErrHandlers<InferFail<R>, any>>(
		handlers: H,
	): (
		result: R,
	) => Match<[
		{
			if: And<[
				Check<InferHandlerReturn<H>, "extends", AnyResult>,
				Check<PromiseLike<any>, "extends", InferHandlerReturn<H> | R>,
			]>;
			return: AsyncResult<
				InferOk<R> | RecoveryOk<InferHandlerReturn<H>>,
				UnhandledErrors<InferFail<R>, H> | RecoveryErr<InferHandlerReturn<H>>
			>;
		},
		{
			if: Check<InferHandlerReturn<H>, "extends", AnyResult>;
			return: Result<
				InferOk<R> | RecoveryOk<InferHandlerReturn<H>>,
				UnhandledErrors<InferFail<R>, H> | RecoveryErr<InferHandlerReturn<H>>
			>;
		},
		{
			if: Check<InferHandlerReturn<H>, "extends", Promise<any>>;
			return: AsyncResult<
				InferOk<R> | RecoveryOk<Awaited<InferHandlerReturn<H>>>,
				| UnhandledErrors<InferFail<R>, H>
				| RecoveryErr<Awaited<InferHandlerReturn<H>>>
				| "UNKNOWN_ERR"
			>;
		},
		{
			if: Check<R, "extends", PromiseLike<any>>;
			return: AsyncResult<
				InferOk<R> | RecoveryOk<InferHandlerReturn<H>>,
				UnhandledErrors<InferFail<R>, H> | RecoveryErr<InferHandlerReturn<H>>
			>;
		},
		{
			if: true;
			return: Result<
				InferOk<R> | RecoveryOk<InferHandlerReturn<H>>,
				UnhandledErrors<InferFail<R>, H> | RecoveryErr<InferHandlerReturn<H>>
			>;
		},
	]>;
	// Function overload
	<R extends AnyResult, U>(
		fn: (err: Extract<Awaited<R>, { _tag: "Err" }>) => U,
	): (
		result: R,
	) => Match<[
		{
			if: And<[
				Check<U, "extends", AnyResult>,
				Check<PromiseLike<any>, "extends", U | R>,
			]>;
			return: AsyncResult<InferOk<R> | RecoveryOk<U>, RecoveryErr<U>>;
		},
		{
			if: Check<U, "extends", AnyResult>;
			return: Result<InferOk<R> | RecoveryOk<U>, RecoveryErr<U>>;
		},
		{
			if: Check<U, "extends", Promise<any>>;
			return: AsyncResult<
				InferOk<R> | RecoveryOk<Awaited<U>>,
				RecoveryErr<Awaited<U>> | "UNKNOWN_ERR"
			>;
		},
		{
			if: Check<R, "extends", PromiseLike<any>>;
			return: AsyncResult<InferOk<R> | RecoveryOk<U>, RecoveryErr<U>>;
		},
		{
			if: true;
			return: Result<InferOk<R> | RecoveryOk<U>, RecoveryErr<U>>;
		},
	]>;
};

/**
 * Transforms or recovers from errors. Has two forms:
 *
 * **Function form** transforms all errors:
 * ```ts
 * R.mapErr(e => R.err("DEFAULT_ERROR", e.message))
 * ```
 *
 * **Handler object** handles specific error codes (with autocomplete):
 * ```ts
 * R.mapErr({
 *   NOT_FOUND: () => R.ok(guestUser),   // recover with ok()
 *   TIMEOUT: () => defaultUser,          // recover with plain value
 *   // AUTH_FAILED not listed → passes through unchanged
 * })
 * ```
 *
 * Each handler receives the narrowed `Err<"CODE">` and can return `ok(value)`,
 * a plain value (treated as recovery), or `err(code, message)` to transform.
 *
 * Throws {@link Panic} if a handler throws synchronously.
 */
export const mapErr: MapErrOperator =
	(fnOrHandlers: any) => (result: any): any => {
		const handle = (r: Result<any, any>) => {
			if (isOk(r)) return r;
			return handleMapErr(r, fnOrHandlers);
		};

		if (result instanceof Promise) {
			return asyncResult(
				(result as Promise<any>).then(handle) as Promise<Result<any, any>>,
			);
		}
		return handle(result as Result<any, any>);
	};
