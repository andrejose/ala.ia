# Roteiro de implementação do backend

Documento vivo: define os endpoints da API, as convenções e a ordem de entrega.
Atualize o status de cada fase conforme avançarmos.

## Decisões tomadas

| Tema | Decisão |
| :--- | :--- |
| Login | A **API expõe** `/auth/signup`, `/auth/login`, `/auth/refresh` e `/auth/logout`, repassando ao Supabase Auth. O cliente usa o `access_token` devolvido no header `Authorization: Bearer <token>`. Assim a API é testável de ponta a ponta pelo Swagger e pelos testes. |
| Acesso aos dados | Cada requisição autenticada cria um cliente Supabase **com o token do usuário**. Quem decide o que ele vê é o RLS do banco. A chave secreta (service role) **nunca** é usada nas rotas. |
| Permissões entre membros | Qualquer membro do household pode criar, editar e excluir contas, categorias e lançamentos (inclusive os de outros membros). O produto é de uso pessoal/familiar; não há necessidade de restrição maior. |
| Validação | Zod (mensagens em português). Os mesmos schemas geram a documentação de request no Swagger. |
| Documentação | OpenAPI 3.1 servido em `/docs` (Swagger UI) e `/docs.json` (JSON). |
| Testes | Vitest + supertest, contra o **Supabase local** (`.env.test`). Os testes se recusam a rodar contra um banco remoto. |

## Convenções

- Rotas de dados ficam aninhadas no household: `/households/:householdId/<recurso>`.
- JSON em `snake_case`, igual às colunas do banco.
- Valores monetários como número com 2 casas (`amount: 150.5`); datas como `YYYY-MM-DD`.
- A listagem de lançamentos é paginada (`limit`, padrão 50, máx. 100, e `offset`) e devolve `{ data, pagination: { total, limit, offset } }`. Contas, categorias, households e membros são listas curtas e voltam como array simples.
- Rotas de um household respondem **404** se o usuário não for membro (sem revelar que o household existe) e **403** quando a operação é exclusiva do dono.
- Formato único de erro:

```json
{ "error": { "code": "VALIDATION_ERROR", "message": "Dados inválidos.", "details": [ { "path": "email", "message": "..." } ] } }
```

### Mapeamento de erros

| Origem | Status | `code` |
| :--- | :--- | :--- |
| Body/params/query inválidos (Zod) ou JSON malformado | 400 | `VALIDATION_ERROR` / `INVALID_JSON` |
| Sem token, token inválido ou expirado | 401 | `UNAUTHORIZED` / `INVALID_TOKEN` |
| Credenciais erradas no login | 401 | `INVALID_CREDENTIALS` |
| `42501` – RLS barrou a escrita | 403 | `FORBIDDEN` |
| `PGRST116` – linha não encontrada (inclusive escondida pelo RLS) | 404 | `NOT_FOUND` |
| Rota inexistente | 404 | `ROUTE_NOT_FOUND` |
| `23505` – duplicado (ex.: categoria repetida); e-mail já cadastrado | 409 | `CONFLICT` / `EMAIL_ALREADY_REGISTERED` |
| `23503` em **delete** – registro em uso (ex.: conta com lançamentos) | 409 | `RESOURCE_IN_USE` |
| `23503` em **insert/update** – referência inválida (conta de outro household, categoria do tipo errado) | 400 | `INVALID_REFERENCE` |
| `23514` / `23502` / `22P02` – check, not null, tipo inválido | 400 | `CONSTRAINT_VIOLATION` / `INVALID_INPUT` |
| `P0001` – `raise exception` sem `errcode` | 400 | `BUSINESS_RULE` |
| `P0002` – RPC não encontrou o dado (ex.: convite inexistente ou de outra pessoa) | 404 | `NOT_FOUND` |
| `AL001` – household ficaria sem dono (trigger `ensure_household_has_owner`) | 409 | `LAST_OWNER` |
| `AL002` – convite expirado, já respondido ou cancelado | 410 | `INVITATION_UNAVAILABLE` |
| `22023` – regra violada em RPC (ex.: convidar o próprio e-mail) | 400 | `BUSINESS_RULE` |
| Limite de requisições do Supabase Auth | 429 | `RATE_LIMITED` |
| Qualquer outro | 500 | `INTERNAL_ERROR` |

> **Atenção (404 com RLS):** `update`/`delete` em linha que o RLS esconde **não dá erro** no supabase-js, só afeta 0 linhas. Sempre encadear `.select().single()` para receber `PGRST116` → 404.

## Endpoints

