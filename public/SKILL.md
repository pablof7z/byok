---
name: byok-connect
description: Integrate client apps with BYOK authorization and key access. Use when Codex needs to connect a web app, server app, iOS app, native app, or hybrid app to BYOK using OAuth-style authorization, provider scopes such as key:openrouter or key:ollama, PKCE, redirect callbacks, token exchange, raw API key handling, secure storage, or launch/return URL flows.
---

# BYOK Connect

Use this skill to wire an app to BYOK without leaking secrets or inventing an unsafe auth flow. First inspect the BYOK repo and the target app for current endpoint names, SDKs, provider scope names, and callback conventions; treat this skill as the integration checklist, not runtime truth.

## Integration Flow

1. Identify the provider key the app needs, for example `key:openrouter` or `key:ollama`. Request the narrowest BYOK provider scopes required by the feature.
2. Use OAuth-style authorization for user consent. Generate a high-entropy `state`; use PKCE (`code_verifier` and S256 `code_challenge`) for public clients and iOS/native flows.
3. Launch BYOK authorization with `client_id`, `redirect_uri`, requested scopes, `state`, and PKCE challenge when applicable.
4. Handle the redirect callback. Verify `state` before exchanging the authorization code. Reject unknown callback origins, unexpected schemes, and missing PKCE state.
5. Exchange the code with BYOK from the correct trust boundary: server-side for confidential web apps; app-side only for public clients using PKCE.
6. Store returned BYOK grants/tokens securely. Retrieve or proxy provider keys only when needed, and never print, log, commit, or persist raw provider API keys outside the approved secret store.

## Web Apps

- Prefer a backend callback route such as `/api/byok/callback` that validates `state` and performs token exchange from the server.
- Keep BYOK tokens and raw provider keys out of browser localStorage, sessionStorage, IndexedDB, analytics, logs, and client-rendered HTML.
- Store server-held BYOK grants in encrypted server storage, a secret manager, or an HTTP-only secure session depending on the app architecture.
- If the web app is static or has no backend, use an explicit public-client + PKCE flow and keep only non-secret authorization state in the browser. Do not store raw API keys in browser storage.
- For provider API calls, prefer a server proxy that injects the key server-side. If a feature requires direct browser calls, confirm BYOK intentionally supports a constrained, short-lived browser-safe credential before implementing it.

## iOS And Native Apps

- Use PKCE. Persist only the `code_verifier`, `state`, and pending redirect context needed to finish the flow.
- Launch BYOK with `ASWebAuthenticationSession` or the platform's system browser auth flow so cookies, passkeys, and consent screens behave normally.
- Register and handle return URLs through the app's custom scheme or universal link, for example `myapp://byok/callback` or `https://app.example.com/byok/callback`.
- Validate the callback URL, `state`, and expected host/path before token exchange. Clear pending authorization state after success or failure.
- Store BYOK refresh tokens, access tokens, and any raw provider keys in Keychain with the narrowest practical accessibility class. Do not store secrets in `UserDefaults`, plist files, SQLite without encryption, debug logs, or crash breadcrumbs.
- If the native app needs to hand control to a web app and return, include an application return URL or nonce in the authorization state and validate it before opening it.

## Raw API Keys

- Prefer BYOK-managed grants/tokens over exposing raw provider API keys to the client app.
- If BYOK returns a raw provider key by design, treat it as a secret with the same controls as a user-entered API key: secure storage, no logs, no screenshots, no telemetry, redaction in error messages, and explicit deletion/revocation UX.
- Scope provider access narrowly. For example, request only `key:openrouter` for OpenRouter usage instead of broader provider or account scopes.
- Add tests or manual checks that verify secrets are not present in browser storage, app preferences, logs, crash reports, or committed files.

## Implementation Checks

- Match redirect URIs exactly with BYOK app registration and target app routing.
- Preserve CSRF protection with `state`; preserve interception protection with PKCE on public clients.
- Handle user cancellation, denied scopes, expired codes, replayed callbacks, network failures, and token revocation.
- Add a clear re-connect path when a BYOK grant expires or is revoked.
- Document required BYOK app registration values without recording real secrets.
