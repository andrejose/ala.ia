import { Plus, UserPlus } from "lucide-react";
import { useState } from "react";
import { FormError } from "../../components/fields";
import { PageHeader } from "../../components/PageHeader";
import { Button, Card, SectionTitle } from "../../components/ui";
import { api } from "../../lib/api";
import { formatDate } from "../../lib/format";
import { errorMessage, useAccountMutation, useHouseholdMutation } from "../../lib/mutations";
import { useHouseholdInvitations, useMembers } from "../../lib/queries";
import type { Member, Role } from "../../lib/types";
import { useHousehold } from "./HouseholdProvider";
import { HouseholdNameSheet, InviteSheet } from "./HouseholdSheets";
import { ReceivedInvitations } from "./ReceivedInvitations";

const roleLabel: Record<Role, string> = { owner: "Dono", member: "Membro" };

// Mensagens da tela para os erros de regra mais comuns
const overrides = {
  LAST_OWNER:
    "O household precisa de pelo menos um dono. Promova outra pessoa a dono antes, ou exclua o household.",
};

export function HouseholdPage() {
  const { me, household, households, selectHousehold } = useHousehold();
  const [sheet, setSheet] = useState<"rename" | "new" | "invite" | null>(null);

  if (!me || !household) return null;
  const isOwner = household.role === "owner";

  return (
    <>
      <PageHeader
        title={household.name}
        description={
          isOwner
            ? "Você é dono deste household: pode convidar pessoas, mudar papéis e excluí-lo."
            : "Você é membro deste household: vê e lança as finanças dele."
        }
      />

      <div className="space-y-8">
        <ReceivedInvitations />

        {households.length > 1 && (
          <p className="text-sm text-muted">
            Você participa de {households.length} households. Troque o que está em uso pelo seletor no painel.
          </p>
        )}

        <MembersSection />
        <InvitationsSection onInvite={() => setSheet("invite")} />

        <section aria-labelledby="settings-title">
          <SectionTitle>
            <span id="settings-title">Ajustes</span>
          </SectionTitle>
          <Card className="divide-y divide-line">
            {isOwner && (
              <div className="flex items-center justify-between gap-4 px-4 py-4">
                <div>
                  <p className="font-semibold">Nome</p>
                  <p className="text-sm text-muted">{household.name}</p>
                </div>
                <Button variant="ghost" className="h-10 text-sm" onClick={() => setSheet("rename")}>
                  Renomear
                </Button>
              </div>
            )}
            <div className="flex items-center justify-between gap-4 px-4 py-4">
              <div>
                <p className="font-semibold">Criar outro household</p>
                <p className="text-sm text-muted">Para separar outro conjunto de finanças, como uma viagem ou um negócio.</p>
              </div>
              <Button variant="soft" className="h-10 shrink-0 text-sm" onClick={() => setSheet("new")}>
                <Plus className="size-4" aria-hidden="true" />
                Criar
              </Button>
            </div>
            <LeaveRow />
            {isOwner && <DeleteRow />}
          </Card>
        </section>
      </div>

      <HouseholdNameSheet household={household} open={sheet === "rename"} onClose={() => setSheet(null)} />
      <HouseholdNameSheet open={sheet === "new"} onClose={() => setSheet(null)} onCreated={(h) => selectHousehold(h.id)} />
      <InviteSheet householdId={household.id} open={sheet === "invite"} onClose={() => setSheet(null)} />
    </>
  );
}

// -----------------------------------------------------------------------------
// Quem participa
// -----------------------------------------------------------------------------
function MembersSection() {
  const { me, household } = useHousehold();
  const { data, isLoading } = useMembers(household?.id);
  const isOwner = household?.role === "owner";

  const changeRole = useAccountMutation((input: { member: Member; role: Role }) =>
    api.patch(`/households/${household!.id}/members/${input.member.user_id}`, { role: input.role })
  );
  const remove = useHouseholdMutation(household?.id, (member: Member) =>
    api.delete(`/households/${household!.id}/members/${member.user_id}`)
  );
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null);
  const error = errorMessage(changeRole.error, overrides) ?? errorMessage(remove.error, overrides);

  return (
    <section aria-labelledby="members-title">
      <SectionTitle>
        <span id="members-title">Quem participa</span>
      </SectionTitle>

      {isLoading && <Card className="h-28 animate-pulse" />}

      {data && (
        <Card className="divide-y divide-line">
          {data.map((member) => {
            const isMe = member.user_id === me?.id;
            const name = member.name ?? "Sem nome";
            return (
              <div key={member.user_id} className="flex flex-wrap items-center gap-3 px-4 py-3.5">
                <span
                  className="grid size-10 shrink-0 place-items-center rounded-full bg-accent-soft font-display text-lg font-bold text-accent"
                  aria-hidden="true"
                >
                  {name.charAt(0).toUpperCase()}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold">
                    {name}
                    {isMe && <span className="font-normal text-muted"> (você)</span>}
                  </span>
                  <span className="block text-sm text-muted">Desde {formatDate(member.joined_at.slice(0, 10))}</span>
                </span>

                {isOwner ? (
                  <div className="flex items-center gap-2">
                    <label className="sr-only" htmlFor={`role-${member.user_id}`}>
                      Papel de {name}
                    </label>
                    <select
                      id={`role-${member.user_id}`}
                      value={member.role}
                      disabled={changeRole.isPending}
                      onChange={(e) => changeRole.mutate({ member, role: e.target.value as Role })}
                      className="h-9 rounded-xl border border-line bg-surface px-2 text-sm font-semibold"
                    >
                      <option value="owner">Dono</option>
                      <option value="member">Membro</option>
                    </select>
                    {!isMe && (
                      <Button
                        variant="ghost"
                        className={`h-9 px-3 text-sm ${confirmRemove === member.user_id ? "text-expense hover:text-expense" : ""}`}
                        disabled={remove.isPending}
                        onClick={() =>
                          confirmRemove === member.user_id
                            ? remove.mutate(member, { onSuccess: () => setConfirmRemove(null) })
                            : setConfirmRemove(member.user_id)
                        }
                      >
                        {confirmRemove === member.user_id ? "Confirmar" : "Remover"}
                      </Button>
                    )}
                  </div>
                ) : (
                  <span className="rounded-full bg-surface-2 px-2.5 py-0.5 text-xs font-bold text-muted">
                    {roleLabel[member.role]}
                  </span>
                )}
              </div>
            );
          })}
        </Card>
      )}
      {error && (
        <div className="mt-3">
          <FormError>{error}</FormError>
        </div>
      )}
    </section>
  );
}

