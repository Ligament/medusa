import "package:http/http.dart" as http;

import "client.dart";
import "resources/admin.dart";
import "resources/auth.dart";
import "resources/store.dart";

/// The Medusa SDK entry point. Ports the default `Medusa` export of the JS SDK.
///
/// ```dart
/// final sdk = Medusa(Config(baseUrl: "https://api.example.com"));
/// final res = await sdk.store.product.list();
/// ```
class Medusa {
  Medusa(Config config, {http.Client? httpClient})
      : client = MedusaClient(config, httpClient: httpClient) {
    admin = Admin(client);
    store = Store(client);
    auth = Auth(client, config);
  }

  /// The underlying HTTP client.
  final MedusaClient client;

  /// Admin API resources.
  late final Admin admin;

  /// Store (storefront) API resources.
  late final Store store;

  /// Authentication methods.
  late final Auth auth;

  /// Sets the locale sent with subsequent requests.
  void setLocale(String locale) => client.setLocale(locale);

  /// Returns the currently configured locale.
  String getLocale() => client.locale;
}
