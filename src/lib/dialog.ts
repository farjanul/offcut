// Promise-based in-app dialogs (native confirm/prompt are blocked or invisible in many embedded browsers).
export interface DialogReq {
  kind: "confirm" | "prompt" | "alert";
  title: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  value?: string;
  placeholder?: string;
  resolve: (v: boolean | string | null | void) => void;
}

type Listener = (queue: DialogReq[]) => void;
let queue: DialogReq[] = [];
const listeners = new Set<Listener>();
const emit = () => listeners.forEach((l) => l(queue));

export const subscribeDialogs = (l: Listener) => { listeners.add(l); l(queue); return () => { listeners.delete(l); }; };
export function settleDialog(req: DialogReq, value: boolean | string | null | void) {
  queue = queue.filter((r) => r !== req);
  emit();
  req.resolve(value);
}
function open<T>(r: Omit<DialogReq, "resolve">, fallback: () => T): Promise<T> {
  if (listeners.size === 0) return Promise.resolve(fallback()); // host not mounted (should not happen)
  return new Promise<T>((resolve) => { queue = [...queue, { ...r, resolve: resolve as DialogReq["resolve"] }]; emit(); });
}

export const confirmDialog = (o: { title: string; message?: string; confirmLabel?: string; cancelLabel?: string; danger?: boolean }) =>
  open<boolean>({ kind: "confirm", ...o }, () => window.confirm(`${o.title}\n\n${o.message ?? ""}`));
export const promptDialog = (o: { title: string; message?: string; value?: string; placeholder?: string; confirmLabel?: string }) =>
  open<string | null>({ kind: "prompt", ...o }, () => window.prompt(o.title, o.value ?? ""));
export const alertDialog = (o: { title: string; message?: string }) =>
  open<void>({ kind: "alert", confirmLabel: "OK", ...o }, () => window.alert(`${o.title}\n\n${o.message ?? ""}`));
