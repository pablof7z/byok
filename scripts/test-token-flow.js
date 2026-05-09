const assert = require("assert");
const { sealGrant, openGrant, sha256Base64url } = require("../api/_crypto");
const { decryptAPIKey, upsertAPIKey } = require("../api/_db");

const verifier = "bullshit-test-verifier";

for (const provider of ["openrouter", "ollama"]) {
  const grant = {
    exp: Math.floor(Date.now() / 1000) + 180,
    provider,
    api_key: provider === "ollama" ? "ollama-test-key" : "sk-or-v1-bullshit-local-test",
    key_id: "test-key-id",
    key_label: provider === "ollama" ? "Bullshit Ollama" : "Bullshit OpenRouter",
    client_id: "com.winday.app",
    app_name: "Win the Day",
    redirect_uri: "wintheday://byok-oauth",
    state: "state-test",
    code_challenge: sha256Base64url(verifier),
    code_challenge_method: "S256"
  };

  const code = sealGrant(grant);
  const opened = openGrant(code);

  assert.equal(opened.provider, provider);
  assert.equal(opened.api_key, grant.api_key);
  assert.equal(opened.code_challenge, sha256Base64url(verifier));
}

const user = { id: "test-user", keys: [] };
const stored = upsertAPIKey(user, {
  provider: "ollama",
  label: "Default",
  api_key: "ollama-test-key"
});

assert.equal(stored.provider, "ollama");
assert.notEqual(stored.encryptedValue, "ollama-test-key");
assert.equal(decryptAPIKey(user, stored), "ollama-test-key");

console.log("BYOK grant seal/open test passed");
