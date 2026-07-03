// Repository-level caching example for the Medusa Dart SDK.
//
// The core SDK never caches responses. Caching policy — cache keys, TTL,
// region/currency isolation, and invalidation after mutations — is
// application-specific and lives here, in a repository that wraps the SDK.
//
// Run analysis with: dart analyze
import "package:medusajs_dart_sdk/medusajs_dart_sdk.dart";

class _Entry {
  _Entry(this.value, this.fetchedAt);
  final Object value;
  final DateTime fetchedAt;
  bool isFresh(Duration ttl) => DateTime.now().difference(fetchedAt) < ttl;
}

/// Memoizes storefront product reads and invalidates them on writes.
class ProductRepository {
  ProductRepository(this._sdk, {this.ttl = const Duration(minutes: 5)});

  final Medusa _sdk;
  final Duration ttl;
  final Map<String, _Entry> _cache = {};

  // Region and currency are part of the cache key, so prices and availability
  // are never shared across regions or currencies.
  String _key(String op, String? regionId, String? currencyCode, Map<String, dynamic>? query) =>
      [op, regionId ?? "-", currencyCode ?? "-", query == null ? "" : encodeQuery(query)].join("|");

  Future<StoreProductListResponse> list({
    String? regionId,
    String? currencyCode,
    Map<String, dynamic>? query,
  }) async {
    final key = _key("list", regionId, currencyCode, query);
    final hit = _cache[key];
    if (hit != null && hit.isFresh(ttl)) {
      return hit.value as StoreProductListResponse;
    }

    final res = await _sdk.store.product.list(query: {
      ...?query,
      if (regionId != null) "region_id": regionId,
      if (currencyCode != null) "currency_code": currencyCode,
    });

    _cache[key] = _Entry(res, DateTime.now());
    return res;
  }

  /// Clears cached reads. Call after any mutation that affects products
  /// (for example an admin create/update/delete).
  void invalidate() => _cache.clear();
}

Future<void> main() async {
  final sdk = Medusa(Config(
    baseUrl: "https://your-medusa-server.com",
    publishableKey: "pk_replace_me",
  ));
  final products = ProductRepository(sdk, ttl: const Duration(minutes: 5));

  final first = await products.list(regionId: "reg_eu", currencyCode: "eur");
  final cached = await products.list(regionId: "reg_eu", currencyCode: "eur"); // served from cache
  print("first=${first.count} cached=${cached.count}");

  // After a mutation elsewhere, drop the memoized reads.
  products.invalidate();

  sdk.client.close();
}
