/**
 * Type-safe error handling for TypeScript, inspired by Rust's `Result` type.
 *
 * See the {@link https://github.com/boyeln/skyr | README} for full documentation.
 *
 * @example
 * ```ts
 * import * as R from "skyr";
 *
 * const result = R.ok(42)
 *   .map((n) => n * 2)
 *   .match({
 *     ok: (n) => `Got ${n}`,
 *     err: (e) => `Error: ${e.code}`,
 *   });
 * ```
 *
 * @module
 */

// Core types and constructors
export { err, isErr, isOk, isResult, ok } from "./result.ts";
export type { Err, Ok, Result, ResultErr } from "./result.ts";
export type { AsyncResult } from "./async_result.ts";

// Pipe
export { pipe } from "./pipe.ts";

// Errors
export { Panic } from "./panic.ts";

// Standalone operators (for pipe())
export { map } from "./operators/map.ts";
export { mapErr } from "./operators/map_err.ts";
export { match } from "./operators/match.ts";
export { inspect } from "./operators/inspect.ts";
export { inspectErr } from "./operators/inspect_err.ts";
export { unwrap } from "./operators/unwrap.ts";
export { unwrapOr } from "./operators/unwrap_or.ts";

// Converters
export { fromThrowable } from "./converters/from_throwable.ts";
export { wrapThrowable } from "./converters/wrap_throwable.ts";

// Dependency injection
export type { Dependency, DependencyImpl, Fn } from "./fn/types.ts";
export { dependency } from "./fn/dependency.ts";
export { fn } from "./fn/fn.ts";
export { inject } from "./fn/inject.ts";
export { use } from "./fn/use.ts";