Legenda: 🔓 público · 🔒 exige `Bearer` · ✅ pronto · ⏳ pendente

### Fase 0 — Fundação ✅

| Método | Rota | Descrição |
| :--- | :--- | :--- |
| GET | `/health` 🔓 | Status da API |
| GET | `/docs` 🔓 | Swagger UI |
| GET | `/docs.json` 🔓 | Especificação OpenAPI |

Estrutura em `src/` (routes, controllers, middlewares, schemas, docs), scripts `start`/`dev`/`test`, `.env.example`, middleware de erro central e 404 genérico.

### Fase 1 — Autenticação e perfil ✅

| Método | Rota | Body | Resposta |
| :--- | :--- | :--- | :--- |
| POST | `/auth/signup` 🔓 | `name`, `email`, `password` (mín. 6) | 201 `{ user, session }` — `session` é `null` se o projeto exigir confirmação de e-mail |
| POST | `/auth/login` 🔓 | `email`, `password` | 200 `{ user, session }` |
| POST | `/auth/refresh` 🔓 | `refresh_token` | 200 `{ user, session }` |
| POST | `/auth/logout` 🔒 | — | 204 (revoga a sessão atual) |
| GET | `/me` 🔒 | — | 200 perfil + households do usuário com o papel em cada um |
| PATCH | `/me` 🔒 | `name` | 200 perfil atualizado |

O cadastro dispara o trigger `handle_new_user`, que cria o perfil e o household pessoal.

### Fase 2 — Contas ✅

| Método | Rota | Observações |
| :--- | :--- | :--- |
| GET | `/households/:householdId/accounts` 🔒 | Lê de `account_balances` (inclui `current_balance`). Filtro `?is_active=true` |
| POST | `/households/:householdId/accounts` 🔒 | `name`, `type`, `initial_balance` |
| GET | `/households/:householdId/accounts/:id` 🔒 | Com saldo |
| PATCH | `/households/:householdId/accounts/:id` 🔒 | `name`, `type`, `initial_balance`, `is_active` (arquivar) |
| DELETE | `/households/:householdId/accounts/:id` 🔒 | 409 `RESOURCE_IN_USE` se houver lançamentos, sugerindo arquivar |

### Fase 3 — Categorias ✅

| Método | Rota | Observações |
| :--- | :--- | :--- |
| GET | `/households/:householdId/categories` 🔒 | Filtro `?type=income\|expense` |
| POST | `/households/:householdId/categories` 🔒 | `name`, `type`, `color` (`#RRGGBB`), `icon`. 409 se duplicada |
| GET | `/households/:householdId/categories/:id` 🔒 | |
| PATCH | `/households/:householdId/categories/:id` 🔒 | Trocar `type` de categoria em uso → 409 |
| DELETE | `/households/:householdId/categories/:id` 🔒 | 409 se houver lançamentos |

### Fase 4 — Lançamentos ✅

| Método | Rota | Observações |
| :--- | :--- | :--- |
| GET | `/households/:householdId/transactions` 🔒 | Filtros: `type`, `account_id`, `category_id`, `from`, `to` (por `due_date`), `status=paid\|pending`; paginação |
| POST | `/households/:householdId/transactions` 🔒 | `type`, `description`, `amount`, `account_id`, `destination_account_id` (transfer), `category_id` (income/expense), `due_date`, `payment_date`. `user_id` é ignorado no body |
| GET | `/households/:householdId/transactions/:id` 🔒 | |
| PATCH | `/households/:householdId/transactions/:id` 🔒 | Inclui marcar como pago (`payment_date`) |
| DELETE | `/households/:householdId/transactions/:id` 🔒 | 204 |

A validação Zod replica as regras do banco (transfer × categoria) para devolver mensagens claras antes de chegar ao Postgres.

### Fase 5 — Households e membros ✅

| Método | Rota | Observações |
| :--- | :--- | :--- |
| GET | `/households` 🔒 | Households do usuário com o papel |
| POST | `/households` 🔒 | RPC `create_household`; o usuário vira owner |
| GET | `/households/:householdId` 🔒 | Inclui o papel do usuário |
| PATCH | `/households/:householdId` 🔒 | Só owner (`name`) |
| DELETE | `/households/:householdId` 🔒 | Só owner; apaga tudo em cascata |
| GET | `/households/:householdId/members` 🔒 | Com nome do perfil |
| PATCH | `/households/:householdId/members/:userId` 🔒 | Só owner (`role`) |
| DELETE | `/households/:householdId/members/:userId` 🔒 | Owner remove qualquer um; membro só pode sair (remover a si mesmo) |

