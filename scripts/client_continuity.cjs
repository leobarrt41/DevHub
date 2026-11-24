#!/usr/bin/env node
// Adaptadores reais. Fake somente de SecretStorage host e resolução de URL relativa do browser.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const ts = require('../frontend/node_modules/typescript');
const { DevHubApi } = require('../extension/out/api.js');

async function main() {
  const origin = process.env.DEVHUB_TEST_API_ORIGIN || 'http://127.0.0.1:8000';
  const token = process.env.DEVHUB_ACCESS_TOKEN;
  if (!token) throw new Error('Token ausente no ambiente; não informar no CLI.');
  const evidence = JSON.parse(fs.readFileSync(path.join(__dirname, '../docs/live-smoke-evidence.json'), 'utf8'));
  const source = fs.readFileSync(path.join(__dirname, '../frontend/src/services/api.ts'), 'utf8');
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const file = path.join(os.tmpdir(), `devhub-api-client-${process.pid}.cjs`);
  fs.writeFileSync(file, compiled);
  const { ApiClient } = require(file);
  const store = new Map();
  const storage = { get: async key => store.get(key), store: async (key, value) => store.set(key, value), delete: async key => store.delete(key) };
  const extension = new DevHubApi(() => origin, storage);
  await extension.bindToken(origin, token);
  const actualFetch = global.fetch;
  global.fetch = (url, options) => actualFetch(typeof url === 'string' && url.startsWith('/') ? origin + url : url, options);
  try {
    const frontend = new ApiClient(token);
    const [webTree, extensionTree] = await Promise.all([frontend.getTree(), extension.getTree()]);
    assert.deepEqual(webTree, extensionTree);
    const [webHistory, extensionHistory] = await Promise.all([frontend.getMessages(evidence.conversation_id), extension.get(`/api/v1/conversations/${evidence.conversation_id}/messages`)]);
    assert.deepEqual(webHistory, extensionHistory);
    assert.equal(webHistory.length, 2);
    const [webMetric, extensionMetric] = await Promise.all([frontend.getObservability(evidence.app_id), extension.getObservability(evidence.app_id)]);
    assert.deepEqual(webMetric, extensionMetric);
    assert.equal(webMetric.tasks[0].task_id, evidence.task_id);
    console.log(JSON.stringify({validated_at: new Date().toISOString(), frontend_adapter: 'frontend/src/services/api.ts', extension_adapter: 'extension/src/api.ts', same_tree: true, same_conversation: true, same_metrics_and_task_id: true, conversation_id: evidence.conversation_id, task_id: evidence.task_id, vscode_host_ui_validated: false}, null, 2));
  } finally {
    global.fetch = actualFetch;
    fs.unlinkSync(file);
    await extension.clearBoundToken();
  }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
