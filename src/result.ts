/**
 * Type-safe error handling with Result types
 * Inspired by Rust's Result<T, E>
 */

// ============================================================================
// Core Types
// ============================================================================

/**
 * Structured failure with code, message, and optional cause
 */
export type Failure<Code extends string> = {
	code: Code;
	message: string;
	cause?: unknown;
};

/**
 * Result type - either success (Ok) or failure (Fail)
 */
export type Result<T, E> = Ok<T, E> | Fail<T, E>;

// ============================================================================
// Pattern Matching Type Helpers
// ============================================================================

/**
 * Extract code literals from a Failure union type
 * ExtractCodes<Failure<"A"> | Failure<"B">> = "A" | "B"
 */
export type ExtractCodes<E> = E extends Failure<infer Code> ? Code : never;

/**
 * Handler map for pattern matching on failure codes
 * Provides autocomplete for available codes and narrows failure type per handler
 */
export type FailureHandlers<E> = {
	[K in ExtractCodes<E>]?: (failure: Extract<E, Failure<K>>) => any;
};

// ============================================================================
// Ok Class - Represents Success
// ============================================================================

export class Ok<T, E> {
	readonly _tag = "Ok" as const;

	constructor(readonly value: T) {}

	// Transformation methods
	map<U>(fn: (value: T) => U): Result<U, E>;
	map<U>(
		fn: (value: T) => Promise<U>,
	): AsyncResult<U, E | Failure<"UNKNOWN_FAILURE">>;
	map<U, F>(fn: (value: T) => Result<U, F>): Result<U, E | F>;
	map<U, F>(fn: (value: T) => AsyncResult<U, F>): AsyncResult<U, E | F>;
	map(fn: (value: T) => any): any {
		const result = fn(this.value);

		// Handle Result types
		if (result instanceof Ok || result instanceof Fail) {
			return result;
		}

		// Handle AsyncResult
		if (result instanceof AsyncResult) {
			return result;
		}

		// Handle Promise
		if (result instanceof Promise) {
			return new AsyncResult(
				result
					.then((v) => new Ok(v))
					.catch((err) => new Fail(createUnknownFailure(err))),
			);
		}

		// Handle plain value
		return new Ok(result);
	}

	mapFailure<F>(_fn: (failure: never) => F): Result<T, F>;
	mapFailure(_handlers: FailureHandlers<never>): Result<T, never>;
	mapFailure(_fnOrHandlers: any): any {
		return this as any;
	}

	// Inspection methods (for side effects)
	inspect(fn: (value: T) => void): Result<T, E> {
		fn(this.value);
		return this;
	}

	inspectFailure(_fn: (failure: never) => void): Result<T, E> {
		return this;
	}

	// Unwrapping methods
	unwrap(): T {
		return this.value;
	}

	unwrapOr<U>(_defaultValue: U): T | U {
		return this.value;
	}

	expect(_message: string): T {
		return this.value;
	}

	// Pattern matching
	match<U>(handlers: { ok: (value: T) => U; failed: (failure: E) => U }): U {
		return handlers.ok(this.value);
	}

	// Type guards
	isOk(): this is Ok<T, E> {
		return true;
	}

	hasFailed(): this is Fail<T, E> {
		return false;
	}

	// Generator support - allows `yield* ok(value)` to unwrap the value
	// deno-lint-ignore require-yield
	*[Symbol.iterator](): Generator<never, T, unknown> {
		return this.value;
	}
}

// ============================================================================
// Fail Class - Represents Failure
// ============================================================================

export class Fail<T, E> {
	readonly _tag = "Fail" as const;

	constructor(readonly failure: E) {}

	// Transformation methods
	map<U>(_fn: (value: never) => U): Result<U, E> {
		return this as any;
	}

