/// Dart SDK for the Medusa commerce API.
///
/// A faithful port of `@medusajs/js-sdk`. Import this single library:
///
/// ```dart
/// import "package:medusajs/medusajs.dart";
///
/// final sdk = Medusa(Config(baseUrl: "https://api.example.com"));
/// final products = await sdk.store.product.list();
/// ```
library;

export "src/client.dart";
export "src/medusa.dart";
export "src/models.dart";
export "src/resources/admin.dart";
export "src/resources/auth.dart";
export "src/resources/store.dart";
