# BYOK

BYOK is a small multi-tenant key vault for labeled API keys. It supports two sharing modes:

- Web OAuth-style grants from `https://byok.f7z.io`.
- Native iOS app grants with the `byok://` URL scheme.

## One-Line Deploy

Run BYOK at home:

```sh
curl -fsSL https://byok.f7z.io/deploy.sh | sh
```

Deploy it to your own Vercel project:

```sh
curl -fsSL https://byok.f7z.io/deploy.sh | sh -s -- vercel
```

The installer clones `https://github.com/pablof7z/byok.git`, installs dependencies, generates `BYOK_TOKEN_SECRET`, and starts the local server or runs a Vercel production deploy. Vercel deployments should set `BLOB_READ_WRITE_TOKEN` for persistent encrypted storage.

## Integrate BYOK Into Another App

The BYOK integration skill is served at:

```text
https://byok.f7z.io/SKILL.md
```

Paste this one line into a coding agent inside the app you want to connect:

```text
Read https://byok.f7z.io/SKILL.md and follow it to integrate into the current app
```

## Accounts and Storage

The web app supports:

- GitHub OAuth sign-in.
- Manual passkey registration and sign-in.
- Passkey registration from an existing signed-in account for easier future login.

API keys are encrypted server-side with AES-256-GCM and stored in Vercel Blob. Browser storage is not used for key material. Grant history is recorded per signed-in user.

Production environment:

- `BLOB_READ_WRITE_TOKEN`: Vercel Blob store token.
- `BYOK_BLOB_ACCESS`: optional Blob write mode, `private` or `public`. Defaults to `private`; set `public` when the attached Vercel Blob store is public. The database blob is encrypted before upload in either mode.
- `BYOK_TOKEN_SECRET`: encryption/signing secret. `BYOK_SESSION_SECRET` and `BYOK_VAULT_SECRET` can be set separately; otherwise this secret is used.
- `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET`: required for GitHub OAuth sign-in.

## Web OAuth Flow

Apps start an authorization request:

```text
https://byok.f7z.io/authorize?response_type=code&client_id=com.example.app&app_name=Example&redirect_uri=example%3A%2F%2Fbyok&scope=key%3Aopenrouter&state=<state>&code_challenge=<pkce>&code_challenge_method=S256
```

Use the provider-specific scope for the key an app needs, for example
`key:openrouter`, `key:ollama`, `key:elevenlabs`, or `key:assemblyai`. Apps can request more than
one key in the same authorization request by separating scopes with spaces:
`scope=key:openrouter key:elevenlabs key:assemblyai key:ollama`.

BYOK asks the user to sign in if needed, then shows their labeled keys for each requested provider. The user chooses which keys to share, skips providers they do not want to grant, or saves a new key, then BYOK redirects:

```text
example://byok?code=<code>&state=<state>&provider=openrouter&key_id=<id>&key_label=Default
```

The app exchanges the code:

```http
POST /api/token
content-type: application/json

{
  "grant_type": "authorization_code",
  "code": "<code>",
  "code_verifier": "<pkce verifier>",
  "client_id": "com.example.app",
  "redirect_uri": "example://byok"
}
```

Successful responses intentionally return the raw API key because the app needs to call the upstream API directly:

```json
{
  "token_type": "raw_api_key",
  "provider": "openrouter",
  "api_key": "sk-...",
  "key_id": "...",
  "key_label": "Default"
}
```

When multiple provider keys were granted, the token response returns the selected keys:

```json
{
  "token_type": "raw_api_keys",
  "providers": [
    {
      "provider": "openrouter",
      "api_key": "sk-...",
      "key_id": "...",
      "key_label": "Default"
    },
    {
      "provider": "elevenlabs",
      "api_key": "sk_...",
      "key_id": "...",
      "key_label": "Default"
    }
  ]
}
```

The serverless API creates and redeems short-lived encrypted authorization codes. `/api/create-grant` requires a signed-in BYOK session and a server-side `key_id`; it does not accept raw API keys from client apps.

## Native iOS URL Scheme

Request format:

```text
byok://openrouter?callback=wintheday%3A%2F%2Fbyok&source=Win%20the%20Day
```

Callback format:

```text
wintheday://byok?service=openrouter&key=<raw-api-key>
```

The `service` value is normalized to lowercase letters, numbers, `-`, `_`, and `.`.

## Local Checks

```sh
npm test
```