	mapFailure<F>(fn: (failure: E) => F): Result<T, F>;
	mapFailure<F>(
		fn: (failure: E) => Promise<F>,
	): AsyncResult<T, F | Failure<"UNKNOWN_FAILURE">>;
	mapFailure<U, F>(fn: (failure: E) => Result<U, F>): Result<T | U, F>;
	mapFailure<U, F>(
		fn: (failure: E) => AsyncResult<U, F>,
	): AsyncResult<T | U, F>;
	mapFailure(handlers: FailureHandlers<E>): any;
	mapFailure(fnOrHandlers: ((failure: E) => any) | FailureHandlers<E>): any {
		// Handle pattern matching with handler map
		if (typeof fnOrHandlers === "object" && fnOrHandlers !== null) {
			const handlers = fnOrHandlers as Record<string, (f: E) => any>;
			const failure = this.failure as any;

			// Check if this failure has a code property and if there's a handler for it
			if (failure && typeof failure === "object" && "code" in failure) {
				const handler = handlers[failure.code];
				if (handler) {
					const result = handler(failure);

					// Apply same logic as function form
					if (result instanceof Ok || result instanceof Fail) {
						return result;
					}
					if (result instanceof AsyncResult) {
						return result;
					}
					if (result instanceof Promise) {
						return new AsyncResult(
							result
								.then((f) => new Fail(f))
								.catch((err) => new Fail(createUnknownFailure(err))),
						);
					}
					return new Fail(result);
				}
			}

			// No handler found, pass through unchanged
			return this;
		}

		// Handle function form
		const fn = fnOrHandlers as (failure: E) => any;
		const result = fn(this.failure);

		// Handle Result types
		if (result instanceof Ok || result instanceof Fail) {
			return result;
		}

		// Handle AsyncResult
		if (result instanceof AsyncResult) {
			return result;
		}

		// Handle Promise
		if (result instanceof Promise) {
			return new AsyncResult(
				result
					.then((f) => new Fail(f))
					.catch((err) => new Fail(createUnknownFailure(err))),
			);
		}

		// Handle plain failure value
		return new Fail(result);
	}

	// Inspection methods
	inspect(_fn: (value: never) => void): Result<T, E> {
		return this;
	}

	inspectFailure(fn: (failure: E) => void): Result<T, E> {
		fn(this.failure);
		return this;
	}

	// Unwrapping methods
	unwrap(): E {
		return this.failure;
	}

	unwrapOr<U>(defaultValue: U): T | U {
		return defaultValue;
	}

	expect(message: string): never {
		throw new globalThis.Error(`${message}: ${JSON.stringify(this.failure)}`);
	}

	// Pattern matching
	match<U>(handlers: { ok: (value: T) => U; failed: (failure: E) => U }): U {
		return handlers.failed(this.failure);
	}

	// Type guards
	isOk(): this is Ok<T, E> {
		return false;
	}

	hasFailed(): this is Fail<T, E> {
		return true;
	}

	// Generator support - allows `yield* fail(...)` to short-circuit
	*[Symbol.iterator](): Generator<Fail<never, E>, T> {
		// @ts-expect-error -- This is structurally equivalent and safe
		yield this;
		// @ts-expect-error -- This is structurally equivalent and safe
		return this;
	}
}

// ============================================================================
// AsyncResult - Wraps Promise<Result<T, E>>
// ============================================================================

/**
 * AsyncResult wraps a Promise<Result<T, E>> and implements PromiseLike
 * Allows chaining with .map/.mapFailure before awaiting
 */
export class AsyncResult<T, E> implements PromiseLike<Result<T, E>> {
	constructor(private promise: Promise<Result<T, E>>) {}

	// PromiseLike implementation - makes it awaitable
	then<TResult1 = Result<T, E>, TResult2 = never>(
		onfulfilled?:
			| ((value: Result<T, E>) => TResult1 | PromiseLike<TResult1>)
			| null,
		onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
	): PromiseLike<TResult1 | TResult2> {
		return this.promise.then(onfulfilled, onrejected);
	}

	// Transformation methods
	map<U, F>(
		fn: (value: T) => U | Promise<U> | Result<U, F> | AsyncResult<U, F>,
	): AsyncResult<U, E | F | Failure<"UNKNOWN_FAILURE">> {
		return new AsyncResult(
			this.promise.then(async (result) => {
				if (!result.isOk()) {
					return result as any;
				}

				const mapped = fn(result.value);

				// Handle Result types
				if (mapped instanceof Ok || mapped instanceof Fail) {
					return mapped as any;
				}

				// Handle AsyncResult
				if (mapped instanceof AsyncResult) {
					return (await mapped) as any;
				}

				// Handle Promise
				if (mapped instanceof Promise) {
					try {
						const value = await mapped;
						return new Ok(value) as any;
					} catch (err) {
						return new Fail(createUnknownFailure(err)) as any;
					}
				}

				// Handle plain value
				return new Ok(mapped) as any;
			}),
		);
	}

