// Hand-ported from js-sdk/src/auth/index.ts (contains custom token-handling
// logic beyond simple fetch wrappers).
import "../client.dart";

/// Result of an authentication attempt ([Auth.login] / [Auth.callback]).
///
/// On success, [token] is set. For OAuth flows, [location] holds a redirect
/// URL. When a follow-up step is required, [mfaRequired] or
/// [verificationRequired] is set with the relevant challenge/state.
class AuthResult {
  AuthResult({
    this.token,
    this.location,
    this.mfaChallenge,
    this.verification,
    this.mfaRequired = false,
    this.verificationRequired = false,
  });

  final String? token;
  final String? location;
  final Map<String, dynamic>? mfaChallenge;
  final Map<String, dynamic>? verification;
  final bool mfaRequired;
  final bool verificationRequired;
}

/// Methods for managing and completing multi-factor authentication (MFA).
class AuthMfa {
  AuthMfa(this._client, this._setToken);
  final MedusaClient _client;
  final Future<void> Function(String token) _setToken;

  /// Lists the MFA factors configured for the authenticated identity.
  Future<Map<String, dynamic>> list({ClientHeaders? headers}) async {
    final res = await _client.fetch("/auth/mfa/factors", init: FetchArgs(headers: headers));
    return res as Map<String, dynamic>;
  }

  /// Starts MFA setup for the authenticated identity.
  Future<Map<String, dynamic>> start(Map<String, dynamic> body, {ClientHeaders? headers}) async {
    final res = await _client.fetch("/auth/mfa/factors",
        init: FetchArgs(method: "POST", body: body, headers: headers));
    return res as Map<String, dynamic>;
  }

  /// Verifies a pending MFA factor setup.
  Future<Map<String, dynamic>> verify(String id, Map<String, dynamic> body,
      {ClientHeaders? headers}) async {
    final res = await _client.fetch("/auth/mfa/factors/$id/verify",
        init: FetchArgs(method: "POST", body: body, headers: headers));
    return res as Map<String, dynamic>;
  }

  /// Disables an MFA factor for the authenticated identity.
  Future<Map<String, dynamic>> disable(String id,
      {Map<String, dynamic>? body, ClientHeaders? headers}) async {
    final res = await _client.fetch("/auth/mfa/factors/$id",
        init: FetchArgs(method: "DELETE", body: body ?? {}, headers: headers));
    return res as Map<String, dynamic>;
  }

  /// Generates new recovery codes for the authenticated identity.
  Future<Map<String, dynamic>> generateRecoveryCodes(
      {Map<String, dynamic>? body, ClientHeaders? headers}) async {
    final res = await _client.fetch("/auth/mfa/recovery-codes",
        init: FetchArgs(method: "POST", body: body ?? {}, headers: headers));
    return res as Map<String, dynamic>;
  }

  /// Verifies an MFA challenge returned from login/callback. On success the
  /// token is stored according to the SDK auth configuration.
  Future<String> verifyChallenge(String id, Map<String, dynamic> body,
      {ClientHeaders? headers}) async {
    final res = await _client.fetch("/auth/mfa/challenges/$id/verify",
        init: FetchArgs(method: "POST", body: body, headers: headers)) as Map<String, dynamic>;
    final token = res["token"] as String;
    await _setToken(token);
    return token;
  }
}

/// Methods for requesting and confirming verification.
class AuthVerification {
  AuthVerification(this._client);
  final MedusaClient _client;

  /// Requests a verification token for an auth identity.
  Future<Map<String, dynamic>> request(Map<String, dynamic> body, {ClientHeaders? headers}) async {
    final res = await _client.fetch("/auth/verification/request",
        init: FetchArgs(method: "POST", body: body, headers: headers));
    return res as Map<String, dynamic>;
  }

  /// Confirms a verification code.
  Future<Map<String, dynamic>> confirm(Map<String, dynamic> body, {ClientHeaders? headers}) async {
    final res = await _client.fetch("/auth/verification/confirm",
        init: FetchArgs(method: "POST", body: body, headers: headers));
    return res as Map<String, dynamic>;
  }
}

/// Authentication methods for admin users, customers, and custom actor types.
class Auth {
  Auth(this._client, this._config) {
    mfa = AuthMfa(_client, _setToken);
    verification = AuthVerification(_client);
  }

  final MedusaClient _client;
  final Config _config;

  /// Multi-factor authentication methods.
  late final AuthMfa mfa;

  /// Verification request/confirm methods.
  late final AuthVerification verification;

  /// Retrieves a registration JWT token for a new actor. The token is stored
  /// and sent on subsequent requests so the actor can be created.
  Future<String> register(String actor, String method, Map<String, dynamic> payload) async {
    final res = await _client.fetch("/auth/$actor/$method/register",
        init: FetchArgs(method: "POST", body: payload)) as Map<String, dynamic>;
    final token = res["token"] as String?;
    if (token == null) {
      throw StateError("Unexpected registration response");
    }
    // Not a full session yet: the token has no actor type attached.
    await _client.setToken(token);
    return token;
  }

