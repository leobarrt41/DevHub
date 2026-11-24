(() => {
  const vscode = acquireVsCodeApi();
  const messages = document.getElementById("messages");
  const status = document.getElementById("status");
  const taskMeta = document.getElementById("taskMeta");
  const contextPanel = document.getElementById("contextPanel");
  const form = document.getElementById("composer");
  const input = document.getElementById("content");
  const modelSelect = document.getElementById("model");
  const sendButton = document.getElementById("send");
  let selectedConversationId = null;
  let catalogReady = false;
  let busy = false;
  let streamedAssistant = null;

  function setStatus(value) {
    status.textContent = value || "";
  }

  function setBusy(value) {
    busy = value;
    input.disabled = busy || !selectedConversationId;
    modelSelect.disabled = busy || !selectedConversationId || !catalogReady;
    sendButton.disabled = busy || !selectedConversationId || !catalogReady || !input.value.trim();
  }

  function showEmpty(text) {
    messages.replaceChildren();
    const empty = document.createElement("p");
    empty.className = "empty";
    empty.textContent = text;
    messages.appendChild(empty);
  }

  function appendMessage(role, content, messageStatus) {
    const article = document.createElement("article");
    const hasFailure = messageStatus === "failed" || messageStatus === "interrupted";
    article.className = "message" + (role === "user" ? " user" : "") + (hasFailure ? " failed" : "");
    const roleElement = document.createElement("div");
    roleElement.className = "role";
    const roleName = role === "assistant" ? "DevHub AI" : "Você";
    roleElement.textContent = messageStatus && messageStatus !== "completed" ? `${roleName} · ${messageStatus}` : roleName;
    const body = document.createElement("pre");
    body.className = "content";
    body.textContent = typeof content === "string" ? content : "";
    article.append(roleElement, body);
    messages.appendChild(article);
    messages.scrollTop = messages.scrollHeight;
    return body;
  }

  function renderHistory(items) {
    messages.replaceChildren();
    streamedAssistant = null;
    if (!Array.isArray(items) || items.length === 0) {
      showEmpty("Ainda não há mensagens nesta conversa. Escreva para continuar no backend DevHub.");
      return;
    }
    for (const item of items) {
      appendMessage(item.role, item.content, item.status);
    }
    messages.scrollTop = messages.scrollHeight;
  }

  function renderModels(models, defaultModel) {
    modelSelect.replaceChildren();
    if (!Array.isArray(models) || models.length === 0) {
      const option = document.createElement("option");
      option.textContent = "Catálogo indisponível";
      option.value = "";
      modelSelect.appendChild(option);
      catalogReady = false;
      setBusy(busy);
      return;
    }
    for (const model of models) {
      if (typeof model.id !== "string") continue;
      const option = document.createElement("option");
      option.value = model.id;
      option.textContent = typeof model.name === "string" ? `${model.name} — ${model.id}` : model.id;
      modelSelect.appendChild(option);
    }
    if (defaultModel && Array.from(modelSelect.options).some((option) => option.value === defaultModel)) {
      modelSelect.value = defaultModel;
    }
    catalogReady = modelSelect.options.length > 0;
    setBusy(busy);
  }

  function clearStreamMetadata() {
    taskMeta.textContent = "";
    taskMeta.classList.remove("visible");
    contextPanel.textContent = "";
    contextPanel.classList.remove("visible");
  }

  function handleHostMessage(message) {
    if (!message || typeof message.type !== "string") return;
    if (message.conversationId && message.conversationId !== selectedConversationId) return;
    switch (message.type) {
      case "idle":
        selectedConversationId = null;
        catalogReady = false;
        setStatus("Selecione ou crie uma conversa na árvore.");
        showEmpty("O histórico é compartilhado com o chat web. Selecione uma conversa na árvore para começar.");
        renderModels([], null);
        clearStreamMetadata();
        setBusy(false);
        break;
      case "loading":
        selectedConversationId = message.conversationId || null;
        setStatus(typeof message.title === "string" ? message.title : "Carregando histórico…");
        showEmpty("Carregando histórico persistido…");
        clearStreamMetadata();
        setBusy(false);
        break;
      case "history":
        renderHistory(message.messages);
        setStatus(typeof message.title === "string" ? message.title : "Conversa aberta");
        setBusy(false);
        break;
      case "models":
        renderModels(message.models, message.defaultModel);
        break;
      case "backendStatus":
        setStatus(typeof message.message === "string" ? message.message : "");
        break;
      case "streamStart":
        clearStreamMetadata();
        setBusy(true);
        setStatus("Enviando ao backend…");
        streamedAssistant = appendMessage("assistant", "", "streaming");
        break;
      case "task": {
        taskMeta.textContent = `task_id: ${String(message.task_id || "indisponível")} · trace_id: ${String(message.trace_id || "indisponível")} · status: ${String(message.status || "indisponível")}`;
        taskMeta.classList.add("visible");
        setStatus("Tarefa registrada pelo backend.");
        break;
      }
      case "context": {
        const sources = Array.isArray(message.sources) ? message.sources : [];
        const lines = sources.map((source) => {
          const label = source && typeof source.source_label === "string" ? source.source_label : "Fonte de contexto";
          const id = source && typeof source.memory_item_id === "string" ? source.memory_item_id : "ID indisponível";
          return `${label} · ${id}`;
        });
        contextPanel.textContent = lines.length ? `Contexto recuperado:\n${lines.join("\n")}` : "Contexto recuperado: nenhuma fonte informada.";
        contextPanel.classList.add("visible");
        break;
      }
      case "delta":
        if (streamedAssistant && typeof message.content === "string") {
          streamedAssistant.textContent += message.content;
          messages.scrollTop = messages.scrollHeight;
        }
        break;
      case "done": {
        const usage = message.usage && typeof message.usage === "object" ? message.usage : {};
        const cost = usage.cost_usd === null || usage.cost_usd === undefined ? "indisponível" : `US$ ${String(usage.cost_usd)}`;
        const tokens = usage.prompt_tokens === null || usage.prompt_tokens === undefined || usage.completion_tokens === null || usage.completion_tokens === undefined
          ? "tokens indisponíveis"
          : `${String(usage.prompt_tokens)} + ${String(usage.completion_tokens)} tokens`;
        taskMeta.textContent = `${taskMeta.textContent ? `${taskMeta.textContent} · ` : ""}custo: ${cost} · ${tokens} · cost_status: ${String(usage.cost_status ?? "indisponível")}`;
        taskMeta.classList.add("visible");
        setStatus("Resposta concluída e persistida pelo backend.");
        setBusy(false);
        streamedAssistant = null;
        break;
      }
      case "error":
        if (streamedAssistant && !streamedAssistant.textContent) streamedAssistant.textContent = "A resposta falhou; consulte o erro abaixo.";
        setStatus(typeof message.message === "string" ? `Erro: ${message.message}` : "Erro informado pelo backend.");
        setBusy(false);
        streamedAssistant = null;
        break;
      case "streamInterrupted":
        appendMessage("assistant", "Stream interrompido; histórico persistido recarregado. Nenhuma repetição automática foi feita.", "interrupted");
        setStatus("Stream interrompido. Atualizando dados persistidos; não houve retry automático.");
        setBusy(false);
        streamedAssistant = null;
        break;
      default:
        break;
    }
  }

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const content = input.value.trim();
    const model = modelSelect.value;
    if (!content || !model || !selectedConversationId || busy || !catalogReady) return;
    appendMessage("user", content, "completed");
    input.value = "";
    setBusy(true);
    vscode.postMessage({ type: "send", content, model });
  });
  input.addEventListener("input", () => setBusy(busy));
  window.addEventListener("message", (event) => handleHostMessage(event.data));
  vscode.postMessage({ type: "ready" });
  showEmpty("Selecione uma conversa na árvore.");
  setBusy(false);
})();