	mapFailure<U, F>(
		fn: (failure: E) => F | Promise<F> | Result<U, F> | AsyncResult<U, F>,
	): AsyncResult<T | U, F | Failure<"UNKNOWN_FAILURE">>;
	mapFailure(handlers: FailureHandlers<E>): any;
	mapFailure<U, F>(
		fnOrHandlers:
			| ((failure: E) => F | Promise<F> | Result<U, F> | AsyncResult<U, F>)
			| FailureHandlers<E>,
	): AsyncResult<T | U, F | Failure<"UNKNOWN_FAILURE">> {
		return new AsyncResult(
			this.promise.then(async (result) => {
				if (!result.hasFailed()) {
					return result as any;
				}

				// Handle pattern matching with handler map
				if (
					typeof fnOrHandlers === "object" &&
					fnOrHandlers !== null &&
					typeof fnOrHandlers !== "function"
				) {
					const handlers = fnOrHandlers as Record<string, (f: E) => any>;
					const failure = result.failure as any;

					// Check if this failure has a code property and if there's a handler for it
					if (failure && typeof failure === "object" && "code" in failure) {
						const handler = handlers[failure.code];
						if (handler) {
							const mapped = handler(failure);

							// Apply same logic as function form below
							if (mapped instanceof Ok || mapped instanceof Fail) {
								return mapped as any;
							}
							if (mapped instanceof AsyncResult) {
								return (await mapped) as any;
							}
							if (mapped instanceof Promise) {
								try {
									const failureValue = await mapped;
									return new Fail(failureValue) as any;
								} catch (err) {
									return new Fail(createUnknownFailure(err)) as any;
								}
							}
							return new Fail(mapped) as any;
						}
					}

					// No handler found, pass through unchanged
					return result as any;
				}

				// Handle function form
				const fn = fnOrHandlers as (failure: E) => any;
				const mapped = fn(result.failure);

				// Handle Result types
				if (mapped instanceof Ok || mapped instanceof Fail) {
					return mapped as any;
				}

				// Handle AsyncResult
				if (mapped instanceof AsyncResult) {
					return (await mapped) as any;
				}

				// Handle Promise
				if (mapped instanceof Promise) {
					try {
						const failure = await mapped;
						return new Fail(failure) as any;
					} catch (err) {
						return new Fail(createUnknownFailure(err)) as any;
					}
				}

				// Handle plain failure value
				return new Fail(mapped) as any;
			}),
		);
	}

	// Inspection methods
	inspect(fn: (value: T) => void): AsyncResult<T, E> {
		return new AsyncResult(
			this.promise.then((result) => {
				if (result.isOk()) {
					fn(result.value);
				}
				return result;
			}),
		);
	}

	inspectFailure(fn: (failure: E) => void): AsyncResult<T, E> {
		return new AsyncResult(
			this.promise.then((result) => {
				if (result.hasFailed()) {
					fn(result.failure);
				}
				return result;
			}),
		);
	}

	// Unwrapping methods
	async unwrap(): Promise<T | E> {
		const result = await this.promise;
		return result.unwrap();
	}

	async unwrapOr<U>(defaultValue: U): Promise<T | U> {
		const result = await this.promise;
		return result.unwrapOr(defaultValue);
	}

	async expect(message: string): Promise<T> {
		const result = await this.promise;
		return result.expect(message);
	}

	// Pattern matching
	async match<U>(handlers: {
		ok: (value: T) => U;
		failed: (failure: E) => U;
	}): Promise<U> {
		const result = await this.promise;
		return result.match(handlers);
	}

	// Type guards
	async isOk(): Promise<boolean> {
		const result = await this.promise;
		return result.isOk();
	}

	async hasFailed(): Promise<boolean> {
		const result = await this.promise;
		return result.hasFailed();
	}

	// Generator support - allows `yield* asyncResult` to unwrap when awaited
	*[Symbol.iterator](): Generator<AsyncResult<T, E>, T, unknown> {
		// @ts-expect-error -- The DI system will send the unwrapped value
		return yield this;
	}
}

// ============================================================================
// Factory Functions
// ============================================================================

/**
 * Create a successful Result
 */
export function ok<T>(value: T): Result<T, never> {
	return new Ok(value) as Result<T, never>;
}

/**
 * Create a structured failure
 */
export function failure<Code extends string>(
	code: Code,
	message: string,
	cause?: unknown,
): Failure<Code> {
	return { code, message, cause };
}

/**
 * Create a failed Result
 * Can be curried: fail("CODE") returns a factory function
 */
export function fail<Code extends string>(
	code: Code,
): (message: string, cause?: unknown) => Result<never, Failure<Code>>;
export function fail<Code extends string>(
	code: Code,
	message: string,
	cause?: unknown,
): Result<never, Failure<Code>>;
export function fail<Code extends string>(
	code: Code,
	message?: string,
	cause?: unknown,
): any {
	if (message === undefined) {
		// Return factory function for curried usage
		return (msg: string, c?: unknown) => {
			return new Fail(failure(code, msg, c)) as Result<never, Failure<Code>>;
		};
	}
	return new Fail(failure(code, message, cause)) as Result<
		never,
		Failure<Code>
	>;
}

