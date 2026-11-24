# Implantação no Google Cloud Run

Nenhum comando de contratação, build remoto, criação de serviço ou deploy foi executado nesta entrega. Estes passos podem gerar custos e só devem ser realizados após sua autorização. O destino confirmado é Cloud Run com PostgreSQL gerenciado. O fornecedor, a região, o tamanho e a rede do banco continuam a ser escolhidos pelo proprietário; não provisionamos Cloud SQL ou outro fornecedor por suposição.

## Pré-requisitos

Tenha projeto Google Cloud, faturamento autorizado, Artifact Registry já disponível, conta de serviço exclusiva e PostgreSQL gerenciado acessível ao serviço e ao job de migrations. Use privilégios mínimos e Secret Manager para `DATABASE_URL`, `DEVHUB_ACCESS_TOKEN` e `OPENROUTER_API_KEY`. Defina limites de instâncias/conexões e configure TLS/verificação de certificado ou a conexão privada autenticada adequada ao fornecedor. O pool por instância tem 5 conexões + até 5 excedentes; duas instâncias podem consumir até 20 conexões, além das migrations.

Uma URI TCP padrão `postgresql://USUARIO:SENHA@HOST:5432/BANCO` é normalizada pelo backend para asyncpg. Use parâmetros SSL compatíveis com asyncpg, por exemplo `?ssl=verify-full`, com certificado de CA quando exigido pelo fornecedor. Credenciais em URL precisam de percent-encoding. Para Cloud SQL por IP privado, configure VPC e permissões; se preferir Auth Proxy/connector/Unix socket, valide explicitamente a conectividade e URI antes do rollout. Não presumimos que um DSN funcione sem rede/IAM/CA configurados.

Não embuta segredos no Dockerfile, em `.env` versionado, flags de build ou frontend. O browser recebe apenas a credencial pessoal que o proprietário informa e não recebe a chave OpenRouter nem DSN PostgreSQL. A extensão armazena a credencial no SecretStorage.

## Build e migrations

Exemplo de parâmetros não secretos (substitua por recursos previamente autorizados):

```bash
export PROJECT_ID=SEU_PROJETO
export REGION=SUA_REGIAO
export REPOSITORY=SEU_REPOSITORIO_ARTIFACT_REGISTRY
export IMAGE="$REGION-docker.pkg.dev/$PROJECT_ID/$REPOSITORY/devhub-ai:0.1.0"
export SERVICE_ACCOUNT="devhub-run@$PROJECT_ID.iam.gserviceaccount.com"
```

Construa localmente o container Linux amd64 para Cloud Run; o sandbox desta entrega não tinha Docker instalado, portanto a build de imagem não foi validada aqui. Não use build ARM do computador por acidente.

```bash
docker buildx build --platform linux/amd64 --tag "$IMAGE" --push .
```

Use a mesma imagem para migrations, antes de direcionar tráfego ao novo schema. Execute uma só tarefa de migration, sem retry automático e com os mesmos parâmetros de conectividade do banco. O comando do job substitui o entrypoint HTTP; não inicia servidor e só precisa do DSN. Use referências a versões fixas de secrets em um release real, não `latest` sem política de rotação.

```bash
gcloud run jobs create devhub-migrate \
  --project "$PROJECT_ID" --region "$REGION" \
  --image "$IMAGE" --service-account "$SERVICE_ACCOUNT" \
  --set-secrets DATABASE_URL=devhub-database-url:1 \
  --command /app/backend/.venv/bin/alembic \
  --args=-c,/app/backend/alembic.ini,upgrade,head \
  --tasks 1 --parallelism 1 --max-retries 0 --task-timeout 300s

gcloud run jobs execute devhub-migrate \
  --project "$PROJECT_ID" --region "$REGION" --wait
```

Se o job já existir, use `gcloud run jobs update` com a imagem/versões novas após revisão. Antes de migrations destrutivas, faça backup e considere expand/contract para compatibilidade entre revisões. O código nunca roda Alembic no startup de cada réplica.

## Serviço HTTP

O Dockerfile instala versões lockadas, compila Vue, usa usuário não root e o entrypoint honra `PORT`. Frontend e API são servidos pela mesma origem FastAPI; não depende do proxy Vite em produção. Só `/health/live`, `/health/ready`, manifesto/arquivos estáticos e documentação OpenAPI são públicos; dados `/api/v1` exigem o Bearer token pessoal.