  /// Authenticates an actor. Returns the token, an OAuth redirect [location],
  /// or an MFA/verification follow-up. On success the token is stored.
  Future<AuthResult> login(String actor, String method, Map<String, dynamic> payload) async {
    final res = await _client.fetch("/auth/$actor/$method",
        init: FetchArgs(method: "POST", body: payload)) as Map<String, dynamic>;

    final location = res["location"] as String?;
    if (location != null) {
      return AuthResult(location: location);
    }

    final token = res["token"] as String?;
    if (token == null) {
      throw StateError("Unexpected authentication response");
    }

    await _setToken(token);

    if (res["verification_required"] == true) {
      return AuthResult(
        token: token,
        verificationRequired: true,
        verification: res["verification"] as Map<String, dynamic>?,
      );
    }
    if (res["mfa_challenge"] != null) {
      return AuthResult(
        token: token,
        mfaRequired: true,
        mfaChallenge: res["mfa_challenge"] as Map<String, dynamic>?,
      );
    }
    return AuthResult(token: token);
  }

  /// Validates an OAuth callback. Returns the token (stored on success) or an
  /// MFA/verification follow-up.
  Future<AuthResult> callback(String actor, String method, {Map<String, dynamic>? query}) async {
    final res = await _client.fetch("/auth/$actor/$method/callback",
        init: FetchArgs(query: query)) as Map<String, dynamic>;

    final token = res["token"] as String?;
    if (token == null) {
      throw StateError("Unexpected authentication callback response");
    }

    await _setToken(token);

    if (res["verification_required"] == true) {
      return AuthResult(
        token: token,
        verificationRequired: true,
        verification: res["verification"] as Map<String, dynamic>?,
      );
    }
    if (res["mfa_challenge"] != null) {
      return AuthResult(
        token: token,
        mfaRequired: true,
        mfaChallenge: res["mfa_challenge"] as Map<String, dynamic>?,
      );
    }
    return AuthResult(token: token);
  }

  /// Refreshes the JWT authentication token. The new token is stored.
  Future<Map<String, dynamic>> refresh({ClientHeaders? headers}) async {
    final res = await _client.fetch("/auth/token/refresh",
        init: FetchArgs(method: "POST", headers: headers)) as Map<String, dynamic>;
    final token = res["token"] as String?;
    if (token != null) {
      await _setToken(token);
    }
    return res;
  }

  /// Logs out the current actor and clears any stored token/session.
  Future<void> logout() async {
    if (_config.auth?.type == AuthType.session) {
      await _client.fetch("/auth/session", init: FetchArgs(method: "DELETE"));
    }
    await _client.clearToken();
  }

  /// Requests a reset-password token for an actor.
  Future<void> resetPassword(String actor, String provider, Map<String, dynamic> body) async {
    await _client.fetch("/auth/$actor/$provider/reset-password",
        init: FetchArgs(method: "POST", body: body, headers: {"accept": "text/plain"}));
  }

  /// Updates an actor's auth data (e.g. password) using a reset token.
  Future<void> updateProvider(
      String actor, String provider, Map<String, dynamic> body, String token) async {
    await _client.fetch("/auth/$actor/$provider/update",
        init: FetchArgs(method: "POST", body: body, headers: {"authorization": "Bearer $token"}));
  }

  /// Lists the authentication providers available for an [actor] type.
  ///
  /// This is a public, pre-authentication route. Use it to render the available
  /// login options (email/password form, "Continue with ..." buttons) based on
  /// each provider's `flow`.
  Future<Map<String, dynamic>> listProviders(String actor, {ClientHeaders? headers}) async {
    final res = await _client.fetch("/auth/$actor/providers",
        init: FetchArgs(headers: headers));
    return res as Map<String, dynamic>;
  }

  /// Creates or links the `user` (admin) actor for a redirect-based [provider]
  /// after a successful callback.
  ///
  /// The token returned by [callback] is actorless until the user is
  /// provisioned. Pass it in the `authorization` header here, then call
  /// [refresh] to obtain a token bound to the newly linked user.
  Future<Map<String, dynamic>> createUser(String provider, {ClientHeaders? headers}) async {
    final res = await _client.fetch("/auth/$provider/user",
        init: FetchArgs(method: "POST", headers: headers));
    return res as Map<String, dynamic>;
  }

  Future<void> _setToken(String token) async {
    if (_config.auth?.type == AuthType.session) {
      await _client.fetch("/auth/session",
          init: FetchArgs(method: "POST", headers: {"authorization": "Bearer $token"}));
    } else {
      await _client.setToken(token);
    }
  }
}
