import { Check } from "lucide-react";
import { useState, type FormEvent } from "react";
import { categoryColors, categoryIcons } from "../../components/CategoryIcon";
import { FormError, Segmented } from "../../components/fields";
import { Sheet } from "../../components/Sheet";
import { Button, TextField } from "../../components/ui";
import { api } from "../../lib/api";
import { errorMessage, fieldErrors, useHouseholdMutation } from "../../lib/mutations";
import type { Category, CategoryType } from "../../lib/types";

interface CategoryInput {
  name: string;
  type: CategoryType;
  color: string | null;
  icon: string | null;
}

export function CategorySheet({
  householdId,
  category,
  defaultType = "expense",
  open,
  onClose,
  onCreated,
}: {
  householdId: string;
  category?: Category;
  defaultType?: CategoryType;
  open: boolean;
  onClose: () => void;
  onCreated?: (category: Category) => void;
}) {
  return (
    <Sheet open={open} onClose={onClose} title={category ? "Editar categoria" : "Nova categoria"}>
      {open && (
        <CategoryForm
          key={category?.id ?? `new-${defaultType}`}
          householdId={householdId}
          category={category}
          defaultType={defaultType}
          onDone={onClose}
          onCreated={onCreated}
        />
      )}
    </Sheet>
  );
}

function CategoryForm({
  householdId,
  category,
  defaultType,
  onDone,
  onCreated,
}: {
  householdId: string;
  category?: Category;
  defaultType: CategoryType;
  onDone: () => void;
  onCreated?: (category: Category) => void;
}) {
  const [name, setName] = useState(category?.name ?? "");
  const [type, setType] = useState<CategoryType>(category?.type ?? defaultType);
  const [color, setColor] = useState<string | null>(category?.color ?? categoryColors[0].value);
  const [icon, setIcon] = useState<string | null>(category?.icon ?? "tag");
  const [confirmDelete, setConfirmDelete] = useState(false);

  const base = `/households/${householdId}/categories`;
  const save = useHouseholdMutation(householdId, (input: CategoryInput) =>
    category ? api.patch<Category>(`${base}/${category.id}`, input) : api.post<Category>(base, input)
  );
  const remove = useHouseholdMutation(householdId, () => api.delete(`${base}/${category!.id}`));

  const errors = fieldErrors(save.error);
  const error =
    errorMessage(save.error, {
      CONFLICT: `Já existe uma categoria de ${type === "income" ? "receita" : "despesa"} com esse nome.`,
      RESOURCE_IN_USE: "Esta categoria já tem lançamentos, então não pode mudar de tipo.",
    }) ??
    errorMessage(remove.error, {
      RESOURCE_IN_USE: "Esta categoria tem lançamentos, então não pode ser excluída. Mude os lançamentos de categoria antes.",
    });

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    save.mutate(
      { name, type, color, icon },
      {
        onSuccess: (saved) => {
          if (!category) onCreated?.(saved);
          onDone();
        },
      }
    );
  }

  const busy = save.isPending || remove.isPending;

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <Segmented
        label="Tipo da categoria"
        value={type}
        onChange={setType}
        options={[
          { value: "expense", label: "Despesa" },
          { value: "income", label: "Receita" },
        ]}
      />

      <TextField
        id="category-name"
        label="Nome"
        placeholder={type === "income" ? "Ex.: Salário, Freela" : "Ex.: Mercado, Farmácia"}
        value={name}
        onChange={(e) => setName(e.target.value)}
        error={errors.name}
        maxLength={50}
        required
        autoFocus={!category}
      />

      <fieldset>
        <legend className="mb-2 text-sm font-bold">Cor</legend>
        <div className="flex flex-wrap gap-2.5">
          {categoryColors.map((c) => (
            <label key={c.value} className="relative cursor-pointer" title={c.label}>
              <input
                type="radio"
                name="category-color"
                value={c.value}
                checked={color === c.value}
                onChange={() => setColor(c.value)}
                className="peer sr-only"
                aria-label={c.label}
              />
              <span
                className="grid size-9 place-items-center rounded-full ring-offset-2 ring-offset-surface transition peer-checked:ring-2 peer-checked:ring-ink peer-focus-visible:ring-2 peer-focus-visible:ring-primary"
                style={{ backgroundColor: c.value }}
              >
                {color === c.value && <Check className="size-4 text-white" aria-hidden="true" />}
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset>
        <legend className="mb-2 text-sm font-bold">Ícone</legend>
        <div className="grid grid-cols-5 gap-2 sm:grid-cols-10">
          {Object.entries(categoryIcons).map(([value, { icon: Icon, label }]) => (
            <label key={value} className="cursor-pointer" title={label}>
              <input
                type="radio"
                name="category-icon"
                value={value}
                checked={icon === value}
                onChange={() => setIcon(value)}
                className="peer sr-only"
                aria-label={label}
              />
              <span
                className="grid aspect-square place-items-center rounded-2xl bg-surface-2 text-muted transition peer-checked:text-white peer-focus-visible:ring-2 peer-focus-visible:ring-primary hover:text-ink"
                style={icon === value ? { backgroundColor: color ?? undefined } : undefined}
              >
                <Icon className="size-5" aria-hidden="true" />
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      {error && <FormError>{error}</FormError>}

      <Button type="submit" className="w-full" disabled={busy}>
        {save.isPending ? "Salvando…" : category ? "Salvar alterações" : "Criar categoria"}
      </Button>

      {category && (
        <div className="flex justify-end border-t border-line pt-4">
          <Button
            type="button"
            variant="ghost"
            disabled={busy}
            className={confirmDelete ? "text-expense hover:text-expense" : ""}
            onClick={() => (confirmDelete ? remove.mutate(undefined, { onSuccess: onDone }) : setConfirmDelete(true))}
          >
            {confirmDelete ? "Confirmar exclusão" : "Excluir categoria"}
          </Button>
        </div>
      )}
    </form>
  );
}
