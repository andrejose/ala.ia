import { createContext, useCallback, useContext, useMemo, useState, type FormEvent, type ReactNode } from "react";
import { Link } from "react-router";
import { FormError, MoneyField, Segmented, SelectField, Toggle } from "../../components/fields";
import { Sheet } from "../../components/Sheet";
import { Button, TextField } from "../../components/ui";
import { api } from "../../lib/api";
import { moneyToInput, parseMoney, today } from "../../lib/money";
import { errorMessage, fieldErrors, useHouseholdMutation } from "../../lib/mutations";
import { useAccounts, useCategories } from "../../lib/queries";
import type { Category, Transaction, TransactionType } from "../../lib/types";
import { CategorySheet } from "../categories/CategorySheet";
import { useHousehold } from "../household/HouseholdProvider";

// =============================================================================
// Abre o formulário de lançamento de qualquer lugar (botão "+", listas...)
// =============================================================================

// Valores já preenchidos num lançamento novo (ex.: "Pagar fatura" do cartão)
export interface TransactionPrefill {
  description?: string;
  amount?: number;
  account_id?: string;
  destination_account_id?: string;
  /** Abre já com "Repetir todo mês" ligado */
  repeat?: boolean;
}

interface TransactionSheetContextValue {
  openNew: (type?: TransactionType, prefill?: TransactionPrefill) => void;
  openEdit: (transaction: Transaction) => void;
}

const TransactionSheetContext = createContext<TransactionSheetContextValue | null>(null);

export function TransactionSheetProvider({ children }: { children: ReactNode }) {
  const { household } = useHousehold();
  const [state, setState] = useState<{
    transaction?: Transaction;
    prefill?: TransactionPrefill;
    type: TransactionType;
    nonce: number;
  } | null>(null);

  const openNew = useCallback(
    (type: TransactionType = "expense", prefill?: TransactionPrefill) => setState({ type, prefill, nonce: Date.now() }),
    []
  );
  const openEdit = useCallback(
    (transaction: Transaction) => setState({ transaction, type: transaction.type, nonce: Date.now() }),
    []
  );
  const value = useMemo(() => ({ openNew, openEdit }), [openNew, openEdit]);
  const close = () => setState(null);

  return (
    <TransactionSheetContext.Provider value={value}>
      {children}
      {household && (
        <Sheet open={state !== null} onClose={close} title={state?.transaction ? "Editar lançamento" : "Novo lançamento"}>
          {state && (
            <TransactionForm
              key={state.nonce}
              householdId={household.id}
              transaction={state.transaction}
              prefill={state.prefill}
              initialType={state.type}
              onDone={close}
            />
          )}
        </Sheet>
      )}
    </TransactionSheetContext.Provider>
  );
}

export function useTransactionSheet() {
  const context = useContext(TransactionSheetContext);
  if (!context) throw new Error("useTransactionSheet precisa estar dentro de <TransactionSheetProvider>");
  return context;
}

// =============================================================================
// Formulário
// =============================================================================

const typeOptions: Array<{ value: TransactionType; label: string; activeClass: string }> = [
  { value: "expense", label: "Despesa", activeClass: "bg-expense-soft text-expense shadow-card" },
  { value: "income", label: "Receita", activeClass: "bg-income-soft text-income shadow-card" },
  { value: "transfer", label: "Transferência", activeClass: "bg-surface text-ink shadow-card" },
];

const paidLabel: Record<TransactionType, { label: string; description: string }> = {
  expense: { label: "Já paguei", description: "Desligado, fica como conta a pagar." },
  income: { label: "Já recebi", description: "Desligado, fica como valor a receber." },
  transfer: { label: "Já transferi", description: "Desligado, fica agendada." },
};

interface RecurrenceInput {
  type: TransactionType;
  description: string;
  amount: number;
  account_id: string;
  destination_account_id: string | null;
  category_id: string | null;
  day_of_month: number;
  start_month: string;
  occurrences: number | null;
  auto_paid: boolean;
}

interface TransactionInput {
  type: TransactionType;
  description: string;
  amount: number;
  account_id: string;
  destination_account_id: string | null;
  category_id: string | null;
  due_date: string;
  payment_date: string | null;
}

