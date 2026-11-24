const test = require("node:test");
const assert = require("node:assert/strict");
const { buildApiUrl, eligibleReparentFolderIds, formatCostUsd, parseSseFrames, validateBackendUrl } = require("../out/utils.js");

test("permite HTTP apenas em hosts loopback e normaliza a origem", () => {
  assert.equal(validateBackendUrl("http://localhost:8000/"), "http://localhost:8000");
  assert.equal(validateBackendUrl("http://127.0.0.1:8000"), "http://127.0.0.1:8000");
  assert.equal(validateBackendUrl("http://[::1]:8000"), "http://[::1]:8000");
});

test("exige HTTPS remoto e rejeita URL com token/caminho/query", () => {
  assert.equal(validateBackendUrl("https://devhub.example.com/"), "https://devhub.example.com");
  for (const value of [
    "http://devhub.example.com",
    "https://user:secret@devhub.example.com",
    "https://devhub.example.com/?token=secret",
    "https://devhub.example.com/?",
    "https://devhub.example.com/#fragment",
    "https://devhub.example.com/api/v1",
    "file:///tmp/backend",
  ]) {
    assert.throws(() => validateBackendUrl(value));
  }
});

test("constrói URLs somente no prefixo documentado e impede traversal", () => {
  assert.equal(
    buildApiUrl("https://devhub.example.com", "/api/v1/conversations/abc/messages"),
    "https://devhub.example.com/api/v1/conversations/abc/messages",
  );
  assert.throws(() => buildApiUrl("https://devhub.example.com", "//evil.example/api/v1"));
  assert.throws(() => buildApiUrl("https://devhub.example.com", "/api/v1/../health"));
  assert.throws(() => buildApiUrl("https://devhub.example.com", "/api/v1/tree?token=x"));
});

test("parseia eventos SSE e preserva frame incompleto entre chunks", () => {
  const first = parseSseFrames(": keepalive\r\nevent: task\r\ndata: {\"task_id\":\"a\"}\r\n\r\nevent: delta\ndata: {\"content\":\"hello\"}\ndata: {\"content\":\" world\"}\n\npartial");
  assert.deepEqual(first.frames, [
    { event: "task", data: "{\"task_id\":\"a\"}" },
    { event: "delta", data: "{\"content\":\"hello\"}\n{\"content\":\" world\"}" },
  ]);
  assert.equal(first.remainder, "partial");
  const last = parseSseFrames("data: {\"content\":\"partial\"}", true);
  assert.deepEqual(last.frames, [{ event: "message", data: "{\"content\":\"partial\"}" }]);
  assert.equal(last.remainder, "");
});

test("custo ausente permanece indisponível e custo informado mantém precisão", () => {
  assert.equal(formatCostUsd(null), "Indisponível");
  assert.equal(formatCostUsd(undefined), "Indisponível");
  assert.equal(formatCostUsd("valor inválido"), "Indisponível");
  assert.equal(formatCostUsd("0"), "US$ 0.00");
  assert.equal(formatCostUsd("0.01234567"), "US$ 0.01234567");
  assert.equal(formatCostUsd("0.0000004"), "US$ 0.0000004");
});

test("reparent só oferece pastas do mesmo app fora da própria subárvore", () => {
  const folders = [
    { folder_id: "root", app_id: "app-a", parent_folder_id: null },
    { folder_id: "source", app_id: "app-a", parent_folder_id: "root" },
    { folder_id: "child", app_id: "app-a", parent_folder_id: "source" },
    { folder_id: "grandchild", app_id: "app-a", parent_folder_id: "child" },
    { folder_id: "sibling", app_id: "app-a", parent_folder_id: "root" },
    { folder_id: "other-app", app_id: "app-b", parent_folder_id: null },
  ];

  assert.deepEqual(eligibleReparentFolderIds("source", folders), ["root", "sibling"]);
  assert.deepEqual(eligibleReparentFolderIds("missing", folders), []);
});
