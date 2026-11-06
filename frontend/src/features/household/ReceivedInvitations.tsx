import { Mail } from "lucide-react";
import { FormError } from "../../components/fields";
import { Button, Card } from "../../components/ui";
import { api } from "../../lib/api";
import { formatDate } from "../../lib/format";
import { errorMessage, useAccountMutation } from "../../lib/mutations";
import { useMyInvitations } from "../../lib/queries";
import type { Household } from "../../lib/types";
import { useHousehold } from "./HouseholdProvider";

const roleText = { owner: "como dono", member: "como membro" } as const;

// Convites recebidos pelo usuário logado, com Aceitar e Recusar.
// Aparece no painel e na tela do espaço; sem convites, não mostra nada.
export function ReceivedInvitations() {
  const { data } = useMyInvitations();
  const { selectHousehold } = useHousehold();

  const accept = useAccountMutation((id: string) => api.post<Household>(`/invitations/${id}/accept`));
  const decline = useAccountMutation((id: string) => api.post(`/invitations/${id}/decline`));
  const error = errorMessage(accept.error) ?? errorMessage(decline.error);
  const busy = accept.isPending || decline.isPending;

  if (!data || data.length === 0) return null;

  return (
    <section aria-label="Convites recebidos" className="space-y-3">
      {data.map((invitation) => (
        <Card key={invitation.id} className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center">
          <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-accent-soft text-accent" aria-hidden="true">
            <Mail className="size-5" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="font-semibold">
              {invitation.invited_by_name ?? "Alguém"} convidou você para <strong>{invitation.household_name}</strong>{" "}
              {roleText[invitation.role]}.
            </p>
            <p className="mt-0.5 text-sm text-muted">
              Ao aceitar, você passa a ver e lançar as finanças desse espaço. Vale até {formatDate(invitation.expires_at.slice(0, 10))}.
            </p>
          </div>
          <div className="flex gap-2">
            <Button
              variant="ghost"
              className="h-10 text-sm"
              disabled={busy}
              onClick={() => decline.mutate(invitation.id)}
            >
              Recusar
            </Button>
            <Button
              className="h-10 text-sm"
              disabled={busy}
              onClick={() => accept.mutate(invitation.id, { onSuccess: (household) => selectHousehold(household.id) })}
            >
              Aceitar
            </Button>
          </div>
        </Card>
      ))}
      {error && <FormError>{error}</FormError>}
    </section>
  );
}
