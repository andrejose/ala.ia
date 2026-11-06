# ala.ia

API REST para um sistema de controle financeiro pessoal.

**ALA** = **A**utonomia, **L**iberdade e **A**utocontrole — conquistar liberdade financeira por meio do conhecimento e da organização dos gastos.

## Escopo (MVP)

Controle de gastos de forma simples e eficiente, com:

- Cadastro e autenticação de usuários
- Contas (corrente, poupança, investimento, dinheiro) com saldo calculado
- Categorias de receitas e despesas
- Lançamentos de receitas, despesas e transferências entre contas
- Compartilhamento das finanças entre usuários (ex.: um casal) via _households_

## Stack

| Área         | Tecnologia                                         |
| :----------- | :------------------------------------------------- |
| Backend      | Node.js + Express                                  |
| Database     | Supabase (PostgreSQL 17) com Row Level Security    |
| Autenticação | Supabase Auth                                      |
| Testes       | Vitest                                             |
| Documentação | Swagger                                            |

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
│   ├── schemas/             # Validação (Zod) — também gera o Swagger
│   ├── middlewares/         # Autenticação, validação, erros
│   ├── errors/              # HttpError e tradução dos erros do Supabase
│   └── docs/                # Especificação OpenAPI
├── tests/                   # Testes de integração (Vitest + supertest)
├── package.json
└── supabase/
    ├── config.toml          # Configuração do Supabase CLI
    ├── schemas/             # Schema declarativo (fonte da verdade do banco)
    └── migrations/          # Migrations geradas a partir dos schemas
```

## Banco de dados

Todos os dados financeiros pertencem a um **household** (grupo compartilhado). Ao se cadastrar, o usuário ganha automaticamente um perfil e um household pessoal, do qual é dono.

| Tabela / View       | Descrição                                                      |
| :------------------ | :------------------------------------------------------------- |
| `profiles`          | Dados públicos do usuário (1:1 com `auth.users`)               |
| `households`        | Grupo que agrupa contas, categorias e transações               |
| `household_members` | Usuários de cada household e seu papel (`owner` / `member`)    |
| `accounts`          | Contas do household e saldo inicial                            |
| `categories`        | Categorias de receita e despesa                                |
| `transactions`      | Receitas, despesas e transferências                            |
| `account_balances`  | View com o saldo atual de cada conta (só transações pagas)     |

Funções RPC: `create_household(p_name)` e `invite_member(p_household_id, p_email, p_role)`.

### Alterando o schema

1. Edite os arquivos em `backend/supabase/schemas/`
2. Gere a migration: `npx supabase db diff -f nome_da_mudanca`
3. Teste localmente: `npx supabase db reset`
4. Envie ao projeto remoto: `npx supabase db push --remote`

## Como executar

Pré-requisitos: Node.js 20+, Docker (para o Supabase local).

```bash
cd backend
npm install
npx supabase start      # sobe o Supabase local
npx supabase db reset   # aplica as migrations
cp .env.example .env    # preencha com API_URL e PUBLISHABLE_KEY de `npx supabase status`
npm run dev             # servidor com reload em http://localhost:3001
```

| Script          | Descrição                                     |
| :-------------- | :-------------------------------------------- |
| `npm start`     | Sobe o servidor                               |
| `npm run dev`   | Sobe o servidor e reinicia a cada alteração   |
| `npm test`      | Roda os testes uma vez                        |
| `npm run test:watch` | Roda os testes em modo observação        |

## Documentação da API (Swagger)

Com o servidor no ar, acesse **http://localhost:3001/docs**. A especificação OpenAPI fica em `/docs.json`.

Para testar rotas protegidas: faça `POST /auth/signup` ou `POST /auth/login`, copie o `session.access_token` e clique em **Authorize**.

O roteiro dos endpoints, as convenções e o mapeamento de erros estão em [docs/roteiro-backend.md](docs/roteiro-backend.md).

## Testes

Os testes de integração rodam contra o **Supabase local** e criam usuários de verdade; por segurança, eles se recusam a rodar contra outro host.

```bash
cd backend
npx supabase start
cp .env.test.example .env.test   # preencha o PUBLISHABLE_KEY de `npx supabase status`
npm test
```

## Equipe

- André Guimarães — Backend
- Agrício Vitoretti Jr. — Database
- Laura Brietzig — Testes / Documentação

## Status

🚧 Schema do banco criado; autenticação, perfil e Swagger prontos. Próximos passos em [docs/roteiro-backend.md](docs/roteiro-backend.md).
