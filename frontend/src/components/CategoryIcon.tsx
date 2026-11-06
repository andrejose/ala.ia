import {
  ArrowLeftRight,
  Briefcase,
  Bus,
  HeartPulse,
  Home,
  Popcorn,
  ShoppingBasket,
  Sparkles,
  Tag,
  type LucideIcon,
} from "lucide-react";

// Ícones disponíveis para categorias (campo "icon" da API)
export const categoryIcons: Record<string, LucideIcon> = {
  briefcase: Briefcase,
  bus: Bus,
  "heart-pulse": HeartPulse,
  home: Home,
  popcorn: Popcorn,
  "shopping-basket": ShoppingBasket,
  sparkles: Sparkles,
  transfer: ArrowLeftRight,
};

// Bolinha colorida com o ícone da categoria
export function CategoryIcon({
  icon,
  color,
  size = "md",
}: {
  icon: string | null;
  color: string | null;
  size?: "sm" | "md";
}) {
  const Icon = (icon && categoryIcons[icon]) || Tag;
  const tint = color ?? "var(--muted)";

  return (
    <span
      className={`grid shrink-0 place-items-center rounded-2xl ${size === "sm" ? "size-9" : "size-11"}`}
      style={{ backgroundColor: `color-mix(in srgb, ${tint} 16%, transparent)`, color: tint }}
      aria-hidden="true"
    >
      <Icon className={size === "sm" ? "size-4" : "size-5"} strokeWidth={2.2} />
    </span>
  );
}
