# skyr

> Skyr is a thick, protein-rich, and nutritious traditional Icelandic dairy
> product.

**skyr** is a lightweight TypeScript library for functional error handling with async support and optional dependency injection.

## Installation

```bash
npm install skyr
pnpm install skyr
deno add npm:skyr
bun add skyr
```

## Usage

### Basic Results

A `Result` can either be **ok** or it can **fail**. When ok, the result contains
a value of whatever type you need. When failed, it contains a `Failure` - a
structured error with a `code`, `message`, and optional `cause` for debugging.

```typescript
import { fail, ok } from "skyr";

type User = { id: string; email: string; passwordHash: string };

// Simple validation
function validateEmail(email: string) {
  if (!email.includes("@")) {
    return fail("INVALID_EMAIL", "Email must contain @");
  }
  return ok(email);
} // => Result<string, Failure<"INVALID_EMAIL">>

// Check the result
const result = validateEmail("user@example.com");

if (result.isOk()) {
  console.log("Valid email:", result.unwrap());
} else {
  console.log("Error:", result.unwrap().message);
}
```

Use `.isOk()` and `.hasFailed()` to check which variant you have, then
`.unwrap()` to extract the value or the failure.

### Transforming Results

Transform ok values with `.map()`, which automatically skips if the result has
failed.

```typescript
function normalizeEmail(email: string) {
  return email.toLowerCase().trim();
}

const result = validateEmail("User@Example.com")
  .map(normalizeEmail)
  .map((email) => `Welcome, ${email}!`); // Result<string, Failure<"INVALID_EMAIL">>

// Pattern matching handles both cases
const message = result.match({
  ok: (greeting) => greeting,
  failed: (error) => `Error: ${error.message}`,
});

console.log(message);
```

### Handling Specific Errors

Use `.mapFailure()` with an object to handle specific error codes—perfect for
recovery or transforming specific failures while letting others pass through.

```typescript
type AppError =
  | Failure<"NOT_FOUND">
  | Failure<"TIMEOUT">
  | Failure<"AUTH_FAILED">;

declare function fetchUser(id: string): Result<User, AppError>;

const result = fetchUser("123").mapFailure({
  // TypeScript autocompletes available codes: "NOT_FOUND", "TIMEOUT", "AUTH_FAILED"
  "NOT_FOUND": () => ok(guestUser),                    // Recovery
  "TIMEOUT": (err) => fail("RETRY")(err.message),      // Transform
  // AUTH_FAILED not handled - passes through unchanged
});
// Result<User | GuestUser, Failure<"RETRY"> | Failure<"AUTH_FAILED">>
```

Each handler:
- Gets autocomplete for available error codes
- Receives the narrowed `Failure<"CODE">` type
- Can return `ok(value)` for recovery or `fail(code)(message)` to transform
- Unhandled codes automatically pass through

This works with async results too:

```typescript
const result = await fetchUserAsync("123").mapFailure({
  "NOT_FOUND": () => ok(guestUser),
  "TIMEOUT": () => fromThrowable(retryFetch("123")),
});
```

### Async Operations

When you work with Promises, skyr automatically returns an `AsyncResult` - and
it stays async until you await it.

```typescript
import { wrapThrowable } from "skyr";

// Simulate database lookup (might throw or reject)
async function findUserInDb(email: string) {
  const user = await db.query("SELECT * FROM users WHERE email = ?", [email]);
  if (!user) throw new Error("User not found");
  return user;
}

// Wrap throwing async function to return Results
const findUser = wrapThrowable(
  findUserInDb,
  (cause) => ({
    code: "USER_NOT_FOUND",
    message: "Unable to locate user",
    cause,
  }),
); // => (email: string) => AsyncResult<User, Failure<"USER_NOT_FOUND">>

// Chain async operations
const userResult = validateEmail("user@example.com")
  .map(normalizeEmail)
  .map((email) => findUser(email)); // AsyncResult<User, Failure<"INVALID_EMAIL"> | Failure<"USER_NOT_FOUND">>

// Await to get the Result
const user = await userResult.unwrap();
```

`wrapThrowable()` wraps a function to catch any errors and convert them to
Failures. Once a Result becomes async, it stays async—this is called "async
poison".

### Better Type Inference with `fn()`

The `fn()` helper provides cleaner type inference for functions.

```typescript
import { fn } from "skyr";

const validatePassword = fn((password: string) => {
  if (password.length < 8) {
    return fail("WEAK_PASSWORD", "Password must be at least 8 characters");
  }
  return ok(password);
}); // (password: string) => Result<string, Failure<"WEAK_PASSWORD">>

const result = validatePassword("secret"); // Result<string, Failure<"WEAK_PASSWORD">>
```

