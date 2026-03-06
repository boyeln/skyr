/**
 * Shared implementation helpers for methods and standalone operators.
 *
 * Both chainable methods (e.g. .map(), .inject()) and standalone operators
 * (for pipe()) need the same transformation logic. This module provides
 * the shared core so behavior stays consistent and bugs only need fixing
 * in one place.
 *
 * @internal
 */

import { Panic } from "../panic.ts";
import { unknownErr } from "./errors.ts";
import { isResult, ok, type Result } from "../result.ts";
import { asyncResult } from "../async_result.ts";
import { createFn } from "../fn/fn.ts";

/**
 * Core map logic: transform an Ok value, handling Result flattening,
 * Promise→AsyncResult conversion, and Panic on sync throw.
 */
export function handleMap(value: any, fn: (value: any) => any): any {
	let mapped: any;
	try {
		mapped = fn(value);
	} catch (cause) {
		throw new Panic(
			"map() callback threw — use fromThrowable() for unsafe code",
			{ cause },
		);
	}
	if (mapped instanceof Promise) {
		return asyncResult(
			mapped
				.then((v: any) => isResult(v) ? v : ok(v))
				.catch((cause: any) => unknownErr("Promise rejected", cause)),
		);
	}
	if (isResult(mapped)) return mapped;
	return ok(mapped);
}

/**
 * Core mapErr logic: transform an Err, supporting both function and handler
 * object forms. Plain values are treated as recovery (wrapped in ok()).
 */
export function handleMapErr(
	errResult: Result<any, any>,
	fnOrHandlers: any,
): any {
	let mapped: any;
	try {
		if (typeof fnOrHandlers === "function") {
			mapped = fnOrHandlers(errResult);
		} else {
			// Handler object
			const handler = fnOrHandlers[(errResult as any).code];
			if (handler) {
				mapped = handler(errResult);
			} else {
				return errResult; // Unhandled code passes through
			}
		}
	} catch (cause) {
		throw new Panic(
			"mapErr() callback threw — use fromThrowable() for unsafe code",
			{ cause },
		);
	}
	if (mapped instanceof Promise) {
		return asyncResult(
			mapped
				.then((v: any) => isResult(v) ? v : ok(v))
				.catch((cause: any) => unknownErr("Promise rejected", cause)),
		);
	}
	if (isResult(mapped)) return mapped;
	return ok(mapped); // Plain value = recovery
}

/**
 * Core match logic: call the appropriate handler based on Result tag.
 * Throws Panic on sync throw.
 */
export function handleMatch(
	result: Result<any, any>,
	handlers: { ok: (value: any) => any; err: (e: any) => any },
): any {
	try {
		if (result._tag === "Ok") {
			return handlers.ok((result as any).value);
		} else {
			return handlers.err(result);
		}
	} catch (cause) {
		throw new Panic(
			"match() callback threw — use fromThrowable() for unsafe code",
			{ cause },
		);
	}
}

/**
 * Core inspect logic: run a side effect on a value, swallowing errors.
 * Returns the original Result unchanged. If callback returns a Promise,
 * wraps in AsyncResult that resolves to the original Result.
 */
export function handleInspect(
	result: Result<any, any>,
	fn: (value: any) => any,
): any {
	try {
		const effect = fn(result._tag === "Ok" ? (result as any).value : result);
		if (effect instanceof Promise) {
			return asyncResult(
				effect.then(() => result, () => result) as Promise<any>,
			);
		}
	} catch {
		// Swallow — side effects never break the pipeline
	}
	return result;
}

/**
 * Core inject logic: merge dependency implementations into an Fn,
 * returning a new Fn with those dependencies satisfied.
 */
export function injectDeps(fn: any, impls: readonly any[]): any {
	const newInjectedDeps = { ...fn._fn._injectedDeps };
	for (const impl of impls) {
		newInjectedDeps[impl.key] = impl.value;
	}
	return createFn(fn._fn._generator, newInjectedDeps);
}
