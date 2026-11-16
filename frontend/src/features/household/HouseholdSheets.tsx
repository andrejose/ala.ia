import { useState, type FormEvent } from "react";
import { FormError, SelectField } from "../../components/fields";
import { Sheet, useUnsavedChanges } from "../../components/Sheet";
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
  // Fechar sem salvar pede confirmação quando algo mudou
  useUnsavedChanges(name);
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
  const [sent, setSent] = useState<Invitation | null>(null);
  const close = () => {
    setSent(null);
    onClose();
  };
  return (
    <Sheet open={open} onClose={close} title={sent ? "Convite criado" : "Convidar pessoa"}>
      {open && (sent ? <InviteSent invitation={sent} onDone={close} /> : <InviteForm householdId={householdId} onDone={setSent} />)}
    </Sheet>
  );
}

// Depois de convidar: diz se o e-mail foi e, se não foi, dá o link para avisar
function InviteSent({ invitation, onDone }: { invitation: Invitation; onDone: () => void }) {
  const link = `${window.location.origin}/entrar`;
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className="space-y-4">
      {invitation.email_sent ? (
        <p>
          Mandamos um e-mail para <strong className="break-all">{invitation.email}</strong> avisando do convite. A pessoa
          aceita ao entrar no Ala.ia com esse e-mail, ou ao criar a conta com ele.
        </p>
      ) : (
        <>
          <p>
            O convite para <strong className="break-all">{invitation.email}</strong> está criado, mas o e-mail de aviso
            não foi enviado. Avise a pessoa para entrar no Ala.ia com esse e-mail, ou criar a conta com ele: o convite
            aparece logo na entrada.
          </p>
          <div className="flex items-center gap-2 rounded-2xl bg-surface-2 p-3">
            <span className="min-w-0 flex-1 truncate text-sm" title={link}>
              {link}
            </span>
            <Button type="button" variant="soft" className="h-9 px-3 text-sm" onClick={copy}>
              {copied ? "Copiado" : "Copiar link"}
            </Button>
          </div>
        </>
      )}
      <Button type="button" className="w-full" onClick={onDone} autoFocus>
        Pronto
      </Button>
    </div>
  );
}

function InviteForm({ householdId, onDone }: { householdId: string; onDone: (invitation: Invitation) => void }) {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Role>("member");
  // Fechar sem salvar pede confirmação quando algo mudou
  useUnsavedChanges({ email, role });
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
        A pessoa recebe um e-mail de aviso e vê o convite ao entrar no Ala.ia com este e-mail, mesmo que ainda não
        tenha conta. Só passa a ver as finanças depois de aceitar. O convite vale por 7 dias.
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
