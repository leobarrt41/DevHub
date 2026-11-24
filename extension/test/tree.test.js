const assert = require('node:assert/strict');
const test = require('node:test');
const Module = require('node:module');

// Adaptar apenas a API do host indisponível em Node; importar o TreeProvider de produção.
const load = Module._load;
Module._load = function (name, ...args) {
  if (name === 'vscode') return {
    EventEmitter: class { event = () => {}; fire() {} dispose() {} },
    Disposable: class { constructor(callback) { this.callback = callback; } dispose() { this.callback(); } },
    window: { showErrorMessage() {} },
  };
  return load.call(this, name, ...args);
};
const { DevHubTreeProvider } = require('../out/treeProvider.js');
Module._load = load;

function deferred() {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
}
const tick = () => new Promise(done => setImmediate(done));
const treeData = name => ({ applications: [{ app_id: name, name, archived: false }], folders: [], conversations: [] });

test('resposta atrasada não repovoa árvore depois de desconectar', async () => {
  const pending = deferred();
  let connected = true;
  const tree = new DevHubTreeProvider({ hasToken: async () => connected, getTree: () => pending.promise });
  const old = tree.refresh();
  await tick();
  connected = false;
  await tree.refresh();
  pending.resolve(treeData('velho'));
  await old;
  assert.deepEqual(tree.getApplications(), []);
  tree.dispose();
});

test('atualização recente prevalece sobre resposta anterior', async () => {
  const pending = deferred();
  let calls = 0;
  const tree = new DevHubTreeProvider({ hasToken: async () => true, getTree: () => ++calls === 1 ? pending.promise : Promise.resolve(treeData('recente')) });
  const old = tree.refresh();
  await tick();
  await tree.refresh();
  pending.resolve(treeData('velho'));
  await old;
  assert.equal(tree.getApplications()[0].name, 'recente');
  tree.dispose();
});

test('erro de autenticação/rede remove dados prévios e não os apresenta como atuais', async () => {
  let failed = false;
  const tree = new DevHubTreeProvider({ hasToken: async () => true, getTree: async () => { if (failed) throw new Error('401'); return treeData('antigo'); } });
  await tree.refresh();
  failed = true;
  await tree.refresh();
  assert.deepEqual(tree.getApplications(), []);
  assert.equal(tree.errorMessage, '401');
  tree.dispose();
});
