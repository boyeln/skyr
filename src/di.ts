/**
 * Dependency Injection using generators
 * Allows declaring, requiring, and injecting dependencies in a type-safe way
 */

import {
	AsyncResult,
	type Fail,
	hasFailed,
	isOk,
	isResult,
	Ok,
	type Result,
} from "./result.js";

// ============================================================================
// Dependency Types
// ============================================================================

const DEPENDENCY_SYMBOL = Symbol("dependency");

/**
 * Dependency - declares a dependency requirement
 * Example: const LoggerService = fn.dependency<Logger>()("logger")
 */
export class Dependency<T, K extends string = string> {
	constructor(readonly key: K) {}

	/**
	 * Create an implementation binding for this dependency
	 * Example: LoggerService.impl(myLogger)
	 */
	impl(value: T): DependencyImpl<T, K> {
		return new DependencyImpl<T, K>(this.key, value);
	}
}

/**
 * DependencyImpl - binds a value to a dependency key
 * Created by Dependency.impl() and used in .inject()
 */
export class DependencyImpl<T, K extends string = string> {
	constructor(
		readonly key: K,
		readonly value: T,
	) {}
}

/**
 * DependencyDeclaration - yielded in generators to request a dependency
 * Created by fn.require(dependency)
 */
export class DependencyDeclaration<T, K extends string = string> {
	readonly _tag = DEPENDENCY_SYMBOL;
	constructor(readonly key: K) {}

	// Generator support - allows `yield* fn.require(dep)` to get the value
	*[Symbol.iterator](): Generator<DependencyDeclaration<T, K>, T, T> {
		return yield this;
	}
}

/**
 * DependentGenerator - instruction to execute a function with dependency inheritance
 * Created by fn.yield() and consumed by the DI system
 */
export interface DependentGenerator<T, Deps = never, Errors = never> {
	_tag: "DependentGenerator";
	_deps: Deps;
	_errors: Errors;
	_generator: Generator<YieldedValue, T, any>;
	[Symbol.iterator](): Generator<DependentGenerator<T, Deps, Errors>, T, any>;
}

// ============================================================================
// Type Helpers
// ============================================================================

/**
 * Values that can be yielded in a generator
 */
type YieldedValue =
	| Result<any, any>
	| AsyncResult<any, any>
	| Promise<unknown>
	| DependencyDeclaration<any>
	| DependentGenerator<any, any, any>;

/**
 * Extract return type from generator
 */
type ExtractGeneratorReturn<G> = G extends Generator<any, infer R, any>
	? R
	: never;

/**
 * Extract yield type from generator
 */
type ExtractGeneratorYield<G> = G extends Generator<infer Y, any, any>
	? Y
	: never;

/**
 * Extract error types from yielded values
 */
type ExtractYieldedErrors<Y> = Y extends Fail<any, infer E>
	? E
	: Y extends Result<any, infer E>
		? E
		: Y extends AsyncResult<any, infer E>
			? E
			: Y extends DependentGenerator<any, any, infer E>
				? E
				: never;

/**
 * Extract dependencies from yielded values
 */
type ExtractYieldedDependencies<Y> = Y extends DependencyDeclaration<
	infer T,
	infer K
>
	? K extends string
		? Dependency<T, K>
		: never
	: Y extends DependentGenerator<any, infer D, any>
		? D
		: never;

/**
 * Infer all dependencies from a generator
 */
type InferDependencies<G> = ExtractYieldedDependencies<
	ExtractGeneratorYield<G>
>;

/**
 * Extract dependency keys from Dependency union
 */
type ExtractDepKeys<D> = D extends Dependency<any, infer K> ? K : never;

/**
 * Remove dependencies from union by key
 */
type RemoveDepByKey<D, K extends string> = D extends Dependency<any, K>
	? never
	: D;

/**
 * Check if yields contain async values
 */
type ContainsAsyncYields<Y> = [
	Extract<Y, AsyncResult<any, any> | Promise<any>>,
] extends [never]
	? false
	: true;

/**
 * Marker for async yields
 */
const AsyncYieldsMarker = Symbol("AsyncYields");
type AsyncYieldsMarker = typeof AsyncYieldsMarker;

/**
 * Normalize yields - return marker if async present
 */