```bash
gcloud run deploy devhub-ai \
  --project "$PROJECT_ID" --region "$REGION" \
  --image "$IMAGE" --service-account "$SERVICE_ACCOUNT" \
  --set-secrets DATABASE_URL=devhub-database-url:1,DEVHUB_ACCESS_TOKEN=devhub-access-token:1,OPENROUTER_API_KEY=devhub-openrouter-api-key:1 \
  --set-env-vars DEVHUB_DEFAULT_MODEL=openrouter/free,DEVHUB_MAX_OUTPUT_TOKENS=1024,DEVHUB_MAX_REQUEST_COST_USD=0.05,DEVHUB_DAILY_BUDGET_USD=1.00,DEVHUB_OWNER_ID=personal-owner \
  --port 8080 --timeout 300 --concurrency 10 \
  --min-instances 0 --max-instances 2 --memory 512Mi --cpu 1 \
  --allow-unauthenticated
```

`--allow-unauthenticated` abre a página de login e endpoints de health, **não** dados privados: a API aplica token próprio. Se exigir Cloud Run IAM, retire a flag e adicione um mecanismo de acesso IAM/IAP compatível com browser e extensão; o token pessoal não é um token Google IAM. Esta escolha precisa de revisão antes da publicação. Aplique rate limit/restrições de ingresso/WAF conforme risco; o MVP não é um produto público multiusuário.

Valide `/health/ready` retornando 200, autenticado `/api/v1/session`, árvore, uma mensagem em modelo permitido, custo/status e a mesma conversa na extensão. Configure probe do serviço para `/health/ready` quando o schema/credencial devem bloquear readiness. Liveness `/health/live` só verifica processo, não banco. O timeout interno de stream (240s) fica abaixo do timeout HTTP (300s). Em troca de revisão pode haver streams interrompidos: consulte checkpoint e reconcilie a tarefa, nunca repita request_id/inferência silenciosamente.

## Persistência e executor

Todas as aplicações, pastas, conversas, mensagens, memórias aprovadas, tarefas, custos, IDs e eventos ficam no PostgreSQL externo. O filesystem do Cloud Run só contém código e frontend compilado; não armazena banco/clone/artefatos duráveis. Checkpoints de texto são gravados durante o stream. Bytes de tokens ainda não recebidos/persistidos podem se perder numa interrupção, explicitamente.

O MVP 1 **não executa código de projetos**. A futura implementação MVP 2 deverá usar serviço/job dedicado com identidade própria, credencial curta por tarefa, root filesystem/clone isolados, limites de CPU/memória/tempo/rede, e storage durável de artefatos. Não montar Docker socket, volume de workspaces ou chaves GitHub irrestritas no servidor FastAPI. O executor não chama outro LLM: LangGraph/OpenRouter no backend continuam sendo o único cérebro. Sua tecnologia ainda não foi escolhida nem implementada; separar containers por si só não prova sandboxing seguro.

## Backups, rotação e rollback

Ative backup automático/PITR no PostgreSQL gerenciado conforme plano autorizado e teste restauração em banco separado. Nunca teste restauração apagando produção. Exemplo local de backup de desenvolvimento, com `PG*` definidos fora do histórico e sem secrets em flags:

```bash
pg_dump --format=custom --file=devhub-backup.dump
# Em banco novo e dedicado:
pg_restore --no-owner --dbname=devhub_restore_test devhub-backup.dump
```

Backups contêm conversas privadas e precisam de criptografia, acesso restrito e retenção definida. Revogar o token pessoal significa criar nova versão de secret e atualizar/reiniciar todas as revisões ativas; durante rollout versões antigas podem aceitar o token antigo, portanto finalize o tráfego antigo. Preserve `DEVHUB_OWNER_ID` e o banco ao rotacionar token, senão os dados parecerão pertencer a outra identidade. Para rollback de app, redirecione tráfego a revisão compatível com o schema. Downgrade Alembic inicial remove dados e não deve ser realizado em produção sem salvaguarda/aprovação.

## Referências consultadas

[Contrato de containers Cloud Run](https://docs.cloud.google.com/run/docs/container-contract) confirma PORT/listener e filesystem não durável. [Migrations com Cloud Run Jobs](https://cloud.google.com/blog/topics/developers-practitioners/running-database-migrations-cloud-run-jobs/) descreve override de command, secrets e execução administrativa fora do serviço.
