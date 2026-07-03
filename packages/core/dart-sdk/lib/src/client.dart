import "dart:async";
import "dart:convert";

import "package:http/http.dart" as http;

/// The header name used for the publishable API key.
const String publishableKeyHeader = "x-publishable-api-key";

/// The default storage key used for the JWT auth token.
const String defaultJwtStorageKey = "medusa_auth_token";

/// Headers map for client requests. A `null` value removes the header.
typedef ClientHeaders = Map<String, String?>;

/// Query parameters passed to a request. Values may be nested maps/lists and
/// are encoded using a `qs`-compatible encoder (see [encodeQuery]).
typedef QueryParams = Map<String, dynamic>;

/// Logger interface for the Medusa client.
abstract class Logger {
  void error(String message);
  void warn(String message);
  void info(String message);
  void debug(String message);
}

/// Default logger that writes to stdout/stderr via `print`.
class DefaultLogger implements Logger {
  const DefaultLogger();
  @override
  void error(String message) => print("[medusa:error] $message");
  @override
  void warn(String message) => print("[medusa:warn] $message");
  @override
  void info(String message) => print("[medusa:info] $message");
  @override
  void debug(String message) => print("[medusa:debug] $message");
}

class _ScopedLogger implements Logger {
  _ScopedLogger(this._inner, this._debugEnabled);
  final Logger _inner;
  final bool _debugEnabled;
  @override
  void error(String message) => _inner.error(message);
  @override
  void warn(String message) => _inner.warn(message);
  @override
  void info(String message) => _inner.info(message);
  @override
  void debug(String message) {
    if (_debugEnabled) _inner.debug(message);
  }
}

/// Pluggable token storage. Replaces the browser `localStorage`/`sessionStorage`
/// used by the JS SDK. Flutter apps can wrap `flutter_secure_storage` here.
abstract class TokenStorage {
  FutureOr<String?> getItem(String key);
  FutureOr<void> setItem(String key, String value);
  FutureOr<void> removeItem(String key);
}

/// In-memory token storage (the default). Tokens are lost when the process ends.
class InMemoryTokenStorage implements TokenStorage {
  final Map<String, String> _store = {};
  @override
  String? getItem(String key) => _store[key];
  @override
  void setItem(String key, String value) => _store[key] = value;
  @override
  void removeItem(String key) => _store.remove(key);
}

/// The authentication type.
enum AuthType { jwt, session }

/// Where the JWT token is persisted.
enum JwtStorageMethod { memory, custom, nostore }

/// Authentication configuration.
class AuthConfig {
  const AuthConfig({
    this.type,
    this.jwtTokenStorageKey,
    this.jwtTokenStorageMethod,
    this.fetchCredentials,
    this.storage,
  });

  final AuthType? type;
  final String? jwtTokenStorageKey;
  final JwtStorageMethod? jwtTokenStorageMethod;

  /// Retained for parity with the JS SDK. In pure Dart, cookie handling is the
  /// responsibility of the injected [http.Client].
  final String? fetchCredentials;
  final TokenStorage? storage;
}

/// Configuration options for the Medusa client.
class Config {
  Config({
    required this.baseUrl,
    this.globalHeaders,
    this.publishableKey,
    this.apiKey,
    this.auth,
    this.logger,
    this.debug = false,
  });

  /// The base URL of the Medusa server.
  final String baseUrl;

  /// Default headers included with every request.
  final ClientHeaders? globalHeaders;

  /// The publishable API key for storefront authentication.
  final String? publishableKey;

  /// The secret API key for admin authentication.
  final String? apiKey;

  /// Authentication configuration.
  final AuthConfig? auth;

  /// Custom logger instance.
  final Logger? logger;

  /// Whether to enable debug logging.
  final bool debug;
}

/// Error thrown for non-2xx HTTP responses. Mirrors the JS SDK `FetchError`.
class FetchError implements Exception {
  FetchError(this.message, [this.statusText, this.status]);
  final String message;
  final String? statusText;
  final int? status;

  @override
  String toString() => "FetchError($status): $message";
}

/// Arguments for a fetch operation, mirroring the JS SDK `FetchArgs`.
class FetchArgs {
  FetchArgs({
    this.method,
    this.query,
    this.headers,
    this.body,
  });

  /// HTTP method. Defaults to `GET`.
  final String? method;

  /// Query parameters appended to the URL.
  final QueryParams? query;

  /// Request headers (a `null` value removes a default header).
  final ClientHeaders? headers;

  /// Request body. A `Map`/`List` is JSON-encoded when the content-type is JSON;
  /// a `String` is sent as-is.
  final Object? body;
}

/// A single server-sent event message.
class ServerSentEventMessage {
  ServerSentEventMessage({this.comment, this.event, this.data, this.id, this.retry});
  final String? comment;
  final String? event;
  final String? data;
  final String? id;
  final int? retry;
}

/// Return value of [MedusaClient.fetchStream].
class FetchStreamResponse {
  FetchStreamResponse({required this.stream, required this.abort});
  final Stream<ServerSentEventMessage> stream;
  final void Function() abort;
}

