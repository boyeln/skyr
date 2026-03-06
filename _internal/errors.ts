import { err, type Result } from "../result.ts";

export type UNKNOWN_ERR = "UNKNOWN_ERR";

export const unknownErr = (
	message: string,
	cause?: unknown,
): Result<never, UNKNOWN_ERR> => err("UNKNOWN_ERR", message, cause);
