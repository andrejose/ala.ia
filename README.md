# ala.ia

[![CI](https://github.com/andrejose/ala.ia/actions/workflows/ci.yml/badge.svg)](https://github.com/andrejose/ala.ia/actions/workflows/ci.yml)

Sistema de controle financeiro pessoal e compartilhado: uma **API REST** (Node.js + Express + Supabase) e uma interface web para usá-la no dia a dia.

**ALA** = **A**utonomia, **L**iberdade e **A**utocontrole: conquistar liberdade financeira por meio do conhecimento e da organização dos gastos.

**Status:** ✅ versão 1.0, entrega da disciplina. As próximas ideias estão em [docs/melhorias-futuras.md](docs/melhorias-futuras.md).

## Funcionalidades

- **Cadastro e login**, com sessão renovada automaticamente.
- **Contas** (corrente, poupança, investimento, dinheiro e cartão de crédito) com **saldo calculado**: saldo inicial + lançamentos pagos. Contas com histórico são arquivadas, não excluídas.
- **Cartão de crédito**: cada compra é uma despesa no cartão, com a sua categoria, e o saldo negativo aparece como **fatura em aberto**. "Pagar fatura" abre a transferência da conta corrente para o cartão já preenchida; como transferência não tem categoria, o pagamento não conta duas vezes nos relatórios.
- **Categorias** de receita e despesa, com cor e ícone. Todo cadastro já começa com Salário, Mercado, Transporte e Lazer.
- **Lançamentos**: receitas, despesas e transferências entre contas; pendentes (a pagar ou a receber) não entram no saldo até serem marcados como pagos.
- **Relatórios**: total de entradas e saídas do mês (pagas e pendentes), gastos e receitas por categoria em gráfico de rosca, comparação com o mês anterior e gráfico mês a mês dos últimos 6 meses.
- **Espaços compartilhados** (na API, _households_): um casal, por exemplo, divide contas, categorias e lançamentos. O dono convida por e-mail e a pessoa só entra se **aceitar o convite**.

## Arquitetura

```
 Navegador                    API (Express)                       Supabase
┌───────────────┐   /api    ┌─────────────────────────┐        ┌──────────────────────┐
│ React + Vite  │──────────▶│ valida (Zod)            │  JWT   │ Auth (cadastro/login)│
│ (frontend/)   │   Bearer  │ autentica o token       │───────▶│ PostgreSQL com RLS   │
└───────────────┘   token   │ traduz erros para HTTP  │        │ triggers e funções   │
                            │ documenta (Swagger)     │        └──────────────────────┘
                            └─────────────────────────┘
```

Decisões principais:

- **A API age como o usuário.** Cada requisição cria um cliente Supabase com o token de quem chamou, e o **Row Level Security** do banco decide o que essa pessoa vê e altera. A chave de serviço (que ignora o RLS) não é usada em nenhuma rota.
- **Regras de negócio no banco.** Valor positivo, transferência com conta de destino, categoria do tipo certo, dados sempre do mesmo espaço, espaço nunca sem dono, autor do lançamento sempre o usuário logado: tudo garantido por constraints, FKs compostas e triggers. A API valida antes (Zod) para devolver mensagens claras.
- **Erros previsíveis.** Todo erro sai como `{ error: { code, message, details? } }`, com os códigos do Postgres traduzidos para status HTTP (veja o [roteiro do backend](docs/roteiro-backend.md#mapeamento-de-erros)).
- **"Household" na API, "Espaço" na interface.** O código, o banco e a API usam `household`; para quem usa o app, o nome é Espaço.

## Stack

| Área         | Tecnologia                                              |
| :----------- | :------------------------------------------------------ |
| Backend      | Node.js + Express 5, Zod                                |
| Banco        | Supabase (PostgreSQL 17) com Row Level Security         |
| Autenticação | Supabase Auth                                           |
| Testes       | Banco: pgTAP. Backend: Vitest + supertest (integração, contra o Supabase local). Frontend: Vitest + Testing Library + MSW |
| Documentação | OpenAPI 3.1 + Swagger UI                                |
| Frontend     | React + Vite + TypeScript + Tailwind CSS + TanStack Query |
| CI           | GitHub Actions                                          |

## Estrutura

```
backend/
├── src/
│   ├── server.js            # Sobe o servidor (listen)
│   ├── app.js               # App Express (rotas, Swagger, erros)
│   ├── config/              # Leitura e validação do .env
│   ├── lib/                 # Clientes Supabase e configuração do Zod
│   ├── routes/              # Definição das rotas
│   ├── controllers/         # Lógica de cada endpoint
│   ├── schemas/             # Validação (Zod), que também gera o Swagger
│   ├── middlewares/         # Autenticação, espaço em uso, validação, erros
│   ├── errors/              # HttpError e tradução dos erros do Supabase
│   └── docs/                # Especificação OpenAPI
├── tests/                   # Testes de integração (Vitest + supertest)
└── supabase/
    ├── config.toml          # Configuração do Supabase CLI
    ├── schemas/             # Schema declarativo (fonte da verdade do banco)
    ├── migrations/          # Migrations geradas a partir dos schemas
    └── tests/database/      # Testes do banco (pgTAP)

frontend/
├── src/
│   ├── app/                 # Rotas e cache (usados pelo main.tsx e pelos testes)
│   ├── components/          # Peças visuais (logo, navegação, campos, diálogo)
│   ├── features/            # Telas: entrada, painel, lançamentos, contas,
│   │                        #   categorias, espaço e convites, perfil (+ testes *.test.tsx)
│   ├── lib/                 # Cliente da API, consultas, formatação e tema
│   └── test/                # API simulada (MSW) e utilitários dos testes
├── vite.config.ts           # Proxy /api -> backend em desenvolvimento
└── vitest.config.ts         # Configuração dos testes (jsdom)

docs/                        # Roteiros, decisões e melhorias futuras
.github/workflows/ci.yml     # CI
```

## Banco de dados

Todos os dados financeiros pertencem a um **household** (o "espaço"). Ao se cadastrar, o usuário ganha automaticamente um perfil, um espaço pessoal chamado "Pessoal" (do qual é dono) e as categorias padrão.

| Tabela / View           | Descrição                                                         |
| :---------------------- | :---------------------------------------------------------------- |
| `profiles`              | Dados públicos do usuário (1:1 com `auth.users`)                  |
| `households`            | Espaço que agrupa contas, categorias e lançamentos                |
| `household_members`     | Quem participa de cada espaço e com qual papel (`owner`/`member`) |
| `household_invitations` | Convites (pendente, aceito, recusado, cancelado), válidos por 7 dias |
| `accounts`              | Contas e saldo inicial                                            |
| `categories`            | Categorias de receita e despesa (podem ser arquivadas)            |
| `transactions`          | Receitas, despesas e transferências                               |
| `account_balances`      | View com o saldo atual de cada conta (só lançamentos pagos)       |

- **Funções RPC:** `create_household`; convites (`invite_member`, `my_invitations`, `accept_invitation`, `decline_invitation`, `cancel_invitation`); relatórios (`report_monthly_summary`, `report_by_category`, `report_monthly_series`).
- **Triggers:** `handle_new_user` (perfil, espaço pessoal e categorias no cadastro), `ensure_household_has_owner` (espaço nunca fica sem dono) e `set_transaction_author` (autor do lançamento é sempre quem está logado).

### Alterando o schema

1. Edite os arquivos em `backend/supabase/schemas/`.
2. Gere a migration: `npx supabase db schema declarative sync --name nome_da_mudanca --no-apply` e **revise o arquivo gerado** (procure `DROP` inesperado).
3. Aplique localmente: `npx supabase migration up` (ou `npx supabase db reset` para recomeçar do zero).
4. Envie ao projeto remoto, de dentro de `backend/`: `npx supabase db push --remote --dry-run` e, conferida a lista, sem o `--dry-run`.

## API

A documentação completa, com exemplos e todos os erros, fica no Swagger: **http://localhost:3001/docs** (especificação em `/docs.json`). Para testar rotas protegidas, faça `POST /auth/login`, copie o `session.access_token` e clique em **Authorize**.

| Grupo | Rotas |
| :--- | :--- |
| Autenticação | `POST /auth/signup`, `/auth/login`, `/auth/refresh`, `/auth/logout` |
| Perfil | `GET` e `PATCH /me` |
| Espaços | `GET` e `POST /households`; `GET`, `PATCH` e `DELETE /households/:householdId` |
| Membros | `GET /households/:id/members`; `PATCH` e `DELETE /households/:id/members/:userId` |
| Convites | `GET`, `POST /households/:id/invitations`; `DELETE /households/:id/invitations/:invitationId`; `GET /invitations`; `POST /invitations/:id/accept` e `/decline` |
| Contas | CRUD em `/households/:id/accounts` |
| Categorias | CRUD em `/households/:id/categories` |
| Lançamentos | CRUD em `/households/:id/transactions`, com filtros e paginação |
| Relatórios | `GET /households/:id/reports/summary`, `/reports/by-category` e `/reports/monthly` |

Endpoints, convenções e mapeamento de erros: [docs/roteiro-backend.md](docs/roteiro-backend.md).

## Como executar

Pré-requisitos: Node.js 20+ e Docker (para o Supabase local).

**Backend**

```bash
cd backend
npm install
npx supabase start      # sobe o Supabase local (aplica as migrations na primeira vez)
cp .env.example .env    # preencha com API_URL e PUBLISHABLE_KEY de `npx supabase status`
npm run dev             # http://localhost:3001 (Swagger em /docs)
```

| Script               | Descrição                                   |
| :------------------- | :------------------------------------------ |
| `npm start`          | Sobe o servidor                             |
| `npm run dev`        | Sobe o servidor e reinicia a cada alteração |
| `npm test`           | Roda os testes uma vez                      |
| `npm run test:watch` | Roda os testes em modo observação           |
| `npm run test:db`    | Roda os testes do banco (pgTAP)             |

**Frontend** (com o backend rodando)

```bash
cd frontend
npm install
npm run dev             # http://localhost:5173
```

| Script               | Descrição                                   |
| :------------------- | :------------------------------------------ |
| `npm run dev`        | Sobe o app em desenvolvimento               |
| `npm run build`      | Gera a versão de produção                   |
| `npm run typecheck`  | Checa os tipos (TypeScript)                 |
| `npm test`           | Roda os testes uma vez                      |
| `npm run test:watch` | Roda os testes em modo observação           |

O Vite repassa as chamadas de `/api` para o backend, então não é preciso configurar CORS em desenvolvimento. Para usar outra porta da API: `API_TARGET=http://localhost:3101 npm run dev`. Se o visual aparecer sem estilos depois de trocar de branch, reinicie o `npm run dev`.

## Testes

### Banco (pgTAP)

São **89 testes** em SQL, em `backend/supabase/tests/database/`, que falam direto com o Postgres, sem passar pela API. Cada arquivo roda numa transação desfeita no fim, então nada fica no banco local.

```bash
cd backend
npx supabase start
npm run test:db
```

Cobrem o cadastro (perfil, espaço "Pessoal" e categorias padrão), a regra de sempre ter um dono, o autor do lançamento, o **RLS** de todas as tabelas (quem é de fora, membro, dono e anônimo), as constraints dos lançamentos (tipo, categoria, transferência e espaço), o saldo das contas, o fluxo do cartão de crédito (compras, fatura e pagamento), os relatórios (do mês e mês a mês) e as funções de convite com cada erro que a API traduz.

### Backend

São **100 testes de integração** que rodam contra o **Supabase local** e criam usuários de verdade; por segurança, eles se recusam a rodar contra outro host.

```bash
cd backend
npx supabase start
cp .env.test.example .env.test   # preencha o PUBLISHABLE_KEY de `npx supabase status`
npm test
```

Para cada recurso, os testes cobrem sucesso, validação (400), falta de token (401) e o bloqueio de acesso ao espaço de outra pessoa (RLS). Também cobrem cálculo de saldo, relatórios, regra do último dono, fluxo completo de convites, regras do banco acessado direto (sem a API) e um teste que garante que **toda rota da API está documentada** no Swagger.

### Frontend

São **31 testes** que montam o app inteiro (rotas, provedores e cache) no jsdom e o usam como uma pessoa usaria: digitando, escolhendo opções e clicando. A API é simulada pelo [MSW](https://mswjs.io/), então não precisam do backend nem do Supabase.

```bash
cd frontend
npm test
```

Cobrem os fluxos principais: **entrar** (login, erro de senha, erros por campo, redirecionamento de quem não entrou, sessão retomada e cadastro com confirmação de e-mail), **lançar** (despesa, receita a receber, transferência, validação antes de enviar, erro da API e conta inexistente), **convidar** (enviar convite, erro da API, membro sem permissão, aceitar e recusar convite recebido) e **arquivar categorias** (arquivar, reativar, sugestão ao excluir uma em uso e o que o formulário de lançamento oferece), **relatórios** (totais, comparação com o mês anterior, despesas e receitas por categoria e a navegação pelo gráfico mês a mês) e o **cartão de crédito** (cadastro com a fatura em aberto, fatura no lugar do saldo e "Pagar fatura" abrindo a transferência preenchida). A API simulada fica em `frontend/src/test/server.ts`; um endpoint que ela não conhece faz o teste falhar.

## Integração contínua (CI)

O GitHub Actions roda o workflow [`.github/workflows/ci.yml`](.github/workflows/ci.yml) a cada pull request e a cada push na `main`:

| Job      | O que faz |
| :------- | :-------- |
| Backend  | Sobe o Supabase local no runner (Docker), aplica as migrations e roda os testes do banco (pgTAP) e os de integração |
| Frontend | Checa os tipos (`npm run typecheck`), roda os testes (`npm test`) e faz o build (`npm run build`) |

O CI não usa o projeto Supabase remoto nem segredos do repositório. A `main` é protegida: merge só por pull request, com os dois jobs passando.

## Documentação

| Documento | Conteúdo |
| :--- | :--- |
| [docs/roteiro-backend.md](docs/roteiro-backend.md) | Decisões, convenções, mapeamento de erros e endpoints por fase |
| [docs/roteiro-frontend.md](docs/roteiro-frontend.md) | Decisões, identidade visual e telas |
| [docs/melhorias-futuras.md](docs/melhorias-futuras.md) | Ideias para depois da versão 1.0 (importação de extratos, rateio de lançamentos...) |
| `http://localhost:3001/docs` | Swagger da API |

## Limitações conhecidas (versão 1.0)

- Roda **só localmente**; publicar exige liberar CORS e hospedar backend e frontend (ver [melhorias futuras](docs/melhorias-futuras.md#4-publicação)).
- O **aceite de convites confia no e-mail da conta**: no projeto Supabase remoto, a confirmação de e-mail precisa estar ligada.
- A sessão guarda o `refresh_token` no `localStorage`, adequado ao projeto; em produção, cookies `httpOnly` seriam mais seguros.

## Equipe

- André Guimarães — Backend
- Agrício Vitoretti Jr. — Database
- Laura Brietzig — Testes / Documentação
