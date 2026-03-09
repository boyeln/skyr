/** Helper for acquiring dependencies and nested Fn callables inside generators. */

import type {
	ContextualizedCallable,
	Dependency,
	Fn,
	UseDependencyRequest,
	UseFnRequest,
} from "./types.ts";

/**
 * Acquires a dependency or nested Fn inside a generator function.
 *
 * - `yield* R.use(Database)` returns the dependency value
 * - `yield* R.use(ChildFn)` returns a contextualized callable that inherits
 *   the parent's dependency context
 *
 * For unwrapping Results, use plain `yield*` instead (no `use()` needed).
 *
 * @example
 * ```ts
 * const GetUser = R.fn(function* (email: string) {
 *   const db = yield* R.use(Database);
 *   const checkPerms = yield* R.use(CheckPermissions);
 *   const user = yield* R.fromThrowable(db.findUser(email));
 *   yield* checkPerms(user.id);
 *   return R.ok(user);
 * });
 * ```
 */
export function use<T, K extends string>(
	target: Dependency<T, K>,
): Iterable<UseDependencyRequest<T, K>, T, T>;

export function use<
	Args extends any[],
	Return,
	Errors extends string,
	Deps extends Dependency<any, string>,
>(
	target: [Deps] extends [never] ? {
			_error:
				"use() is not needed for functions without dependencies. Call the function directly and yield* the result.";
		}
		: Fn<Args, Return, Errors, Deps>,
): Iterable<
	UseFnRequest<Args, Return, Errors, Deps>,
	ContextualizedCallable<Args, Return, Errors>,
	ContextualizedCallable<Args, Return, Errors>
>;

export function use(target: any): any {
	if (isDependency(target)) {
		return createDependencyUse(target);
	}

	return createFnUse(target);
}

function isDependency<T, K extends string>(
	value: Dependency<T, K> | any,
): value is Dependency<T, K> {
	return value != null && typeof value === "object" &&
		"_tag" in value && value._tag === "Dependency";
}

function createDependencyUse<T, K extends string>(
	dependency: Dependency<T, K>,
): Iterable<UseDependencyRequest<T, K>, T, T> {
	return {
		*[Symbol.iterator](): Generator<UseDependencyRequest<T, K>, T, T> {
			const instruction: UseDependencyRequest<T, K> = {
				_tag: "UseRequest",
				type: "dependency",
				target: dependency,
			};

			const resolved = yield instruction;
			return resolved as T;
		},
	};
}

function createFnUse<
	Args extends any[],
	Return,
	Errors extends string,
	Deps extends Dependency<any, string>,
>(
	fn: Fn<Args, Return, Errors, Deps>,
): Iterable<
	UseFnRequest<Args, Return, Errors, Deps>,
	ContextualizedCallable<Args, Return, Errors>,
	ContextualizedCallable<Args, Return, Errors>
> {
	return {
		*[Symbol.iterator](): Generator<
			UseFnRequest<Args, Return, Errors, Deps>,
			ContextualizedCallable<Args, Return, Errors>,
			ContextualizedCallable<Args, Return, Errors>
		> {
			const instruction: UseFnRequest<Args, Return, Errors, Deps> = {
				_tag: "UseRequest",
				type: "fn",
				target: fn,
			};

			const resolved = yield instruction;
			return resolved as ContextualizedCallable<Args, Return, Errors>;
		},
	};
}