/// Encodes [params] into a `qs`-compatible query string using bracket notation
/// for nested objects and indexed brackets for lists. Null values are skipped
/// (equivalent to `qs.stringify(params, { skipNulls: true })`).
String encodeQuery(QueryParams params) {
  final pairs = <String>[];

  void add(String key, dynamic value) {
    if (value == null) return; // skipNulls
    if (value is Map) {
      value.forEach((k, v) => add("$key[$k]", v));
    } else if (value is Iterable) {
      var i = 0;
      for (final v in value) {
        add("$key[${i++}]", v);
      }
    } else {
      pairs.add("${Uri.encodeComponent(key)}=${Uri.encodeComponent(_stringifyScalar(value))}");
    }
  }

  params.forEach(add);
  return pairs.join("&");
}

String _stringifyScalar(dynamic value) {
  if (value is bool) return value ? "true" : "false";
  if (value is DateTime) return value.toUtc().toIso8601String();
  return value.toString();
}

/// Parses a raw byte stream of `text/event-stream` data into SSE messages.
Stream<ServerSentEventMessage> parseServerSentEvents(Stream<List<int>> byteStream) async* {
  String? event;
  final data = <String>[];
  String? id;
  int? retry;
  String? comment;
  var hasContent = false;

  ServerSentEventMessage build() => ServerSentEventMessage(
        comment: comment,
        event: event,
        data: data.isEmpty ? null : data.join("\n"),
        id: id,
        retry: retry,
      );

  await for (final line in byteStream.transform(utf8.decoder).transform(const LineSplitter())) {
    if (line.isEmpty) {
      if (hasContent) yield build();
      event = null;
      data.clear();
      id = null;
      retry = null;
      comment = null;
      hasContent = false;
      continue;
    }

    hasContent = true;
    if (line.startsWith(":")) {
      comment = line.substring(1).trimLeft();
      continue;
    }

    final idx = line.indexOf(":");
    final field = idx == -1 ? line : line.substring(0, idx);
    var value = idx == -1 ? "" : line.substring(idx + 1);
    if (value.startsWith(" ")) value = value.substring(1);

    switch (field) {
      case "event":
        event = value;
        break;
      case "data":
        data.add(value);
        break;
      case "id":
        id = value;
        break;
      case "retry":
        retry = int.tryParse(value);
        break;
    }
  }

  if (hasContent) yield build();
}

/// The main HTTP client for the Medusa Dart SDK. Ports `js-sdk/src/client.ts`.
class MedusaClient {
  MedusaClient(this.config, {http.Client? httpClient})
      : _httpClient = httpClient ?? http.Client() {
    final base = config.logger ?? const DefaultLogger();
    logger = _ScopedLogger(base, config.debug);
  }

  final Config config;
  final http.Client _httpClient;
  late final Logger logger;

  String _token = "";
  String _locale = "";

  /// The currently configured locale (sent as the `x-medusa-locale` header).
  String get locale => _locale;

  /// Sets the locale sent with subsequent requests.
  void setLocale(String locale) => _locale = locale;

  /// Performs a request and returns the decoded JSON body (a `Map`, `List`, or
  /// scalar). If the `accept` header is not JSON, the raw [http.Response] is
  /// returned instead. Throws [FetchError] on non-2xx responses.
  Future<dynamic> fetch(String input, {FetchArgs? init}) async {
    final headers = await _buildHeaders(init);
    final uri = _buildUri(input, init?.query);
    final method = (init?.method ?? "GET").toUpperCase();

    final request = http.Request(method, uri);
    headers.forEach((k, v) => request.headers[k] = v);

    final body = init?.body;
    if (body != null) {
      final contentType = headers["content-type"] ?? "";
      if (body is String) {
        request.body = body;
      } else if (contentType.contains("application/json")) {
        request.body = jsonEncode(body);
      } else if (body is List<int>) {
        request.bodyBytes = body;
      } else {
        request.body = body.toString();
      }
    }

    logger.debug("Performing request: $method $uri");

    final streamed = await _httpClient.send(request);
    final response = await http.Response.fromStream(streamed);
    logger.debug("Received response with status ${response.statusCode}");
    return _normalizeResponse(response, headers);
  }

  /// Helper for server-sent events. Mirrors the JS SDK `fetchStream`.
  Future<FetchStreamResponse> fetchStream(String input, {FetchArgs? init}) async {
    final headers = await _buildHeaders(init);
    headers["accept"] = "text/event-stream";
    final uri = _buildUri(input, init?.query);
    final method = (init?.method ?? "GET").toUpperCase();

    final request = http.Request(method, uri);
    headers.forEach((k, v) => request.headers[k] = v);
    final body = init?.body;
    if (body != null && body is! String) {
      request.body = jsonEncode(body);
    } else if (body is String) {
      request.body = body;
    }

    final streamed = await _httpClient.send(request);
    if (streamed.statusCode >= 300) {
      throw FetchError(
        "Stream failed with status ${streamed.statusCode}",
        streamed.reasonPhrase,
        streamed.statusCode,
      );
    }

    final controller = StreamController<ServerSentEventMessage>();
    late StreamSubscription<ServerSentEventMessage> sub;
    sub = parseServerSentEvents(streamed.stream).listen(
      controller.add,
      onError: controller.addError,
      onDone: controller.close,
      cancelOnError: true,
    );
    controller.onCancel = sub.cancel;

    return FetchStreamResponse(
      stream: controller.stream,
      abort: () {
        sub.cancel();
        if (!controller.isClosed) controller.close();
      },
    );
  }