function TransactionForm({
  householdId,
  transaction,
  prefill,
  initialType,
  onDone,
}: {
  householdId: string;
  transaction?: Transaction;
  prefill?: TransactionPrefill;
  initialType: TransactionType;
  onDone: () => void;
}) {
  const accounts = useAccounts(householdId);
  const categories = useCategories(householdId);
  const activeAccounts = (accounts.data ?? []).filter((a) => a.is_active || a.id === transaction?.account_id || a.id === transaction?.destination_account_id);

  const [type, setType] = useState<TransactionType>(initialType);
  const initialAmount = transaction?.amount ?? prefill?.amount;
  const [amount, setAmount] = useState(initialAmount ? moneyToInput(initialAmount) : "");
  const [description, setDescription] = useState(transaction?.description ?? prefill?.description ?? "");
  const [accountId, setAccountId] = useState(transaction?.account_id ?? prefill?.account_id ?? "");
  const [destinationId, setDestinationId] = useState(
    transaction?.destination_account_id ?? prefill?.destination_account_id ?? ""
  );
  const [categoryId, setCategoryId] = useState(transaction?.category_id ?? "");
  const [dueDate, setDueDate] = useState(transaction?.due_date ?? today());
  const [paid, setPaid] = useState(transaction ? transaction.payment_date !== null : true);
  const [paymentDate, setPaymentDate] = useState(transaction?.payment_date ?? today());
  const [repeat, setRepeat] = useState(prefill?.repeat ?? false);
  const [times, setTimes] = useState("");
  const [localErrors, setLocalErrors] = useState<Record<string, string>>({});
  const [creatingCategory, setCreatingCategory] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const base = `/households/${householdId}/transactions`;
  const save = useHouseholdMutation(householdId, (input: TransactionInput) =>
    transaction ? api.patch<Transaction>(`${base}/${transaction.id}`, input) : api.post<Transaction>(base, input)
  );
  const remove = useHouseholdMutation(householdId, () => api.delete(`${base}/${transaction!.id}`));
  // Repetir todo mês: cria a regra, e a API já gera os lançamentos dos meses
  const saveRecurrence = useHouseholdMutation(householdId, (input: RecurrenceInput) =>
    api.post(`/households/${householdId}/recurrences`, input)
  );
  const repeating = repeat && !transaction;

  const isTransfer = type === "transfer";
  const categoryType = type === "income" ? "income" : "expense";
  // Categorias arquivadas saem da lista, menos a que o lançamento já usa
  const categoryOptions = (categories.data ?? []).filter(
    (c) => c.type === categoryType && (c.is_active || c.id === transaction?.category_id)
  );
  const saveError = repeating ? saveRecurrence.error : save.error;
  const errors = { ...fieldErrors(saveError), ...localErrors };
  const error = errorMessage(saveError, {
    INVALID_REFERENCE: "A conta ou a categoria escolhida não vale para este lançamento. Escolha outra.",
  }) ?? errorMessage(remove.error);

  // Sem contas não há onde lançar: leva a pessoa a cadastrar uma
  if (accounts.data && activeAccounts.length === 0) {
    return (
      <div className="space-y-4">
        <p className="text-muted">
          Para lançar, primeiro cadastre uma conta: é dela que o dinheiro sai ou para ela que ele entra.
        </p>
        <Link
          to="/contas"
          onClick={onDone}
          className="inline-flex h-12 w-full items-center justify-center rounded-2xl bg-primary font-bold text-primary-ink"
        >
          Cadastrar conta
        </Link>
      </div>
    );
  }

  function changeType(next: TransactionType) {
    setType(next);
    // Categoria de receita não serve para despesa (e vice-versa)
    if (next !== type) setCategoryId("");
    setLocalErrors({});
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const value = parseMoney(amount);
    const problems: Record<string, string> = {};
    if (value === null || value <= 0) problems.amount = "Informe um valor maior que zero. Ex.: 89,90";
    if (!accountId) problems.account_id = "Escolha a conta.";
    if (isTransfer && !destinationId) problems.destination_account_id = "Escolha para qual conta vai.";
    if (isTransfer && destinationId && destinationId === accountId)
      problems.destination_account_id = "Escolha uma conta diferente da de origem.";
    if (!isTransfer && !categoryId) problems.category_id = "Escolha a categoria.";
    const occurrences = times.trim() === "" ? null : Number(times);
    if (repeating && occurrences !== null && !(Number.isInteger(occurrences) && occurrences >= 1 && occurrences <= 600))
      problems.occurrences = "Use um número de 1 a 600, ou deixe vazio para repetir sem fim.";
    setLocalErrors(problems);
    if (Object.keys(problems).length > 0) return;

    if (repeating) {
      saveRecurrence.mutate(
        {
          type,
          description,
          amount: value!,
          account_id: accountId,
          destination_account_id: isTransfer ? destinationId : null,
          category_id: isTransfer ? null : categoryId,
          day_of_month: Number(dueDate.slice(8, 10)),
          start_month: dueDate.slice(0, 7),
          occurrences,
          auto_paid: paid,
        },
        { onSuccess: onDone }
      );
      return;
    }

    save.mutate(
      {
        type,
        description,
        amount: value!,
        account_id: accountId,
        destination_account_id: isTransfer ? destinationId : null,
        category_id: isTransfer ? null : categoryId,
        due_date: dueDate,
        payment_date: paid ? paymentDate : null,
      },
      { onSuccess: onDone }
    );
  }

  const busy = save.isPending || remove.isPending || saveRecurrence.isPending;

  return (
    <>
      <form onSubmit={handleSubmit} className="space-y-4">
        <Segmented label="Tipo do lançamento" value={type} onChange={changeType} options={typeOptions} />

        <MoneyField id="tx-amount" label="Valor" value={amount} onChange={setAmount} error={errors.amount} large autoFocus={!transaction} />

        <TextField
          id="tx-description"
          label="Descrição"
          placeholder={isTransfer ? "Ex.: Guardar para a viagem" : type === "income" ? "Ex.: Salário de novembro" : "Ex.: Feira da semana"}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          error={errors.description}
          maxLength={200}
          required
        />

        <div className={isTransfer ? "grid grid-cols-2 gap-3" : ""}>
          <SelectField
            id="tx-account"
            label={isTransfer ? "De" : type === "income" ? "Entrou em" : "Saiu de"}
            value={accountId}
            onChange={(e) => setAccountId(e.target.value)}
            error={errors.account_id}
          >
            <option value="">Escolha a conta</option>
            {activeAccounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </SelectField>

          {isTransfer && (
            <SelectField
              id="tx-destination"
              label="Para"
              value={destinationId}
              onChange={(e) => setDestinationId(e.target.value)}
              error={errors.destination_account_id}
            >
              <option value="">Escolha a conta</option>
              {activeAccounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </SelectField>
          )}
        </div>

        {!isTransfer && (
          <SelectField
            id="tx-category"
            label="Categoria"
            value={categoryId}
            onChange={(e) => (e.target.value === "__new" ? setCreatingCategory(true) : setCategoryId(e.target.value))}
            error={errors.category_id}
            hint={categoryOptions.length === 0 ? "Você ainda não tem categorias deste tipo. Crie uma na lista." : undefined}
          >
            <option value="">Escolha a categoria</option>
            {categoryOptions.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
            <option value="__new">+ Nova categoria…</option>
          </SelectField>
        )}

        <TextField
          id="tx-due"
          type="date"
          label={repeating ? "Primeira data" : paid ? "Data" : "Vencimento"}
          hint={repeating ? "Os próximos meses usam o mesmo dia. Dia 31 cai no último dia dos meses mais curtos." : undefined}
          value={dueDate}
          onChange={(e) => setDueDate(e.target.value)}
          error={errors.due_date}
          required
        />

        {!transaction && (
          <div className="rounded-2xl bg-surface-2 p-4">
            <Toggle
              id="tx-repeat"
              label="Repetir todo mês"
              description={repeat ? undefined : "Para aluguel, salário, assinaturas e parcelas."}
              checked={repeat}
              onChange={(on) => {
                setRepeat(on);
                // Repetindo, o padrão é cada mês entrar a pagar (ou a receber)
                if (on) setPaid(false);
              }}
            />
            {repeat && (
              <div className="mt-3">
                <TextField
                  id="tx-times"
                  label="Quantas vezes"
                  inputMode="numeric"
                  placeholder="Sem fim"
                  value={times}
                  onChange={(e) => setTimes(e.target.value.replace(/D/g, ""))}
                  error={errors.occurrences}
                  hint="Deixe vazio para repetir sem data para acabar. Com um número, a descrição ganha a parcela: (1/10), (2/10)…"
                />
              </div>
            )}
          </div>
        )}

        <div className="rounded-2xl bg-surface-2 p-4">
          {repeating ? (
            <Toggle
              id="tx-paid"
              label="Débito automático"
              description={
                paid
                  ? "Cada mês entra como pago no dia."
                  : type === "income"
                    ? "Desligado, cada mês entra como valor a receber."
                    : "Desligado, cada mês entra como conta a pagar."
              }
              checked={paid}
              onChange={setPaid}
            />
          ) : (
            <Toggle id="tx-paid" label={paidLabel[type].label} description={paid ? undefined : paidLabel[type].description} checked={paid} onChange={setPaid} />
          )}
          {paid && !repeating && (
            <div className="mt-3">
              <TextField
                id="tx-payment"
                type="date"
                label="Quando"
                value={paymentDate}
                onChange={(e) => setPaymentDate(e.target.value)}
                error={errors.payment_date}
                required
              />
            </div>
          )}
        </div>

        {error && <FormError>{error}</FormError>}

        <Button type="submit" className="w-full" disabled={busy}>
          {busy && !remove.isPending ? "Salvando…" : transaction ? "Salvar alterações" : repeating ? "Lançar e repetir" : "Lançar"}
        </Button>

        {transaction && (
          <div className="flex justify-end border-t border-line pt-4">
            <Button
              type="button"
              variant="ghost"
              disabled={busy}
              className={confirmDelete ? "text-expense hover:text-expense" : ""}
              onClick={() => (confirmDelete ? remove.mutate(undefined, { onSuccess: onDone }) : setConfirmDelete(true))}
            >
              {confirmDelete ? "Confirmar exclusão" : "Excluir lançamento"}
            </Button>
          </div>
        )}
      </form>

      <CategorySheet
        householdId={householdId}
        defaultType={categoryType}
        open={creatingCategory}
        onClose={() => setCreatingCategory(false)}
        onCreated={(category: Category) => setCategoryId(category.id)}
      />
    </>
  );
}
