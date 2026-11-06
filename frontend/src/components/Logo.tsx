// Logo do Ala.ia: uma asa em duas curvas (liberdade e leveza) + "ala" em minúsculas.

export function LogoMark({ className = "size-9" }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden="true">
      <rect width="64" height="64" rx="18" className="fill-primary" />
      <path
        d="M14 42c10-1 20-7 26-18 2 9-1 18-9 22"
        fill="none"
        className="stroke-primary-ink"
        strokeWidth="4.5"
        strokeLinecap="round"
      />
      <path d="M22 47c9 0 18-3 26-12" fill="none" className="stroke-accent" strokeWidth="4.5" strokeLinecap="round" />
    </svg>
  );
}

export function Logo({ size = "md" }: { size?: "md" | "lg" }) {
  const large = size === "lg";
  return (
    <span className="inline-flex items-center gap-2.5" aria-label="Ala.ia">
      <LogoMark className={large ? "size-12" : "size-9"} />
      <span className={`font-display font-semibold tracking-tight ${large ? "text-4xl" : "text-2xl"}`}>
        ala<span className="text-accent">.</span>ia
      </span>
    </span>
  );
}
