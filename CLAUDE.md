# CLAUDE.md

Guidance for Claude Code when working with this repository.

## Project Overview

**skyr** is a TypeScript library for type-safe error handling inspired by Rust's
`Result` type. Functional approach with async support and optional dependency
injection.

**Bun project** - All imports require `.ts` extensions.

## Commands

```bash
bun run check            # Type check
bun test                 # Run tests (coverage goal: 90%)
bun run lint             # Lint (using Biome)
bun run format           # Format (using Biome)
```

## Architecture

### Core Principles

1. **Async Poison**: Once a Result becomes AsyncResult, it stays async until
   awaited
2. **Auto Async Detection**: Runtime `instanceof Promise` detection
3. **Linear Error Handling**: `yield*` with Results auto-unwraps Ok or
   short-circuits Err

### Modules

**`src/result.ts`** - Core Result types and operations:
- Types: `Ok<T>`, `Err<E>`, `Result<T, E>`, `AsyncResult<T, E>`, `Failure<Code>`
- Constructors: `ok(value)`, `fail(code, message, cause?)`
- Converters: `fromThrowable(fn, mapper?)`, `wrapThrowable(fn, mapper?)`
- Methods: `.map()`, `.mapFailure()`, `.match()`, `.unwrap()`, `.unwrapOr()`, `.isOk()`, `.hasFailed()`
- AsyncResult wraps `Promise<Result<T, E>>` and implements `PromiseLike`

**`src/di.ts`** - Dependency injection with type-safe tracking:
- `fn()` creates generator functions with automatic Result unwrapping via `yield*`
- `fn.dependency<Type>()("key")` declares dependency types
- `yield* fn.require(Dep)` acquires dependencies in generator functions
- `.inject(impl1, impl2, ...)` provides dependency implementations
- `.yield(args)` calls functions with dependencies from parent context
- TypeScript tracks required dependencies and prevents calls until all are injected
