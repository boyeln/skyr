/** Dependency injection operator for use with `pipe()`. */

import { createFn } from "./fn.ts";
import type {
	Dependency,
	DependencyImpl,
	Fn,
	ImplKeys,
	RemoveDepsByKeys,
} from "./types.ts";

/**
 * Provides dependency implementations to an `Fn`. Use inside `pipe()`.
 *
 * Returns a new Fn with the given dependencies satisfied. When all dependencies
 * are provided, the Fn becomes directly callable. Injection can be done
 * incrementally across multiple `pipe()` calls.
 *
 * @example
 * ```ts
 * const getUser = R.pipe(
 *   GetUser,
 *   R.inject(
 *     Database.impl({ findUser: async (email) => db.query(email) }),
 *     Logger.impl({ info: console.log }),
 *   ),
 * );
 *
 * const result = await getUser("user@example.com");
 * ```
 */
export const inject =
	<const Impls extends readonly DependencyImpl<any, string>[]>(
		...impls: Impls
	) =>
	<
		Args extends any[],
		Return,
		Errors extends string,
		Deps extends Dependency<any, string>,
	>(
		fn: Fn<Args, Return, Errors, Deps>,
	): Fn<
		Args,
		Return,
		Errors,
		RemoveDepsByKeys<Deps, ImplKeys<Impls>>
	> => {
		// Merge new implementations with existing ones
		const newInjectedDeps = { ...fn._fn._injectedDeps };
		for (const impl of impls) {
			newInjectedDeps[impl.key] = impl.value;
		}

		type RemainingDeps = RemoveDepsByKeys<Deps, ImplKeys<Impls>>;

		// Create new Fn with merged dependencies
		return createFn<Args, Return, Errors, RemainingDeps>(
			fn._fn._generator as any,
			newInjectedDeps,
		);
	};
