# skyr

Type-safe error handling for TypeScript, inspired by Rust's `Result` type.
Method chaining, functional composition with `pipe()`, automatic async
propagation, and optional dependency injection.

## Installation

```bash
# Deno
deno add jsr:@thefridge/skyr
# Bun
bunx jsr add @thefridge/skyr
# pnpm
pnpm add jsr:@thefridge/skyr
# npm
npx jsr add @thefridge/skyr
# Yarn
yarn add jsr:@thefridge/skyr
```

## Core Concepts

### Results Instead of Exceptions

A `Result<T, E>` is either **ok** (containing a value of type `T`) or an **err**
(containing a structured error with a typed `code`, a `message`, and an optional
`cause`). This replaces `try/catch` with values you can inspect, transform, and
compose.

```typescript
import * as R from "@thefridge/skyr";

function validateEmail(input: string) {
	if (!input.includes("@")) {
		return R.err("INVALID_EMAIL", "Email must contain @");
	}
	return R.ok(input);
}

const { ok: email, err } = validateEmail("user@example.com");

if (err) {
	console.log(err.code); // "INVALID_EMAIL"
	console.log(err.message); // "Email must contain @"
} else {
	console.log(email); // "user@example.com"
}
```

Error codes are string literals tracked by the type system. TypeScript knows
exactly which errors a function can produce and autocompletes them for you.

Results are plain objects you can destructure. Rename `ok` to something
meaningful at the call site:

- `ok(value)` creates `{ ok: value, err: null, ... }`
- `err(code, message, cause?)` creates
  `{ ok: null, err: { code, message, cause }, ... }`

The `cause` field is `undefined` when not provided.

Every Result comes with methods for transforming and inspecting it. Type `.` in
your IDE and see what's available.

### Destructuring

Results support destructuring with TypeScript's narrowing. Rename `ok` to give
the value a descriptive name:

```typescript
const { ok: email, err } = validateEmail("user@example.com");

if (err) {
	// err: { code: "INVALID_EMAIL"; message: string; cause?: unknown }
	// email: null
} else {
	// email: string
	// err: null
}
```

Checking `err` is the recommended pattern because it's safe for all value types.
The `err` property is either `null` (falsy) or an object (always truthy), so
there are no edge cases. Checking `ok` works for non-nullable, non-falsy types
but can be unreliable if `T` includes `null`, `0`, `""`, or `false`.

### Letting TypeScript Infer Result Types

There's a subtlety with the example above. Without an explicit return type
annotation, TypeScript infers the return type as
`Result<string, never> | Result<never, "INVALID_EMAIL">`, a union of two
separate Result types rather than a single unified
`Result<string, "INVALID_EMAIL">`.

You could fix this by adding a return type annotation, but it's generally safer
to let TypeScript infer return types whenever possible. Annotations can drift
out of sync with the implementation and mask bugs.

Instead, wrap the function with `fn()`:

```typescript
import * as R from "@thefridge/skyr";

const validateEmail = R.fn((email: string) => {
	if (!email.includes("@")) {
		return R.err("INVALID_EMAIL", "Email must contain @");
	}
	return R.ok(email);
});
// (email: string) => Result<string, "INVALID_EMAIL">
```

`fn()` collapses all the Result branches into a single, clean `Result<T, E>`
type. No annotation needed; the ok value type and all possible error codes are
inferred automatically.

