-- Tipo de conta "cartão de crédito".
-- Só acrescenta um valor ao enum: nada do que já existe muda.
-- Compras no cartão são despesas lançadas na conta do cartão (saldo negativo
-- = fatura em aberto); o pagamento da fatura é uma transferência para ele.
alter type public.account_type add value if not exists 'credit_card';
