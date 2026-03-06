import type { Result } from "../result.ts";
import type { AsyncResult } from "../async_result.ts";

export type AnyResult<T = any, E extends string = any> =
	| Result<T, E>
	| AsyncResult<T, E>
	| Promise<Result<T, E>>;

// Inference-friendly subset: AsyncResult's complex intersection type breaks
// TypeScript's `infer` when included in a union, so we infer from a simpler
// union and handle AsyncResult via a separate conditional branch.
type InferableResult<T = any, E extends string = any> =
	| Result<T, E>
	| Promise<Result<T, E>>;

export type InferOk<R> = [R] extends [InferableResult<infer T, any>] ? T
	: [R] extends [AsyncResult<infer T, any>] ? T
	: never;

export type InferFail<R> = [R] extends [InferableResult<any, infer E>] ? E
	: [R] extends [AsyncResult<any, infer E>] ? E
	: never;

export type Match<RuleList extends any[]> = RuleList extends
	[infer First extends { if: boolean; return: any }, ...infer Rest]
	? First["if"] extends true ? First["return"]
	: Match<Rest>
	: never;

export type Check<A, Kind extends "extends" | "isExactly", B> =
	"extends" extends Kind ? [A] extends [B] ? true : false
		: "isExactly" extends Kind
			? And<[Check<A, "extends", B>, Check<B, "extends", A>]>
		: never;

export type And<Conditions extends boolean[]> = Conditions extends
	[infer First extends boolean, ...infer Rest extends boolean[]]
	? First extends true ? Rest extends [] ? true
		: And<Rest>
	: false
	: true;

export type Or<Conditions extends boolean[]> = Conditions extends
	[infer First extends boolean, ...infer Rest extends boolean[]]
	? First extends true ? true
	: Rest extends [] ? false
	: Or<Rest>
	: false;

export type Not<Condition extends boolean> = Condition extends true ? false
	: true;

// ============================================================================
// mapErr handler type helpers (shared by result.ts and async_result.ts)
// ============================================================================

/** Extract the Ok type from a handler return (plain value = recovery). */
export type HandlerOk<R> = [R] extends [{ _tag: "Ok" | "Err" }]
	? R extends { _tag: "Ok"; value: infer T } ? T : never
	: R;

/** Extract the Err codes from a handler return. */
export type HandlerErr<R> = [R] extends [{ _tag: "Ok" | "Err" }]
	? R extends { _tag: "Err"; code: infer E extends string } ? E : never
	: never;

/** Infer all return types from a handler object. */
export type InferHandlerReturns<H> = {
	[K in keyof H]: H[K] extends ((...args: any[]) => infer R) ? R : never;
}[keyof H];
