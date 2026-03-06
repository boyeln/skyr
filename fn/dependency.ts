/** Dependency declaration and implementation. */

import type { Dependency, DependencyImpl, DependencyRequest } from "./types.ts";

/**
 * Declares a typed dependency. The double-call syntax separates the type
 * parameter from the runtime key:
 *
 * ```ts
 * const Database = R.dependency<{
 *   findUser: (email: string) => Promise<User | null>;
 * }>()("database");
 * ```
 *
 * Use `Database.impl(value)` to create an implementation for `inject()`.
 * Use `yield* R.use(Database)` inside a generator to acquire the value.
 */
export const dependency =
	<T>() => <const K extends string>(key: K): Dependency<T, K> => {
		const self: Dependency<T, K> = {
			_tag: "Dependency",
			key,

			impl(value: T): DependencyImpl<T, K> {
				return {
					key,
					value,
				};
			},

			*[Symbol.iterator](): Generator<DependencyRequest<T, K>, T, T> {
				const request: DependencyRequest<T, K> = {
					_tag: "DependencyRequest",
					key,
					_dep: self,
				};
				return yield request;
			},
		};

		return self;
	};
