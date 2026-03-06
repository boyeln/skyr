/** Function factory with dependency injection support. */

import { isErr, isOk, isResult, ok, type Result } from "../result.ts";
import { asyncResult } from "../async_result.ts";
import { unknownErr } from "../_internal/errors.ts";
import type {
	ContextualizedCallable,
	Dependency,
	DependencyRequest,
	ExtractGeneratorReturn,
	ExtractResultErrors,
	Fn,
	FnMetadata,
	InferDependencies,
	InferErrors,
	UnwrapResultType,
	UseRequest,
	YieldedValue,
} from "./types.ts";

// ============================================================================
// Type Guards
// ============================================================================

function isUseRequest(value: unknown): value is UseRequest {
	return (
		value != null &&
		typeof value === "object" &&
		"_tag" in value &&
		value._tag === "UseRequest"
	);
}

// ============================================================================
// Dependency Resolution
// ============================================================================

/** Resolve a dependency request. Throws if not found. */
function resolveDependency(
	request: DependencyRequest<any>,
	deps: Record<string, any>,
	gen: Generator<YieldedValue, any, any>,
): IteratorResult<YieldedValue, any> {
	if (!(request.key in deps)) {
		throw new Error(
			`Missing dependency: "${request.key}". Use inject() to provide this dependency.`,
		);
	}
	return gen.next(deps[request.key]);
}

// ============================================================================
// Generator Execution — Shared Helpers
// ============================================================================

/** Handle a UseRequest — resolves dependencies or creates contextualized callables. */
function handleUseRequest(
	request: UseRequest,
	gen: Generator<YieldedValue, any, any>,
	deps: Record<string, any>,
): IteratorResult<YieldedValue, any> {
	if (request.type === "dependency") {
		const depRequest: DependencyRequest<any> = {
			_tag: "DependencyRequest",
			key: request.target.key,
			_dep: request.target,
		};
		return resolveDependency(depRequest, deps, gen);
	}

	// type === "fn" — create contextualized callable
	const target = request.target;
	const contextualizedCallable: ContextualizedCallable<any, any, any> = (
		...callArgs: any[]
	) => {
		const mergedDeps = { ...deps, ...target._fn._injectedDeps };
		const childResult = runGenerator(
			target._fn._generator,
			callArgs,
			mergedDeps,
		);
		if (childResult instanceof Promise) {
			return asyncResult(childResult);
		}
		return childResult;
	};

	return gen.next(contextualizedCallable);
}

/** Await a promise safely: rejections become UNKNOWN_ERR, failed Results short-circuit. */
async function awaitAndUnwrap(
	promise: Promise<any>,
): Promise<
	{ done: true; value: Result<any, any> } | { done: false; value: any }
> {
	let resolved: any;
	try {
		resolved = await promise;
	} catch (cause) {
		return { done: true, value: unknownErr("Promise rejected", cause) };
	}
	if (isResult(resolved) && isErr(resolved)) {
		return { done: true, value: resolved };
	}
	const unwrapped = isResult(resolved) && isOk(resolved)
		? resolved.value
		: resolved;
	return { done: false, value: unwrapped };
}

// ============================================================================
// Generator Execution
// ============================================================================

/** Run a generator synchronously. Transitions to async on first Promise. */
function runGenerator(
	generator: (...args: any[]) => Generator<YieldedValue, any, any>,
	args: any[],
	deps: Record<string, any>,
): any {
	const gen = generator(...args);
	let result = gen.next();

	while (!result.done) {
		const yielded = result.value;

		if (isUseRequest(yielded)) {
			result = handleUseRequest(yielded, gen, deps);
			continue;
		}

		if (isResult(yielded)) {
			if (isErr(yielded)) return yielded;

			// Ok with Promise value — transition to async
			if (isOk(yielded) && yielded.value instanceof Promise) {
				return asyncResult(
					runGeneratorAsync(gen, yielded.value, deps),
				);
			}

			result = gen.next(isOk(yielded) ? yielded.value : yielded);
			continue;
		}

		// Bare Promise — transition to async
		if (yielded instanceof Promise) {
			return asyncResult(runGeneratorAsync(gen, yielded, deps));
		}

		result = gen.next();
	}

	return isResult(result.value) ? result.value : ok(result.value);
}

/** Continue generator execution asynchronously after encountering a Promise. */
async function runGeneratorAsync(
	gen: Generator<YieldedValue, any, any>,
	firstAsyncValue: Promise<any>,
	deps: Record<string, any>,
): Promise<Result<any, any>> {
	// Resolve the first async value that triggered the transition
	const first = await awaitAndUnwrap(firstAsyncValue);
	if (first.done) return first.value;

	let result = gen.next(first.value);

	while (!result.done) {
		const yielded = result.value;

		if (isUseRequest(yielded)) {
			result = handleUseRequest(yielded, gen, deps);
			continue;
		}

		if (isResult(yielded)) {
			if (isErr(yielded)) return yielded;

			if (isOk(yielded) && yielded.value instanceof Promise) {
				const inner = await awaitAndUnwrap(yielded.value);
				if (inner.done) return inner.value;
				result = gen.next(inner.value);
				continue;
			}

			result = gen.next(isOk(yielded) ? yielded.value : yielded);
			continue;
		}

		if (yielded instanceof Promise) {
			const awaited = await awaitAndUnwrap(yielded);
			if (awaited.done) return awaited.value;
			result = gen.next(awaited.value);
			continue;
		}

		result = gen.next();
	}

	return isResult(result.value) ? result.value : ok(result.value);
}

