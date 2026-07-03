import "dart:convert";

import "package:http/http.dart" as http;
import "package:http/testing.dart";
import "package:medusajs_dart_sdk/medusajs_dart_sdk.dart";
import "package:test/test.dart";

http.Response _json(Object body, {int status = 200}) => http.Response(
      jsonEncode(body),
      status,
      headers: {"content-type": "application/json"},
    );

void main() {
  group("MedusaClient", () {
    test("builds URL, attaches publishable key, parses JSON", () async {
      late http.Request captured;
      final client = MedusaClient(
        Config(baseUrl: "https://api.test", publishableKey: "pk_123"),
        httpClient: MockClient((req) async {
          captured = req;
          return _json({"ok": true});
        }),
      );

      final res = await client.fetch("/admin/currencies", init: FetchArgs(query: {"limit": 10}));

      expect(captured.method, "GET");
      expect(captured.url.toString(), "https://api.test/admin/currencies?limit=10");
      expect(captured.headers["x-publishable-api-key"], "pk_123");
      expect((res as Map)["ok"], true);
    });

    test("throws FetchError on non-2xx with server message", () async {
      final client = MedusaClient(
        Config(baseUrl: "https://api.test"),
        httpClient: MockClient((req) async => _json({"message": "nope"}, status: 422)),
      );

      await expectLater(
        client.fetch("/x"),
        throwsA(isA<FetchError>()
            .having((e) => e.status, "status", 422)
            .having((e) => e.message, "message", "nope")),
      );
    });

    test("attaches bearer token from storage", () async {
      late http.Request captured;
      final client = MedusaClient(
        Config(baseUrl: "https://api.test"),
        httpClient: MockClient((req) async {
          captured = req;
          return _json({});
        }),
      );

      await client.setToken("tok_abc");
      await client.fetch("/admin/orders");

      expect(captured.headers["authorization"], "Bearer tok_abc");
    });

    test("encodes a JSON body on POST", () async {
      late http.Request captured;
      final client = MedusaClient(
        Config(baseUrl: "https://api.test"),
        httpClient: MockClient((req) async {
          captured = req;
          return _json({});
        }),
      );

      await client.fetch("/admin/x", init: FetchArgs(method: "POST", body: {"a": 1}));

      expect(captured.method, "POST");
      expect(jsonDecode(captured.body), {"a": 1});
    });
  });

  group("query encoder", () {
    test("nested objects, arrays, skipNulls", () {
      final q = encodeQuery({
        "a": {"\$gte": 5},
        "b": [1, 2],
        "c": null,
        "d": "x",
      });

      expect(q, contains("a%5B%24gte%5D=5")); // a[$gte]=5
      expect(q, contains("b%5B0%5D=1")); // b[0]=1
      expect(q, contains("b%5B1%5D=2")); // b[1]=2
      expect(q, isNot(contains("c"))); // null skipped
      expect(q, contains("d=x"));
    });
  });

  group("models", () {
    test("AdminCurrency round-trips through fromJson/toJson", () {
      final c = AdminCurrency.fromJson({
        "code": "usd",
        "symbol": "\$",
        "decimal_digits": 2,
        "created_at": "2023-01-01T00:00:00.000Z",
      });

      expect(c.code, "usd");
      expect(c.decimalDigits, 2);
      expect(c.createdAt, isA<DateTime>());

      final j = c.toJson();
      expect(j["code"], "usd");
      expect(j["created_at"], "2023-01-01T00:00:00.000Z");
      expect(j.containsKey("name"), isFalse); // null fields omitted
    });
  });

  group("resources", () {
    test("admin.currency.retrieve hits the right path and deserializes", () async {
      late http.Request captured;
      final client = MedusaClient(
        Config(baseUrl: "https://api.test"),
        httpClient: MockClient((req) async {
          captured = req;
          return _json({
            "currency": {"code": "usd", "symbol": "\$"}
          });
        }),
      );

      final res = await Admin(client).currency.retrieve("usd");

      expect(captured.url.path, "/admin/currencies/usd");
      expect(res.currency?.code, "usd");
    });

    test("store.region.list deserializes a list response", () async {
      final client = MedusaClient(
        Config(baseUrl: "https://api.test"),
        httpClient: MockClient((req) async => _json({
              "regions": [
                {"id": "reg_1", "name": "EU"}
              ],
              "count": 1,
              "offset": 0,
              "limit": 20,
            })),
      );

      final res = await Store(client).region.list();
      expect(res.count, 1);
      expect(res.regions?.first.id, "reg_1");
    });
  });

  group("auth", () {
    test("login stores the returned token", () async {
      final config = Config(baseUrl: "https://api.test");
      final client = MedusaClient(
        config,
        httpClient: MockClient((req) async => _json({"token": "jwt_1"})),
      );

      final result = await Auth(client, config).login(
        "customer",
        "emailpass",
        {"email": "a@b.c", "password": "x"},
      );

      expect(result.token, "jwt_1");
      expect(await client.getToken(), "jwt_1");
    });

    test("login returns an OAuth redirect location without a token", () async {
      final config = Config(baseUrl: "https://api.test");
      final client = MedusaClient(
        config,
        httpClient: MockClient((req) async => _json({"location": "https://oauth"})),
      );

      final result = await Auth(client, config).login("customer", "google", {});
      expect(result.location, "https://oauth");
      expect(result.token, isNull);
    });
  });
}
