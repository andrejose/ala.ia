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
├── index.js                 # Servidor Express
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

Pré-requisitos: Node.js, Docker (para o Supabase local).

```bash
cd backend
npm install
npx supabase start      # sobe o Supabase local
npx supabase db reset   # aplica as migrations
node index.js
```

Crie o arquivo `backend/.env` com:

```
SUPABASE_URL=
SUPABASE_PUBLISHABLE_KEY=
```

## Equipe

- André Guimarães — Backend
- Agrício Vitoretti Jr. — Database
- Laura Brietzig — Testes / Documentação

## Status

🚧 Etapa inicial — schema do banco criado no Supabase; endpoints da API em desenvolvimento.
