import { buildPdf } from "../../helpers/pdf.js";

// Extratos fictícios em PDF, no mesmo layout que cada banco gera. Os dados são
// os mesmos dos CSVs fictícios ao lado (bb.csv, santander.csv, nubank-fatura.csv),
// para os testes conferirem que CSV e PDF do mesmo extrato batem.

// Banco do Brasil: histórico logo acima da linha da data, detalhe logo abaixo.
// O Pix recebido tem o detalhe longo: começa na linha da data e continua embaixo.
export function bbPdf() {
  const head = [
    { x: 25, y: 803, text: "Extrato de Conta Corrente" },
    { x: 25, y: 783, text: "Cliente: PESSOA EXEMPLO" },
    { x: 30, y: 740, text: "Lançamentos" },
    { x: 30, y: 726, text: "Dia" },
    { x: 99, y: 726, text: "Lote" },
    { x: 148, y: 726, text: "Documento" },
    { x: 265, y: 726, text: "Histórico" },
    { x: 550, y: 726, text: "Valor" },
  ];
  const main = (y, date, doc, value, history) => [
    { x: 30, y, text: date },
    { x: 99, y, text: "99008" },
    ...(doc ? [{ x: 148, y, text: doc }] : []),
    ...(history ? [{ x: 265, y, text: history }] : []),
    { x: 530, y, text: value },
  ];
  const entry = (y, date, doc, value, title, detail) => [
    { x: 265, y: y + 5, text: title },
    ...main(y, date, doc, value),
    ...(detail ? [{ x: 265, y: y - 6, text: detail }] : []),
  ];

  const page1 = [
    ...head,
    ...main(711, "31/10/2026", "", "100,00 (+)", "Saldo Anterior"),
    ...entry(691, "03/11/2026", "140111", "39,99 (-)", "Compra com Cartão", "31/10 11:08 PADARIA PAO QUENTE"),
    ...entry(667, "03/11/2026", "110301", "66,00 (-)", "Pix - Enviado", "31/10 20:18 PIZZARIA BELLA LTDA"),
    ...entry(643, "03/11/2026", "110302", "66,00 (-)", "Pix - Enviado", "31/10 20:18 PIZZARIA BELLA LTDA"),
    ...entry(619, "03/11/2026", "1", "1.234,56 (-)", "Tarifa Pacote de Serviços", "Tarifa mensal"),
    ...entry(595, "03/11/2026", "9903", "1.306,55 (+)", "BB Rende Fácil", "Rende Facil"),
    ...main(581, "03/11/2026", "", "0,00 (+)", "Saldo do dia"),
  ];
  const page2 = [
    ...head,
    { x: 265, y: 702, text: "Pix - Recebido" },
    ...main(691, "05/11/2026", "555", "2.500,00 (+)", "05/11 09:00 EMPRESA EXEMPLO"),
    { x: 265, y: 679, text: "SA" },
    ...main(655, "12/11/2026", "", "2.500,00 (+)", "S A L D O"),
    { x: 30, y: 620, text: "Informações Adicionais" },
    { x: 30, y: 605, text: "Saldo" },
    { x: 516, y: 605, text: "2.500,00 (+)" },
    { x: 30, y: 560, text: "Lançamentos Futuros" },
    { x: 30, y: 540, text: "13/11/2026" },
    { x: 100, y: 540, text: "PAG BOLETO" },
    { x: 518, y: 540, text: "500,00 (-)" },
  ];
  return buildPdf([page1, page2]);
}

// Santander: títulos de dia à esquerda; lançamento em uma linha ou em três.
// O detalhe do "Liquido de vencimento" vem diferente do CSV, como no PDF real
// (onde o detalhe aparece encurtado ou trocado).
export function santanderPdf() {
  const money = (y, value, balance) => [
    { x: 420, y, text: value },
    { x: 500, y, text: balance },
  ];
  return buildPdf([
    [
      { x: 388, y: 782, text: "EXTRATO DE CONTA" },
      { x: 40, y: 732, text: "Período: 01/11/2026 a 12/11/2026" },
      { x: 40, y: 598, text: "DETALHE DOS MOVIMENTOS" },
      { x: 40, y: 578, text: "Data" },
      { x: 112, y: 578, text: "Descrição" },
      { x: 430, y: 578, text: "Valor" },
      { x: 512, y: 578, text: "Saldo" },
      { x: 44, y: 543, text: "Segunda, 9 de novembro de 2026" },
      { x: 40, y: 522, text: "09/11/2026" },
      { x: 112, y: 522, text: "Remuneracao aplicacao automatica" },
      ...money(522, "R$ 0,03", "R$ 1.000,03"),
      { x: 44, y: 463, text: "Terça, 3 de novembro de 2026" },
      { x: 112, y: 442, text: "Pix enviado" },
      { x: 40, y: 433, text: "03/11/2026" },
      ...money(433, "-R$ 2.800,00", "R$ 1.000,00"),
      { x: 112, y: 424, text: "Pet Shop Exemplo" },
      { x: 44, y: 365, text: "Domingo, 1 de novembro de 2026" },
      { x: 112, y: 344, text: "Liquido de vencimento" },
      { x: 40, y: 335, text: "01/11/2026" },
      ...money(335, "R$ 3.800,00", "R$ 3.800,00"),
      { x: 112, y: 326, text: "Fundacao Exemplo" },
      { x: 542, y: 20, text: "1/1" },
    ],
  ]);
}

// Nubank: "06 OUT" e a descrição na mesma altura (1 ponto de diferença), sem ano.
export function nubankPdf({ invoice = "13 NOV 2026", rows } = {}) {
  const transactions = rows ?? [
    ["01 NOV", "•••• 1234", "Posto Exemplo", "R$ 228,49"],
    ["30 OUT", null, 'IOF de "Assinatura Exemplo"', "R$ 4,00"],
    ["30 OUT", "•••• 1234", "Assinatura Exemplo", "R$ 114,40"],
    ["13 OUT", null, "Pagamento em 13 OUT", "-R$ 3.339,70"],
    ["10 OUT", null, "Estorno Loja Exemplo", "-R$ 50,00"],
  ];
  const cells = [
    { x: 327, y: 795, text: "PESSOA EXEMPLO" },
    { x: 327, y: 782, text: `FATURA ${invoice}` },
    { x: 438, y: 782, text: "EMISSÃO E ENVIO 06 NOV 2026" },
    { x: 50, y: 732, text: "TRANSAÇÕES" },
    { x: 119, y: 666, text: "Pessoa Exemplo" },
    { x: 491, y: 666, text: "R$ 397,89" },
  ];
  transactions.forEach(([date, card, title, value], index) => {
    const y = 640 - index * 22;
    cells.push({ x: 123, y: y + 1, text: date });
    if (card) cells.push({ x: 172, y, text: card });
    cells.push({ x: card ? 214 : 185, y, text: title }, { x: 500, y, text: value });
  });
  // Linha de conversão de moeda, sem data: não é lançamento
  cells.push({ x: 214, y: 640 - transactions.length * 22, text: "USD 20.00" });
  cells.push({ x: 50, y: 120, text: "Nu Pagamentos S.A." });
  return buildPdf([cells]);
}
