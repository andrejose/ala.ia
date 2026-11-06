import {
  ArrowLeftRight,
  Baby,
  Briefcase,
  Bus,
  Car,
  Dumbbell,
  Gift,
  GraduationCap,
  HeartPulse,
  Home,
  PawPrint,
  PiggyBank,
  Plane,
  Popcorn,
  Shirt,
  ShoppingBasket,
  Smartphone,
  Sparkles,
  Tag,
  Utensils,
  Zap,
  type LucideIcon,
} from "lucide-react";

// Ícones disponíveis para categorias (campo "icon" da API), na ordem do seletor
export const categoryIcons: Record<string, { icon: LucideIcon; label: string }> = {
  "shopping-basket": { icon: ShoppingBasket, label: "Mercado" },
  utensils: { icon: Utensils, label: "Comida" },
  home: { icon: Home, label: "Casa" },
  zap: { icon: Zap, label: "Contas da casa" },
  bus: { icon: Bus, label: "Transporte público" },
  car: { icon: Car, label: "Carro" },
  "heart-pulse": { icon: HeartPulse, label: "Saúde" },
  dumbbell: { icon: Dumbbell, label: "Esporte" },
  popcorn: { icon: Popcorn, label: "Lazer" },
  plane: { icon: Plane, label: "Viagem" },
  shirt: { icon: Shirt, label: "Roupas" },
  "graduation-cap": { icon: GraduationCap, label: "Educação" },
  smartphone: { icon: Smartphone, label: "Tecnologia" },
  "paw-print": { icon: PawPrint, label: "Pets" },
  baby: { icon: Baby, label: "Filhos" },
  gift: { icon: Gift, label: "Presentes" },
  briefcase: { icon: Briefcase, label: "Trabalho" },
  sparkles: { icon: Sparkles, label: "Extra" },
  "piggy-bank": { icon: PiggyBank, label: "Rendimentos" },
  tag: { icon: Tag, label: "Outros" },
};

// Cores para categorias: tons terrosos que convivem com os dois temas
export const categoryColors = [
  { value: "#B4513A", label: "Argila" },
  { value: "#E08A5B", label: "Damasco" },
  { value: "#9A7420", label: "Ocre" },
  { value: "#6F8F3A", label: "Oliva" },
  { value: "#2F7D5B", label: "Verde" },
  { value: "#3E8DA8", label: "Azul-lago" },
  { value: "#4F6BA8", label: "Anil" },
  { value: "#7A6FA8", label: "Lavanda" },
  { value: "#A8577A", label: "Amora" },
  { value: "#6E655C", label: "Cinza-quente" },
];

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
  const Icon = (icon && categoryIcons[icon]?.icon) || (icon === "transfer" ? ArrowLeftRight : Tag);
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
