export type { Fn } from "./di.js";
export { fn } from "./di.js";
export type { AsyncResult, Fail, Failure, Ok, Result } from "./result.js";
export {
	fail,
	fromThrowable,
	isResult,
	ok,
	UnknownFailure,
	wrapThrowable,
} from "./result.js";