### Generator Syntax

Generators let you write error-handling code that reads like regular code,
automatically short-circuiting on failures.

```typescript
const checkPassword = fn((password: string, hash: string) => {
  const isValid = password === hash; // Simplified
  if (!isValid) {
    return fail("INVALID_PASSWORD", "Password does not match");
  }
  return ok(true);
});

// Using generators with yield*
const loginUser = fn(function* (email: string, password: string) {
  // yield* unwraps ok values or short-circuits on fail
  const validatedEmail = yield* validateEmail(email);
  const normalizedEmail = normalizeEmail(validatedEmail);

  // Async works seamlessly
  const user = yield* findUser(normalizedEmail);

  // If this fails, the whole function returns the failure
  yield* checkPassword(password, user.passwordHash);

  return ok(user);
}); // Fn with dependencies that returns Result<User, Failure<"INVALID_EMAIL"> | ...>

const result = await loginUser("user@example.com", "secret123");
// Result<User, Failure<"INVALID_EMAIL"> | Failure<"USER_NOT_FOUND"> | Failure<"INVALID_PASSWORD">>

if (result.isOk()) {
  console.log("Logged in:", result.unwrap());
} else {
  console.log("Login failed:", result.unwrap().message);
}
```

With `yield*`, you unwrap ok values automatically. If any operation fails, the
entire function short-circuits and returns that failure—no nested `if`
statements needed.

### Composing Functions

Yield other Result-returning functions and their errors propagate automatically.

```typescript
const createSession = fn(function* (user: User) {
  const sessionId = crypto.randomUUID();
  return ok({ sessionId, userId: user.id });
});

const loginUser = fn(function* (email: string, password: string) {
  const validatedEmail = yield* validateEmail(email);
  const normalizedEmail = yield* ok(normalizeEmail(validatedEmail));
  const user = yield* findUser(normalizedEmail);

  yield* checkPassword(password, user.passwordHash);
  const session = yield* createSession(user);

  return ok({ user, session });
}); // All error types collected: Failure<"INVALID_EMAIL"> | Failure<"USER_NOT_FOUND"> | Failure<"INVALID_PASSWORD">
```

### Dependency Injection

Declare dependencies without implementing them yet—write complete business logic
first.

```typescript
// Declare dependencies (just the types!)
const Database = fn.dependency<{
  findUser: (email: string) => Promise<User | null>;
  createSession: (userId: string) => Promise<{ sessionId: string }>;
}>()("database");

const Logger = fn.dependency<{
  info: (message: string) => void;
  error: (message: string, error: unknown) => void;
}>()("logger");

// Use dependencies in your code
const loginUser = fn(function* (email: string, password: string) {
  // Get dependencies with yield* fn.require()
  const db = yield* fn.require(Database);
  const logger = yield* fn.require(Logger);

  logger.info(`Login attempt for ${email}`);

  const validatedEmail = yield* validateEmail(email);
  const user = yield* fromThrowable(() => db.findUser(validatedEmail));

  if (!user) {
    logger.error("User not found", { email });
    return fail("USER_NOT_FOUND", "No user found");
  }

  yield* checkPassword(password, user.passwordHash);

  const session = yield* fromThrowable(() => db.createSession(user.id));

  logger.info(`User ${user.id} logged in`);

  return ok({ user, session });
}); // Note: loginUser requires Database and Logger dependencies
```

The code is complete and type-safe, but we haven't implemented `Database` or
`Logger` yet.

### Type-Safe Dependency Tracking

TypeScript tracks which dependencies are required and prevents calling functions
until all are provided.

```typescript
// Compiler error: missing dependencies
const result = loginUser("user@example.com", "password");
//            ^^^^^^^^^ Type error!

// Must inject dependencies first
const runLogin = loginUser
  .inject(
    Database.impl({
      findUser: async (email) => {/* real implementation */},
      createSession: async (userId) => {/* real implementation */},
    }),
    Logger.impl({
      info: (msg) => console.log(msg),
      error: (msg, err) => console.error(msg, err),
    }),
  ); // runLogin now requires no dependencies

// Now callable
const result = await runLogin("user@example.com", "password");
```

Partial injection works too:

```typescript
const partialLogin = loginUser.inject(
  Database.impl({/* ... */}),
); // partialLogin still requires: Logger

const fullLogin = partialLogin.inject(
  Logger.impl({/* ... */}),
); // fullLogin requires: (none)

await fullLogin("user@example.com", "password"); // ✓
```

### Different Implementations

Swap implementations for testing, development, and production.

