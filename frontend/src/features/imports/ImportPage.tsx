import { CircleCheck, FileUp, TriangleAlert } from "lucide-react";
import { useMemo, useState, type FormEvent } from "react";
import { Link } from "react-router";
import { FormError, SelectField } from "../../components/fields";
import { Money } from "../../components/Money";
import { PageHeader } from "../../components/PageHeader";
import { Button, Card } from "../../components/ui";
import { api } from "../../lib/api";
import { formatShortDate } from "../../lib/format";
import { useMutation } from "@tanstack/react-query";
import { errorMessage, useHouseholdMutation } from "../../lib/mutations";
import { useAccounts, useCategories } from "../../lib/queries";
import type { Category, ImportPreview, ImportResult, ImportRow } from "../../lib/types";
import { useHousehold } from "../household/HouseholdProvider";

// Importação de extratos em três passos: escolher conta e arquivo, conferir a
// prévia (marcar linhas e categorias) e gravar tudo de uma vez.

interface RowChoice {
  selected: boolean;
  category_id: string;
  /** A pessoa escolheu a categoria desta linha (o IOF deixa de seguir a compra) */
  chosen?: boolean;
}

export function ImportPage() {
  const { household } = useHousehold();
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);

  if (!household) return null;

  return (
    <>
      <PageHeader
        title="Importar extrato"
        description="Traga os lançamentos do banco de uma vez, em vez de digitar um por um."
      />

      {result ? (
        <ImportDone
          result={result}
          onAgain={() => {
            setResult(null);
            setPreview(null);
          }}
        />
      ) : preview ? (
        <PreviewStep
          householdId={household.id}
          preview={preview}
          onBack={() => setPreview(null)}
          onDone={setResult}
        />
      ) : (
        <FileStep householdId={household.id} onPreview={setPreview} />
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// 1. Conta e arquivo
// ---------------------------------------------------------------------------
function FileStep({ householdId, onPreview }: { householdId: string; onPreview: (preview: ImportPreview) => void }) {
  const accounts = useAccounts(householdId);
  const active = (accounts.data ?? []).filter((a) => a.is_active);
  const [accountId, setAccountId] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [localError, setLocalError] = useState<string>();

  // Ler o arquivo não muda nada no banco: é uma mutação só porque envia o arquivo
  const read = useMutation({
    mutationFn: (input: { accountId: string; file: File }) =>
      api.upload<ImportPreview>(`/households/${householdId}/imports/preview`, input.file, { account_id: input.accountId }),
  });

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!accountId) return setLocalError("Escolha a conta do extrato.");
    if (!file) return setLocalError("Escolha o arquivo do extrato.");
    setLocalError(undefined);
    read.mutate({ accountId, file }, { onSuccess: onPreview });
  }

  const error = localError ?? errorMessage(read.error, {
    PAYLOAD_TOO_LARGE: "O arquivo é grande demais. Exporte um período menor do extrato.",
  });

  return (
    <Card className="p-5 sm:p-6">
      <form onSubmit={handleSubmit} className="max-w-lg space-y-4">
        <SelectField
          id="import-account"
          label="Conta"
          value={accountId}
          onChange={(e) => setAccountId(e.target.value)}
          hint="Onde os lançamentos vão entrar. Para a fatura do cartão, escolha a conta do cartão."
        >
          <option value="">Escolha a conta</option>
          {active.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </SelectField>

        <div>
          <label htmlFor="import-file" className="mb-1.5 block text-sm font-bold">Arquivo do extrato</label>
          <input
            id="import-file"
            type="file"
            accept=".csv,.pdf,.ofx,text/csv,application/pdf,application/x-ofx"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            aria-describedby="import-file-hint"
            className="block w-full rounded-2xl border border-dashed border-line bg-surface-2/50 px-4 py-4 text-sm file:mr-3 file:rounded-xl file:border-0 file:bg-primary-soft file:px-3 file:py-2 file:font-bold file:text-primary"
          />
          <span id="import-file-hint" className="mt-1.5 block text-sm text-muted">
            Extrato do Banco do Brasil ou do Santander e fatura do cartão Nubank, em CSV ou PDF, e OFX de qualquer
            banco. O arquivo é lido e descartado: não fica guardado.
          </span>
        </div>

        {error && <FormError>{error}</FormError>}

        <Button type="submit" disabled={read.isPending}>
          <FileUp className="size-4" aria-hidden="true" />
          {read.isPending ? "Lendo…" : "Ler arquivo"}
        </Button>
      </form>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// 2. Prévia
// ---------------------------------------------------------------------------
function PreviewStep({
  householdId,
  preview,
  onBack,
  onDone,
}: {
  householdId: string;
  preview: ImportPreview;
  onBack: () => void;
  onDone: (result: ImportResult) => void;
}) {
  const categories = useCategories(householdId);
  const [choices, setChoices] = useState<Record<string, RowChoice>>(() =>
    Object.fromEntries(
      preview.rows.map((row) => [row.import_hash, { selected: row.selected, category_id: row.category_id ?? "" }])
    )
  );
  const [showErrors, setShowErrors] = useState(false);

  const options = useMemo(() => {
    const active = (categories.data ?? []).filter((c) => c.is_active);
    return {
      income: active.filter((c) => c.type === "income"),
      expense: active.filter((c) => c.type === "expense"),
    };
  }, [categories.data]);

  const save = useHouseholdMutation(householdId, (rows: ImportRow[]) =>
    api.post<ImportResult>(`/households/${householdId}/imports`, {
      account_id: preview.account.id,
      rows: rows.map((row) => ({
        import_hash: row.import_hash,
        date: row.date,
        description: row.description,
        amount: row.amount,
        type: row.type,
        category_id: choices[row.import_hash].category_id,
      })),
    })
  );

  const chosen = preview.rows.filter((row) => choices[row.import_hash].selected);
  const missing = chosen.filter((row) => !choices[row.import_hash].category_id);
  const total = chosen.reduce((sum, row) => sum + (row.type === "income" ? row.amount : -row.amount), 0);

  function update(hash: string, change: Partial<RowChoice>) {
    setChoices((current) => {
      const next = { ...current, [hash]: { ...current[hash], ...change } };
      // O IOF de uma compra acompanha a categoria dela, enquanto a pessoa não
      // escolher uma categoria para o próprio IOF
      if (change.category_id !== undefined) {
        for (const row of preview.rows) {
          const iof = next[row.import_hash];
          if (row.follows === hash && !iof.chosen) next[row.import_hash] = { ...iof, category_id: change.category_id };
        }
      }
      return next;
    });
  }

  // Uma categoria para todas as linhas marcadas, daquele tipo, que estão sem
  function fillMissing(type: ImportRow["type"], categoryId: string) {
    if (!categoryId) return;
    setChoices((current) => {
      const next = { ...current };
      for (const row of preview.rows) {
        const choice = next[row.import_hash];
        if (row.type === type && choice.selected && !choice.category_id) next[row.import_hash] = { ...choice, category_id: categoryId };
      }
      return next;
    });
  }

  function handleImport() {
    if (missing.length > 0) {
      setShowErrors(true);
      return;
    }
    save.mutate(chosen, { onSuccess: onDone });
  }

  const missingTypes = new Set(missing.map((row) => row.type));
  const { summary } = preview;

  return (
    <div className="space-y-4">
      <Card className="p-5">
        <p className="text-sm font-semibold text-muted">
          {preview.source.label} · {preview.account.name}
        </p>
        <p className="mt-1 font-display text-xl font-semibold">
          {summary.total} {summary.total === 1 ? "lançamento" : "lançamentos"} no arquivo
        </p>
        <p className="mt-1 text-sm text-muted">
          {[
            summary.imported > 0 && `${summary.imported} já importados antes`,
            summary.similar > 0 && `${summary.similar} parecidos com lançamentos que já estão na conta`,
          ]
            .filter(Boolean)
            .join(" · ") || "Nenhum deles está na conta ainda."}
        </p>

        {preview.kind_mismatch && (
          <p role="alert" className="mt-3 flex gap-2 rounded-2xl bg-pending-soft px-4 py-3 text-sm text-pending">
            <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            {preview.source.kind === "credit_card"
              ? "Este arquivo é a fatura de um cartão, mas a conta escolhida não é um cartão de crédito."
              : "Este arquivo é o extrato de uma conta, mas a conta escolhida é um cartão de crédito."}
          </p>
        )}
      </Card>

      {missingTypes.size > 0 && (
        <Card className="grid gap-3 p-5 sm:grid-cols-2">
          <p className="text-sm text-muted sm:col-span-2">
            {missing.length} {missing.length === 1 ? "linha marcada está" : "linhas marcadas estão"} sem categoria. Escolha
            uma para todas de uma vez, ou uma por uma na lista.
          </p>
          {(["expense", "income"] as const)
            .filter((type) => missingTypes.has(type))
            .map((type) => (
              <SelectField
                key={type}
                id={`fill-${type}`}
                label={type === "expense" ? "Despesas sem categoria" : "Receitas sem categoria"}
                value=""
                onChange={(e) => fillMissing(type, e.target.value)}
              >
                <option value="">Escolha a categoria</option>
                {options[type].map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </SelectField>
            ))}
        </Card>
      )}

      <Card className="overflow-hidden">
        <ul aria-label="Lançamentos do arquivo" className="divide-y divide-line">
          {preview.rows.map((row) => (
            <PreviewRow
              key={row.import_hash}
              row={row}
              choice={choices[row.import_hash]}
              categories={options[row.type]}
              showError={showErrors}
              onChange={(change) => update(row.import_hash, change)}
            />
          ))}
        </ul>
      </Card>

      <div className="sticky bottom-20 z-10 lg:bottom-4">
        <Card className="flex flex-wrap items-center gap-3 p-4 shadow-card">
          <div className="w-full min-w-0 text-sm sm:w-auto sm:flex-1">
            <p className="font-bold">
              {chosen.length} {chosen.length === 1 ? "lançamento marcado" : "lançamentos marcados"}
            </p>
            <p className="text-muted">
              Efeito no saldo: <Money value={Math.abs(total)} tone={total >= 0 ? "income" : "expense"} />
            </p>
          </div>
          <div className="ml-auto flex gap-2">
            <Button variant="ghost" onClick={onBack} disabled={save.isPending}>
              Outro arquivo
            </Button>
            <Button onClick={handleImport} disabled={chosen.length === 0 || save.isPending}>
              {save.isPending ? "Importando…" : `Importar ${chosen.length}`}
            </Button>
          </div>
          {(showErrors && missing.length > 0) || save.error ? (
            <div className="w-full">
              <FormError>
                {showErrors && missing.length > 0
                  ? `Escolha a categoria de ${missing.length} ${missing.length === 1 ? "linha marcada" : "linhas marcadas"}.`
                  : errorMessage(save.error)}
              </FormError>
            </div>
          ) : null}
        </Card>
      </div>
    </div>
  );
}

function PreviewRow({
  row,
  choice,
  categories,
  showError,
  onChange,
}: {
  row: ImportRow;
  choice: RowChoice;
  categories: Category[];
  showError: boolean;
  onChange: (change: Partial<RowChoice>) => void;
}) {
  const imported = row.status === "imported";
  const id = `row-${row.import_hash.slice(0, 12)}`;
  const invalid = showError && choice.selected && !choice.category_id;

  return (
    <li className={`grid gap-3 px-4 py-4 sm:grid-cols-[1fr_14rem] sm:items-center ${choice.selected ? "" : "opacity-70"}`}>
      <div className="flex min-w-0 gap-3">
        <input
          id={id}
          type="checkbox"
          checked={choice.selected}
          disabled={imported}
          onChange={(e) => onChange({ selected: e.target.checked })}
          className="mt-1 size-5 shrink-0 accent-[var(--primary)]"
        />
        <label htmlFor={id} className="min-w-0 flex-1">
          <span className="flex items-baseline justify-between gap-3">
            <span className="truncate font-semibold">{row.description}</span>
            <Money value={row.amount} tone={row.type} className="shrink-0 font-semibold" />
          </span>
          <span className="block text-sm text-muted">{formatShortDate(row.date)}</span>
          {row.note && <span className="mt-1 block text-sm text-pending">{row.note}</span>}
        </label>
      </div>
      {!imported && (
        <SelectField
          id={`${id}-category`}
          label={`Categoria de ${row.description}`}
          hideLabel
          value={choice.category_id}
          onChange={(e) => onChange({ category_id: e.target.value, selected: true, chosen: true })}
          error={invalid ? "Escolha a categoria" : undefined}
        >
          <option value="">Categoria</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </SelectField>
      )}
    </li>
  );
}

// ---------------------------------------------------------------------------
// 3. Pronto
// ---------------------------------------------------------------------------
function ImportDone({ result, onAgain }: { result: ImportResult; onAgain: () => void }) {
  return (
    <Card className="p-6">
      <CircleCheck className="size-8 text-income" aria-hidden="true" />
      <p role="status" className="mt-3 font-display text-2xl font-semibold">
        {result.imported} {result.imported === 1 ? "lançamento importado" : "lançamentos importados"}
      </p>
      {result.skipped > 0 && (
        <p className="mt-1 text-muted">
          {result.skipped} {result.skipped === 1 ? "já estava" : "já estavam"} na conta e {result.skipped === 1 ? "ficou" : "ficaram"} de fora.
        </p>
      )}
      <div className="mt-5 flex flex-wrap gap-3">
        <Link to="/lancamentos" className="inline-flex h-12 items-center rounded-2xl bg-primary px-5 font-bold text-primary-ink">
          Ver lançamentos
        </Link>
        <Button variant="ghost" onClick={onAgain}>
          Importar outro arquivo
        </Button>
      </div>
    </Card>
  );
}
