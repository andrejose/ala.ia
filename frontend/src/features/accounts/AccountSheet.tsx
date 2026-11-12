import { useState, type FormEvent } from "react";
import { FormError, MoneyField, SelectField } from "../../components/fields";
import { Sheet } from "../../components/Sheet";
import { Button, TextField } from "../../components/ui";
import { api } from "../../lib/api";
import { moneyToInput, parseMoney } from "../../lib/money";
import { errorMessage, fieldErrors, useHouseholdMutation } from "../../lib/mutations";
import type { Account, AccountType } from "../../lib/types";
import { accountTypes, isCreditCard } from "./accountTypes";

interface AccountInput {
  name: string;
  type: AccountType;
  initial_balance: number;
  is_active?: boolean;
}

// Criar ou editar uma conta. Na edição, também arquiva, reativa e exclui.
export function AccountSheet({
  householdId,
  account,
  open,
  onClose,
}: {
  householdId: string;
  account?: Account;
  open: boolean;
  onClose: () => void;
}) {
  return (
    <Sheet open={open} onClose={onClose} title={account ? "Editar conta" : "Nova conta"}>
      {/* key: reinicia o formulário a cada abertura */}
      {open && <AccountForm key={account?.id ?? "new"} householdId={householdId} account={account} onDone={onClose} />}
    </Sheet>
  );
}

function AccountForm({ householdId, account, onDone }: { householdId: string; account?: Account; onDone: () => void }) {
  const [name, setName] = useState(account?.name ?? "");
  const [type, setType] = useState<AccountType>(account?.type ?? "checking");
  // No cartão, o campo pede a dívida (positiva) e grava como saldo negativo
  const [balance, setBalance] = useState(
    account ? moneyToInput(isCreditCard(account) ? -account.initial_balance : account.initial_balance) : ""
  );
  const card = type === "credit_card";
  const [balanceError, setBalanceError] = useState<string>();
  const [confirmDelete, setConfirmDelete] = useState(false);

  const base = `/households/${householdId}/accounts`;
  const save = useHouseholdMutation(householdId, (input: AccountInput) =>
    account ? api.patch<Account>(`${base}/${account.id}`, input) : api.post<Account>(base, input)
  );
  const archive = useHouseholdMutation(householdId, (is_active: boolean) =>
    api.patch<Account>(`${base}/${account!.id}`, { is_active })
  );
  const remove = useHouseholdMutation(householdId, () => api.delete(`${base}/${account!.id}`));

  const errors = fieldErrors(save.error);
  const error =
    errorMessage(save.error) ??
    errorMessage(archive.error) ??
    errorMessage(remove.error, {
      RESOURCE_IN_USE: "Esta conta tem lançamentos, então não pode ser excluída. Arquive para tirá-la do painel sem perder o histórico.",
    });

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const initial = balance.trim() === "" ? 0 : parseMoney(balance);
    if (initial === null) {
      setBalanceError("Use só números, com até 2 casas decimais. Ex.: 1.250,00");
      return;
    }
    setBalanceError(undefined);
    save.mutate({ name, type, initial_balance: card && initial !== 0 ? -initial : initial }, { onSuccess: onDone });
  }

  const busy = save.isPending || archive.isPending || remove.isPending;

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <TextField
        id="account-name"
        label="Nome"
        placeholder="Ex.: Nubank, Carteira"
        value={name}
        onChange={(e) => setName(e.target.value)}
        error={errors.name}
        maxLength={100}
        required
        autoFocus={!account}
      />
      <SelectField id="account-type" label="Tipo" value={type} onChange={(e) => setType(e.target.value as AccountType)}>
        {Object.entries(accountTypes).map(([value, { label }]) => (
          <option key={value} value={value}>
            {label}
          </option>
        ))}
      </SelectField>
      <MoneyField
        id="account-balance"
        label={card ? "Fatura em aberto no início" : "Saldo inicial"}
        value={balance}
        onChange={setBalance}
        error={balanceError ?? errors.initial_balance}
        hint={
          card
            ? "Quanto você já devia no cartão quando começou a usar o Ala.ia. Depois, lance cada compra como despesa neste cartão."
            : "Quanto havia na conta quando você começou a usar o Ala.ia. Pode ser negativo."
        }
      />

      {error && <FormError>{error}</FormError>}

      <Button type="submit" className="w-full" disabled={busy}>
        {save.isPending ? "Salvando…" : account ? "Salvar alterações" : "Criar conta"}
      </Button>

      {account && (
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line pt-4">
          <Button
            type="button"
            variant="ghost"
            disabled={busy}
            onClick={() => archive.mutate(!account.is_active, { onSuccess: onDone })}
          >
            {account.is_active ? "Arquivar conta" : "Reativar conta"}
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
      )}
    </form>
  );
}