O único owner não pode sair nem se rebaixar (409 `LAST_OWNER`): primeiro promove outro membro a owner. Regra garantida no banco pelo trigger `ensure_household_has_owner`.

#### Convites (estilo GitHub) ✅

A pessoa só vira membro quando **aceita** o convite. O convite vale para o e-mail, mesmo sem cadastro (fica esperando a pessoa se cadastrar), e expira em 7 dias. Por isso a resposta do convite é a mesma para qualquer e-mail: a API não revela quem tem conta.

| Método | Rota | Observações |
| :--- | :--- | :--- |
| GET | `/households/:householdId/invitations` 🔒 | Convites pendentes do household |
| POST | `/households/:householdId/invitations` 🔒 | Só owner. `email`, `role`. 409 se já é membro ou já tem convite pendente; 400 para o próprio e-mail |
| DELETE | `/households/:householdId/invitations/:invitationId` 🔒 | Só owner. Cancela um convite pendente |
| GET | `/invitations` 🔒 | Convites recebidos pelo usuário logado, com o nome do household e de quem convidou |
| POST | `/invitations/:invitationId/accept` 🔒 | Entra no household com o papel do convite. 410 se expirado, já respondido ou cancelado |
| POST | `/invitations/:invitationId/decline` 🔒 | Recusa |

> **Produção:** o aceite confia no e-mail da conta. Deixe a confirmação de e-mail ligada no Supabase Auth, para ninguém criar conta com o e-mail de outra pessoa e aceitar um convite que não era para ela.

### Fase 6 — Relatórios ✅

| Método | Rota | Observações |
| :--- | :--- | :--- |
| GET | `/households/:householdId/reports/summary?month=YYYY-MM` 🔒 | Total de receitas, despesas e resultado do mês (pagos e pendentes separados) |
| GET | `/households/:householdId/reports/by-category?month=YYYY-MM&type=expense` 🔒 | Total por categoria |

Implementados como funções `report_monthly_summary` e `report_by_category` (`security invoker`, em `08_reports.sql`), então o RLS continua valendo. O mês é o do vencimento (`due_date`) e transferências não entram. Sem `month`, usa o mês atual.

### Fase 7 — Fechamento ✅

Versão 1.0, entrega da disciplina:

- README final, com visão geral, arquitetura, resumo da API e limitações conhecidas.
- Swagger revisado (versão 1.0.0) e um teste (`tests/docs-coverage.test.js`) que falha se alguma rota da API não estiver documentada ou se o Swagger documentar rota que não existe.
- Testes de RLS entre usuários em todos os recursos, mais testes das regras do banco acessado direto pelo Supabase, sem a API (`tests/db-rules.test.js`).
- CI no GitHub Actions e `main` protegida.
- Deploy: fora do escopo da versão 1.0 (o projeto roda localmente); ver `docs/melhorias-futuras.md`.

## Ajustes no banco (Database)

Feitos na migration `household_owner_guard_and_reports`:

- ✅ Household nunca fica sem owner (trigger `ensure_household_has_owner`, erro `AL001`). Exclusões em cascata continuam permitidas.
- ✅ `invite_member` com `errcode` próprios (`42501`, `P0002`, `23505`), retornando o id do usuário adicionado e acusando quem já é membro.
- ✅ Funções de relatório.
- ✅ O trigger `on_auth_user_created` passou a ser declarado em `07_functions.sql`; sem isso, o `supabase db schema declarative sync` gerava um `DROP TRIGGER`.

Feitos na migration `invitations_and_default_categories`:

- ✅ Convites com aceite (tabela `household_invitations` e funções `invite_member`, `my_invitations`, `accept_invitation`, `decline_invitation`, `cancel_invitation`). O convite não revela mais se um e-mail tem cadastro; convidar como `owner` passou a ser aceitável, porque a pessoa precisa aceitar.
- ✅ Categorias padrão no cadastro: Salário (receita), Mercado, Transporte e Lazer (despesas).

Feito na migration `transaction_author_guard`:

- ✅ `transactions.user_id` é sempre o usuário logado (trigger `set_transaction_author`), também para quem usar o Supabase direto. O autor não pode ser trocado depois; só vira `null` quando o perfil é excluído.

Para depois da versão 1.0: arquivar categorias (`is_active`), registrado em `docs/melhorias-futuras.md`.

## Definição de pronto (por endpoint)

- Validação Zod de params, query e body.
- Documentado no Swagger (request, respostas e erros).
- Testes de integração: sucesso, 400, 401 e acesso a household de outro usuário (RLS).