This is the simplest use of `fn()`. It also supports
[generator functions for railway-style programming and dependency injection](#dependency-injection-with-fn),
covered later.

### Type Guards

Results have `.isOk()` and `.isErr()` methods that act as type guards:

```typescript
const result = validateEmail(input);

if (result.isOk()) {
	result.ok; // string
} else {
	result.err.code; // "INVALID_EMAIL"
	result.err.message; // string
	result.err.cause; // unknown | undefined
}
```

Standalone functions `isOk()`, `isErr()`, and `isResult()` are also available:

```typescript
R.isOk(result); // narrows to Ok<T>
R.isErr(result); // narrows to Err<E>
R.isResult(value); // checks if any unknown value is a Result
```

`isResult(value)` checks whether any unknown value is a Result. A value is
considered a Result if it's a non-null object with `_tag` equal to `"Ok"` or
`"Err"`.

### Method Chaining

Every Result has methods for transformation, error handling, and value
extraction. Chain them directly, no imports or special syntax needed:

```typescript
const message = validateEmail("User@Example.com")
	.map((email) => email.toLowerCase().trim())
	.map((email) => `Welcome, ${email}!`)
	.match({
		ok: (greeting) => greeting,
		err: (e) => `Error: ${e.message}`,
	});

console.log(message); // "Welcome, user@example.com!"
```

Methods skip over errors automatically. If `validateEmail` returns an error, the
`.map()` calls are never executed and the error flows straight to `.match()`.

### Async Propagation

When any step returns a `Promise`, the result becomes an `AsyncResult`, a
wrapper around `Promise<Result>` with the same methods. This is called **async
poison**: once async, always async (until you `await`).

```typescript
const result = validateEmail("user@example.com") // Result<string, ...>
	.map((email) => fetchUser(email)) // returns Promise → AsyncResult
	.map((user) => user.name); // still async, still chainable
// Type: AsyncResult<string, ...>

const finalResult = await result;
// Type: Result<string, ...> (back to sync)
```

`AsyncResult` is `PromiseLike`, so you can `await` it to get back a sync
`Result` with all its methods.

### Functional Composition with `pipe()`

For those who prefer a functional style, `pipe()` threads a value through a
sequence of functions left-to-right. All methods are also available as
standalone operators:

```typescript
import * as R from "@thefridge/skyr";

const message = R.pipe(
	validateEmail("User@Example.com"),
	R.map((email) => email.toLowerCase().trim()),
	R.map((email) => `Welcome, ${email}!`),
	R.match({
		ok: (greeting) => greeting,
		err: (e) => `Error: ${e.message}`,
	}),
);
```

Standalone operators accept both `Result` and `Promise<Result>` as input and
propagate async automatically and work interchangeably with both styles.

### Panics: Unexpected Throws

If your code calls something that might throw or reject, or you're unsure
whether it could, wrap it with `fromThrowable()` to convert it into a Result
safely. This is the recommended approach for any code you don't fully control.

If a callback passed to `map`, `mapErr`, or `match` throws synchronously without
being wrapped, a `Panic` is thrown, halting execution immediately unless caught:

```typescript
R.ok(42).map(() => {
	throw new Error("oops");
});
// Throws: Panic("map() callback threw — use fromThrowable() for unsafe code")
//   cause: Error("oops")
```

`Panic` extends `Error`, so you get a full stack trace. Catch it at the top
level with `instanceof R.Panic` if needed.

**Async functions** (Promises) returned from callbacks are automatically wrapped
with `fromThrowable` implicitly, so rejections become `UNKNOWN_ERR` results
instead of Panics. However, if you use multiple async functions, all their
errors will share the same `UNKNOWN_ERR` code, making it impossible to
distinguish between them. Wrapping each one with `fromThrowable` and a dedicated
error code is the recommended approach.

## Methods

Every `Result` has the following methods. `AsyncResult` has the same methods,
but they always return `AsyncResult` (or `Promise` for terminal operations).

### `.map(fn)`

Transforms the ok value. Skips if the result is an error.

```typescript
R.ok(5)
	.map((n) => n * 2)
	.map((n) => `Value: ${n}`);
// Result<string, never> → Ok("Value: 10")
```

If `fn` returns a `Result`, it's automatically flattened (no nested Results). If
it returns a `Promise`, the result becomes an `AsyncResult`. The Promise is
automatically handled like `fromThrowable`: resolved values become ok, rejected
Promises become `UNKNOWN_ERR`.

### `.mapErr(fn | handlers)`

Transforms or recovers from errors. Has two forms:

**Function form** - transform all errors:

```typescript
R.err("NOT_FOUND", "User not found")
	.mapErr((e) => R.err("DEFAULT_ERROR", e.message));
// Result<never, "DEFAULT_ERROR">
```

**Handler object** - handle specific error codes with autocomplete:

```typescript
type AppError = "NOT_FOUND" | "TIMEOUT" | "AUTH_FAILED";

declare function fetchUser(id: string): R.Result<User, AppError>;

const result = fetchUser("123").mapErr({
	NOT_FOUND: () => R.ok(guestUser), // recover with ok()
	TIMEOUT: () => defaultUser, // recover with plain value (same as ok())
	// AUTH_FAILED not listed → passes through unchanged
});
// Result<User, "AUTH_FAILED">
```

Handlers get autocomplete for the available error codes. Each handler receives a
`ResultErr<"CODE">` object (with `code`, `message`, and `cause`) and can:

- Return `ok(value)` or a **plain value** to recover (both treated as success)
- Return `err(code, message)` to transform the error

Unhandled codes pass through unchanged.

### `.match({ ok, err })`

Pattern match both cases and leave the Result world:

```typescript
const label = R.ok(42).match({
	ok: (n) => `Got ${n}`,
	err: (e) => `Error: ${e.code}`,
});
// "Got 42"
```

The `ok` handler receives the unwrapped value `T`. The `err` handler receives a
`ResultErr<E>` object (with `code`, `message`, and `cause`).

If either handler returns a `Result`, the output is a `Result`. Otherwise it's a
plain value. On `AsyncResult`, `.match()` returns a `Promise`.

### `.inspect(fn)` / `.inspectErr(fn)`

Run side effects (logging, metrics) without changing the Result:

```typescript
validateEmail("user@example.com")
	.inspect((email) => console.log("Valid:", email))
	.inspectErr((e) => console.error("Failed:", e.code))
	.map((email) => email.toLowerCase());
```

The callback's return value is ignored; the original Result is always returned
unchanged. If the callback throws or the returned Promise rejects, the error is
silently swallowed and the original Result passes through. Side effects should
never break the pipeline.

### `.unwrap()` / `.unwrapOr(default)`

Extract values from Results:

```typescript
// unwrap() extracts the ok value, or returns undefined on error
const value = R.ok(42).map((n) => n * 2).unwrap();
// number | undefined → 84

const missing = R.err("NOT_FOUND", "gone").unwrap();
// undefined

// Works great with optional chaining
fetchUser("123").unwrap()?.name;

// Or non-null assertion when you know it's Ok
R.ok(42).unwrap()!;

// unwrapOr() extracts the ok value, or returns the default on error
const fallback = R.err("ERROR", "Something went wrong").unwrapOr(0);
// 0
```

On `AsyncResult`, `.unwrap()` returns `Promise<T | undefined>` and
`.unwrapOr(default)` returns `Promise<T | D>`.

## Converting Throwing Code

### `fromThrowable(fn | promise, mapper?)`

Convert code that throws (or Promises that reject) into Results:

```typescript
// Wrap a function call
const result = R.fromThrowable(
	() => JSON.parse('{"name": "Alice"}'),
	(err) => R.err("PARSE_ERROR", "Invalid JSON", err),
);
// Result<any, "PARSE_ERROR">

// Wrap a Promise
const response = await R.fromThrowable(
	fetch("https://api.example.com"),
	(err) => R.err("FETCH_ERROR", "Request failed", err),
);
// Result<Response, "FETCH_ERROR">
```

Without a mapper, errors become `"UNKNOWN_ERR"`.

The function overload calls the function synchronously and catches any thrown
error. If you have a Promise, use the Promise overload directly.

### `wrapThrowable(fn, mapper?)`

Like `fromThrowable`, but returns a reusable wrapper function:

```typescript
const safeParse = R.wrapThrowable(
	(str: string) => JSON.parse(str),
	(err) => R.err("PARSE_ERROR", "Invalid JSON", err),
);

safeParse('{"valid": true}'); // Ok({valid: true})
safeParse("nope"); // Err("PARSE_ERROR")
```

## Dependency Injection with `fn()`

`fn()` is a function builder. You pass it a generator and get back a function
you can call just like any other. The difference is that inside the generator
you get two superpowers:

1. **Dependency requests** - `yield* R.use(Dep)` gives you an implementation of
   a dependency without worrying about how to acquire it. Think of it like a
   function parameter, except you don't have to pass it in at the call site.
   When one `fn()` function calls another, unmet dependencies propagate up
   automatically, no prop drilling required. You can also choose to supply some
   dependencies but not all, and the rest keep propagating.

2. **Result unwrapping** - `yield* someResult` extracts the success value from
   any `Result` or `AsyncResult`. If it's an error, the function short-circuits
   (early return) and the error propagates to the caller, just like the
   non-generator version (`fn(() => ...)`).

The return type of an `fn()` function is `Fn<Args, Success, Errors, Deps>`:

- **Args** - the parameter list of your generator (e.g. `(email: string)` →
  `[string]`)
- **Success** - the unwrapped success type
- **Errors** - a union of all error codes, accumulated from every `yield*` call
- **Deps** - a union of all unmet dependencies, accumulated from every
  `yield* R.use()` call

The `Fn` you get back is only callable once all dependencies are injected (via
`.inject()`), at which point the `Deps` part of the type becomes `never`.

### Declaring Dependencies

```typescript
const Database = R.dependency<{
	findUser: (email: string) => Promise<User | null>;
}>()("database");

const Logger = R.dependency<{
	info: (msg: string) => void;
}>()("logger");
```

> **Convention:** Dependencies and functions that still need injection use
> PascalCase. After injection, use camelCase to signal "ready to call."

### Creating Functions

```typescript
const GetUser = R.fn(function* (email: string) {
	const db = yield* R.use(Database);
	const logger = yield* R.use(Logger);

	logger.info(`Looking up ${email}`);

	const validEmail = yield* validateEmail(email);
	const user = yield* R.fromThrowable(db.findUser(validEmail));

	if (!user) return R.err("NOT_FOUND", "User not found");

	return R.ok(user);
});
// Type: Fn<[string], User, "INVALID_EMAIL" | "NOT_FOUND" | "UNKNOWN_ERR", Database | Logger>
```

Key points:

- `yield* R.use(Database)` - acquires a dependency from the DI context
- `yield* validateEmail(email)` - unwraps a Result; short-circuits on failure
- `yield* R.fromThrowable(...)` - catches throws/rejections, converting them to
  a Result, then unwraps it
- Error types accumulate automatically across all `yield*` calls
- Dependency types accumulate automatically across all `yield* R.use()` calls

### Injecting Dependencies

Use `.inject()` to provide implementations:

```typescript
const getUser = GetUser.inject(
	Database.impl({ findUser: async (email) => db.query(email) }),
	Logger.impl({ info: console.log }),
);

// All dependencies satisfied, now callable
const result = await getUser("user@example.com");
```

If you try to call a function before all dependencies are injected, TypeScript
shows an error:

```
ERROR - Missing dependencies: database, logger. Use inject() first.
```

At runtime, calling with missing dependencies throws an `Error` with a message
like `Missing dependency: "database". Use inject() to provide this dependency.`

Injection can be done incrementally:

```typescript
const withDb = GetUser.inject(Database.impl({/* ... */}));
// Still needs Logger

const getUser = withDb.inject(Logger.impl({/* ... */}));
// Fully callable
```

The standalone `inject()` operator works the same way inside `pipe()`:

```typescript
const getUser = R.pipe(
	GetUser,
	R.inject(
		Database.impl({ findUser: async (email) => db.query(email) }),
		Logger.impl({ info: console.log }),
	),
);
```

### Nested Functions

When one `fn()` uses another via `yield* R.use(ChildFn)`, the child's
dependencies are inherited by the parent:

```typescript
const CheckPermissions = R.fn(function* (userId: string) {
	const db = yield* R.use(Database);
	// ...
	return R.ok(canAccess);
});

const LoginUser = R.fn(function* (email: string, password: string) {
	const logger = yield* R.use(Logger);

	const user = yield* getUser(email);

	const checkPerms = yield* R.use(CheckPermissions);
	const canAccess = yield* checkPerms(user.id);

	return R.ok(user);
});
// Dependencies: Logger | Database (Database inherited from CheckPermissions)
```

The two-step pattern, `yield* R.use(Fn)` then `yield* callable(args)`, separates
dependency resolution from execution, keeping the control flow explicit.

## API Reference

### Result Structure

| Variant | Shape                                                      |
| ------- | ---------------------------------------------------------- |
| Ok      | `{ ok: T, err: null, _tag: "Ok" }`                         |
| Err     | `{ ok: null, err: { code, message, cause }, _tag: "Err" }` |

Destructure and check `err` to narrow:

```typescript
const { ok: value, err } = result;
if (err) { /* err: ResultErr<E>, value: null */ }
else { /* value: T, err: null */ }
```

### Constructors

| Function                     | Description                       |
| ---------------------------- | --------------------------------- |
| `ok(value)`                  | Create an Ok result with methods  |
| `err(code, message, cause?)` | Create an Err result with methods |

### Type Guards

| Function / Method | Description                                    |
| ----------------- | ---------------------------------------------- |
| `.isOk()`         | Narrow to `Ok<T>` (method)                     |
| `.isErr()`        | Narrow to `Err<E>` (method)                    |
| `isOk(result)`    | Narrow to `Ok<T>` (standalone)                 |
| `isErr(result)`   | Narrow to `Err<E>` (standalone)                |
| `isResult(value)` | Check if value has `_tag` of `"Ok"` or `"Err"` |

### Methods on Result

| Method                       | Description                                       |
| ---------------------------- | ------------------------------------------------- |
| `.map(fn)`                   | Transform ok value; Panics on sync throw          |
| `.mapErr(fn)`                | Transform error; plain values treated as recovery |
| `.mapErr({ CODE: handler })` | Handle specific error codes; Panics on sync throw |
| `.match({ ok, err })`        | Pattern match both cases; Panics on sync throw    |
| `.inspect(fn)`               | Side effect on ok; errors silently swallowed      |
| `.inspectErr(fn)`            | Side effect on error; errors silently swallowed   |
| `.unwrap()`                  | Extract ok value or return `undefined`            |
| `.unwrapOr(default)`         | Extract ok value or return default                |

### AsyncResult

`AsyncResult<T, E>` wraps a `Promise<Result<T, E>>` and exposes the same methods
as `Result`. All methods return `AsyncResult` (async poison), except terminal
operations (`.match()`, `.unwrap()`, `.unwrapOr()`) which return `Promise`.
`AsyncResult` is `PromiseLike`; `await` it to get a sync `Result`.

### Standalone Operators (for `pipe()`)

| Operator                    | Description                                       |
| --------------------------- | ------------------------------------------------- |
| `map(fn)`                   | Transform ok value; Panics on sync throw          |
| `mapErr(fn)`                | Transform error; plain values treated as recovery |
| `mapErr({ CODE: handler })` | Handle specific error codes; Panics on sync throw |
| `match({ ok, err })`        | Pattern match both cases; Panics on sync throw    |
| `inspect(fn)`               | Side effect on ok; errors silently swallowed      |
| `inspectErr(fn)`            | Side effect on error; errors silently swallowed   |
| `unwrap`                    | Extract ok value or return `undefined`            |
| `unwrapOr(default)`         | Extract ok value or return default                |

### Converters

| Function                          | Description                         |
| --------------------------------- | ----------------------------------- |
| `fromThrowable(fn, mapper?)`      | Convert throwing function to Result |
| `fromThrowable(promise, mapper?)` | Convert Promise to async Result     |
| `wrapThrowable(fn, mapper?)`      | Wrap function to return Results     |

### Errors

| Type    | Description                                                 |
| ------- | ----------------------------------------------------------- |
| `Panic` | Thrown on sync throw in operator callbacks; extends `Error` |

### Types

| Type                | Description                                     |
| ------------------- | ----------------------------------------------- |
| `Result<T, E>`      | Ok or Err with chainable methods                |
| `Ok<T>`             | `{ ok: T, err: null, _tag: "Ok" }`              |
| `Err<E>`            | `{ ok: null, err: ResultErr<E>, _tag: "Err" }`  |
| `ResultErr<E>`      | `{ code: E, message: string, cause?: unknown }` |
| `AsyncResult<T, E>` | Promise-wrapped Result with chainable methods   |

### Dependency Injection

| Function               | Description                                   |
| ---------------------- | --------------------------------------------- |
| `dependency<T>()(key)` | Declare a dependency type                     |
| `fn(generator)`        | Create function with DI and Result unwrapping |
| `fn(func)`             | Unify Result return type                      |
| `use(dep)`             | Acquire dependency inside a generator         |
| `use(Fn)`              | Get contextualized callable for nested Fn     |
| `.inject(...impls)`    | Provide dependency implementations (method)   |
| `inject(...impls)`     | Provide dependency implementations (operator) |

## License

MIT