```typescript
// Production
const productionDb = Database.impl({
  findUser: async (email) => {
    const result = await pool.query("SELECT * FROM users WHERE email = $1", [
      email,
    ]);
    return result.rows[0] || null;
  },
  createSession: async (userId) => {
    const sessionId = crypto.randomUUID();
    await pool.query("INSERT INTO sessions (id, user_id) VALUES ($1, $2)", [
      sessionId,
      userId,
    ]);
    return { sessionId };
  },
});

const productionLogger = Logger.impl({
  info: (msg) => winston.info(msg),
  error: (msg, err) => winston.error(msg, { error: err }),
});

// Testing (mocks)
const testDb = Database.impl({
  findUser: async (email) => {
    if (email === "test@example.com") {
      return { id: "test-123", email, passwordHash: "hashed" };
    }
    return null;
  },
  createSession: async () => ({ sessionId: "test-session" }),
});

const testLogger = Logger.impl({
  info: () => {}, // Silent in tests
  error: () => {},
});

// Use in production
const prodLogin = loginUser.inject(productionDb, productionLogger);

// Use in tests
const testLogin = loginUser.inject(testDb, testLogger);

// Same code, different implementations
```

### Nested Dependencies

Functions can call other functions with dependencies, and those dependencies
propagate automatically.

```typescript
const RateLimiter = fn.dependency<{
  checkLimit: (email: string) => Promise<boolean>;
}>()("rateLimiter");

// This function has its own dependency
const checkRateLimit = fn(function* (email: string) {
  const limiter = yield* fn.require(RateLimiter);
  const allowed = yield* fromThrowable(() => limiter.checkLimit(email));

  if (!allowed) {
    return fail("RATE_LIMITED", "Too many login attempts");
  }

  return ok(true);
}); // Requires: RateLimiter

// Call functions with dependencies using .yield()
const loginUser = fn(function* (email: string, password: string) {
  const db = yield* fn.require(Database);
  const logger = yield* fn.require(Logger);

  yield* checkRateLimit.yield(email);

  // ... rest of login logic

  return ok({ user, session });
}); // Requires: Database, Logger, RateLimiter (inherited from checkRateLimit)

const runLogin = loginUser.inject(
  Database.impl({/* ... */}),
  Logger.impl({/* ... */}),
  RateLimiter.impl({/* ... */}), // Required!
);
```

Use `.yield()` to call functions with dependencies. Dependencies automatically
propagate to parent functions and are tracked in the type system.

## Testing

Inject mocks without any mocking libraries.

```typescript
import { test, expect } from "bun:test";

test("loginUser - successful login", async () => {
  const mockDb = Database.impl({
    findUser: async () => ({
      id: "123",
      email: "test@example.com",
      passwordHash: "hash",
    }),
    createSession: async () => ({ sessionId: "session-123" }),
  });

  const mockLogger = Logger.impl({ info: () => {}, error: () => {} });

  const login = loginUser.inject(mockDb, mockLogger);
  const result = await login("test@example.com", "password");

  expect(result.isOk()).toBe(true);
});

test("loginUser - user not found", async () => {
  const mockDb = Database.impl({
    findUser: async () => null,
    createSession: async () => ({ sessionId: "session-123" }),
  });

  const mockLogger = Logger.impl({ info: () => {}, error: () => {} });

  const login = loginUser.inject(mockDb, mockLogger);
  const result = await login("test@example.com", "password");

  expect(result.hasFailed()).toBe(true);
  if (result.hasFailed()) {
    expect(result.unwrap().code).toBe("USER_NOT_FOUND");
  }
});
```

## API Reference

### Core Functions

```typescript
ok(value)                    // Create ok result
fail(code, message, cause?)  // Create failed result
fromThrowable(fn, mapper?)   // Convert throwing code to Result
wrapThrowable(fn, mapper?)   // Wrap function to return Results

result.map(fn)                        // Transform ok value
result.mapFailure(fn)                 // Transform failure
result.mapFailure({ CODE: handler })  // Handle specific error codes
result.match({ ok, failed })          // Pattern match both cases
result.unwrap()              // Get value or failure
result.unwrapOr(default)     // Get value or default
result.isOk()                // Check if ok
result.hasFailed()           // Check if failed
```

### Generator Functions

```typescript
const myFn = fn(function* (arg) {
  const value = yield* someResult; // Unwrap or short-circuit
  return ok(result);
});

myFn(arg); // Call (if no dependencies)
myFn.run(arg); // Explicit run
```

### Dependency Injection

```typescript
// Declare
const Service = fn.dependency<Type>()("key");

// Require
const service = yield * fn.require(Service);

// Implement
const impl = Service.impl({/* implementation */});

// Inject
const runnable = myFn.inject(impl1, impl2);

// Compose
yield * childFn.yield(args);
```

## License

MIT
