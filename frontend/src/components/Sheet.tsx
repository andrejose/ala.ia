import { X } from "lucide-react";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";

// O formulário dentro do Sheet avisa se tem algo preenchido e ainda não salvo
// (ver useUnsavedChanges). Com isso, fechar pelo X, pelo fundo ou pelo Esc
// pede confirmação antes de descartar. Salvar fecha direto, sem perguntar.
const SheetDirtyContext = createContext<((dirty: boolean) => void) | null>(null);

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
  const dirty = useRef(false);
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
    if (!open) {
      dirty.current = false;
      setConfirming(false);
    }
  }, [open]);

  const setDirty = useCallback((value: boolean) => {
    dirty.current = value;
  }, []);

  // Pedido de fechar vindo da pessoa (X, fundo ou Esc)
  function requestClose() {
    if (dirty.current) setConfirming(true);
    else onClose();
  }

  function discard() {
    dirty.current = false;
    setConfirming(false);
    onClose();
  }

  return (
    <dialog
      ref={ref}
      // Esc: o navegador fecharia o <dialog> sozinho; aqui ele só pede para fechar
      onCancel={(event) => {
        if (event.target !== event.currentTarget) return;
        event.preventDefault();
        if (confirming) setConfirming(false);
        else requestClose();
      }}
      // O React repassa o "close" de um <dialog> aberto por dentro (ex.: nova
      // categoria dentro do lançamento) para este; só reage ao próprio.
      // O navegador pode fechar o <dialog> sem deixar segurar (o Chrome ignora
      // um segundo Esc seguido): com algo preenchido, reabre e pergunta.
      onClose={(event) => {
        if (event.target !== event.currentTarget) return;
        if (open && dirty.current) {
          ref.current?.showModal();
          setConfirming(true);
          return;
        }
        onClose();
      }}
      // Clique no fundo escurecido pede para fechar
      onClick={(event) => event.target === ref.current && requestClose()}
      aria-labelledby="sheet-title"
      className="m-0 mt-auto max-h-[92dvh] w-full max-w-none overflow-y-auto rounded-t-[1.75rem] bg-surface p-0 text-ink shadow-card backdrop:bg-ink/40 backdrop:backdrop-blur-[2px] sm:m-auto sm:max-w-lg sm:rounded-card"
    >
      {open && (
        <div className="relative px-5 pt-3 pb-[max(1.5rem,env(safe-area-inset-bottom))] sm:px-7 sm:pt-6">
          <div className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-line sm:hidden" aria-hidden="true" />
          <div className="mb-5 flex items-center justify-between gap-4">
            <h2 id="sheet-title" className="font-display text-2xl font-semibold tracking-tight">
              {title}
            </h2>
            <button
              type="button"
              onClick={requestClose}
              aria-label="Fechar"
              className="grid size-10 place-items-center rounded-full text-muted transition hover:bg-surface-2 hover:text-ink"
            >
              <X className="size-5" aria-hidden="true" />
            </button>
          </div>
          <SheetDirtyContext.Provider value={setDirty}>{children}</SheetDirtyContext.Provider>

          {confirming && <DiscardConfirmation onKeep={() => setConfirming(false)} onDiscard={discard} />}
        </div>
      )}
    </dialog>
  );
}

// Confirmação por cima do formulário, que continua lá embaixo, intacto
function DiscardConfirmation({ onKeep, onDiscard }: { onKeep: () => void; onDiscard: () => void }) {
  return (
    <div className="absolute inset-0 z-10 grid place-items-center bg-surface/85 p-5 backdrop-blur-[2px]">
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="discard-title"
        aria-describedby="discard-description"
        className="w-full max-w-sm rounded-card border border-line bg-surface p-5 shadow-card"
      >
        <p id="discard-title" className="font-display text-xl font-semibold">
          Descartar o que você preencheu?
        </p>
        <p id="discard-description" className="mt-1 text-sm text-muted">
          Se fechar agora, o que foi digitado neste formulário se perde.
        </p>
        <div className="mt-4 flex flex-wrap justify-end gap-2">
          <button
            type="button"
            onClick={onDiscard}
            className="h-11 rounded-2xl px-4 text-sm font-bold text-expense transition hover:bg-expense-soft"
          >
            Descartar
          </button>
          <button
            type="button"
            // Continuar editando é o padrão: um Enter sem querer não apaga nada
            autoFocus
            onClick={onKeep}
            className="h-11 rounded-2xl bg-primary px-4 text-sm font-bold text-primary-ink transition hover:brightness-110"
          >
            Continuar editando
          </button>
        </div>
      </div>
    </div>
  );
}

// Usado pelos formulários dentro de um Sheet: passe os valores dos campos. Se
// eles mudarem em relação ao que estava quando o formulário abriu, fechar pede
// confirmação. Fora de um Sheet, não faz nada.
export function useUnsavedChanges(values: unknown) {
  const setDirty = useContext(SheetDirtyContext);
  const serialized = JSON.stringify(values);
  const [initial] = useState(serialized);
  const dirty = useMemo(() => serialized !== initial, [serialized, initial]);

  useEffect(() => {
    setDirty?.(dirty);
  }, [dirty, setDirty]);

  // Ao sair (ex.: o formulário foi trocado), não deixa a marca para trás
  useEffect(() => () => setDirty?.(false), [setDirty]);
}
