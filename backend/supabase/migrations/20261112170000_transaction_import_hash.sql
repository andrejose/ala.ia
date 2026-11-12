-- Importação de extratos: identificador da linha importada.
-- Só acrescenta uma coluna opcional e um índice: os lançamentos existentes
-- ficam com import_hash nulo e nada da v1.0 muda.
alter table public.transactions add column import_hash varchar(64);

-- Reimportar o mesmo extrato não duplica nada. Nulos não colidem, então só as
-- linhas importadas entram na regra.
create unique index transactions_account_import_hash_key
  on public.transactions (account_id, import_hash);
