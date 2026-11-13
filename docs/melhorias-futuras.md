# Melhorias futuras

Ideias registradas para depois da versão 1.0 (entrega da disciplina). Nada aqui está implementado: o que for entregue sai desta lista.
A ordem das seções não é de prioridade.

## 1. Importação de extratos bancários: próximos formatos

A importação em CSV já está entregue para o extrato do Banco do Brasil, o do Santander e a fatura do cartão Nubank, com prévia, categoria sugerida e proteção contra duplicatas (ver README). Cada banco tem um leitor em `backend/src/imports/parsers/`, e todos devolvem o mesmo formato. Para aceitar um banco novo, basta criar o arquivo dele e incluí-lo na lista de `parsers/index.js`, com um teste usando um extrato fictício no mesmo formato.

Falta:

- **Fatura do cartão Santander:** ainda não há um arquivo de exemplo. Com o CSV (ou o PDF) em mãos, é um leitor novo.
- **PDF:** é o formato mais frágil, porque o layout muda sem aviso e cada banco é diferente. A ideia é extrair o texto com `pdfjs-dist`, montar regras por banco e testar com extratos de exemplo anonimizados. Já há PDFs de exemplo do BB, do Santander e do Nubank.
- **XLSX** (biblioteca `exceljs`) e **OFX**: Banco do Brasil e Santander exportam OFX, um formato padronizado e bem mais confiável que PDF. O `FITID` do OFX pode servir de `import_hash`.
- **Extrato da conta Nubank** (não a fatura): outro CSV, com o cabeçalho `Data,Valor,Identificador,Descrição`.
- **Regras de categoria explícitas:** hoje a sugestão vem da categoria usada mais recentemente numa descrição parecida. Regras do tipo "contém IFOOD → Alimentação", editáveis, dariam mais controle.

## 2. Lançamento com subdivisão (rateio)

Um único lançamento dividido entre várias categorias. Exemplo: a fatura do cartão de R$ 1.000,00 sai da conta corrente como uma despesa, mas dentro dela há R$ 400,00 de mercado, R$ 350,00 de roupas e R$ 250,00 de alimentação. Os relatórios por categoria devem mostrar cada parte.

Modelo proposto:

- Nova tabela `transaction_splits` (`transaction_id`, `category_id`, `amount`, `description` opcional), com a mesma FK composta das transações para garantir categoria do mesmo household e do mesmo tipo.
- O lançamento pai continua com o valor total e é o que conta no **saldo da conta**. Um lançamento com divisão não tem `category_id` próprio.
- Regra no banco (trigger com `deferrable initially deferred`): a soma das partes é igual ao valor do lançamento.
- Os relatórios (`report_by_category`) passam a somar as partes no lugar do lançamento pai quando houver divisão.
- No formulário: botão "Dividir em categorias", com linhas de categoria e valor e o quanto falta distribuir.

### Cartão de crédito em vez do rateio (já entregue)

O caso da fatura foi resolvido com o tipo de conta **cartão de crédito**. Cada compra é uma despesa no cartão, com a sua categoria, e o pagamento da fatura é uma transferência da corrente para o cartão. O rateio fica para depois, só se o uso real pedir.

Ainda dá para evoluir o cartão com limite e dias de fechamento/vencimento. Sem eles, o app mostra o total devido no cartão, não a fatura de cada mês.

Limitações do cartão que o rateio ou outras melhorias resolveriam:

- **Compra única com várias categorias fora do cartão** (ex.: nota de mercado paga no Pix com comida e limpeza) continua precisando do rateio.
- **Parcelamento:** resolvido com os lançamentos recorrentes. Uma compra parcelada no cartão vira uma recorrência com "Quantas vezes", e cada parcela entra numerada no mês dela.
- **Estorno:** como `amount > 0`, entra como receita, o que distorce um pouco o relatório por categoria.
- **Mais lançamentos:** cada compra vira um lançamento. A importação de extratos (seção 1) compensa isso, já que o Nubank exporta a fatura do cartão em CSV.
- **Histórico:** faturas já lançadas como despesa única na corrente ficam como estão.

## 3. Outras melhorias do app

- **Metas e orçamento por categoria:** "gastar até R$ 800,00 em mercado".

## 4. Publicação

Hoje o projeto roda só localmente. Para publicar:

- Liberar CORS no backend para o domínio do frontend.
- Hospedar o backend (Render, Railway ou Fly.io) e o frontend (Vercel ou Netlify), com as variáveis do Supabase remoto.
- Reforços de produção: `helmet`, limite de requisições nas rotas de autenticação e logs estruturados.
- Manter a confirmação de e-mail ligada no Supabase Auth (necessária para o aceite de convites ser seguro).
