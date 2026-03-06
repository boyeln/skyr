/** Dependency injection operator for use with `pipe()`. */

import type {
	Dependency,
	DependencyImpl,
	Fn,
	ImplKeys,
	RemoveDepsByKeys,
} from "./types.ts";
import { injectDeps } from "../_internal/handlers.ts";

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
		return injectDeps(fn, impls);
	};