/**
 * Reusable factory for unknown failures
 */
export const UnknownFailure = fail("UNKNOWN_FAILURE");

// ============================================================================
// Error Conversion Utilities
// ============================================================================

/**
 * Convert unknown error to structured Failure
 */
function createUnknownFailure(err: unknown): Failure<"UNKNOWN_FAILURE"> {
	const message = err instanceof globalThis.Error ? err.message : String(err);
	return failure("UNKNOWN_FAILURE", message, err);
}

/**
 * Convert throwing function or Promise into a Result
 * Catches any errors and converts them to Failure
 */
export function fromThrowable<T>(
	promise: Promise<T>,
): AsyncResult<T, Failure<"UNKNOWN_FAILURE">>;
export function fromThrowable<T, E>(
	promise: Promise<T>,
	failureMapper: (error: unknown) => E,
): AsyncResult<T, E>;
export function fromThrowable<T>(
	fn: () => Promise<T>,
): AsyncResult<T, Failure<"UNKNOWN_FAILURE">>;
export function fromThrowable<T, E>(
	fn: () => Promise<T>,
	failureMapper: (error: unknown) => E,
): AsyncResult<T, E>;
export function fromThrowable<T>(
	fn: () => T,
): Result<T, Failure<"UNKNOWN_FAILURE">>;
export function fromThrowable<T, E>(
	fn: () => T,
	failureMapper: (error: unknown) => E,
): Result<T, E>;
export function fromThrowable<T, E = Failure<"UNKNOWN_FAILURE">>(
	fnOrPromise: (() => T | Promise<T>) | Promise<T>,
	failureMapper: (error: unknown) => E = createUnknownFailure as any,
): Result<T, E> | AsyncResult<T, E> {
	// Handle direct Promise
	if (fnOrPromise instanceof Promise) {
		return new AsyncResult(
			fnOrPromise
				.then((value) => new Ok(value) as Result<T, E>)
				.catch((error) => new Fail(failureMapper(error)) as Result<T, E>),
		);
	}

	// Handle function
	try {
		const result = fnOrPromise();

		// If function returns Promise, wrap in AsyncResult
		if (result instanceof Promise) {
			return new AsyncResult(
				result
					.then((value) => new Ok(value) as Result<T, E>)
					.catch((error) => new Fail(failureMapper(error)) as Result<T, E>),
			);
		}

		// Synchronous success
		return new Ok(result) as Result<T, E>;
	} catch (error) {
		// Synchronous error
		return new Fail(failureMapper(error)) as Result<T, E>;
	}
}

/**
 * Wrap a function to return Results instead of throwing
 */
export function wrapThrowable<Args extends any[], T>(
	fn: (...args: Args) => Promise<T>,
): (...args: Args) => AsyncResult<T, Failure<"UNKNOWN_FAILURE">>;
export function wrapThrowable<Args extends any[], T, E>(
	fn: (...args: Args) => Promise<T>,
	failureMapper: (error: unknown) => E,
): (...args: Args) => AsyncResult<T, E>;
export function wrapThrowable<Args extends any[], T>(
	fn: (...args: Args) => T,
): (...args: Args) => Result<T, Failure<"UNKNOWN_FAILURE">>;
export function wrapThrowable<Args extends any[], T, E>(
	fn: (...args: Args) => T,
	failureMapper: (error: unknown) => E,
): (...args: Args) => Result<T, E>;
export function wrapThrowable<
	Args extends any[],
	T,
	E = Failure<"UNKNOWN_FAILURE">,
>(
	fn: (...args: Args) => T | Promise<T>,
	failureMapper?: (error: unknown) => E,
): (...args: Args) => Result<T, E> | AsyncResult<T, E> {
	return (...args: Args) =>
		fromThrowable(() => fn(...args), failureMapper as any) as
			| Result<T, E>
			| AsyncResult<T, E>;
}

// ============================================================================
// Type Guards
// ============================================================================

/**
 * Check if value is a Fail result
 */
export function hasFailed(value: unknown): value is Fail<unknown, unknown> {
	return (
		value != null &&
		typeof value === "object" &&
		"_tag" in value &&
		value._tag === "Fail"
	);
}

/**
 * Check if value is an Ok result
 */
export function isOk(value: unknown): value is Ok<unknown, unknown> {
	return (
		value != null &&
		typeof value === "object" &&
		"_tag" in value &&
		value._tag === "Ok"
	);
}

/**
 * Check if value is any Result (Ok or Fail)
 */
export function isResult(value: unknown): value is Result<unknown, unknown> {
	return isOk(value) || hasFailed(value);
}
