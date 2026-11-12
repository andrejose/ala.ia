-- =============================================================================
-- 01_base.sql
-- Tipos (enums) e funções utilitárias compartilhadas pelas demais tabelas.
-- Os arquivos desta pasta são aplicados em ordem alfabética (01_, 02_, ...).
-- =============================================================================

-- Tipos de conta que o usuário pode cadastrar
create type public.account_type as enum (
  'checking',    -- Conta corrente
  'savings',     -- Poupança
  'investment',  -- Investimentos
  'cash',        -- Dinheiro em espécie / carteira
  'credit_card'  -- Cartão de crédito: saldo negativo é a fatura em aberto
);

-- Natureza da transação. Usado também nas categorias (apenas income/expense):
-- receita = entrada (crédito) | despesa = saída (débito)
create type public.transaction_type as enum (
  'income',      -- Receita: entrada de dinheiro na conta
  'expense',     -- Despesa: saída de dinheiro da conta
  'transfer'     -- Transferência entre duas contas do mesmo household
);

-- Papel do usuário dentro de um household (grupo compartilhado)
create type public.member_role as enum (
  'owner',       -- Dono: pode convidar/remover membros e editar o household
  'member'       -- Membro: acessa e lança dados do household
);

-- Atualiza automaticamente a coluna "updated_at" em qualquer UPDATE
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

