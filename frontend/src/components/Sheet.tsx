import { X } from "lucide-react";
import { useEffect, useRef, type ReactNode } from "react";

// Painel de formulário: sobe de baixo no celular e aparece centralizado no
// computador. Usa <dialog> nativo, que já cuida do foco, do Esc e do fundo.
export function Sheet({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      // O React repassa o "close" de um <dialog> aberto por dentro (ex.: nova
      // categoria dentro do lançamento) para este; só reage ao próprio
      onClose={(event) => event.target === event.currentTarget && onClose()}
      // Clique no fundo escurecido fecha
      onClick={(event) => event.target === ref.current && onClose()}
      aria-labelledby="sheet-title"
      className="m-0 mt-auto max-h-[92dvh] w-full max-w-none overflow-y-auto rounded-t-[1.75rem] bg-surface p-0 text-ink shadow-card backdrop:bg-ink/40 backdrop:backdrop-blur-[2px] sm:m-auto sm:max-w-lg sm:rounded-card"
    >
      {open && (
        <div className="px-5 pt-3 pb-[max(1.5rem,env(safe-area-inset-bottom))] sm:px-7 sm:pt-6">
          <div className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-line sm:hidden" aria-hidden="true" />
          <div className="mb-5 flex items-center justify-between gap-4">
            <h2 id="sheet-title" className="font-display text-2xl font-semibold tracking-tight">
              {title}
            </h2>
            <button
              type="button"
              onClick={onClose}
              aria-label="Fechar"
              className="grid size-10 place-items-center rounded-full text-muted transition hover:bg-surface-2 hover:text-ink"
            >
              <X className="size-5" aria-hidden="true" />
            </button>
          </div>
          {children}
        </div>
      )}
    </dialog>
  );
}