type NormalizeYields<Y> = ContainsAsyncYields<Y> extends true
	? AsyncYieldsMarker
	: never;

/**
 * Ensure return type is a Result
 * Converts to AsyncResult if async yields are present
 */
type EnsureResult<T, E = never, Yields = never> = [Yields] extends [never]
	? T extends Result<infer U, infer TE>
		? Result<U, TE | E>
		: T extends AsyncResult<infer U, infer TE>
			? AsyncResult<U, TE | E>
			: Result<T, E>
	: Yields extends AsyncYieldsMarker
		? T extends Result<infer U, infer TE>
			? AsyncResult<U, TE | E>
			: T extends AsyncResult<infer U, infer TE>
				? AsyncResult<U, TE | E>
				: AsyncResult<T, E>
		: T extends Result<infer U, infer TE>
			? Result<U, TE | E>
			: T extends AsyncResult<infer U, infer TE>
				? AsyncResult<U, TE | E>
				: Result<T, E>;

/**
 * Unwrap Result type to get inner value
 */
type UnwrapResult<T> = T extends Result<infer U, any>
	? U
	: T extends AsyncResult<infer U, any>
		? U
		: T;

/**
 * Generator type for functions with dependencies
 */
export type FnGenerator<Return, Errors = any> = Generator<YieldedValue, Return>;

// ============================================================================
// Fn Interface
// ============================================================================

/**
 * Function with dependency injection support
 */
export interface Fn<
	Args extends any[],
	Return,
	Errors,
	Deps = never,
	Yields = never,
> {
	/**
	 * Call the function directly (only available when all dependencies are satisfied)
	 */
	(
		...args: Args
	): [Deps] extends [never] ? EnsureResult<Return, Errors, Yields> : never;

	/**
	 * Inject dependencies using implementation bindings
	 * Example: fn.inject(LoggerImpl, DbImpl)
	 * Allows injecting any dependency, even if not currently required (enables overriding)
	 */
	inject<const Impls extends readonly DependencyImpl<any, string>[]>(
		...impls: Impls
	): Fn<
		Args,
		Return,
		Errors,
		RemoveDepByKey<Deps, Impls[number]["key"]>,
		Yields
	>;

	/**
	 * Execute the function with all dependencies satisfied
	 * Only callable when Deps is never (all dependencies injected)
	 */
	run(
		...args: Args
	): [Deps] extends [never] ? EnsureResult<Return, Errors, Yields> : never;

	/**
	 * Create an instruction for executing this function with dependency inheritance
	 * Use with yield* to inherit dependencies from parent generator
	 * Automatically unwraps Ok results for seamless composition
	 */
	yield(...args: Args): DependentGenerator<UnwrapResult<Return>, Deps, Errors>;

	// Internal properties
	_generator: (...args: Args) => FnGenerator<Return, Errors>;
	_injectedDeps: Record<string, any>;
	_deps: Deps;
}

// ============================================================================
// Type Guards
// ============================================================================

function isDependencyDeclaration(
	value: unknown,
): value is DependencyDeclaration<any> {
	return (
		value != null &&
		typeof value === "object" &&
		"_tag" in value &&
		value._tag === DEPENDENCY_SYMBOL
	);
}

function isDependentGenerator(
	value: unknown,
): value is DependentGenerator<any, any, any> {
	return (
		value != null &&
		typeof value === "object" &&
		"_tag" in value &&
		value._tag === "DependentGenerator"
	);
}

// ============================================================================
// Generator Execution
// ============================================================================

/**
 * Resolve a dependency and continue generator execution
 */
function resolveDependency(
	decl: DependencyDeclaration<any>,
	deps: Record<string, any>,
	gen: Generator<YieldedValue, any, any>,
): IteratorResult<YieldedValue, any> {
	if (!(decl.key in deps)) {
		throw new Error(`Missing dependency: ${decl.key}`);
	}
	return gen.next(deps[decl.key]);
}

/**
 * Run a generator synchronously until it completes or needs to go async
 * Handles:
 * - Dependency resolution (yield* fn.require(...))
 * - Result unwrapping (yield* ok(...) / yield* fail(...))
 * - Nested function calls (yield* child.yield(...))
 * - Async transition (yield* asyncResult / yield promise)
 */
