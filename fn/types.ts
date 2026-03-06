/**
 * Core types for the dependency injection system.
 * @module
 */

import type { Result } from "../result.ts";
import type { InferFail } from "../_internal/types.ts";

// ============================================================================
// Dependency Types
// ============================================================================

/** A dependency declaration created by `dependency<T>()(key)`. */
export interface Dependency<T, K extends string = string> {
	readonly _tag: "Dependency";
	readonly key: K;
	impl(value: T): DependencyImpl<T, K>;
	[Symbol.iterator](): Generator<DependencyRequest<T, K>, T, T>;
}

/** A concrete implementation binding, created by `Dep.impl(value)` for use with `inject()`. */
export interface DependencyImpl<T, K extends string = string> {
	readonly key: K;
	readonly value: T;
}

/** Internal: yielded by generators to request a dependency from the runtime. */
export interface DependencyRequest<T, K extends string = string> {
	readonly _tag: "DependencyRequest";
	readonly key: K;
	readonly _dep: Dependency<T, K>;
}

/** Internal: yielded by `use()` to request dependency or Fn resolution. */
export interface UseDependencyRequest<T, K extends string> {
	readonly _tag: "UseRequest";
	readonly type: "dependency";
	readonly target: Dependency<T, K>;
}

export interface UseFnRequest<
	Args extends any[] = any[],
	Return = any,
	Errors extends string = string,
	Deps extends Dependency<any, string> = Dependency<any, string>,
> {
	readonly _tag: "UseRequest";
	readonly type: "fn";
	readonly target: Fn<Args, Return, Errors, Deps>;
}

export type UseRequest<T = any> =
	| UseDependencyRequest<T, any>
	| UseFnRequest;

// ============================================================================
// Fn Types
// ============================================================================

/** Internal: union of all values a generator may yield to the runtime. */
export type YieldedValue =
	| Result<any, string>
	| Promise<Result<any, string>>
	| DependencyRequest<any, string>
	| UseRequest<any>
	| Fn<any, any, any, any>;

/** Result returned by a contextualized callable, supporting `yield*` for unwrapping. */
export type GeneratorCallableResult<T, E extends string> = {
	[Symbol.iterator](): Generator<Result<T, E> | Promise<Result<T, E>>, T, any>;
};

/** A callable returned by `yield* use(Fn)` that inherits the parent's dependency context. */
export type ContextualizedCallable<
	Args extends any[],
	Return,
	Errors extends string,
> = (...args: Args) => GeneratorCallableResult<Return, Errors>;

/** Internal metadata attached to every Fn for the runtime and type system. */
export interface FnMetadata<
	Args extends any[],
	Return,
	Errors extends string,
	Deps extends Dependency<any, string>,
> {
	readonly _tag: "Fn";
	readonly _generator: (...args: Args) => Generator<YieldedValue, any, any>;
	readonly _deps: Deps;
	readonly _injectedDeps: Record<string, any>;
}

/**
 * A function created by `fn()` with typed dependencies, errors, and return value.
 *
 * When all dependencies are satisfied (`Deps = never`), callable with `Args`.
 * Otherwise, calling produces a compile-time error listing the missing dependencies.
 *
 * @typeParam Args - Function argument types
 * @typeParam Return - Ok value type
 * @typeParam Errors - Union of possible error codes
 * @typeParam Deps - Union of required Dependency types (`never` = fully satisfied)
 */
export type Fn<
	Args extends any[],
	Return,
	Errors extends string,
	Deps extends Dependency<any, string> = never,
> = {
	(
		...args: [Deps] extends [never] ? Args
			: [
				_: `ERROR - Missing dependencies: ${DepKeys<
					Deps
				>}. Use inject() first.`,
			]
	): [Deps] extends [never]
		? Result<Return, Errors> | Promise<Result<Return, Errors>>
		: never;

	readonly _fn: FnMetadata<Args, Return, Errors, Deps>;

	[Symbol.iterator](): Generator<
		Fn<Args, Return, Errors, Deps>,
		ContextualizedCallable<Args, Return, Errors>,
		any
	>;
};

// ============================================================================
// Type Helpers
// ============================================================================

/** Extracts dependency key strings from a Dependency union (for error messages). */
export type DepKeys<D> = D extends Dependency<any, infer K> ? K : never;

/** Extracts Dependency types from yielded values (UseRequest, DependencyRequest, nested Fn). */
export type ExtractDeps<Y> =
	// Handle UseRequest with dependency target
	Y extends { _tag: "UseRequest"; type: "dependency"; target: infer D } ? D
		// Handle UseRequest with fn target
		: Y extends
			{ _tag: "UseRequest"; type: "fn"; target: Fn<any, any, any, infer D> } ? D
		// Legacy: Handle direct DependencyRequest
		: Y extends { _tag: "DependencyRequest"; _dep: infer D } ? D
		// Legacy: Handle direct Fn
		: Y extends Fn<any, any, any, infer D> ? D
		: never;

/** Extracts error codes from yielded values (UseRequest with Fn, Results, nested Fn). */
export type ExtractErrors<Y> =
	// Handle UseRequest with fn target
	Y extends
		{ _tag: "UseRequest"; type: "fn"; target: Fn<any, any, infer E, any> } ? E
		// Legacy: Handle direct Fn
		: Y extends Fn<any, any, infer E, any> ? E
		: InferFail<Y>;

/** Extracts the return type from a Generator. */
export type ExtractGeneratorReturn<G> = G extends Generator<any, infer R, any>
	? R
	: never;

/** Unwraps a Result to its Ok value type. Non-distributive for union correctness. */
export type UnwrapResultType<R> = [R] extends [Result<infer T, any>] ? T : R;

/** Extracts error codes from a Result type. Non-distributive for union correctness. */
export type ExtractResultErrors<R> = [R] extends [Result<any, infer E>] ? E
	: never;

/** Extracts the yield type from a Generator. */
export type ExtractGeneratorYield<G> = G extends Generator<infer Y, any, any>
	? Y
	: never;

/** Infers all required dependencies from a generator's yield type. */
export type InferDependencies<G> = ExtractDeps<ExtractGeneratorYield<G>>;

/** Infers all error codes from a generator's yield type. */
export type InferErrors<G> = ExtractErrors<ExtractGeneratorYield<G>>;

// ============================================================================
// inject() helpers
// ============================================================================

export type RemoveDepsByKeys<
	Deps,
	Keys extends string,
> = Deps extends Dependency<any, infer K> ? (K extends Keys ? never : Deps)
	: never;

export type ImplKeys<
	Impls extends readonly DependencyImpl<any, string>[],
> = Impls[number] extends DependencyImpl<any, infer K> ? K : never;
