(function () {
  const $ = (selector) => document.querySelector(selector);
  const TESTFLIGHT_URL = "https://testflight.apple.com/join/u39ygm8r";
  const DEPLOY_HOME_COMMAND = "curl -fsSL https://byok.f7z.io/deploy.sh | sh";
  const DEPLOY_VERCEL_COMMAND = "curl -fsSL https://byok.f7z.io/deploy.sh | sh -s -- vercel";
  const INTEGRATION_PROMPT = "Read https://byok.f7z.io/SKILL.md and follow it to integrate into the current app";
  const dateTimeFormatter = new Intl.DateTimeFormat(navigator.languages || undefined, {
    dateStyle: "medium",
    timeStyle: "short"
  });
  let state = { user: null, providers: [], loaded: false, busy: false };

  function normalize(value) {
    return String(value || "").trim().toLowerCase().replace(/[^a-z0-9._-]/g, "");
  }

  function providerFor(service) {
    return state.providers.find((provider) => provider.service === normalize(service));
  }

  function displayName(service, fallback) {
    const provider = providerFor(service);
    if (provider) return provider.name;
    if (fallback) return fallback;
    return normalize(service).replaceAll("-", " ").replaceAll("_", " ").replace(/\b\w/g, (c) => c.toUpperCase());
  }

  function logo(service, size = 38) {
    const provider = providerFor(service);
    const mark = provider ? provider.mark : (normalize(service).slice(0, 2).toUpperCase() || "?");
    const bg = provider ? provider.bg : "var(--surface-muted)";
    const fg = provider ? provider.fg : "var(--accent)";
    return `<span class="logo" aria-hidden="true" style="--logo-size:${size}px;--logo-bg:${bg};--logo-fg:${fg};--logo-font:${mark.length > 1 ? size * 0.38 : size * 0.54}px">${escapeHtml(mark)}</span>`;
  }

  function escapeHtml(value) {
    return String(value || "").replace(/[&<>"']/g, (char) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;"
    })[char]);
  }

  async function api(path, options = {}) {
    const response = await fetch(path, {
      ...options,
      headers: {
        ...(options.body ? { "content-type": "application/json" } : {}),
        ...(options.headers || {})
      }
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.error || "request_failed");
    return body;
  }

  function currentPage(path) {
    return location.pathname === path ? ` aria-current="page"` : "";
  }

  function announce(message) {
    const region = $("#status-region");
    if (region) region.textContent = message;
  }

  function formatDateTime(value) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "Unknown Time";
    return dateTimeFormatter.format(date);
  }

  async function refresh() {
    const body = await api("/api/me");
    state.user = body.user;
    state.providers = body.providers || [];
    state.loaded = true;
  }

  function parseAuthorize() {
    const params = new URLSearchParams(location.search);
    const scope = params.get("scope") || "";
    const providers = [];
    for (const item of scope.split(/\s+/)) {
      if (!item.startsWith("key:")) continue;
      const provider = normalize(item.slice(4));
      if (provider && !providers.includes(provider)) providers.push(provider);
    }
    for (const item of (params.get("providers") || "").split(",")) {
      const provider = normalize(item);
      if (provider && !providers.includes(provider)) providers.push(provider);
    }
    const explicitProvider = normalize(params.get("provider"));
    if (explicitProvider && !providers.includes(explicitProvider)) providers.push(explicitProvider);
    if (location.pathname !== "/authorize" || !providers.length) return null;
    return {
      provider: providers[0],
      providers,
      responseType: params.get("response_type") || "code",
      clientID: params.get("client_id") || "",
      appName: params.get("app_name") || params.get("client_id") || "Unknown app",
      redirectURI: params.get("redirect_uri") || "",
      state: params.get("state") || "",
      codeChallenge: params.get("code_challenge") || "",
      codeChallengeMethod: params.get("code_challenge_method") || "S256"
    };
  }

  function shell(content) {
    $("#app").innerHTML = `
      <section class="shell">
        <header class="topbar">
          <a class="brand" href="/" data-route-link aria-label="BYOK Home">
            <span class="brand-mark" aria-hidden="true">B</span>
            <span class="brand-copy">
              <span class="brand-title">BYOK</span>
              <span class="brand-subtitle">Private API Key Access</span>
            </span>
          </a>
          <nav class="nav" aria-label="Primary">
            <a class="nav-link" href="/deploy" data-route-link${currentPage("/deploy")}>Deploy</a>
            <a class="nav-link" href="/integrate" data-route-link${currentPage("/integrate")}>Integrate</a>
            ${state.user ? `
              <button class="nav-button" type="button" data-nav="keys"${currentPage("/")}>Vault</button>
              <button class="nav-button" type="button" data-nav="grants"${currentPage("/grants")}>Grants</button>
              <button class="button secondary nav-cta" type="button" id="logout">Sign Out</button>
            ` : `
              <a class="button nav-cta" href="/login" data-route-link${currentPage("/login")}>Open Vault</a>
            `}
          </nav>
        </header>
        <div class="sr-only" id="status-region" aria-live="polite"></div>
        ${content}
      </section>
    `;
    document.querySelectorAll("[data-route-link]").forEach((link) => {
      link.addEventListener("click", (event) => {
        if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
        event.preventDefault();
        history.pushState({}, "", link.getAttribute("href"));
        route();
      });
    });
    document.querySelectorAll("[data-nav]").forEach((button) => {
      button.addEventListener("click", () => {
        history.pushState({}, "", button.dataset.nav === "grants" ? "/grants" : "/");
        route();
      });
    });
    document.querySelectorAll("[data-copy-target]").forEach((button) => {
      button.addEventListener("click", async () => {
        const target = document.getElementById(button.dataset.copyTarget);
        const text = target?.dataset.copyValue || target?.textContent || "";
        if (!text.trim()) return;
        await navigator.clipboard?.writeText(text.trim());
        const previous = button.textContent;
        button.textContent = "Copied";
        announce("Copied to clipboard.");
        setTimeout(() => {
          button.textContent = previous;
        }, 1200);
      });
    });
    $("#logout")?.addEventListener("click", async () => {
      await api("/api/auth/logout", { method: "POST" });
      state.user = null;
      history.pushState({}, "", "/");
      route();
    });
  }

  function testFlightButton(label = "Join TestFlight") {
    const url = TESTFLIGHT_URL.trim();
    if (url) {
      return `<a class="button" href="${escapeHtml(url)}" target="_blank" rel="noreferrer noopener">${escapeHtml(label)}</a>`;
    }
    return `<button class="button" type="button" disabled title="TestFlight invite link coming soon">TestFlight Invite Soon</button>`;
  }

  function returnTo() {
    return encodeURIComponent(location.pathname + location.search);
  }

  function copyBlock(id, text, label = "Copy") {
    return `
      <div class="copy-block">
        <code id="${escapeHtml(id)}" translate="no">${escapeHtml(text)}</code>
        <button class="button secondary copy-button" type="button" data-copy-target="${escapeHtml(id)}">${escapeHtml(label)}</button>
      </div>
    `;
  }

  function renderLanding() {
    shell(`
      <section class="hero">
        <div class="hero-copy">
          <p class="kicker">Private API Key Access</p>
          <h1>BYOK</h1>
          <p class="lead">Store provider keys once. Approve access only when an app asks. Keep a simple ledger of what each app received.</p>
          <div class="button-row">
            <a class="button" href="/login" data-route-link>Open Vault</a>
            <a class="button secondary" href="/deploy" data-route-link>Deploy Your Own</a>
            ${testFlightButton()}
          </div>
        </div>
        <aside class="request-panel" aria-label="Example Access Request">
          <div class="request-header">
            <span class="meta">Access Request</span>
            <span class="status-pill">Pending</span>
          </div>
          <dl>
            <div class="request-line">
              <dt class="request-label">App</dt>
              <dd class="request-value">Win the Day</dd>
            </div>
            <div class="request-line">
              <dt class="request-label">Provider</dt>
              <dd class="request-value">Ollama Cloud</dd>
            </div>
            <div class="request-line">
              <dt class="request-label">Scope</dt>
              <dd class="request-value" translate="no">key:ollama</dd>
            </div>
          </dl>
          <div class="key-line">
            ${logo("ollama", 40)}
            <div>
              <div class="key-title">Personal</div>
              <div class="service">Chosen Key</div>
            </div>
          </div>
        </aside>
      </section>
      <section class="principle-grid" aria-label="Core Flow">
        <article class="principle">
          <span class="step-number">01</span>
          <h2>Store Keys</h2>
          <p class="muted">Keep OpenRouter, Ollama Cloud, ElevenLabs, AssemblyAI, and custom provider keys in one encrypted vault.</p>
        </article>
        <article class="principle">
          <span class="step-number">02</span>
          <h2>Approve Access</h2>
          <p class="muted">Apps request a provider scope. You choose a labeled key or reject the request.</p>
        </article>
        <article class="principle">
          <span class="step-number">03</span>
          <h2>Keep the Ledger</h2>
          <p class="muted">Review grants later so key access stays explicit instead of scattered across apps.</p>
        </article>
      </section>
    `);
  }

  function renderDeploy() {
    shell(`
      <section class="page-heading">
        <p class="kicker">Run Your Own Vault</p>
        <h1>Deploy BYOK</h1>
        <p class="lead">Install a private local vault or push the same app to your own Vercel project.</p>
      </section>
      <section class="command-list">
        <article class="command-row">
          <div>
            <span class="status-pill green">Home</span>
            <h2>Local Private Vault</h2>
            <p class="muted">Runs on your machine with encrypted data stored under the app local directory.</p>
          </div>
          <div class="command-copy">${copyBlock("home-deploy-command", DEPLOY_HOME_COMMAND, "Copy Command")}</div>
        </article>
        <article class="command-row">
          <div>
            <span class="status-pill blue">Vercel</span>
            <h2>Your Vercel Project</h2>
            <p class="muted">Uses the same app and prompts for production environment values before deploying.</p>
          </div>
          <div class="command-copy">${copyBlock("vercel-deploy-command", DEPLOY_VERCEL_COMMAND, "Copy Command")}</div>
        </article>
      </section>
      <section class="detail-list" aria-label="Installer Details">
        <div class="detail-line">
          <h2>Source</h2>
          <p class="muted">Clones <code translate="no">https://github.com/pablof7z/byok.git</code> into <code translate="no">~/byok</code> unless <code translate="no">BYOK_DIR</code> is set. Existing checkouts are updated with <code translate="no">git pull --ff-only</code>.</p>
        </div>
        <div class="detail-line">
          <h2>Secrets</h2>
          <p class="muted">Generates <code translate="no">BYOK_TOKEN_SECRET</code> for encryption and sessions. Vercel mode can upload <code translate="no">BLOB_READ_WRITE_TOKEN</code> and GitHub OAuth values when provided.</p>
        </div>
        <div class="detail-line">
          <h2>Storage</h2>
          <p class="muted">Home mode stores encrypted data locally. Vercel mode should use a Vercel Blob read/write token for persistent production storage.</p>
        </div>
      </section>
    `);
  }

  function renderIntegrate() {
    shell(`
      <section class="page-heading">
        <p class="kicker">Integrate BYOK</p>
        <h1>Connect an App</h1>
        <p class="lead">Give this prompt to the coding agent working inside the app you want to connect.</p>
      </section>
      <section class="command-list">
        <article class="command-row">
          <div>
            <span class="status-pill blue">Agent Prompt</span>
            <h2>Implementation Checklist</h2>
            <p class="muted">The hosted skill lives at <a class="quiet-link" href="/SKILL.md">/SKILL.md</a> and describes the OAuth-style key flow.</p>
          </div>
          <div class="command-copy">${copyBlock("integration-agent-prompt", INTEGRATION_PROMPT, "Copy Prompt")}</div>
        </article>
      </section>
      <section class="detail-list" aria-label="Integration Details">
        <div class="detail-line">
          <h2>Covers</h2>
          <p class="muted">Authorization, provider scopes such as <code translate="no">key:openrouter</code>, <code translate="no">key:assemblyai</code>, and <code translate="no">key:ollama</code>, PKCE, redirect callbacks, token exchange, secure storage, and raw-key leak checks.</p>
        </div>
      </section>
    `);
  }

  function renderSignedOut(authRequest) {
    const error = new URLSearchParams(location.search).get("error");
    const title = authRequest
      ? `${escapeHtml(authRequest.appName)} Wants ${escapeHtml(requestedProviderTitle(authRequest))}`
      : "Sign In to BYOK";
    shell(`
      <section class="auth-layout">
        <div>
          <p class="kicker">${authRequest ? "Approve Request" : "Open Vault"}</p>
          <h1 id="auth-title">${title}</h1>
          <p class="lead">Your API keys are encrypted on the server and released only after you choose a labeled key.</p>
        </div>
        <section class="surface auth-panel" aria-labelledby="auth-title">
          ${error ? `<p class="notice danger-text" role="alert">${escapeHtml(error.replaceAll("_", " "))}</p>` : ""}
          <div class="auth-grid">
            <a class="button auth-button" href="/api/auth/github/start?return_to=${returnTo()}">Continue With GitHub</a>
            <button class="button secondary auth-button" type="button" id="passkey-login">Sign In With Passkey</button>
          </div>
          <div class="divider"></div>
          <form class="form-grid" id="passkey-signup-form">
            <div class="field">
              <label for="signup-email">Email</label>
              <input id="signup-email" name="email" type="email" autocomplete="email" inputmode="email" spellcheck="false" placeholder="alex@example.com…" required>
            </div>
            <div class="field">
              <label for="signup-name">Name</label>
              <input id="signup-name" name="name" autocomplete="name" placeholder="Ada Lovelace…">
            </div>
            <button class="button" type="submit">Create Passkey Account</button>
          </form>
        </section>
      </section>
    `);
    $("#passkey-login").addEventListener("click", signInWithPasskey);
    $("#passkey-signup-form").addEventListener("submit", async (event) => {
      event.preventDefault();
      await signUpWithPasskey($("#signup-email").value, $("#signup-name").value);
    });
  }

  function renderHome() {
    const keys = state.user.keys || [];
    shell(`
      <section class="workspace-heading">
        <p class="kicker">Vault</p>
        <h1>Keys & Grants</h1>
        <p class="lead">Manage stored provider keys and approve access requests from connected apps.</p>
      </section>
      <section class="dashboard-grid">
        <aside class="surface account-panel" aria-label="Account Summary">
          <div class="account-line">
            <h2>Account</h2>
            <p class="muted">${escapeHtml(state.user.email || state.user.name || "Signed In")}</p>
          </div>
          <div class="metric">
            <span class="meta">Saved Keys</span>
            <span class="metric-value">${keys.length}</span>
          </div>
          <div class="metric">
            <span class="meta">Passkeys</span>
            <span class="metric-value">${state.user.passkeyCount || 0}</span>
          </div>
          <button class="button secondary" type="button" id="add-passkey">Add Passkey</button>
        </aside>
        <section class="surface keys-panel" aria-labelledby="keys-title">
          <div class="list-header">
            <div>
              <h2 id="keys-title">API Keys</h2>
              <p class="muted">Stored encrypted in Vercel. Raw values are only decrypted for explicit grants.</p>
            </div>
            <button class="button" type="button" id="new-key">Add Key</button>
          </div>
          <div class="key-list">
            ${keys.length ? keys.map(keyRow).join("") : `<p class="muted">No keys saved yet. Add one to make app requests useful.</p>`}
          </div>
        </section>
      </section>
    `);
    $("#add-passkey").addEventListener("click", addPasskeyToCurrentAccount);
    $("#new-key").addEventListener("click", () => renderKeyEditor());
    document.querySelectorAll("[data-edit-key]").forEach((button) => {
      button.addEventListener("click", () => renderKeyEditor(keys.find((item) => item.id === button.dataset.editKey)));
    });
  }

  function keyRow(key) {
    return `
      <button class="list-button" type="button" data-edit-key="${escapeHtml(key.id)}">
        <div class="row">
          ${logo(key.provider)}
          <div>
            <div class="key-title">${escapeHtml(displayName(key.provider))} · ${escapeHtml(key.label)}</div>
            <div class="service">${escapeHtml(key.provider)}</div>
          </div>
        </div>
      </button>
    `;
  }

  function renderKeyEditor(existing, authRequest, defaults = {}) {
    const selected = existing?.provider || defaults.provider || authRequest?.provider || "openrouter";
    shell(`
      <section class="editor-layout">
        <div>
          <p class="kicker">Vault Key</p>
          <h1>${existing ? "Edit Key" : "Add Key"}</h1>
          <p class="lead">Labels help you choose the right key when an app asks for provider access.</p>
        </div>
        <form class="surface editor-panel" id="key-form">
          <div class="form-grid">
            <div class="field">
              <label for="provider">Provider</label>
              <select id="provider" name="provider" autocomplete="off">
                ${state.providers.map((provider) => `<option value="${provider.service}" ${provider.service === selected ? "selected" : ""}>${provider.name}</option>`).join("")}
                <option value="custom" ${providerFor(selected) ? "" : "selected"}>Custom Provider</option>
              </select>
            </div>
            <div class="field ${providerFor(selected) ? "hidden" : ""}" id="custom-provider-wrap">
              <label for="custom-provider">Service Name</label>
              <input id="custom-provider" name="custom_provider" value="${providerFor(selected) ? "" : escapeHtml(selected)}" placeholder="provider-name…" autocapitalize="none" autocomplete="off" spellcheck="false">
            </div>
            <div class="field">
              <label for="label">Label</label>
              <input id="label" name="label" value="${escapeHtml(existing?.label || defaults.label || "Default")}" placeholder="Personal…" autocomplete="off">
            </div>
            <div class="field">
              <label for="api-key">API Key</label>
              <input id="api-key" name="api_key" type="password" placeholder="${existing ? "replacement key..." : "paste provider key..."}" autocomplete="off" autocapitalize="none" spellcheck="false" aria-describedby="key-form-error">
            </div>
            <p class="form-error hidden" id="key-form-error" aria-live="polite"></p>
          </div>
          ${existing ? `
            <div class="secret-panel" aria-labelledby="secret-title">
              <div>
                <h2 id="secret-title">Raw API Key</h2>
                <p class="muted">Reveal only when you need to inspect or migrate the stored key.</p>
              </div>
              <div class="secret-actions">
                <button class="button secondary" type="button" id="reveal-key">Show Raw API Key</button>
                <button class="button secondary hidden" type="button" id="hide-key">Hide Key</button>
              </div>
              <div class="copy-block hidden" id="revealed-key-wrap">
                <code id="revealed-key" translate="no"></code>
                <button class="button secondary copy-button" type="button" id="copy-revealed-key">Copy</button>
              </div>
              <p class="form-error hidden" id="reveal-key-error" aria-live="polite"></p>
            </div>
          ` : ""}
          <div class="actions">
            <button class="button" type="submit" id="save-key">Save Key</button>
            <button class="button secondary" type="button" id="cancel">Cancel</button>
            ${existing ? `<button class="button danger" type="button" id="delete-key">Delete Key</button>` : ""}
          </div>
        </form>
      </section>
    `);

    $("#provider").addEventListener("change", () => {
      $("#custom-provider-wrap").classList.toggle("hidden", $("#provider").value !== "custom");
    });
    $("#cancel").addEventListener("click", () => authRequest ? renderAuthorize(authRequest) : renderHome());
    $("#key-form").addEventListener("submit", async (event) => {
      event.preventDefault();
      const error = $("#key-form-error");
      const saveButton = $("#save-key");
      error.classList.add("hidden");
      error.textContent = "";
      const provider = $("#provider").value === "custom" ? normalize($("#custom-provider").value) : $("#provider").value;
      const body = {
        id: existing?.id,
        provider,
        label: $("#label").value.trim() || "Default",
        api_key: $("#api-key").value.trim()
      };

      if (!body.provider) {
        error.textContent = "Enter a provider service name.";
        error.classList.remove("hidden");
        $("#custom-provider").focus();
        return;
      }
      if (!body.api_key) {
        error.textContent = existing ? "Paste the replacement API key before saving." : "Paste the API key before saving.";
        error.classList.remove("hidden");
        $("#api-key").focus();
        return;
      }

      saveButton.disabled = true;
      saveButton.textContent = "Saving…";
      try {
        const result = await api("/api/keys", { method: "POST", body: JSON.stringify(body) });
        state.user = result.user;
        if (authRequest) {
          const created = state.user.keys.find((key) => key.provider === provider && key.label === body.label);
          return renderAuthorize(authRequest, { [provider]: created?.id });
        }
        renderHome();
      } catch (apiError) {
        error.textContent = `${apiError.message.replaceAll("_", " ")}. Check the key and try again.`;
        error.classList.remove("hidden");
        $("#api-key").focus();
      } finally {
        saveButton.disabled = false;
        saveButton.textContent = "Save Key";
      }
    });
    $("#delete-key")?.addEventListener("click", async () => {
      if (!window.confirm("Delete this API key? Existing app grants for this stored key will stop working.")) return;
      const result = await api(`/api/keys?id=${encodeURIComponent(existing.id)}`, { method: "DELETE" });
      state.user = result.user;
      renderHome();
    });
    if (existing) setupRevealKey(existing);
  }

  function setupRevealKey(existing) {
    const revealButton = $("#reveal-key");
    const hideButton = $("#hide-key");
    const copyButton = $("#copy-revealed-key");
    const value = $("#revealed-key");
    const wrap = $("#revealed-key-wrap");
    const error = $("#reveal-key-error");
    if (!revealButton || !hideButton || !copyButton || !value || !wrap || !error) return;

    revealButton.addEventListener("click", async () => {
      error.classList.add("hidden");
      error.textContent = "";
      revealButton.disabled = true;
      revealButton.textContent = "Revealing...";
      try {
        const result = await api("/api/reveal-key", {
          method: "POST",
          body: JSON.stringify({ id: existing.id })
        });
        value.textContent = result.api_key || "";
        value.dataset.copyValue = result.api_key || "";
        wrap.classList.remove("hidden");
        hideButton.classList.remove("hidden");
        revealButton.textContent = "Refresh Raw API Key";
        announce("Raw API key revealed.");
      } catch (apiError) {
        error.textContent = `${apiError.message.replaceAll("_", " ")}.`;
        error.classList.remove("hidden");
        revealButton.textContent = "Show Raw API Key";
      } finally {
        revealButton.disabled = false;
      }
    });

    hideButton.addEventListener("click", () => {
      value.textContent = "";
      value.dataset.copyValue = "";
      wrap.classList.add("hidden");
      hideButton.classList.add("hidden");
      revealButton.textContent = "Show Raw API Key";
      announce("Raw API key hidden.");
    });

    copyButton.addEventListener("click", async () => {
      const text = value.dataset.copyValue || "";
      if (!text) return;
      await navigator.clipboard?.writeText(text);
      copyButton.textContent = "Copied";
      announce("Raw API key copied.");
      setTimeout(() => {
        copyButton.textContent = "Copy";
      }, 1200);
    });
  }

  function renderGrants() {
    const grants = state.user.grants || [];
    shell(`
      <section class="workspace-heading">
        <p class="kicker">Ledger</p>
        <h1>Grant History</h1>
        <p class="lead">A record of apps that received a labeled provider key.</p>
      </section>
      <section class="key-list" aria-label="Grant History">
          ${grants.length ? grants.map((grant) => `
            <div class="grant-row">
              ${logo(grant.provider)}
              <div>
                <div class="key-title">${escapeHtml(grant.appName)} Got ${escapeHtml(displayName(grant.provider))} · ${escapeHtml(grant.keyLabel)}</div>
                <div class="service">${escapeHtml(formatDateTime(grant.createdAt))}</div>
              </div>
            </div>
          `).join("") : `<p class="muted">No grants yet.</p>`}
      </section>
    `);
  }

  function requestedProviderTitle(request) {
    if ((request.providers || []).length <= 1) return displayName(request.provider);
    return `${request.providers.length} Provider Keys`;
  }

  function renderAuthorize(request, preferredSelections = {}) {
    const selectedByProvider = {};
    for (const provider of request.providers) {
      const providerKeys = (state.user.keys || []).filter((key) => key.provider === provider);
      selectedByProvider[provider] = preferredSelections[provider] || providerKeys[0]?.id || "";
    }
    shell(`
      <section class="authorize-layout">
        <div>
          <p class="kicker">Access Request</p>
          <h1>${escapeHtml(request.appName)} Wants ${escapeHtml(requestedProviderTitle(request))}</h1>
          <p class="lead">Choose which saved keys this app can use. Providers without a selected key are skipped.</p>
        </div>
        <div class="surface authorize-panel">
          <div id="authorize-body"></div>
        </div>
      </section>
    `);

    function draw() {
      const body = $("#authorize-body");
      const selectedCount = Object.values(selectedByProvider).filter(Boolean).length;

      body.innerHTML = `
        <div class="stack">
          ${request.providers.map((provider) => {
            const available = (state.user.keys || []).filter((key) => key.provider === provider);
            const selectedID = selectedByProvider[provider] || "";
            return `
              <div class="provider-request">
                <div class="provider-request-header">
                  <div class="row">
                    ${logo(provider)}
                    <div>
                      <div class="key-title">${escapeHtml(displayName(provider))}</div>
                      <div class="service" translate="no">key:${escapeHtml(provider)}</div>
                    </div>
                  </div>
                  <button class="button secondary small-button" type="button" data-add-provider="${escapeHtml(provider)}">Add Key</button>
                </div>
                ${available.length ? `
                  <div class="stack compact-stack">
                    ${available.map((key) => `
                      <button class="key-row ${key.id === selectedID ? "selected" : ""}" type="button" data-provider="${escapeHtml(provider)}" data-key-id="${escapeHtml(key.id)}" aria-pressed="${key.id === selectedID ? "true" : "false"}">
                        <div class="row">
                          ${logo(key.provider)}
                          <div>
                            <div class="key-title">${escapeHtml(key.label)}</div>
                            <div class="service">${escapeHtml(key.provider)}</div>
                          </div>
                        </div>
                      </button>
                    `).join("")}
                    <button class="key-row ${selectedID ? "" : "selected"}" type="button" data-provider="${escapeHtml(provider)}" data-skip-provider="${escapeHtml(provider)}" aria-pressed="${selectedID ? "false" : "true"}">
                      <div class="row">
                        <span class="provider-logo muted-logo" aria-hidden="true">--</span>
                        <div>
                          <div class="key-title">Do Not Share</div>
                          <div class="service">Skip this provider</div>
                        </div>
                      </div>
                    </button>
                  </div>
                ` : `
                  <p class="muted">No saved ${escapeHtml(displayName(provider))} key. Add one or leave this provider skipped.</p>
                `}
              </div>
            `;
          }).join("")}
        </div>
        <div class="actions">
          <button class="button" type="button" id="grant"${selectedCount ? "" : " disabled"}>${selectedCount ? `Grant ${selectedCount} Selected ${selectedCount === 1 ? "Key" : "Keys"}` : "Grant Selected Keys"}</button>
          <button class="button secondary" type="button" id="deny">Reject</button>
        </div>
      `;
      document.querySelectorAll("[data-add-provider]").forEach((button) => {
        button.addEventListener("click", () => {
          renderKeyEditor(null, request, { provider: button.dataset.addProvider, label: "Default" });
        });
      });
      document.querySelectorAll("[data-key-id], [data-skip-provider]").forEach((button) => {
        button.addEventListener("click", () => {
          selectedByProvider[button.dataset.provider] = button.dataset.keyId || "";
          draw();
        });
      });
      $("#grant").addEventListener("click", async () => {
        await grant(request, selectedByProvider);
      });
      $("#deny").addEventListener("click", () => deny(request));
    }

    draw();
  }

  async function grant(request, selectedByProvider) {
    const selections = request.providers
      .map((provider) => ({ provider, key_id: selectedByProvider[provider] }))
      .filter((item) => item.key_id);
    if (!selections.length) return;
    const response = await api("/api/create-grant", {
      method: "POST",
      body: JSON.stringify({
        selections,
        client_id: request.clientID,
        app_name: request.appName,
        redirect_uri: request.redirectURI,
        state: request.state,
        code_challenge: request.codeChallenge,
        code_challenge_method: request.codeChallengeMethod
      })
    });
    state.user = response.user || state.user;
    const redirect = new URL(request.redirectURI);
    redirect.searchParams.set("code", response.code);
    if (request.state) redirect.searchParams.set("state", request.state);
    if (selections.length === 1) {
      const selected = state.user.keys.find((key) => key.id === selections[0].key_id);
      redirect.searchParams.set("provider", selections[0].provider);
      redirect.searchParams.set("key_id", selections[0].key_id);
      redirect.searchParams.set("key_label", selected?.label || "");
    } else {
      redirect.searchParams.set("providers", selections.map((item) => item.provider).join(","));
    }
    location.href = redirect.toString();
  }

  function deny(request) {
    if (!request.redirectURI) {
      route();
      return;
    }
    const redirect = new URL(request.redirectURI);
    redirect.searchParams.set("error", "access_denied");
    if (request.state) redirect.searchParams.set("state", request.state);
    location.href = redirect.toString();
  }

  async function signUpWithPasskey(email, name) {
    const options = await api("/api/passkey/register-options", {
      method: "POST",
      body: JSON.stringify({ email, name })
    });
    const credential = await navigator.credentials.create({ publicKey: publicKeyCreationOptions(options) });
    const result = await api("/api/passkey/register-verify", {
      method: "POST",
      body: JSON.stringify(credentialToJSON(credential))
    });
    state.user = result.user;
    route();
  }

  async function addPasskeyToCurrentAccount() {
    const options = await api("/api/passkey/register-options", {
      method: "POST",
      body: "{}"
    });
    const credential = await navigator.credentials.create({ publicKey: publicKeyCreationOptions(options) });
    const result = await api("/api/passkey/register-verify", {
      method: "POST",
      body: JSON.stringify(credentialToJSON(credential))
    });
    state.user = result.user;
    renderHome();
  }

  async function signInWithPasskey() {
    const options = await api("/api/passkey/login-options", { method: "POST", body: "{}" });
    const credential = await navigator.credentials.get({ publicKey: publicKeyRequestOptions(options) });
    const result = await api("/api/passkey/login-verify", {
      method: "POST",
      body: JSON.stringify(credentialToJSON(credential))
    });
    state.user = result.user;
    route();
  }

  function publicKeyCreationOptions(options) {
    return {
      ...options,
      challenge: base64urlToBuffer(options.challenge),
      user: { ...options.user, id: base64urlToBuffer(options.user.id) },
      excludeCredentials: (options.excludeCredentials || []).map((credential) => ({ ...credential, id: base64urlToBuffer(credential.id) }))
    };
  }

  function publicKeyRequestOptions(options) {
    return {
      ...options,
      challenge: base64urlToBuffer(options.challenge),
      allowCredentials: (options.allowCredentials || []).map((credential) => ({ ...credential, id: base64urlToBuffer(credential.id) }))
    };
  }

  function credentialToJSON(credential) {
    const response = {};
    for (const key in credential.response) {
      const value = credential.response[key];
      if (value instanceof ArrayBuffer) response[key] = bufferToBase64url(value);
    }
    if (credential.response.getTransports) response.transports = credential.response.getTransports();
    return {
      id: credential.id,
      rawId: bufferToBase64url(credential.rawId),
      type: credential.type,
      authenticatorAttachment: credential.authenticatorAttachment,
      clientExtensionResults: credential.getClientExtensionResults(),
      response
    };
  }

  function base64urlToBuffer(value) {
    const base64 = String(value).replaceAll("-", "+").replaceAll("_", "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
    return bytes.buffer;
  }

  function bufferToBase64url(buffer) {
    const bytes = new Uint8Array(buffer);
    let binary = "";
    for (const byte of bytes) binary += String.fromCharCode(byte);
    return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
  }

  async function route() {
    const auth = parseAuthorize();
    if (location.pathname === "/deploy") {
      renderDeploy();
      return;
    }
    if (location.pathname === "/integrate") {
      renderIntegrate();
      return;
    }
    if (!state.loaded) await refresh();
    if (!state.user) {
      if (auth || location.pathname !== "/") {
        renderSignedOut(auth);
      } else {
        renderLanding();
      }
      return;
    }
    if (auth) {
      renderAuthorize(auth);
      return;
    }
    if (location.pathname === "/grants") {
      renderGrants();
      return;
    }
    renderHome();
  }

  window.addEventListener("popstate", route);
  route().catch((error) => {
    if (location.pathname === "/") {
      renderLanding();
      return;
    }
    shell(`<section class="panel"><h2>BYOK is unavailable</h2><p class="muted">${escapeHtml(error.message)}</p></section>`);
  });
})();
