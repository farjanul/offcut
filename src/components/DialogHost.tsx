"use client";
import { useEffect, useRef, useState } from "react";
import { AlertTriangle, Trash2, X } from "lucide-react";
import { DialogReq, settleDialog, subscribeDialogs } from "@/lib/dialog";

/** Renders the in-app confirm / prompt / alert dialogs. Mounted once in the editor. */
export default function DialogHost() {
  const [queue, setQueue] = useState<DialogReq[]>([]);
  useEffect(() => subscribeDialogs(setQueue), []);
  const req = queue[0];
  const [text, setText] = useState("");
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => { if (req) setText(req.value ?? ""); }, [req]);
  useEffect(() => { if (req?.kind === "prompt") setTimeout(() => { input.current?.focus(); input.current?.select(); }, 30); }, [req]);

  const cancel = () => req && settleDialog(req, req.kind === "prompt" ? null : req.kind === "confirm" ? false : undefined);
  const ok = () => req && settleDialog(req, req.kind === "prompt" ? text : req.kind === "confirm" ? true : undefined);

  useEffect(() => {
    if (!req) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.stopPropagation(); cancel(); }
      else if (e.key === "Enter" && (req.kind !== "prompt" || document.activeElement === input.current)) { e.preventDefault(); e.stopPropagation(); ok(); }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  });

  if (!req) return null;
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/65" onPointerDown={cancel}>
      <div role="dialog" aria-modal="true" className="w-[420px] max-w-[92vw] rounded-xl border border-[var(--line)] bg-[var(--panel)] p-5 shadow-2xl" onPointerDown={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-start gap-3">
          <div className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${req.danger ? "bg-red-500/15 text-red-400" : "bg-[var(--accent)]/15 text-[var(--accent)]"}`}>
            {req.danger ? <Trash2 size={18} /> : <AlertTriangle size={18} />}
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="text-base font-semibold">{req.title}</h2>
            {req.message && <p className="mt-1 whitespace-pre-line break-words text-sm leading-relaxed text-[var(--muted)]">{req.message}</p>}
          </div>
          <button className="btn !p-1" onClick={cancel} aria-label="Close"><X size={14} /></button>
        </div>
        {req.kind === "prompt" && (
          <input ref={input} className="field mb-1" value={text} placeholder={req.placeholder} onChange={(e) => setText(e.target.value)} />
        )}
        <div className="mt-4 flex justify-end gap-2">
          {req.kind !== "alert" && <button className="btn" onClick={cancel}>{req.cancelLabel ?? "Cancel"}</button>}
          <button className={`btn ${req.danger ? "!border-transparent !bg-red-600 font-semibold text-white hover:!bg-red-500" : "btn-primary"}`} autoFocus={req.kind !== "prompt"} onClick={ok}>
            {req.confirmLabel ?? (req.kind === "confirm" ? "Confirm" : "OK")}
          </button>
        </div>
      </div>
    </div>
  );
}
