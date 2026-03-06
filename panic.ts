/**
 * Thrown when an operator callback (`map`, `mapErr`, `match`) throws synchronously.
 * This signals a programmer error (a bug), not a domain error.
 *
 * Extends `Error` — catch with `instanceof R.Panic` if needed. The original
 * error is available as `cause`. Promise rejections are different: they become
 * `UNKNOWN_ERR` results, not Panics.
 *
 * If your callback calls code that might throw, wrap it with `fromThrowable()`.
 */
export class Panic extends Error {
	override readonly name = "Panic";
}
