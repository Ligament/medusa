// A small example of using the Medusa Dart SDK.
// Run with: dart run example/main.dart
import "package:medusajs_dart_sdk/medusajs_dart_sdk.dart";

Future<void> main() async {
  final sdk = Medusa(Config(
    baseUrl: "https://your-medusa-server.com",
    publishableKey: "pk_replace_me",
  ));

  // Storefront: list products.
  final products = await sdk.store.product.list(query: {"limit": 10});
  print("Fetched ${products.products?.length ?? 0} products "
      "(total ${products.count}).");

  // Authenticate a customer.
  final auth = await sdk.auth.login("customer", "emailpass", {
    "email": "customer@example.com",
    "password": "supersecret",
  });

  if (auth.token != null) {
    final me = await sdk.store.customer.retrieve();
    print("Logged in as ${me.customer?.email}");
  } else if (auth.location != null) {
    print("Continue auth at ${auth.location}");
  }

  sdk.client.close();
}
