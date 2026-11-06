import { useState, type FormEvent } from "react";
import { FormError, SelectField } from "../../components/fields";
import { Sheet } from "../../components/Sheet";
import { Button, TextField } from "../../components/ui";
import { api } from "../../lib/api";
import { errorMessage, fieldErrors, useAccountMutation, useHouseholdMutation } from "../../lib/mutations";
import type { Household, Invitation, Role } from "../../lib/types";

// -----------------------------------------------------------------------------
// Criar ou renomear um household
// -----------------------------------------------------------------------------
export function HouseholdNameSheet({
  household,
  open,
  onClose,
  onCreated,
}: {
  household?: Household;
  open: boolean;
  onClose: () => void;
  onCreated?: (household: Household) => void;
}) {
  return (
    <Sheet open={open} onClose={onClose} title={household ? "Renomear espaço" : "Novo espaço"}>
      {open && <NameForm key={household?.id ?? "new"} household={household} onDone={onClose} onCreated={onCreated} />}
    </Sheet>
  );
}

function NameForm({
  household,
  onDone,
  onCreated,
}: {
  household?: Household;
  onDone: () => void;
  onCreated?: (household: Household) => void;
}) {
  const [name, setName] = useState(household?.name ?? "");
  const save = useAccountMutation((value: string) =>
    household
      ? api.patch<Household>(`/households/${household.id}`, { name: value })
      : api.post<Household>("/households", { name: value })
  );

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    save.mutate(name, {
      onSuccess: (saved) => {
        if (!household) onCreated?.(saved);
        onDone();
      },
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {!household && (
        <p className="text-muted">
          Um espaço separa um conjunto de finanças: as contas da casa com o seu par, por exemplo, longe das
          suas contas pessoais. Você será o dono e poderá convidar outras pessoas.
        </p>
      )}
      <TextField
        id="household-name"
        label="Nome"
        placeholder="Ex.: Casa, Maria e João"
        value={name}
        onChange={(e) => setName(e.target.value)}
        error={fieldErrors(save.error).name}
        maxLength={100}
        required
        autoFocus
      />
      {save.error && !fieldErrors(save.error).name && <FormError>{errorMessage(save.error)}</FormError>}
      <Button type="submit" className="w-full" disabled={save.isPending}>
        {save.isPending ? "Salvando…" : household ? "Salvar nome" : "Criar espaço"}
      </Button>
    </form>
  );
}

// -----------------------------------------------------------------------------
// Convidar por e-mail
// -----------------------------------------------------------------------------
export function InviteSheet({ householdId, open, onClose }: { householdId: string; open: boolean; onClose: () => void }) {
  return (
    <Sheet open={open} onClose={onClose} title="Convidar pessoa">
      {open && <InviteForm householdId={householdId} onDone={onClose} />}
    </Sheet>
  );
}

function InviteForm({ householdId, onDone }: { householdId: string; onDone: () => void }) {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Role>("member");
  const invite = useHouseholdMutation(householdId, (input: { email: string; role: Role }) =>
    api.post<Invitation>(`/households/${householdId}/invitations`, input)
  );

  const errors = fieldErrors(invite.error);
  const error = errors.email ? null : errorMessage(invite.error);

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    invite.mutate({ email, role }, { onSuccess: onDone });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <p className="text-muted">
        A pessoa recebe o convite ao entrar no Ala.ia com este e-mail, mesmo que ainda não tenha conta. Ela só
        passa a ver as finanças depois de aceitar. O convite vale por 7 dias.
      </p>
      <TextField
        id="invite-email"
        type="email"
        label="E-mail"
        placeholder="joao@exemplo.com"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        error={errors.email}
        autoComplete="off"
        required
        autoFocus
      />
      <SelectField
        id="invite-role"
        label="Papel"
        value={role}
        onChange={(e) => setRole(e.target.value as Role)}
        hint={role === "owner" ? "Dono pode convidar, remover pessoas, renomear e excluir o espaço." : "Membro vê e lança as finanças do espaço."}
      >
        <option value="member">Membro</option>
        <option value="owner">Dono</option>
      </SelectField>
      {error && <FormError>{error}</FormError>}
      <Button type="submit" className="w-full" disabled={invite.isPending}>
        {invite.isPending ? "Enviando…" : "Enviar convite"}
      </Button>
    </form>
  );
}
