const assert = require("assert");
const { sealGrant, openGrant, sha256Base64url } = require("../api/_crypto");

const verifier = "bullshit-test-verifier";
const grant = {
  exp: Math.floor(Date.now() / 1000) + 180,
  provider: "openrouter",
  api_key: "sk-or-v1-bullshit-local-test",
  key_id: "test-key-id",
  key_label: "Bullshit OpenRouter",
  client_id: "com.winday.app",
  app_name: "Win the Day",
  redirect_uri: "wintheday://byok-oauth",
  state: "state-test",
  code_challenge: sha256Base64url(verifier),
  code_challenge_method: "S256"
};

const code = sealGrant(grant);
const opened = openGrant(code);

assert.equal(opened.provider, "openrouter");
assert.equal(opened.api_key, "sk-or-v1-bullshit-local-test");
assert.equal(opened.code_challenge, sha256Base64url(verifier));

console.log("BYOK grant seal/open test passed");

