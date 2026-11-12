import { HttpError } from "../errors/HttpError.js";
import { detectParser, parsers } from "../imports/parsers/index.js";
import { categorySuggester, withImportHashes } from "../imports/preview.js";
import { decodeText, ParseError } from "../imports/text.js";
import { MAX_IMPORT_ROWS } from "../schemas/imports.schemas.js";

// Importação de extratos em dois passos:
//   1. POST /imports/preview: lê o arquivo e devolve as linhas, sem gravar nada
//   2. POST /imports: grava as linhas escolhidas de uma vez (tudo ou nada)
// O arquivo é lido em memória e descartado: extratos não ficam guardados.

const supported = parsers.map((parser) => parser.label).join(", ");

async function getAccount(supabase, householdId, id) {
  const { data, error } = await supabase
    .from("accounts")
    .select("id, name, type, is_active")
    .eq("household_id", householdId)
    .eq("id", id)
    .single();
  if (error) throw error;
  return data;
}

function readStatement(body) {
  if (!Buffer.isBuffer(body) || body.length === 0) {
    throw new HttpError(400, "VALIDATION_ERROR", "Envie o arquivo do extrato no corpo da requisição.");
  }

  const text = decodeText(body);
  const parser = detectParser(text);
  if (!parser) {
    throw new HttpError(
      400,
      "UNSUPPORTED_FORMAT",
      `Não reconheci este arquivo. Por enquanto, a importação aceita: ${supported}.`
    );
  }

  let rows;
  try {
    rows = parser.parse(text);
  } catch (err) {
    if (err instanceof ParseError) throw new HttpError(400, "INVALID_FILE", err.message);
    throw err;
  }
  if (rows.length === 0) throw new HttpError(400, "INVALID_FILE", "O arquivo não tem nenhum lançamento.");
  if (rows.length > MAX_IMPORT_ROWS) {
    throw new HttpError(400, "INVALID_FILE", `O arquivo tem ${rows.length} lançamentos; o máximo é ${MAX_IMPORT_ROWS} por vez.`);
  }
  return { parser, rows };
}

// Lançamentos que já existem na conta no período do arquivo, para marcar o
// que já foi importado e o que parece ter sido lançado à mão.
async function existingInPeriod(supabase, accountId, from, to) {
  const { data, error } = await supabase
    .from("transactions")
    .select("import_hash, account_id, destination_account_id, type, amount, due_date")
    .or(`account_id.eq.${accountId},destination_account_id.eq.${accountId}`)
    .gte("due_date", from)
    .lte("due_date", to)
    .limit(5000);
  if (error) throw error;

  const imported = new Set();
  const manual = new Map(); // "data|valor com sinal" -> quantos
  for (const tx of data) {
    if (tx.import_hash && tx.account_id === accountId) {
      imported.add(tx.import_hash);
      continue;
    }
    const out = tx.type === "expense" || (tx.type === "transfer" && tx.account_id === accountId);
    const key = `${tx.due_date}|${(out ? -tx.amount : Number(tx.amount)).toFixed(2)}`;
    manual.set(key, (manual.get(key) ?? 0) + 1);
  }
  return { imported, manual };
}

async function loadSuggester(supabase, householdId) {
  const [history, categories] = await Promise.all([
    supabase
      .from("transactions")
      .select("description, type, category_id")
      .eq("household_id", householdId)
      .not("category_id", "is", null)
      .order("created_at", { ascending: false })
      .limit(1000),
    supabase.from("categories").select("id").eq("household_id", householdId).eq("is_active", true),
  ]);
  if (history.error) throw history.error;
  if (categories.error) throw categories.error;

  const active = new Set(categories.data.map((c) => c.id));
  const suggest = categorySuggester(history.data);
  return (type, description) => {
    const id = suggest(type, description);
    return id && active.has(id) ? id : null;
  };
}

// POST /households/:householdId/imports/preview?account_id=...
// Corpo: o arquivo do extrato, como veio do banco (text/csv)
export async function preview(req, res) {
  const { account_id } = req.validated.query;
  const account = await getAccount(req.supabase, req.household.id, account_id);
  const { parser, rows } = readStatement(req.body);

  const parsed = withImportHashes(rows);
  const dates = parsed.map((row) => row.date).sort();
  const [{ imported, manual }, suggest] = await Promise.all([
    existingInPeriod(req.supabase, account.id, dates[0], dates.at(-1)),
    loadSuggester(req.supabase, req.household.id),
  ]);

  const result = parsed.map((row) => {
    const type = row.amount > 0 ? "income" : "expense";
    let status = "new";
    let note = row.deselect ?? null;

    if (imported.has(row.import_hash)) {
      status = "imported";
      note = "Já importado antes.";
    } else {
      const key = `${row.date}|${row.amount.toFixed(2)}`;
      if (manual.get(key) > 0) {
        manual.set(key, manual.get(key) - 1);
        status = "similar";
        note = "Parece um lançamento que já está na conta (mesma data e valor).";
      }
    }

    return {
      line: row.line,
      import_hash: row.import_hash,
      date: row.date,
      description: row.description.slice(0, 200),
      amount: Math.abs(row.amount),
      type,
      category_id: suggest(type, row.description),
      status,
      selected: status === "new" && !row.deselect,
      note,
    };
  });

  const count = (status) => result.filter((row) => row.status === status).length;
  res.status(200).json({
    source: { id: parser.id, label: parser.label, kind: parser.kind },
    account,
    kind_mismatch: (parser.kind === "credit_card") !== (account.type === "credit_card"),
    summary: { total: result.length, new: count("new"), imported: count("imported"), similar: count("similar") },
    rows: result,
  });
}

// POST /households/:householdId/imports
// Grava as linhas escolhidas num único insert: ou entram todas, ou nenhuma.
// Linha já importada (mesmo import_hash na conta) é ignorada, não duplicada.
export async function commit(req, res) {
  const { account_id, rows } = req.validated.body;
  await getAccount(req.supabase, req.household.id, account_id);

  const { data, error } = await req.supabase
    .from("transactions")
    .upsert(
      rows.map((row) => ({
        household_id: req.household.id,
        account_id,
        type: row.type,
        category_id: row.category_id,
        description: row.description,
        amount: row.amount,
        due_date: row.date,
        payment_date: row.date,
        import_hash: row.import_hash,
        user_id: req.user.id,
      })),
      { onConflict: "account_id,import_hash", ignoreDuplicates: true }
    )
    .select("id");
  if (error) throw error;

  res.status(201).json({ imported: data.length, skipped: rows.length - data.length });
}
