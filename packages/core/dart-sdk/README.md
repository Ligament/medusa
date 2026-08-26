# medusajs_dart_sdk (Dart SDK)

A Dart SDK for the [Medusa](https://medusajs.com) commerce API — a faithful port
of [`@medusajs/js-sdk`](../js-sdk). Pure Dart with no hard Flutter dependency, so
it runs in Flutter apps, server-side Dart, and CLIs.

## Install

```yaml
dependencies:
  medusajs_dart_sdk:
    path: packages/core/dart-sdk
  # or, once published: medusajs_dart_sdk: ^2.19.0
```

## Quick start

```dart
import "package:medusajs_dart_sdk/medusajs_dart_sdk.dart";

final sdk = Medusa(Config(
  baseUrl: "https://your-medusa-server.com",
  publishableKey: "pk_...", // required for storefront routes
  debug: true,
));

// Storefront
final products = await sdk.store.product.list(query: {"limit": 20});
for (final p in products.products ?? []) {
  print(p.title);
}

// A single resource with field selection
final region = await sdk.store.region.retrieve("reg_123", query: {"fields": "id,*countries"});
```

## Authentication

```dart
// Log in (stores the JWT according to your auth config)
final result = await sdk.auth.login("customer", "emailpass", {
  "email": "customer@example.com",
  "password": "supersecret",
});

if (result.location != null) {
  // OAuth: redirect the user to result.location
} else if (result.token != null) {
  // Authenticated — subsequent requests send the token automatically
  final me = await sdk.store.customer.retrieve();
}

await sdk.auth.logout();
```

## Admin

```dart
final sdk = Medusa(Config(
  baseUrl: "https://your-medusa-server.com",
  apiKey: "sk_...", // admin API key
));

final orders = await sdk.admin.order.list(query: {"limit": 50});
final created = await sdk.admin.product.create(AdminCreateProduct(title: "New product"));
```

## Token storage (Flutter)

By default tokens are kept in memory. To persist them (e.g. with
`flutter_secure_storage`), implement [`TokenStorage`] and wire it into the config:

```dart
class SecureTokenStorage implements TokenStorage {
  final _storage = const FlutterSecureStorage();
  @override
  Future<String?> getItem(String key) => _storage.read(key: key);
  @override
  Future<void> setItem(String key, String value) => _storage.write(key: key, value: value);
  @override
  Future<void> removeItem(String key) => _storage.delete(key: key);
}

final sdk = Medusa(Config(
  baseUrl: "...",
  auth: AuthConfig(
    type: AuthType.jwt,
    jwtTokenStorageMethod: JwtStorageMethod.custom,
    storage: SecureTokenStorage(),
  ),
));
```

## Server-sent events

```dart
final res = await sdk.client.fetchStream("/admin/some-stream");
await for (final event in res.stream) {
  print("${event.event}: ${event.data}");
}
res.abort();
```

## Caching

Caching is intentionally left to the consumer — the core SDK never caches
responses, so there are no implicit cache keys, TTLs, or region/currency/auth
isolation rules baked in. Two approaches are recommended.

### 1. Inject a caching HTTP client

Both `Medusa` and `MedusaClient` accept an optional `httpClient`. Pass any
`http.Client` that honors HTTP cache headers (for example a `package:http`
caching client, or `dio` + `dio_cache_interceptor` adapted to `http.Client`):

```dart
import "package:http/http.dart" as http;

final sdk = Medusa(
  Config(baseUrl: "https://your-medusa-server.com"),
  httpClient: myCachingHttpClient, // any http.Client
);
```

This applies transport-level caching uniformly and requires no SDK changes.

### 2. Repository-level memoization (recommended for domain data)

For Medusa data — products, inventory, carts, customer state — caching policy is
application-specific. Wrap the SDK in a repository that owns the cache keys, TTL,
region/currency isolation, and invalidation after mutations. See
[`example/caching_repository.dart`](example/caching_repository.dart):

```dart
final repo = ProductRepository(sdk, ttl: const Duration(minutes: 5));

// Reads are memoized per (operation, region, currency, query).
final page = await repo.list(regionId: "reg_eu", currencyCode: "eur");

// Invalidate after any mutation that affects products.
repo.invalidate();
```

> A built-in cache would have to make application-specific decisions about cache
> keys, TTLs, region/currency/auth isolation, persistence, invalidation after
> mutations, and stale-data behavior. If that need arises, an optional cache
> adapter or a separate package is preferable to making caching implicit in the
> core SDK.

## Design notes

- **Models** (`lib/src/models.dart`) are generated from the Medusa OpenAPI specs.
  Every field is nullable and `fromJson` is null-safe, because Medusa's `fields`
  query parameter means responses routinely omit fields. JSON keys are kept in
  `snake_case` to mirror the API 1:1.
- **Resources** (`lib/src/resources/*.dart`) are generated from the JS SDK source
  so method names, grouping, paths, and HTTP verbs match the JS SDK exactly.
  Response types come from the OpenAPI component schemas, or are synthesized from
  the matching path response schema. A small number of endpoints whose responses
  are empty/non-object return `Future<dynamic>` (the decoded JSON).
- **Auth** (`lib/src/resources/auth.dart`) is hand-written because it contains
  token-handling logic beyond a simple request wrapper.
- **Query parameters** are encoded with a `qs`-compatible encoder supporting
  nested filter objects and arrays (e.g. `created_at[$gte]=...`).

## Regenerating

The models and resource classes are generated. To regenerate after the JS SDK or
OpenAPI specs change:

```bash
node tool/generate_models.mjs      # OpenAPI specs -> lib/src/models*
node tool/generate_resources.mjs   # JS SDK source -> lib/src/resources/*
dart analyze && dart test
```

## License

MIT
