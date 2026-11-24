const test = require("node:test");
const assert = require("node:assert/strict");
const {
  AUTHORIZED_ORIGIN_SECRET_KEY,
  LEGACY_TOKEN_SECRET_KEY,
  DevHubApi,
} = require("../out/api.js");

class FakeSecretStorage {
  values = new Map();

  async get(key) {
    return this.values.get(key);
  }

  async store(key, value) {
    this.values.set(key, value);
  }

  async delete(key) {
    this.values.delete(key);
  }
}

function stubFetch(t, response = { ok: true, status: 200, json: async () => ({ ok: true }) }) {
  const originalFetch = global.fetch;
  const calls = [];
  global.fetch = async (input, init) => {
    calls.push({ input, init });
    return response;
  };
  t.after(() => {
    global.fetch = originalFetch;
  });
  return calls;
}

test("HTTPS origin change hasToken false and sends no request or bearer token", async (t) => {
  const secrets = new FakeSecretStorage();
  let backend = "https://trusted.example";
  const api = new DevHubApi(() => backend, secrets);
  const calls = stubFetch(t);

  await api.bindToken(backend, "sensitive-token");
  assert.equal(await api.hasToken(), true);

  backend = "https://attacker.example";
  assert.equal(await api.hasToken(), false);
  await assert.rejects(api.getTree(), /não autorizado/);
  assert.equal(calls.length, 0);
  assert.equal(secrets.values.get(AUTHORIZED_ORIGIN_SECRET_KEY), "https://trusted.example");
});

test("loopback-to-remote origin change does not carry the loopback token", async (t) => {
  const secrets = new FakeSecretStorage();
  let backend = "http://localhost:8000";
  const api = new DevHubApi(() => backend, secrets);
  const calls = stubFetch(t);

  await api.bindToken(backend, "local-token");
  backend = "https://remote.example";

  assert.equal(await api.hasToken(), false);
  await assert.rejects(api.get("/api/v1/session"), /não autorizado/);
  assert.equal(calls.length, 0);
});

test("an explicitly bound token is sent to the same normalized origin", async (t) => {
  const secrets = new FakeSecretStorage();
  const backend = "https://devhub.example.test/";
  const api = new DevHubApi(() => backend, secrets);
  const calls = stubFetch(t);

  await api.bindToken("https://devhub.example.test", "same-origin-token");
  assert.equal(await api.hasToken(), true);
  assert.deepEqual(await api.get("/api/v1/session"), { ok: true });
  assert.equal(calls.length, 1);
  assert.equal(new URL(calls[0].input).origin, "https://devhub.example.test");
  assert.equal(new Headers(calls[0].init.headers).get("Authorization"), "Bearer same-origin-token");
});

test("legacy unbound token is ignored and disconnect clears the active binding", async (t) => {
  const secrets = new FakeSecretStorage();
  const backend = "https://devhub.example.test";
  const api = new DevHubApi(() => backend, secrets);
  const calls = stubFetch(t);

  await secrets.store(LEGACY_TOKEN_SECRET_KEY, "legacy-token");
  assert.equal(await api.hasToken(), false);
  await assert.rejects(api.get("/api/v1/session"), /não autorizado/);
  assert.equal(calls.length, 0);

  await api.bindToken(backend, "new-token");
  await api.clearBoundToken();
  assert.equal(await api.hasToken(), false);
  assert.equal(secrets.values.has(AUTHORIZED_ORIGIN_SECRET_KEY), false);
  assert.equal(secrets.values.has(LEGACY_TOKEN_SECRET_KEY), false);
  assert.equal(await api.get("/api/v1/session").catch(() => "blocked"), "blocked");
  assert.equal(calls.length, 0);
});

test("request URL uses the origin captured before asynchronous secret reads", async (t) => {
  const secrets = new FakeSecretStorage();
  let backend = "https://authorized.example";
  const api = new DevHubApi(() => backend, secrets);
  const calls = stubFetch(t);
  await api.bindToken(backend, "authorized-token");

  let unblock;
  let announceRead;
  const readStarted = new Promise((resolve) => { announceRead = resolve; });
  const waitForRead = new Promise((resolve) => { unblock = resolve; });
  const originalGet = secrets.get.bind(secrets);
  let blockOnce = true;
  secrets.get = async (key) => {
    if (key === AUTHORIZED_ORIGIN_SECRET_KEY && blockOnce) {
      blockOnce = false;
      announceRead();
      await waitForRead;
    }
    return originalGet(key);
  };

  const pending = api.get("/api/v1/session");
  await readStarted;
  backend = "https://changed.example";
  unblock();
  await pending;

  assert.equal(calls.length, 1);
  assert.equal(new URL(calls[0].input).origin, "https://authorized.example");
  assert.equal(new Headers(calls[0].init.headers).get("Authorization"), "Bearer authorized-token");
});
