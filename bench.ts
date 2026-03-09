import * as R from "./mod.ts";

// ============================================================================
// Construction
// ============================================================================

Deno.bench("ok()", () => {
	R.ok(42);
});

Deno.bench("err()", () => {
	R.err("NOT_FOUND", "User not found");
});

// ============================================================================
// Pipe flow: validate, transform, recover, extract
// ============================================================================

const processOrder = (rawAmount: string) =>
	R.pipe(
		R.fromThrowable(
			() => parseFloat(rawAmount),
			(e) => R.err("PARSE_ERROR", "Invalid amount", e),
		),
		R.map((amount) => {
			if (isNaN(amount) || amount <= 0) {
				return R.err("INVALID_AMOUNT", "Must be positive");
			}
			return R.ok(amount);
		}),
		R.map((order) => ({
			amount: order,
			tax: order * 0.2,
			total: order * 1.2,
		})),
		R.map((order) => `Order: $${order.total.toFixed(2)}`),
		R.mapErr({
			PARSE_ERROR: () => "Could not read amount",
			INVALID_AMOUNT: () => "Bad amount",
		}),
		R.match({
			ok: (summary) => summary,
			err: (e) => `Error: ${e.message}`,
		}),
	);

Deno.bench("pipe: ok path", () => {
	processOrder("49.99");
});

Deno.bench("pipe: err path", () => {
	processOrder("-10");
});

// ============================================================================
// Same flow with method chaining
// ============================================================================

const processOrderChained = (rawAmount: string) =>
	R.fromThrowable(
		() => parseFloat(rawAmount),
		(e) => R.err("PARSE_ERROR", "Invalid amount", e),
	)
		.map((amount) => {
			if (isNaN(amount) || amount <= 0) {
				return R.err("INVALID_AMOUNT", "Must be positive");
			}
			return R.ok(amount);
		})
		.map((order) => ({
			amount: order,
			tax: order * 0.2,
			total: order * 1.2,
		}))
		.map((order) => `Order: $${order.total.toFixed(2)}`)
		.mapErr({
			PARSE_ERROR: () => "Could not read amount",
			INVALID_AMOUNT: () => "Bad amount",
		})
		.match({
			ok: (summary) => summary,
			err: (e) => `Error: ${e.message}`,
		});

Deno.bench("chain: ok path", () => {
	processOrderChained("49.99");
});

Deno.bench("chain: err path", () => {
	processOrderChained("-10");
});

// ============================================================================
// fn() with DI, nesting, yield*, async
// ============================================================================

const Database = R.dependency<{
	findUser: (
		email: string,
	) => Promise<{ name: string; role: string } | null>;
}>()("database");

const Logger = R.dependency<{
	info: (msg: string) => void;
}>()("logger");

const ValidateEmail = R.fn((email: string) => {
	if (!email.includes("@")) return R.err("INVALID_EMAIL", "Missing @");
	if (email.length > 254) return R.err("INVALID_EMAIL", "Too long");
	return R.ok(email.toLowerCase().trim());
});

const CheckPermissions = R.fn(function* (role: string) {
	const logger = yield* R.use(Logger);
	logger.info(`Checking permissions for ${role}`);
	if (role !== "admin") return R.err("FORBIDDEN", "Admin only");
	return R.ok(true as const);
});

const GetUser = R.fn(function* (email: string) {
	const db = yield* R.use(Database);
	const logger = yield* R.use(Logger);

	const validEmail = yield* ValidateEmail(email);
	logger.info(`Looking up ${validEmail}`);

	const user = yield* R.fromThrowable(
		db.findUser(validEmail),
		(e) => R.err("DB_ERROR", "Query failed", e),
	);

	if (!user) return R.err("NOT_FOUND", "User not found");

	const checkPerms = yield* R.use(CheckPermissions);
	yield* checkPerms(user.role);

	return R.ok(user);
});

const noop = () => {};
const dbImpl = Database.impl({
	findUser: (email) =>
		Promise.resolve(
			email === "admin@test.com"
				? { name: "Alice", role: "admin" }
				: email === "user@test.com"
				? { name: "Bob", role: "viewer" }
				: null,
		),
});
const loggerImpl = Logger.impl({ info: noop });

const getUser = R.pipe(GetUser, R.inject(dbImpl, loggerImpl));

Deno.bench("fn(): DI wiring", () => {
	R.pipe(GetUser, R.inject(dbImpl, loggerImpl));
});

Deno.bench("fn(): ok path", async () => {
	await getUser("admin@test.com");
});

Deno.bench("fn(): err path", async () => {
	await getUser("invalid-email");
});
