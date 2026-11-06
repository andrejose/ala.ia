import { ChevronRight, Plus } from "lucide-react";
import { useState } from "react";
import { CategoryIcon } from "../../components/CategoryIcon";
import { Segmented } from "../../components/fields";
import { PageHeader } from "../../components/PageHeader";
import { Button, Card } from "../../components/ui";
import { useCategories } from "../../lib/queries";
import type { Category, CategoryType } from "../../lib/types";
import { useHousehold } from "../household/HouseholdProvider";
import { CategorySheet } from "./CategorySheet";

export function CategoriesPage() {
  const { household } = useHousehold();
  const { data, isLoading } = useCategories(household?.id);
  const [type, setType] = useState<CategoryType>("expense");
  const [editing, setEditing] = useState<Category | "new" | null>(null);

  const list = (data ?? []).filter((c) => c.type === type);
  const noun = type === "expense" ? "despesa" : "receita";

  return (
    <>
      <PageHeader
        title="Categorias"
        description="Agrupam os lançamentos para você ver para onde vai e de onde vem o dinheiro."
        action={
          <Button onClick={() => setEditing("new")} className="h-10 px-4 text-sm">
            <Plus className="size-4" aria-hidden="true" />
            Nova
          </Button>
        }
      />

      <div className="mb-4 max-w-xs">
        <Segmented
          label="Tipo"
          value={type}
          onChange={setType}
          options={[
            { value: "expense", label: "Despesas" },
            { value: "income", label: "Receitas" },
          ]}
        />
      </div>

      {isLoading && <Card className="h-40 animate-pulse" />}

      {data && list.length === 0 && (
        <Card className="p-6">
          <p className="font-semibold">Nenhuma categoria de {noun} ainda.</p>
          <p className="mt-1 text-muted">
            {type === "expense"
              ? "Crie as que fazem sentido para você, como Mercado, Moradia ou Farmácia."
              : "Crie de onde vem o seu dinheiro, como Salário ou Freela."}
          </p>
          <Button variant="soft" className="mt-4" onClick={() => setEditing("new")}>
            Criar categoria de {noun}
          </Button>
        </Card>
      )}

      {list.length > 0 && (
        <Card className="divide-y divide-line overflow-hidden">
          {list.map((category) => (
            <button
              key={category.id}
              type="button"
              onClick={() => setEditing(category)}
              className="flex w-full items-center gap-3 px-4 py-3.5 text-left transition hover:bg-surface-2/60"
            >
              <CategoryIcon icon={category.icon} color={category.color} />
              <span className="min-w-0 flex-1 truncate font-semibold">{category.name}</span>
              <ChevronRight className="size-4 shrink-0 text-muted" aria-hidden="true" />
            </button>
          ))}
        </Card>
      )}

      {household && (
        <CategorySheet
          householdId={household.id}
          category={editing && editing !== "new" ? editing : undefined}
          defaultType={type}
          open={editing !== null}
          onClose={() => setEditing(null)}
        />
      )}
    </>
  );
}
