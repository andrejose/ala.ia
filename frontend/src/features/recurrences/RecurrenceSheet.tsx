import { useState, type FormEvent } from "react";
import { FormError, MoneyField, SelectField, Toggle } from "../../components/fields";
import { Sheet } from "../../components/Sheet";
import { Button, TextField } from "../../components/ui";
import { api } from "../../lib/api";
import { moneyToInput, parseMoney } from "../../lib/money";
import { errorMessage, fieldErrors, useHouseholdMutation } from "../../lib/mutations";
import { useAccounts, useCategories } from "../../lib/queries";
import type { Recurrence } from "../../lib/types";

// Editar, pausar ou excluir uma recorrência. Criar é pelo formulário de
// lançamento, com "Repetir todo mês".
export function RecurrenceSheet({
  householdId,
  recurrence,
  onClose,
}: {
  householdId: string;
  recurrence: Recurrence | null;
  onClose: () => void;
}) {
  return (
    <Sheet open={recurrence !== null} onClose={onClose} title="Editar recorrente">
      {recurrence && <RecurrenceForm key={recurrence.id} householdId={householdId} recurrence={recurrence} onDone={onClose} />}
    </Sheet>
  );
}

function RecurrenceForm({ householdId, recurrence, onDone }: { householdId: string; recurrence: Recurrence; onDone: () => void }) {
  const accounts = useAccounts(householdId);
  const categories = useCategories(householdId);
  const isTransfer = recurrence.type === "transfer";

  const [description, setDescription] = useState(recurrence.description);
  const [amount, setAmount] = useState(moneyToInput(recurrence.amount));
  const [day, setDay] = useState(String(recurrence.day_of_month));
  const [accountId, setAccountId] = useState(recurrence.account_id);
  const [destinationId, setDestinationId] = useState(recurrence.destination_account_id ?? "");
  const [categoryId, setCategoryId] = useState(recurrence.category_id ?? "");
  const [times, setTimes] = useState(recurrence.occurrences === null ? "" : String(recurrence.occurrences));
  const [autoPaid, setAutoPaid] = useState(recurrence.auto_paid);
  const [localErrors, setLocalErrors] = useState<Record<string, string>>({});
  const [confirmDelete, setConfirmDelete] = useState(false);

  const base = `/households/${householdId}/recurrences/${recurrence.id}`;
  const save = useHouseholdMutation(householdId, (changes: Partial<Recurrence>) => api.patch<Recurrence>(base, changes));
  const remove = useHouseholdMutation(householdId, () => api.delete(base));

  const activeAccounts = (accounts.data ?? []).filter(
    (a) => a.is_active || a.id === recurrence.account_id || a.id === recurrence.destination_account_id
  );
  const categoryOptions = (categories.data ?? []).filter(
    (c) => c.type === recurrence.type && (c.is_active || c.id === recurrence.category_id)
  );
  const errors = { ...fieldErrors(save.error), ...localErrors };
  const error = errorMessage(save.error) ?? errorMessage(remove.error);
  const busy = save.isPending || remove.isPending;

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const value = parseMoney(amount);
    const dayNumber = Number(day);
    const occurrences = times.trim() === "" ? null : Number(times);
    const problems: Record<string, string> = {};
    if (value === null || value <= 0) problems.amount = "Informe um valor maior que zero. Ex.: 89,90";
    if (!Number.isInteger(dayNumber) || dayNumber < 1 || dayNumber > 31) problems.day_of_month = "Use um dia de 1 a 31.";
    if (occurrences !== null && !(Number.isInteger(occurrences) && occurrences >= 1 && occurrences <= 600))
      problems.occurrences = "Use um número de 1 a 600, ou deixe vazio para repetir sem fim.";
    if (isTransfer && destinationId === accountId) problems.destination_account_id = "Escolha uma conta diferente da de origem.";
    setLocalErrors(problems);
    if (Object.keys(problems).length > 0) return;

    // Só o que mudou: mudar valor, dia ou conta refaz os pendentes futuros
    const next: Partial<Recurrence> = {
      description: description.trim(),
      amount: value!,
      day_of_month: dayNumber,
      account_id: accountId,
      occurrences,
      auto_paid: autoPaid,
      ...(isTransfer ? { destination_account_id: destinationId } : { category_id: categoryId }),
    };
    const changes = Object.fromEntries(
      Object.entries(next).filter(([key, v]) => recurrence[key as keyof Recurrence] !== v)
    ) as Partial<Recurrence>;
    if (Object.keys(changes).length === 0) return onDone();
    save.mutate(changes, { onSuccess: onDone });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <MoneyField id="rec-amount" label="Valor" value={amount} onChange={setAmount} error={errors.amount} large />

      <TextField
        id="rec-description"
        label="Descrição"
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        error={errors.description}
        maxLength={190}
        required
      />

      <div className={isTransfer ? "grid grid-cols-2 gap-3" : ""}>
        <SelectField
          id="rec-account"
          label={isTransfer ? "De" : recurrence.type === "income" ? "Entra em" : "Sai de"}
          value={accountId}
          onChange={(e) => setAccountId(e.target.value)}
          error={errors.account_id}
        >
          {activeAccounts.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </SelectField>
        {isTransfer && (
          <SelectField
            id="rec-destination"
            label="Para"
            value={destinationId}
            onChange={(e) => setDestinationId(e.target.value)}
            error={errors.destination_account_id}
          >
            {activeAccounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </SelectField>
        )}
      </div>

      {!isTransfer && (
        <SelectField id="rec-category" label="Categoria" value={categoryId} onChange={(e) => setCategoryId(e.target.value)} error={errors.category_id}>
          {categoryOptions.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </SelectField>
      )}

      <div className="grid grid-cols-2 gap-3">
        <TextField
          id="rec-day"
          label="Dia do mês"
          inputMode="numeric"
          value={day}
          onChange={(e) => setDay(e.target.value.replace(/\D/g, ""))}
          error={errors.day_of_month}
          required
        />
        <TextField
          id="rec-times"
          label="Quantas vezes"
          inputMode="numeric"
          placeholder="Sem fim"
          value={times}
          onChange={(e) => setTimes(e.target.value.replace(/\D/g, ""))}
          error={errors.occurrences}
        />
      </div>

      <div className="rounded-2xl bg-surface-2 p-4">
        <Toggle
          id="rec-auto"
          label="Débito automático"
          description={autoPaid ? "Cada mês entra como pago no dia." : "Desligado, cada mês entra pendente."}
          checked={autoPaid}
          onChange={setAutoPaid}
        />
      </div>

      <p className="text-sm text-muted">
        Ao salvar, os lançamentos futuros que ainda não foram pagos são refeitos com os dados novos. Os já pagos e os
        atrasados ficam como estão.
      </p>

      {error && <FormError>{error}</FormError>}

      <Button type="submit" className="w-full" disabled={busy}>
        {save.isPending ? "Salvando…" : "Salvar alterações"}
      </Button>

      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line pt-4">
        <Button
          type="button"
          variant="ghost"
          disabled={busy}
          onClick={() => save.mutate({ is_active: !recurrence.is_active }, { onSuccess: onDone })}
        >
          {recurrence.is_active ? "Pausar" : "Reativar"}
        </Button>
        <Button
          type="button"
          variant="ghost"
          disabled={busy}
          className={confirmDelete ? "text-expense hover:text-expense" : ""}
          onClick={() => (confirmDelete ? remove.mutate(undefined, { onSuccess: onDone }) : setConfirmDelete(true))}
        >
          {confirmDelete ? "Confirmar exclusão" : "Excluir"}
        </Button>
      </div>
      {confirmDelete && (
        <p className="text-sm text-muted">
          Os lançamentos futuros ainda não pagos saem junto. Os que já aconteceram continuam em Lançamentos.
        </p>
      )}
    </form>
  );
}
