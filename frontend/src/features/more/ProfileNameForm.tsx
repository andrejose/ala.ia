import { useState, type FormEvent } from "react";
import { FormError } from "../../components/fields";
import { Button, TextField } from "../../components/ui";
import { api } from "../../lib/api";
import { errorMessage, fieldErrors, useAccountMutation } from "../../lib/mutations";

// Editar o nome do perfil (PATCH /me). O nome aparece para quem divide o household.
export function ProfileNameForm({ currentName }: { currentName: string }) {
  const [name, setName] = useState(currentName);
  const [saved, setSaved] = useState(false);
  const save = useAccountMutation((value: string) => api.patch("/me", { name: value }));

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setSaved(false);
    save.mutate(name, { onSuccess: () => setSaved(true) });
  }

  const unchanged = name.trim() === currentName;

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <TextField
        id="profile-name"
        label="Seu nome"
        value={name}
        onChange={(e) => {
          setName(e.target.value);
          setSaved(false);
        }}
        error={fieldErrors(save.error).name}
        hint="É como as pessoas dos seus espaços veem você."
        maxLength={100}
        required
      />
      {save.error && !fieldErrors(save.error).name && <FormError>{errorMessage(save.error)}</FormError>}
      <div className="flex items-center gap-3">
        <Button type="submit" variant="soft" className="h-10 text-sm" disabled={save.isPending || unchanged}>
          {save.isPending ? "Salvando…" : "Salvar nome"}
        </Button>
        {saved && (
          <span role="status" className="text-sm font-semibold text-income">
            Nome salvo.
          </span>
        )}
      </div>
    </form>
  );
}
