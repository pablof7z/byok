const assert = require("assert");
const { sealGrant, openGrant, sha256Base64url } = require("../api/_crypto");

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

console.log("BYOK grant seal/open test passed");