  Future<void> setToken(String token) => Future.sync(() => _setToken(token));
  Future<String?> getToken() => Future.sync(_getToken);
  Future<void> clearToken() => Future.sync(_clearToken);

  Future<void> _setToken(String token) async {
    final (method, key) = _tokenStorageInfo();
    switch (method) {
      case JwtStorageMethod.memory:
        _token = token;
        break;
      case JwtStorageMethod.custom:
        await config.auth?.storage?.setItem(key, token);
        break;
      case JwtStorageMethod.nostore:
        break;
    }
  }

  Future<String?> _getToken() async {
    final (method, key) = _tokenStorageInfo();
    switch (method) {
      case JwtStorageMethod.memory:
        return _token.isEmpty ? null : _token;
      case JwtStorageMethod.custom:
        return await config.auth?.storage?.getItem(key);
      case JwtStorageMethod.nostore:
        return null;
    }
  }

  Future<void> _clearToken() async {
    final (method, key) = _tokenStorageInfo();
    switch (method) {
      case JwtStorageMethod.memory:
        _token = "";
        break;
      case JwtStorageMethod.custom:
        await config.auth?.storage?.removeItem(key);
        break;
      case JwtStorageMethod.nostore:
        break;
    }
  }

  (JwtStorageMethod, String) _tokenStorageInfo() {
    final hasCustom = config.auth?.storage != null;
    final method = config.auth?.jwtTokenStorageMethod ??
        (hasCustom ? JwtStorageMethod.custom : JwtStorageMethod.memory);
    final key = config.auth?.jwtTokenStorageKey ?? defaultJwtStorageKey;
    if (method == JwtStorageMethod.custom && !hasCustom) {
      logger.error("Custom storage was not provided in the config");
      throw StateError("Custom storage was not provided in the config");
    }
    return (method, key);
  }

  Future<Map<String, String>> _buildHeaders(FetchArgs? init) async {
    final headers = <String, String?>{
      "content-type": "application/json",
      "accept": "application/json",
    };

    if (config.apiKey != null) {
      headers["authorization"] = "Basic ${base64.encode(utf8.encode("${config.apiKey}:"))}";
    }
    if (config.publishableKey != null) {
      headers[publishableKeyHeader] = config.publishableKey;
    }
    if (_locale.isNotEmpty) {
      headers["x-medusa-locale"] = _locale;
    }

    config.globalHeaders?.forEach((k, v) => headers[k.toLowerCase()] = v);

    final jwt = await _jwtHeader();
    jwt.forEach((k, v) => headers[k.toLowerCase()] = v);

    init?.headers?.forEach((k, v) => headers[k.toLowerCase()] = v);

    final result = <String, String>{};
    headers.forEach((k, v) {
      if (v != null) result[k] = v;
    });
    return result;
  }

  Future<Map<String, String>> _jwtHeader() async {
    if (config.auth?.type == AuthType.session) return {};
    final token = await _getToken();
    return (token != null && token.isNotEmpty) ? {"authorization": "Bearer $token"} : {};
  }

  Uri _buildUri(String input, QueryParams? query) {
    final baseUrl = config.baseUrl.replaceAll(RegExp(r"/+$"), "");
    final path = input.replaceAll(RegExp(r"^/+"), "");
    var uri = Uri.parse("$baseUrl/$path");

    if (query != null && query.isNotEmpty) {
      final encoded = encodeQuery(query);
      if (encoded.isNotEmpty) {
        final existing = uri.query;
        final combined = existing.isEmpty ? encoded : "$existing&$encoded";
        uri = uri.replace(query: combined);
      }
    }
    return uri;
  }

  dynamic _normalizeResponse(http.Response resp, Map<String, String> reqHeaders) {
    if (resp.statusCode >= 300) {
      String? message;
      try {
        final decoded = jsonDecode(resp.body);
        if (decoded is Map && decoded["message"] != null) {
          message = decoded["message"].toString();
        }
      } catch (_) {
        // body was not JSON
      }
      throw FetchError(
        message ?? (resp.reasonPhrase ?? "Request failed"),
        resp.reasonPhrase,
        resp.statusCode,
      );
    }

    final accept = reqHeaders["accept"] ?? "";
    if (accept.contains("application/json")) {
      if (resp.body.isEmpty) return null;
      return jsonDecode(resp.body);
    }
    return resp;
  }

  /// Closes the underlying HTTP client.
  void close() => _httpClient.close();
}
