-- =============================================================================
-- 06_balances.sql
-- Saldo atual de cada conta, considerando apenas transações pagas.
--
-- security_invoker = true faz a view respeitar o RLS de quem consulta
-- (sem isso, a view exporia contas de outros households).
-- Uso no supabase-js: supabase.from('account_balances').select('*')
-- =============================================================================

create or replace view public.account_balances
with (security_invoker = true)
as
select
  a.id   as account_id,
  a.household_id,
  a.name,
  a.type,
  a.is_active,
  a.initial_balance,
  a.initial_balance + coalesce(sum(
    case
      when t.type = 'income'   and t.account_id             = a.id then  t.amount
      when t.type = 'expense'  and t.account_id             = a.id then -t.amount
      when t.type = 'transfer' and t.account_id             = a.id then -t.amount
      when t.type = 'transfer' and t.destination_account_id = a.id then  t.amount
      else 0
    end
  ), 0) as current_balance
from public.accounts a
left join public.transactions t
  on (t.account_id = a.id or t.destination_account_id = a.id)
 and t.payment_date is not null
group by a.id;