// -----------------------------------------------------------------------------
// Convites pendentes do household
// -----------------------------------------------------------------------------
function InvitationsSection({ onInvite }: { onInvite: () => void }) {
  const { household } = useHousehold();
  const { data } = useHouseholdInvitations(household?.id);
  const isOwner = household?.role === "owner";
  const cancel = useHouseholdMutation(household?.id, (id: string) =>
    api.delete(`/households/${household!.id}/invitations/${id}`)
  );

  if (!isOwner && (!data || data.length === 0)) return null;

  return (
    <section aria-labelledby="invitations-title">
      <SectionTitle
        action={
          isOwner ? (
            <Button onClick={onInvite} className="h-10 px-4 text-sm">
              <UserPlus className="size-4" aria-hidden="true" />
              Convidar
            </Button>
          ) : undefined
        }
      >
        <span id="invitations-title">Convites pendentes</span>
      </SectionTitle>

      {data && data.length === 0 && (
        <Card className="p-5">
          <p className="text-muted">
            Nenhum convite pendente. Convide quem divide as contas com você: a pessoa só entra depois de aceitar.
          </p>
        </Card>
      )}

      {data && data.length > 0 && (
        <Card className="divide-y divide-line">
          {data.map((invitation) => (
            <div key={invitation.id} className="flex items-center gap-3 px-4 py-3.5">
              <span className="min-w-0 flex-1">
                <span className="block truncate font-semibold">{invitation.email}</span>
                <span className="block text-sm text-muted">
                  {roleLabel[invitation.role]}, vale até {formatDate(invitation.expires_at.slice(0, 10))}
                </span>
              </span>
              {isOwner && (
                <Button variant="ghost" className="h-9 px-3 text-sm" disabled={cancel.isPending} onClick={() => cancel.mutate(invitation.id)}>
                  Cancelar
                </Button>
              )}
            </div>
          ))}
        </Card>
      )}
      {cancel.error && (
        <div className="mt-3">
          <FormError>{errorMessage(cancel.error)}</FormError>
        </div>
      )}
    </section>
  );
}

// -----------------------------------------------------------------------------
// Sair e excluir
// -----------------------------------------------------------------------------
function LeaveRow() {
  const { me, household } = useHousehold();
  const [confirm, setConfirm] = useState(false);
  const leave = useAccountMutation(() => api.delete(`/households/${household!.id}/members/${me!.id}`));

  return (
    <div className="px-4 py-4">
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="font-semibold">Sair do household</p>
          <p className="text-sm text-muted">Você deixa de ver as finanças dele. Para voltar, precisa de um novo convite.</p>
        </div>
        <Button
          variant="ghost"
          className={`h-10 shrink-0 text-sm ${confirm ? "text-expense hover:text-expense" : ""}`}
          disabled={leave.isPending}
          onClick={() => (confirm ? leave.mutate(undefined) : setConfirm(true))}
        >
          {confirm ? "Confirmar saída" : "Sair"}
        </Button>
      </div>
      {leave.error && (
        <div className="mt-3">
          <FormError>{errorMessage(leave.error, overrides)}</FormError>
        </div>
      )}
    </div>
  );
}

function DeleteRow() {
  const { household } = useHousehold();
  const [confirm, setConfirm] = useState(false);
  const remove = useAccountMutation(() => api.delete(`/households/${household!.id}`));

  return (
    <div className="px-4 py-4">
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="font-semibold text-expense">Excluir household</p>
          <p className="text-sm text-muted">
            Apaga de vez as contas, categorias e lançamentos dele, para todas as pessoas. Não dá para desfazer.
          </p>
        </div>
        <Button
          variant="ghost"
          className={`h-10 shrink-0 text-sm ${confirm ? "bg-expense-soft text-expense hover:text-expense" : "text-expense hover:text-expense"}`}
          disabled={remove.isPending}
          onClick={() => (confirm ? remove.mutate(undefined) : setConfirm(true))}
        >
          {confirm ? "Excluir de vez" : "Excluir"}
        </Button>
      </div>
      {remove.error && (
        <div className="mt-3">
          <FormError>{errorMessage(remove.error)}</FormError>
        </div>
      )}
    </div>
  );
}