function runGenerator<Args extends any[], Return, Errors>(
	generator: (...args: Args) => FnGenerator<Return, Errors>,
	args: Args,
	deps: Record<string, any>,
): EnsureResult<Return, Errors> {
	const gen = generator(...args);
	let result = gen.next();

	while (!result.done) {
		const yielded = result.value;

		// Handle dependency declaration
		if (isDependencyDeclaration(yielded)) {
			result = resolveDependency(yielded, deps, gen);
			continue;
		}

		// Handle nested function call (DependentGenerator)
		if (isDependentGenerator(yielded)) {
			const childGen = yielded._generator;
			let childResult = childGen.next();

			// Execute child generator
			while (!childResult.done) {
				const childYielded = childResult.value;

				// Resolve child's dependencies
				if (isDependencyDeclaration(childYielded)) {
					childResult = resolveDependency(childYielded, deps, childGen);
					continue;
				}

				// Short-circuit on child failure
				if (hasFailed(childYielded)) {
					return childYielded as any;
				}

				// Switch to async if child yields async
				if (childYielded instanceof AsyncResult) {
					return new AsyncResult(
						runGeneratorAsync(gen, childYielded, deps),
					) as any;
				}

				if (childYielded instanceof Promise) {
					return new AsyncResult(
						runGeneratorAsync(gen, childYielded, deps),
					) as any;
				}

				childResult = childGen.next();
			}

			// Send child's return value back to parent
			result = gen.next(childResult.value);
			continue;
		}

		// Short-circuit on failure
		if (hasFailed(yielded)) {
			return yielded as any;
		}

		// Switch to async mode
		if (yielded instanceof AsyncResult) {
			return new AsyncResult(runGeneratorAsync(gen, yielded, deps)) as any;
		}

		if (yielded instanceof Promise) {
			return new AsyncResult(runGeneratorAsync(gen, yielded, deps)) as any;
		}

		// Continue for Ok or other values
		result = gen.next();
	}

	// Auto-wrap return value in Ok if not already a Result
	return (isResult(result.value) ? result.value : new Ok(result.value)) as any;
}

/**
 * Run a generator asynchronously after encountering an async value
 * Continues where runGenerator left off
 */
async function runGeneratorAsync(
	gen: Generator<YieldedValue, any, any>,
	firstAsyncValue: AsyncResult<unknown, unknown> | Promise<unknown>,
	deps: Record<string, any>,
): Promise<any> {
	// Resolve the first async value
	const asyncResult =
		firstAsyncValue instanceof AsyncResult
			? await firstAsyncValue
			: await firstAsyncValue;

	// Short-circuit if it's a failure
	if (hasFailed(asyncResult)) {
		return asyncResult;
	}

	// Unwrap Ok value to send back to generator (for yield* asyncResult)
	const unwrappedValue = isOk(asyncResult) ? asyncResult.value : undefined;
	let result = gen.next(unwrappedValue);

	while (!result.done) {
		const yielded = result.value;

		// Handle dependency declaration
		if (isDependencyDeclaration(yielded)) {
			result = resolveDependency(yielded, deps, gen);
			continue;
		}

		// Short-circuit on failure
		if (hasFailed(yielded)) {
			return yielded;
		}

		// Handle AsyncResult
		if (yielded instanceof AsyncResult) {
			const asyncResult = await yielded;
			if (hasFailed(asyncResult)) {
				return asyncResult;
			}
			// Unwrap Ok to send back (for yield* asyncResult)
			const unwrappedValue = isOk(asyncResult) ? asyncResult.value : undefined;
			result = gen.next(unwrappedValue);
			continue;
		}

		// Handle Promise
		if (yielded instanceof Promise) {
			await yielded;
			result = gen.next();
			continue;
		}

		// Continue for Ok or other values
		result = gen.next();
	}

	// Auto-wrap return value in Ok if not already a Result
	return isResult(result.value) ? result.value : new Ok(result.value);
}

// ============================================================================
// Fn Factory
// ============================================================================

/**
 * Create a Fn implementation with dependency injection support
 */
function createFn<
	Args extends any[],
	Return,
	Errors,
	Deps = never,
	Yields = never,