// ============================================================================
// Fn Factory
// ============================================================================

/** Create an Fn with the given generator and pre-injected deps. */
function createFn<
	Args extends any[],
	Return,
	Errors extends string,
	Deps extends Dependency<any, string>,
>(
	generator: (...args: Args) => Generator<YieldedValue, any, any>,
	injectedDeps: Record<string, any> = {},
): Fn<Args, Return, Errors, Deps> {
	const metadata: FnMetadata<Args, Return, Errors, Deps> = {
		_tag: "Fn",
		_generator: generator,
		_deps: undefined as unknown as Deps,
		_injectedDeps: injectedDeps,
	};

	// The callable and metadata use `any` extensively because TypeScript can't
	// express the relationship between generator yield types, dependency resolution,
	// and the final callable signature. The public type safety comes from the Fn<>
	// type wrapper and the fn() overload signatures — this internal plumbing is
	// invisible to consumers.
	const callable: any = (...args: Args) => {
		const output = runGenerator(
			generator,
			args,
			injectedDeps,
		);

		if (output instanceof Promise) {
			return asyncResult(output);
		}

		return output;
	};

	// Attach metadata
	callable._fn = metadata;

	// Make Fn iterable so `yield* use(SomeFn)` works in parent generators.
	// This generator yields nothing and immediately returns the callable —
	// `yield*` on a generator that only returns (no yields) evaluates to the
	// return value, so `const f = yield* use(Fn)` gives back the callable.
	// deno-lint-ignore require-yield
	callable[Symbol.iterator] = function* (): Generator<
		never,
		typeof callable,
		never
	> {
		return callable;
	};

	return callable as Fn<Args, Return, Errors, Deps>;
}

// ============================================================================
// Public API
// ============================================================================

/**
 * Creates a function with optional dependency injection and Result unwrapping.
 *
 * **Regular function** — collapses Result return type branches into a single
 * `Result<T, E>` (no annotation needed):
 * ```ts
 * const divide = R.fn((a: number, b: number) =>
 *   b === 0 ? R.err("DIV_ZERO", "Cannot divide by zero") : R.ok(a / b)
 * );
 * // (a: number, b: number) => Result<number, "DIV_ZERO">
 * ```
 *
 * **Generator function** — enables `yield*` for Result unwrapping (short-circuits
 * on error) and `yield* R.use(Dep)` for dependency injection:
 * ```ts
 * const GetUser = R.fn(function* (email: string) {
 *   const db = yield* R.use(Database);
 *   const validEmail = yield* validateEmail(email);
 *   const user = yield* R.fromThrowable(db.findUser(validEmail));
 *   if (!user) return R.err("NOT_FOUND", "User not found");
 *   return R.ok(user);
 * });
 * ```
 *
 * Dependencies and error types accumulate automatically across `yield*` calls.
 * Use `inject()` to provide dependencies before calling.
 */

// Detect generator functions via their constructor (immune to minification).
// This uses `instanceof`, which assumes the generator is from the same realm
// (same global context) as this module. Safe in practice — users always write
// `fn(function* () { ... })` inline, never across iframes or VM contexts.
const GeneratorFunction = (function* () {}).constructor;

// Overload: regular function returning Result
export function fn<
	Args extends any[],
	R extends Result<any, any>,
>(
	func: (...args: Args) => R,
): (...args: Args) => Result<UnwrapResultType<R>, ExtractResultErrors<R>>;

// Overload: generator function
export function fn<
	Args extends any[],
	Gen extends Generator<any, any, any>,
>(
	generator: (...args: Args) => Gen,
): Fn<
	Args,
	UnwrapResultType<ExtractGeneratorReturn<Gen>>,
	InferErrors<Gen> | ExtractResultErrors<ExtractGeneratorReturn<Gen>>,
	InferDependencies<Gen> extends Dependency<any, string>
		? InferDependencies<Gen>
		: never
>;

// Implementation
export function fn(
	funcOrGenerator: (...args: any[]) => any,
): any {
	// Check if it's a generator function
	if (funcOrGenerator instanceof GeneratorFunction) {
		return createFn(
			funcOrGenerator as any,
			{},
		) as any;
	}

	// Regular function: return as-is. The type overload handles
	// collapsing Result<T, never> | Result<never, E> into Result<T, E>.
	// No Fn wrapper needed — no generators, no DI, no runtime overhead.
	return funcOrGenerator;
}

// Used by inject.ts — not re-exported from mod.ts
export { createFn };
