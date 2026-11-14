# Publicação

O Ala.ia é publicado como **um contêiner só** no Coolify da VPS, em
**https://ala.andrejose.com.br**. Dentro do contêiner, a API (Node + Express)
entrega também as telas (React, já compiladas): as telas chamam `/api/...` no
próprio endereço, então não há CORS nem um segundo deploy. O banco continua no
**Supabase** de produção, o mesmo de hoje.

```
navegador ──HTTPS──▶ Coolify (Traefik, certificado Let's Encrypt)
                        │
                        ▼
                  contêiner ala-ia (porta 3001)
                    ├─ /            telas (frontend/dist)
                    ├─ /api/...     API
                    └─ /docs        Swagger
                        │
                        ▼
                  Supabase (Auth + Postgres, projeto em produção)
```

O que a imagem traz (ver o `Dockerfile` na raiz):

- **Build em três etapas:** compila o frontend, instala só as dependências de produção da API e copia tudo para uma imagem `node:24-alpine`.
- **Segurança:** roda sem root e tem `HEALTHCHECK` em `/health`.
- **Variáveis de ambiente:** `NODE_ENV=production`, `PORT=3001` e `STATIC_DIR` já vêm definidas. Só faltam as do Supabase.

Em produção o backend também:

- manda cabeçalhos de segurança (helmet), com uma política de conteúdo (CSP) que só aceita arquivos do próprio endereço;
- limita a 20 tentativas por IP, a cada 15 minutos, o login, o cadastro e a renovação de sessão (`AUTH_RATE_LIMIT`), com resposta 429;
- grava uma linha JSON por requisição (método, caminho sem a query string, status e tempo), visível em **Logs** no Coolify;
- usa o IP real de quem chama (vem do proxy do Coolify) no limite de tentativas.

## 1. DNS do subdomínio

No painel onde ficam as DNS de `andrejose.com.br` (o Registro.br, se você não
mudou os servidores de DNS), crie um registro apontando para a VPS:

| Tipo | Nome | Valor | TTL |
|---|---|---|---|
| `A` | `ala` | o IPv4 da VPS (está no painel da Hostinger) | 3600 |
| `AAAA` (opcional) | `ala` | o IPv6 da VPS, se ela tiver | 3600 |

Para conferir se já propagou, o endereço tem que responder com o IP da VPS:

```bash
nslookup ala.andrejose.com.br
```

Antes disso o Coolify não consegue emitir o certificado HTTPS.

## 2. Aplicação no Coolify

1. **Projects → (seu projeto) → + New → Public Repository**.
   - Repositório: `https://github.com/andrejose/ala.ia`
   - Branch: `main`
   - **Build Pack: Dockerfile** (o Coolify acha o `Dockerfile` da raiz)
2. Em **Configuration → General**:
   - **Domains:** `https://ala.andrejose.com.br`. Com `https://`, o Coolify pede o certificado sozinho.
   - **Ports Exposes:** `3001`. Tem que ser a mesma porta em que o app escuta: a variável `PORT`, que vale 3001 na imagem. Se o Coolify ou você definir `PORT` com outro valor (ex.: 3000), use esse mesmo número aqui. O teste de saúde da imagem segue a `PORT` sozinho.
3. Em **Environment Variables**, adicione as duas variáveis do Supabase de produção. Os valores estão no painel do Supabase, em **Project Settings → API Keys**.
   - `SUPABASE_URL`: `https://<id-do-projeto>.supabase.co`
   - `SUPABASE_PUBLISHABLE_KEY`: a chave **publishable**, nunca a `secret` ou a `service_role`
4. **Health Check:** a imagem já traz o teste de saúde (`HEALTHCHECK` em `/health`, na porta da `PORT`), e o Coolify usa esse. Se ligar também o do painel, use o caminho `/health` e a mesma porta.
5. Clique em **Deploy** e acompanhe em **Deployments**. O build leva alguns minutos na primeira vez.

**Deploy automático (opcional):** repositório público não avisa o Coolify
sozinho. Para publicar a cada merge na `main`, use **Webhooks** (o Coolify mostra
a URL para cadastrar no GitHub) ou conecte o repositório pela **GitHub App** do
Coolify. Sem isso, é só clicar em **Redeploy** depois de cada merge.

## 3. Supabase Auth

No painel do Supabase, em **Authentication → URL Configuration**:

- **Site URL:** `https://ala.andrejose.com.br`
- **Redirect URLs:** acrescente `https://ala.andrejose.com.br/**`

O link de confirmação do e-mail de cadastro aponta para a Site URL. Mantenha a
**confirmação de e-mail ligada** (**Authentication → Sign In / Providers →
Email**): ela é necessária para o aceite de convites ser seguro.

## 4. Conferir

- `https://ala.andrejose.com.br/api/health` responde `{"status":"ok"}`.
- `https://ala.andrejose.com.br` abre a tela de login, com o cadeado do HTTPS.
- Entrar, lançar e recarregar a página numa tela interna (ex.: `/lancamentos`) continua funcionando.
- `https://ala.andrejose.com.br/docs` abre o Swagger.
- Em **Logs** no Coolify aparecem as linhas JSON das requisições.

## Se o deploy falhar

- **"New container is unhealthy" com "Connection refused":** o app está escutando numa porta e o teste de saúde está batendo em outra. Nos logs do contêiner aparece "Servidor rodando na porta N": confira se **Ports Exposes** e a variável `PORT` usam esse mesmo N.
- **Telas abrem, mas login e cadastro respondem 503 ("Não foi possível falar com o banco de dados"):** o contêiner não consegue falar com o Supabase. Em **Logs** aparece uma linha com `"code":"SERVICE_UNAVAILABLE"` e o motivo. Pode ser a `SUPABASE_URL` errada ou inalcançável (ex.: `getaddrinfo ENOTFOUND`, `ECONNREFUSED`) ou a `SUPABASE_PUBLISHABLE_KEY` recusada. Corrija a variável e faça **Redeploy**.
- **"Variáveis de ambiente inválidas ou ausentes":** falta `SUPABASE_URL` ou `SUPABASE_PUBLISHABLE_KEY` em **Environment Variables**.
- **Sem cadeado ou erro de certificado:** o DNS ainda não aponta para a VPS, ou o domínio em **Domains** está sem o `https://`.

## Atualizações

- **Código:** merge na `main` e, depois, **Redeploy** no Coolify (ou automático, com o webhook). Os usuários não ficam fora do ar: o Coolify só troca o contêiner quando o novo estiver saudável.
- **Banco:** as migrations continuam indo pelo Supabase CLI, como hoje, antes do deploy do código que depende delas:

  ```bash
  npx supabase db push --remote
  ```

- **Voltar uma versão:** em **Deployments**, o Coolify permite fazer **Rollback** para uma imagem anterior. Como as migrations só acrescentam, o código anterior continua funcionando com o banco novo.

## Testar a imagem localmente

Com o Docker instalado e o Supabase local rodando (`npx supabase start`):

```bash
docker build -t ala-ia .
```

```bash
docker run --rm -p 3005:3001 -e SUPABASE_URL=http://host.docker.internal:54321 -e SUPABASE_PUBLISHABLE_KEY=<publishable do supabase status> ala-ia
```

E abra `http://localhost:3005`. O CI monta a mesma imagem a cada pull request
e confere se ela sobe saudável (job "Imagem Docker").
