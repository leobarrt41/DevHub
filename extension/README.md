# DevHub AI — extensão VS Code (MVP 1)

Esta extensão é uma interface TypeScript do mesmo backend FastAPI usado pelo chat web. Não contém agente ou modelo local e não executa comandos, lê arquivos do workspace nem usa GPU.

## Pré-requisitos e execução no VS Code

- VS Code 1.95 ou posterior.
- Node.js compatível com o VS Code e pnpm instalado.
- Backend DevHub disponível em `/api/v1` e um token pessoal emitido pelo backend.

Com as dependências deste pacote instaladas pelo workspace (`@types/vscode` 1.95.0, `@types/node` 22.10.0 e TypeScript 5.9.3), abra `extension/` no VS Code e pressione **F5**. A configuração `Run DevHub AI Extension` compila a extensão antes de abrir a janela Extension Development Host. Também é possível preparar/validar pelo terminal na pasta do pacote:

```sh
pnpm install
pnpm run compile
pnpm run typecheck
pnpm test
```

Os testes usam `node:test` e importam os utilitários TypeScript compilados em `out/`; não é necessário Vitest. O `.vsix` da entrega pode ser instalado pela opção **Extensions: Install from VSIX...** ou com `code --install-extension devhub-ai-vscode-0.1.0.vsix`. Isso instala o cliente local, não o backend. É possível usar `code --extensionDevelopmentPath=extension` a partir da raiz para desenvolvimento.

Para reproduzir o empacotamento na pasta `extension/`:

```sh
pnpm dlx @vscode/vsce@4.1.1 package --out devhub-ai-vscode-0.1.0.vsix --no-dependencies --skip-license --allow-missing-repository
```

Na primeira execução, pnpm pode solicitar aprovação do build de `@vscode/vsce-sign`; o comando não publica no Marketplace. O pacote usa a lista explícita `files` do manifesto para incluir apenas `out/`, `media/`, README e package.json. Não embute workspace, node_modules, secrets ou dados PostgreSQL. A licença permanece `UNLICENSED` e o identificador publisher é apenas metadado local; nenhum publisher/registro Marketplace foi criado.

## Configuração e autenticação

1. Defina `devhub.backendUrl` nas configurações do VS Code. O padrão é `http://localhost:8000`.
2. Para desenvolvimento, HTTP só é aceito para `localhost`, `127.0.0.1` ou `::1`. Para qualquer servidor remoto, use HTTPS. Informe apenas a origem — sem `/api/v1`, caminho adicional, usuário/senha, query ou fragmento; a extensão acrescenta o prefixo `/api/v1`.
3. Execute **DevHub: Conectar** pela Command Palette e cole o token no campo secreto. O valor é salvo exclusivamente em `SecretStorage`; não é gravado em `settings.json`, não é enviado à webview e não é colocado em URL/log. **DevHub: Desconectar** remove o segredo local.

A configuração é de escopo de aplicação, não do workspace de um repositório. O token é vinculado à origem exata mostrada no prompt; trocar `backendUrl` exige nova conexão explícita e não envia automaticamente a credencial antiga a outro host. Tokens legados sem binding não são aceitos. Troca de origem/desconexão cancela streams ativos.

## Uso

A Activity Bar **DevHub AI** contém a árvore autenticada de projetos, pastas/subpastas, conversas do projeto e conversas gerais; a árvore é atualizada a cada 10 segundos. A mesma conversa abre seu histórico persistido. O painel lateral de chat obtém o catálogo real `/models` e transmite mensagens via POST/SSE autenticado, incluindo IDs de tarefa/trace e custos retornados. Interrupções recarregam o histórico persistido e nunca repetem automaticamente uma solicitação.

Use os comandos **DevHub: Criar projeto**, **Criar pasta**, **Criar conversa**, **Renomear projeto, pasta ou conversa**, **Mover pasta…**, **Arquivar item** e **Mover conversa…**. Reparentar uma pasta oferece somente destinos no mesmo app e exclui a própria pasta e seus descendentes; o backend valida novamente a árvore. A movimentação de conversa solicita `/move-preview`, permite selecionar explicitamente um subconjunto das memórias candidatas e exige confirmação antes de enviar o `move_token` ao backend.

**DevHub: Alternar itens arquivados** recarrega `/tree?archived=true` para exibir ativos e arquivados, identificando os itens arquivados na árvore. Use **DevHub: Reabrir item arquivado** para restaurar um item. Se o projeto ou uma pasta ancestral estiver arquivada, a extensão confirma e reabre essas ancestrais em ordem; outros filhos permanecem arquivados, conforme o contrato. Ao restaurar uma conversa, ela é aberta no chat e sua localização é revelada na árvore.

A reabertura da cadeia ancestral usa requisições PATCH sequenciais, não uma transação única. Se uma requisição falhar no meio, as ancestrais já reabertas permanecem ativas e o erro é exibido.

**DevHub: Pesquisar projetos, pastas, conversas e memória…** consulta `/search` com uma pesquisa de 1–200 caracteres e escolhe escopo global do proprietário (sem `app_id`), conversas gerais (`app_id=general`) ou um projeto. A lista reúne projetos, pastas, conversas e memórias retornados pelo backend; selecionar uma conversa abre seu histórico persistido. **DevHub: Consultar observabilidade** consulta os dados reais de tarefas, eventos e custos; custo `null` é exibido como indisponível, nunca como zero presumido.

Ao consultar uma tarefa `running`, escolha “Reconciliar estado interrompido” somente depois de confirmar que a execução perdeu conexão. O backend exige inatividade mínima e pode rejeitar com 409; a ação apenas persiste estado interrompido, sem repetir inferência. Atualize/reabra a conversa para carregar o checkpoint confirmado.

## Limites e dependências do backend

A extensão segue `docs/api-contract.md`: Bearer pessoal, árvore, busca, PATCH de organização, mensagens, modelos, preview de movimento e endpoints mínimos de tarefas/observabilidade. Ela depende de o backend implementar esses endpoints; erros de contrato ou de conexão são mostrados como erros reais, não como dados simulados. Typecheck e testes automatizados passaram, mas o Extension Development Host do VS Code ainda não foi operado; a instalação, aparência e interação no computador do usuário precisam de validação manual. Este MVP não faz execução local/remota de comandos, leitura/modificação de arquivos, acesso ao terminal, PRs, executor, GPU ou inferência local (MVP 2/3 e fases seguintes).