>(
	generator: (...args: Args) => FnGenerator<Return, Errors>,
	injectedDeps: Record<string, any> = {},
): Fn<Args, Return, Errors, Deps, Yields> {
	// Create the Fn object
	const fnObj = {
		_generator: generator,
		_injectedDeps: injectedDeps,
		_deps: {} as Deps,

		inject(...impls: readonly DependencyImpl<any, any>[]): any {
			// Merge new implementations with existing ones
			const depsRecord = impls.reduce(
				(acc, impl) => {
					acc[impl.key] = impl.value;
					return acc;
				},
				{} as Record<string, any>,
			);
			const newInjectedDeps = { ...injectedDeps, ...depsRecord };
			return createFn(generator, newInjectedDeps);
		},

		run(...args: Args): any {
			return runGenerator(generator, args, injectedDeps);
		},

		yield(
			...args: Args
		): DependentGenerator<UnwrapResult<Return>, Deps, Errors> {
			// Create execution generator that handles dependency inheritance
			const executeGen = function* (): Generator<YieldedValue, any, any> {
				const gen = generator(...args);
				let result = gen.next();

				while (!result.done) {
					const yielded = result.value;

					// If it's a dependency we don't have, yield it to parent
					if (isDependencyDeclaration(yielded)) {
						if (!(yielded.key in injectedDeps)) {
							// Yield to parent and get the value back
							const depValue = yield yielded;
							result = gen.next(depValue);
							continue;
						}
						// We have this dependency, resolve it internally
						result = resolveDependency(yielded, injectedDeps, gen);
						continue;
					}

					// Yield other values to parent
					yield yielded as YieldedValue;
					result = gen.next();
				}

				// Auto-unwrap Result return values for seamless composition
				const returnValue = result.value;
				if (isOk(returnValue)) {
					return returnValue.value;
				}
				return returnValue;
			};

			// Create instruction object
			const instruction: DependentGenerator<
				UnwrapResult<Return>,
				Deps,
				Errors
			> = {
				_tag: "DependentGenerator",
				_deps: {} as Deps,
				_errors: {} as Errors,
				_generator: executeGen(),
				// Make it iterable for yield* - yields itself as instruction
				*[Symbol.iterator]() {
					return yield instruction;
				},
			};

			return instruction;
		},
	};

	// Make the Fn object callable
	const callable: any = (...args: Args) => fnObj.run(...args);

	// Copy Fn properties to the callable function
	callable.inject = fnObj.inject;
	callable.run = fnObj.run;
	callable.yield = fnObj.yield;
	callable._generator = fnObj._generator;
	callable._injectedDeps = fnObj._injectedDeps;
	callable._deps = fnObj._deps;

	return callable as Fn<Args, Return, Errors, Deps>;
}

// ============================================================================
// Public API
// ============================================================================

/**
 * Create a function with dependency injection support
 *
 * For generator functions: Enables DI and automatic error handling
 * For regular functions: Identity transform with type inference
 */
function fnImpl<Args extends any[], T, E>(
	fn: (...args: Args) => Result<T, E>,
): (...args: Args) => Result<T, E>;
function fnImpl<Args extends any[], Gen extends Generator<any, any, any>>(
	generator: (...args: Args) => Gen,
): Fn<
	Args,
	ExtractGeneratorReturn<Gen>,
	ExtractYieldedErrors<ExtractGeneratorYield<Gen>>,
	InferDependencies<Gen>,
	NormalizeYields<ExtractGeneratorYield<Gen>>
>;
function fnImpl(fnOrGen: any): any {
	// Check if it's a generator function
	if (fnOrGen.constructor && fnOrGen.constructor.name === "GeneratorFunction") {
		return createFn(fnOrGen);
	}

	// Regular function - return as-is (identity)
	return fnOrGen;
}

/**
 * Create a dependency key
 * Example: const LoggerService = fn.dependency<Logger>()("logger")
 */
fnImpl.dependency = <T>() => {
	return <const K extends string>(key: K): Dependency<T, K> => {
		return new Dependency<T, K>(key);
	};
};

/**
 * Declare a dependency requirement
 * Example: const logger = yield* fn.require(LoggerService)
 */
fnImpl.require = <T, K extends string>(
	dep: Dependency<T, K>,
): DependencyDeclaration<T, K> => {
	return new DependencyDeclaration<T, K>(dep.key);
};

export const fn = fnImpl;
