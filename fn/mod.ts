/**
 * Dependency injection module — `dependency()`, `fn()`, `use()`, and `inject()`.
 *
 * @module
 *
 * @example
 * ```ts
 * import * as R from "@skyr/result";
 *
 * const Database = R.dependency<{ findUser: (email: string) => Promise<User | null> }>()("database");
 *
 * const GetUser = R.fn(function* (email: string) {
 *   const db = yield* R.use(Database);
 *   const user = yield* R.fromThrowable(db.findUser(email));
 *   if (!user) return R.err("NOT_FOUND", "User not found");
 *   return R.ok(user);
 * });
 *
 * const getUser = R.pipe(
 *   GetUser,
 *   R.inject(Database.impl({ findUser: async (email) => db.query(email) })),
 * );
 *
 * const result = await getUser("user@example.com");
 * ```
 */

export type { Dependency, DependencyImpl, Fn } from "./types.ts";
export { dependency } from "./dependency.ts";
export { fn } from "./fn.ts";
export { inject } from "./inject.ts";
export { use } from "./use.ts";
