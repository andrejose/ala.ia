-- =============================================================================
-- 04_categories.sql
-- Categorias de receitas e despesas (aluguel, restaurante, salário...).
-- Usa o mesmo enum das transações, restrito a 'income' e 'expense'.
-- =============================================================================

create table public.categories (
  id           uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  name         varchar(50) not null,
  type         public.transaction_type not null,
  color        varchar(7),   -- hexadecimal, ex.: #FF8800
  icon         varchar(50),  -- nome do ícone usado no frontend
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),

  constraint categories_type_chk check (type in ('income', 'expense')),
  constraint categories_color_chk check (color is null or color ~ '^#[0-9A-Fa-f]{6}$'),
  constraint categories_name_key unique (household_id, type, name),
  -- Permite FK composta (category_id, household_id, type) em transactions:
  -- garante mesmo household E mesmo tipo (receita com receita, despesa com despesa)
  constraint categories_id_household_id_type_key unique (id, household_id, type)
);

create trigger categories_set_updated_at
  before update on public.categories
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- RLS
-- -----------------------------------------------------------------------------
alter table public.categories enable row level security;

create policy "Membros gerenciam as categorias do household"
  on public.categories for all
  to authenticated
  using ((select public.is_household_member(household_id)))
  with check ((select public.is_household_member(household_id)));

