# Melhorias futuras

Ideias registradas para depois da versão 1.0 (entrega da disciplina). Nada aqui está implementado: o que for entregue sai desta lista.
A ordem das seções não é de prioridade.

## 1. Importação de extratos bancários

Cadastrar lançamentos em lote a partir do extrato do banco, em vez de digitar um por um.

**Formatos:** CSV, XLSX e PDF. **Bancos prioritários:** Banco do Brasil, Santander e Nubank.

Fluxo proposto:

1. A pessoa escolhe a conta de destino e envia o arquivo.
2. A API identifica o banco e o formato e extrai data, descrição e valor de cada linha.
3. O frontend mostra uma **prévia** antes de gravar: cada linha com a categoria sugerida, marcação das prováveis duplicatas e opção de desmarcar.
4. Ao confirmar, a API grava tudo de uma vez (uma transação no banco: ou entra tudo, ou nada).

Pontos de atenção:

- **Um leitor por banco e formato** (ex.: `parsers/nubank-csv.js`, `parsers/bb-pdf.js`), todos devolvendo o mesmo formato intermediário. Assim, um banco novo é só um leitor novo.
- **Começar pelo CSV.** É o formato mais estável (o Nubank exporta CSV direto no app). XLSX é parecido (biblioteca `exceljs`). **PDF é o mais frágil**: o layout muda sem aviso e cada banco é diferente; extrair texto com `pdfjs-dist` e montar regras por banco, com testes usando extratos de exemplo anonimizados.
- **Vale considerar OFX:** Banco do Brasil e Santander exportam OFX, um formato padronizado e bem mais confiável que PDF.
- **Duplicatas:** guardar um identificador da linha importada (o `FITID` do OFX ou um hash de conta + data + valor + descrição) em uma coluna nova, com índice único por conta. Reimportar o mesmo extrato não duplica nada.
- **Categorização automática:** regras do tipo "descrição contém IFOOD → Alimentação", aprendidas a partir das categorias que a pessoa escolhe na prévia.
- **Segurança e privacidade:** o arquivo é processado em memória e descartado, com limite de tamanho e de linhas. Extratos são dados sensíveis e não devem ficar guardados.

## 2. Lançamento com subdivisão (rateio)

Um único lançamento dividido entre várias categorias. Exemplo: a fatura do cartão de R$ 1.000,00 sai da conta corrente como uma despesa, mas dentro dela há R$ 400,00 de mercado, R$ 350,00 de roupas e R$ 250,00 de alimentação. Os relatórios por categoria devem mostrar cada parte.

Modelo proposto:

- Nova tabela `transaction_splits` (`transaction_id`, `category_id`, `amount`, `description` opcional), com a mesma FK composta das transações para garantir categoria do mesmo household e do mesmo tipo.
- O lançamento pai continua com o valor total e é o que conta no **saldo da conta**. Um lançamento com divisão não tem `category_id` próprio.
- Regra no banco (trigger com `deferrable initially deferred`): a soma das partes é igual ao valor do lançamento.
- Os relatórios (`report_by_category`) passam a somar as partes no lugar do lançamento pai quando houver divisão.
- No formulário: botão "Dividir em categorias", com linhas de categoria e valor e o quanto falta distribuir.

### Decisão: começar pelo tipo de conta cartão de crédito

Avaliadas as duas opções, a escolha é implementar primeiro um tipo de conta **cartão de crédito** e deixar o rateio para depois, só se o uso real pedir.

Como funciona: o cartão é uma conta cujo saldo representa uma dívida. Cada compra é uma **despesa** lançada no cartão com a sua categoria; o pagamento da fatura é uma **transferência** da conta corrente para o cartão.

| Situação | Lançamento | Saldo do cartão |
|---|---|---|
| Mercado, R$ 400,00 | Despesa no Cartão, categoria Mercado | −400,00 |
| Roupas, R$ 350,00 | Despesa no Cartão, categoria Roupas | −750,00 |
| iFood, R$ 250,00 | Despesa no Cartão, categoria Alimentação | −1.000,00 (fatura em aberto) |
| Pagamento da fatura | Transferência Corrente → Cartão, R$ 1.000,00 | 0,00 |

Por que resolve o caso da fatura sem rateio: as compras já entram categorizadas, e transferências não têm categoria (`transactions_type_chk`), então o pagamento não aparece em `report_by_category` e nada é contado duas vezes.

O que muda:

- **Banco:** migration nova com `ALTER TYPE account_type ADD VALUE 'credit_card'` (só acrescenta; nada da v1.0 muda).
- **Backend:** novo valor no enum de `schemas/accounts.schemas.js` e em `docs/components.js`.
- **Frontend:** novo tipo em `lib/types.ts` e `accountTypes.ts`; saldo negativo exibido como "Fatura em aberto"; botão "Pagar fatura" que abre a transferência já preenchida.
- **Depois (opcional):** limite e dias de fechamento/vencimento. Sem eles, o app mostra o total devido no cartão, não a fatura de cada mês.

Limitações conhecidas:

- **Compra única com várias categorias fora do cartão** (ex.: nota de mercado paga no Pix com comida e limpeza) continua precisando do rateio.
- **Parcelamento:** exige lançar as parcelas futuras ou a compra inteira; pode ser resolvido junto com os lançamentos recorrentes.
- **Estorno:** como `amount > 0`, entra como receita, o que distorce um pouco o relatório por categoria.
- **Mais lançamentos:** cada compra vira um lançamento. A importação de extratos (seção 1) compensa isso, já que o Nubank exporta a fatura do cartão em CSV.
- **Histórico:** faturas já lançadas como despesa única na corrente ficam como estão.

## 3. Outras melhorias do app

- **Tela de relatórios:** gráfico por categoria e comparação mês a mês (Recharts ou similar).
- **Testes do banco com pgTAP** (`supabase test db`), cobrindo RLS e triggers diretamente no Postgres.
- **Lançamentos recorrentes:** aluguel, salário e assinaturas criados todo mês automaticamente.
- **Metas e orçamento por categoria:** "gastar até R$ 800,00 em mercado".

## 4. Publicação

Hoje o projeto roda só localmente. Para publicar:

- Liberar CORS no backend para o domínio do frontend.
- Hospedar o backend (Render, Railway ou Fly.io) e o frontend (Vercel ou Netlify), com as variáveis do Supabase remoto.
- Reforços de produção: `helmet`, limite de requisições nas rotas de autenticação e logs estruturados.
- Manter a confirmação de e-mail ligada no Supabase Auth (necessária para o aceite de convites ser seguro).
